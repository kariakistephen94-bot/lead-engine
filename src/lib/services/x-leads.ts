import "server-only";

import { and, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  companies, contacts, leadSources, niches, notes, scrapeRuns, settings,
  xAuthors, xPosts, xSearches,
  type XLeadStatus, type XSearch,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import type { XBusinessContext, XPostClassification, XPostToClassify } from "@/lib/ai/types";
import { fallbackQueries, ruleClassify, validateXQuery } from "@/lib/ai/x-leads";
import { getXClient, XApiError, type XTweet, type XUser } from "@/lib/integrations/x";
import { normalizeDomain, normalizeUrl } from "@/lib/utils";
import { logActivity } from "./activities";
import { findCompanyByDomain } from "./dedupe";

/*
 * The X lead engine, end to end:
 *
 *   saved searches ──(worker claims when due)──▶ X recent search API
 *        │                                              │ posts + authors
 *        ▼                                              ▼
 *   since_id cursor                         x_posts (queue) / x_authors
 *                                                       │
 *                         rules prefilter ─▶ AI classifier, 25 posts a call
 *                                                       │
 *                          author best score ≥ threshold → "qualified"
 *                                                       │
 *                        auto-convert or one click → company + contact
 *
 * Every stage is a lease-and-SKIP-LOCKED queue in Postgres, so the in-app
 * scheduler, `npm run x:worker` processes and a hosted cron can all run at
 * once without double-reading from X (which is billed) or double-scoring.
 */

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const KEY_CONFIG = "x_config";
const KEY_BACKOFF = "x_backoff_until";
const KEY_CLASSIFY_ERROR = "x_last_classify_error";
const readsKey = (d = new Date()) => `x_reads:${d.toISOString().slice(0, 7)}`;

const CLASSIFY_BATCH = 25;
const MAX_CLASSIFY_ATTEMPTS = 4;
/**
 * How far back a search's very first run looks. X rejects a start_time older
 * than 7 days, which would read as a bad query and pause the search.
 */
const FIRST_RUN_LOOKBACK_HOURS = Math.min(Math.max(Number(process.env.X_FIRST_RUN_LOOKBACK_HOURS) || 72, 1), 167);

export type XConfig = {
  /** What you sell and to whom — the yardstick every post is scored against. */
  businessDescription: string;
  /** Author score at or above which they count as a qualified lead. */
  minRelevance: number;
};

const DEFAULT_DESCRIPTION =
  process.env.CONTENT_POSITIONING?.trim() ||
  "An AI automation studio. We build AI workflows and custom dashboards that remove repetitive work " +
    "(lead qualification, follow-up, reporting, scheduling, support triage) for small and mid-size businesses, " +
    "plus custom AI agents trained on a client's own material.";

async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  return (row?.value as T | undefined) ?? null;
}

async function setSetting(key: string, value: unknown): Promise<void> {
  await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getXConfig(): Promise<XConfig> {
  const stored = await getSetting<Partial<XConfig>>(KEY_CONFIG);
  return {
    businessDescription: stored?.businessDescription?.trim() || DEFAULT_DESCRIPTION,
    minRelevance: stored?.minRelevance ?? Number(process.env.X_MIN_RELEVANCE ?? 60),
  };
}

export async function saveXConfig(patch: Partial<XConfig>): Promise<XConfig> {
  const current = await getXConfig();
  const next = { ...current, ...patch };
  await setSetting(KEY_CONFIG, next);
  return next;
}

async function getBusinessContext(): Promise<XBusinessContext> {
  const [config, rows] = await Promise.all([
    getXConfig(),
    db.select({
      name: niches.name, targetMarket: niches.targetMarket,
      painPoints: niches.painPoints, offer: niches.offer,
    }).from(niches).where(eq(niches.archived, false)),
  ]);
  return { description: config.businessDescription, niches: rows };
}

/** Dollars per post read on X's pay-per-use plan (docs.x.com, September 2026). */
export const X_COST_PER_READ = 0.005;

/**
 * Cap on posts read per calendar month, enforced before every request.
 *
 * On by default at 10,000 reads (about $50 at X's pay-per-use price) because an
 * uncapped scheduler is an uncapped bill: X charges per post read, and a broad
 * query run hourly can read thousands a day. Set X_MONTHLY_READ_BUDGET to raise
 * it, or to 0 to remove the cap and rely on X's own spending limit.
 */
const monthlyBudget = () => {
  const raw = process.env.X_MONTHLY_READ_BUDGET?.trim();
  if (raw === undefined || raw === "") return 10_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function readsThisMonth(): Promise<number> {
  return Number((await getSetting<number>(readsKey())) ?? 0);
}

/** Atomic, so concurrent workers never undercount what X will bill. */
async function addReads(n: number): Promise<void> {
  if (n <= 0) return;
  await db.execute(sql`
    insert into settings (key, value) values (${readsKey()}, to_jsonb(${n}::int))
    on conflict (key) do update
      set value = to_jsonb(coalesce((settings.value #>> '{}')::int, 0) + ${n}::int), updated_at = now()`);
}

async function backoffUntil(): Promise<Date | null> {
  const iso = await getSetting<string>(KEY_BACKOFF);
  const at = iso ? new Date(iso) : null;
  return at && at.getTime() > Date.now() ? at : null;
}

/** Shared by every worker: one 429 pauses them all until X's window resets. */
async function setBackoff(until: Date): Promise<void> {
  await setSetting(KEY_BACKOFF, until.toISOString());
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export async function getXStatus() {
  const client = getXClient();
  const [backoff, reads, config, classifyError] = await Promise.all([
    backoffUntil(), readsThisMonth(), getXConfig(),
    getSetting<{ message: string; at: string }>(KEY_CLASSIFY_ERROR),
  ]);
  return {
    client: client.name,
    connected: client.isConfigured(),
    backoffUntil: backoff?.toISOString() ?? null,
    readsThisMonth: reads,
    monthlyBudget: monthlyBudget(),
    autorun: isAutorunEnabled(),
    autorunIntervalSeconds: autorunIntervalSeconds(),
    aiProvider: getAIProvider().name,
    /** Last classifier failure, cleared by the next successful model call. */
    classifyError,
    costPerRead: X_COST_PER_READ,
    config,
  };
}

/** Round-trip to X. The usage endpoint is free to call and proves the token works. */
export async function verifyXConnection() {
  const client = getXClient();
  if (!client.isConfigured()) {
    return { ok: false as const, error: "X_BEARER_TOKEN is not set in .env.local" };
  }
  try {
    return { ok: true as const, client: client.name, usage: await client.getUsage() };
  } catch (error) {
    return { ok: false as const, error: (error as Error).message };
  }
}

export async function getXStats() {
  const [authors, posts] = await Promise.all([
    db.select({ status: xAuthors.status, n: count() }).from(xAuthors).groupBy(xAuthors.status),
    db.select({
      total: count(),
      pending: sql<number>`count(*) filter (where ${xPosts.classifiedAt} is null)`,
      today: sql<number>`count(*) filter (where ${xPosts.discoveredAt} >= now() - interval '24 hours')`,
      buyers: sql<number>`count(*) filter (where ${xPosts.intent} in ('buyer', 'pain', 'hiring'))`,
    }).from(xPosts),
  ]);
  const byStatus = Object.fromEntries(authors.map((a) => [a.status, Number(a.n)])) as Partial<Record<XLeadStatus, number>>;
  const p = posts[0];
  return {
    authors: byStatus,
    posts: { total: Number(p?.total ?? 0), pending: Number(p?.pending ?? 0), today: Number(p?.today ?? 0), withIntent: Number(p?.buyers ?? 0) },
  };
}

/* -------------------------------------------------------------------------- */
/* Saved searches                                                             */
/* -------------------------------------------------------------------------- */

export type XSearchInput = {
  name: string;
  query: string;
  nicheId?: string | null;
  enabled?: boolean;
  autoConvert?: boolean;
  intervalMinutes?: number;
  maxPostsPerRun?: number;
};

export class XSearchValidationError extends Error {}

export async function listXSearches() {
  return db
    .select({
      id: xSearches.id, name: xSearches.name, query: xSearches.query,
      nicheId: xSearches.nicheId, nicheName: niches.name,
      enabled: xSearches.enabled, autoConvert: xSearches.autoConvert,
      intervalMinutes: xSearches.intervalMinutes, maxPostsPerRun: xSearches.maxPostsPerRun,
      nextRunAt: xSearches.nextRunAt, lastRunAt: xSearches.lastRunAt,
      lastStatus: xSearches.lastStatus, lastError: xSearches.lastError,
      postsFound: xSearches.postsFound, leadsFound: xSearches.leadsFound,
      running: sql<boolean>`${xSearches.lockedUntil} is not null and ${xSearches.lockedUntil} > now()`,
    })
    .from(xSearches)
    .leftJoin(niches, eq(niches.id, xSearches.nicheId))
    .orderBy(desc(xSearches.enabled), xSearches.createdAt);
}

export async function createXSearch(input: XSearchInput) {
  const problem = validateXQuery(input.query);
  if (problem) throw new XSearchValidationError(problem);
  const [row] = await db.insert(xSearches).values({
    name: input.name.trim(),
    query: input.query.replace(/\s+/g, " ").trim(),
    nicheId: input.nicheId ?? null,
    enabled: input.enabled ?? true,
    autoConvert: input.autoConvert ?? false,
    intervalMinutes: input.intervalMinutes ?? 60,
    maxPostsPerRun: input.maxPostsPerRun ?? 100,
  }).returning();
  return row;
}

export async function updateXSearch(id: string, patch: Partial<XSearchInput> & { runNow?: boolean }) {
  const set: Partial<typeof xSearches.$inferInsert> = { updatedAt: new Date() };
  if (patch.query !== undefined) {
    const problem = validateXQuery(patch.query);
    if (problem) throw new XSearchValidationError(problem);
    set.query = patch.query.replace(/\s+/g, " ").trim();
    // A different query is a different result set; the old cursor would skip it.
    set.sinceId = null;
  }
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.nicheId !== undefined) set.nicheId = patch.nicheId;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.autoConvert !== undefined) set.autoConvert = patch.autoConvert;
  if (patch.intervalMinutes !== undefined) set.intervalMinutes = patch.intervalMinutes;
  if (patch.maxPostsPerRun !== undefined) set.maxPostsPerRun = patch.maxPostsPerRun;
  if (patch.runNow) set.nextRunAt = new Date();
  const [row] = await db.update(xSearches).set(set).where(eq(xSearches.id, id)).returning();
  return row ?? null;
}

export async function deleteXSearch(id: string): Promise<boolean> {
  const rows = await db.delete(xSearches).where(eq(xSearches.id, id)).returning({ id: xSearches.id });
  return rows.length > 0;
}

/**
 * Write searches for each niche — with the AI provider when one is configured,
 * deterministic templates otherwise. Created disabled when `enabled` is false
 * so they can be reviewed before they start spending reads.
 */
export async function generateSearchesFromNiches(options: { nicheIds?: string[]; enabled?: boolean } = {}) {
  const business = await getBusinessContext();
  const rows = await db.select().from(niches).where(and(
    eq(niches.archived, false),
    options.nicheIds?.length ? inArray(niches.id, options.nicheIds) : undefined,
  ));
  const ai = getAIProvider();
  const created: XSearch[] = [];
  const errors: string[] = [];

  for (const niche of rows) {
    const context = { name: niche.name, targetMarket: niche.targetMarket, painPoints: niche.painPoints, offer: niche.offer };
    let drafts;
    try {
      drafts = await ai.writeXSearchQueries({ business, niche: context });
    } catch (error) {
      errors.push(`${niche.name}: ${(error as Error).message} — used templates instead`);
      drafts = fallbackQueries(context);
    }
    for (const draft of drafts) {
      const [row] = await db.insert(xSearches).values({
        name: draft.name, query: draft.query, nicheId: niche.id,
        enabled: options.enabled ?? true,
      }).returning();
      created.push(row);
    }
  }
  return { created: created.length, writer: ai.name, errors };
}

/* -------------------------------------------------------------------------- */
/* Worker — searching                                                         */
/* -------------------------------------------------------------------------- */

export type XSearchRunResult = {
  searchId: string;
  name: string;
  status: "ok" | "rate_limited" | "budget" | "error" | "not_configured";
  read: number;
  newPosts: number;
  newAuthors: number;
  error?: string;
};

/**
 * Take the most overdue enabled search, under a 10-minute lease. The lease is
 * what makes concurrent workers safe; its expiry is what makes a crashed
 * worker harmless.
 */
async function claimDueSearch(searchId?: string): Promise<XSearch | null> {
  const result = await db.execute<Record<string, unknown>>(sql`
    update x_searches set locked_until = now() + interval '10 minutes'
     where id = (
       select id from x_searches
        where (locked_until is null or locked_until < now())
          and ${searchId ? sql`id = ${searchId}` : sql`enabled and next_run_at <= now()`}
        order by next_run_at
        limit 1
        for update skip locked)
    returning id`);
  const id = result.rows[0]?.id as string | undefined;
  if (!id) return null;
  const [row] = await db.select().from(xSearches).where(eq(xSearches.id, id)).limit(1);
  return row ?? null;
}

/** Snowflake ids are 64-bit — compare as BigInt, never as numbers or strings. */
const newerId = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : BigInt(a) >= BigInt(b) ? a : b;

async function upsertAuthors(users: XUser[]): Promise<Map<string, { id: string; isNew: boolean }>> {
  const out = new Map<string, { id: string; isNew: boolean }>();
  if (!users.length) return out;
  const rows = await db.insert(xAuthors).values(users.map((u) => ({
    xUserId: u.id,
    username: u.username,
    name: u.name ?? null,
    bio: u.description ?? null,
    location: u.location ?? null,
    website: u.website ?? null,
    followers: u.followers ?? null,
    following: u.following ?? null,
    verified: u.verified ?? null,
    accountCreatedAt: u.createdAt ? new Date(u.createdAt) : null,
  }))).onConflictDoUpdate({
    target: xAuthors.xUserId,
    // Profiles change; keep the latest. Pipeline fields are never touched here.
    set: {
      username: sql`excluded.username`, name: sql`excluded.name`, bio: sql`excluded.bio`,
      location: sql`excluded.location`, website: sql`excluded.website`,
      followers: sql`excluded.followers`, following: sql`excluded.following`,
      verified: sql`excluded.verified`, lastSeenAt: new Date(), updatedAt: new Date(),
    },
  }).returning({ id: xAuthors.id, xUserId: xAuthors.xUserId, isNew: sql<boolean>`(xmax = 0)` });
  for (const r of rows) out.set(r.xUserId, { id: r.id, isNew: r.isNew });
  return out;
}

async function insertPosts(search: XSearch, tweets: XTweet[], authors: Map<string, { id: string }>): Promise<number> {
  const values = tweets
    .filter((t) => authors.has(t.authorId))
    .map((t) => {
      const author = authors.get(t.authorId)!;
      return {
        tweetId: t.id,
        authorId: author.id,
        searchId: search.id,
        text: t.text,
        lang: t.lang ?? null,
        // /i/web/status resolves without knowing the handle, which can change.
        url: `https://x.com/i/web/status/${t.id}`,
        isReply: t.isReply,
        metrics: t.metrics ?? null,
        postedAt: t.createdAt ? new Date(t.createdAt) : null,
        raw: t.raw as object,
      };
    });
  if (!values.length) return 0;
  const inserted = await db.insert(xPosts).values(values)
    .onConflictDoNothing({ target: xPosts.tweetId })
    .returning({ id: xPosts.id });
  return inserted.length;
}

/** Run one search: page through new posts, store them, advance the cursor. */
async function executeSearch(search: XSearch): Promise<XSearchRunResult> {
  const client = getXClient();
  const result: XSearchRunResult = { searchId: search.id, name: search.name, status: "ok", read: 0, newPosts: 0, newAuthors: 0 };

  // Nothing can be fetched: hand the search back untouched, without logging a
  // failed run — being unconnected or paused by X is a state, not a failure.
  const blockedUntil = client.isConfigured() ? await backoffUntil() : null;
  if (!client.isConfigured() || blockedUntil) {
    await db.update(xSearches).set({ lockedUntil: null }).where(eq(xSearches.id, search.id));
    return client.isConfigured()
      ? { ...result, status: "rate_limited", error: `Paused by X until ${blockedUntil!.toISOString()}` }
      : { ...result, status: "not_configured", error: "X is not connected — set X_BEARER_TOKEN" };
  }

  const [run] = await db.insert(scrapeRuns)
    .values({ source: "x", bucket: "social_listening", terms: [search.query] })
    .returning({ id: scrapeRuns.id });

  let newestId: string | null = null;
  let nextToken: string | null = null;
  let retryAt: Date | null = null;

  try {
    const startTime = search.sinceId ? null : new Date(Date.now() - FIRST_RUN_LOOKBACK_HOURS * 3_600_000);

    // X's minimum page is 10, so a remainder under 10 would overshoot the cap.
    while (result.status === "ok" && search.maxPostsPerRun - result.read >= 10) {
      const budget = monthlyBudget();
      const used = budget === null ? 0 : await readsThisMonth();
      if (budget !== null && used + 10 > budget) {
        result.status = "budget";
        result.error = `Monthly read budget of ${budget} posts reached (X_MONTHLY_READ_BUDGET)`;
        break;
      }

      const page = await client.searchRecent({
        query: search.query,
        maxResults: Math.min(search.maxPostsPerRun - result.read, budget === null ? 100 : budget - used),
        sinceId: search.sinceId,
        startTime,
        nextToken,
      });
      result.read += page.tweets.length;
      await addReads(page.tweets.length);
      // Results come newest first, so the first page carries the new cursor.
      newestId = newerId(newestId, page.newestId);

      const authors = await upsertAuthors([...page.users.values()]);
      result.newAuthors += [...authors.values()].filter((a) => a.isNew).length;
      result.newPosts += await insertPosts(search, page.tweets, authors);

      if (page.rateLimit && page.rateLimit.remaining <= 0) {
        await setBackoff(page.rateLimit.resetAt);
        break;
      }
      nextToken = page.nextToken;
      if (!nextToken || !page.tweets.length) break;
    }
  } catch (error) {
    if (error instanceof XApiError && (error.kind === "rate_limit" || error.kind === "usage_cap" || error.kind === "credits")) {
      result.status = "rate_limited";
      retryAt = error.resetAt;
      if (error.resetAt) await setBackoff(error.resetAt);
      result.error = error.message;
    } else {
      result.status = "error";
      result.error = (error as Error).message;
    }
  }

  // Posts already stored are real progress even when a later page failed, so
  // the cursor advances whenever something was read.
  const now = new Date();
  const nextRun = retryAt && retryAt > now
    ? new Date(Math.max(retryAt.getTime(), now.getTime() + 60_000))
    : new Date(now.getTime() + search.intervalMinutes * 60_000);

  await db.update(xSearches).set({
    sinceId: newerId(search.sinceId, newestId),
    lastRunAt: now,
    nextRunAt: nextRun,
    lockedUntil: null,
    lastStatus: result.status,
    lastError: result.error?.slice(0, 500) ?? null,
    postsFound: sql`${xSearches.postsFound} + ${result.newPosts}`,
    updatedAt: now,
    // An invalid query or a revoked token will fail identically every hour;
    // pause the search instead of burning attempts until someone notices.
    ...(result.status === "error" && /rejected the query|bearer token/i.test(result.error ?? "") ? { enabled: false } : {}),
  }).where(eq(xSearches.id, search.id));

  await db.update(scrapeRuns).set({
    found: result.read, inserted: result.newPosts, updated: 0, skipped: result.read - result.newPosts,
    status: result.status === "ok" ? "completed" : "failed",
    error: result.error?.slice(0, 500) ?? null, finishedAt: new Date(),
  }).where(eq(scrapeRuns.id, run.id));

  return result;
}

/** Run one specific search now, regardless of its schedule. */
export async function runXSearchNow(searchId: string): Promise<XSearchRunResult | null> {
  const search = await claimDueSearch(searchId);
  return search ? executeSearch(search) : null;
}

/* -------------------------------------------------------------------------- */
/* Worker — classifying                                                       */
/* -------------------------------------------------------------------------- */

type ClaimedPost = XPostToClassify & { authorId: string; searchId: string | null; attempts: number };

async function claimUnclassified(limit: number): Promise<ClaimedPost[]> {
  const claimed = await db.execute<{ id: string }>(sql`
    update x_posts set classify_lease_until = now() + interval '5 minutes',
                       classify_attempts = classify_attempts + 1
     where id in (
       select id from x_posts
        where classified_at is null
          and (classify_lease_until is null or classify_lease_until < now())
        order by discovered_at
        limit ${limit}
        for update skip locked)
    returning id`);
  const ids = claimed.rows.map((r) => r.id);
  if (!ids.length) return [];

  const rows = await db
    .select({
      id: xPosts.id, text: xPosts.text, authorId: xPosts.authorId, searchId: xPosts.searchId,
      attempts: xPosts.classifyAttempts,
      authorUsername: xAuthors.username, authorName: xAuthors.name, authorBio: xAuthors.bio,
      authorFollowers: xAuthors.followers, authorWebsite: xAuthors.website,
    })
    .from(xPosts)
    .innerJoin(xAuthors, eq(xAuthors.id, xPosts.authorId))
    .where(inArray(xPosts.id, ids));
  return rows;
}

async function saveClassifications(results: (XPostClassification & { by: string })[], nicheIds: Map<string, string>) {
  if (!results.length) return;
  const values = sql.join(
    results.map((r) => sql`(${r.id}::uuid, ${r.relevance}::smallint, ${r.intent}, ${r.reason}, ${r.niche ? nicheIds.get(r.niche) ?? null : null}::uuid, ${r.by})`),
    sql`, `,
  );
  await db.execute(sql`
    update x_posts p set relevance = v.relevance, intent = v.intent, reason = v.reason,
                         niche_id = v.niche_id, classified_by = v.by,
                         classified_at = now(), classify_lease_until = null
      from (values ${values}) as v(id, relevance, intent, reason, niche_id, by)
     where p.id = v.id`);
}

/**
 * Roll post scores up to their authors, and promote anyone whose best post
 * clears the threshold. Returns authors that became qualified in this pass.
 */
async function refreshAuthors(authorIds: string[], minRelevance: number): Promise<string[]> {
  if (!authorIds.length) return [];
  const promoted = await db.execute<{ id: string }>(sql`
    with best as (
      select distinct on (author_id)
             author_id, relevance, intent, tweet_id, niche_id, search_id,
             count(*) over (partition by author_id) as n
        from x_posts
       where author_id in (${sql.join(authorIds.map((id) => sql`${id}::uuid`), sql`, `)})
         and classified_at is not null
       order by author_id, relevance desc nulls last, posted_at desc nulls last
    ), before as (
      select id, status from x_authors where id in (select author_id from best)
    )
    update x_authors a
       set best_score = best.relevance,
           best_intent = best.intent,
           best_tweet_id = best.tweet_id,
           matched_posts = best.n,
           -- The search's niche is only a fallback for someone who reads like a lead;
           -- a bystander a dental search happened to catch is not a dental lead.
           niche_id = case when best.intent in ('buyer', 'pain', 'hiring')
                           then coalesce(best.niche_id, (select niche_id from x_searches s where s.id = best.search_id), a.niche_id)
                           else a.niche_id end,
           status = case when a.status = 'new' and best.relevance >= ${minRelevance} then 'qualified'::x_lead_status else a.status end,
           updated_at = now()
      from best, before
     where a.id = best.author_id and before.id = a.id
    returning a.id, (before.status = 'new' and a.status = 'qualified') as promoted`);
  return (promoted.rows as { id: string; promoted: boolean }[]).filter((r) => r.promoted).map((r) => r.id);
}

export type ClassifyResult = { classified: number; byRules: number; byModel: number; qualified: number; converted: number; error?: string };

/**
 * Drain the classification queue in batches.
 *
 * The rules run first and settle the definite rejections (vendors, spam,
 * one-word posts) for free; only what survives costs a model call, and those
 * are sent 25 at a time. If the model fails, the batch's leases are released
 * so another pass retries it — after MAX_CLASSIFY_ATTEMPTS the rules decide,
 * so a post can never be stuck in the queue forever.
 */
export async function classifyPending(options: { maxBatches?: number; deadline?: number } = {}): Promise<ClassifyResult> {
  const ai = getAIProvider();
  const [business, config, nicheRows] = await Promise.all([
    getBusinessContext(),
    getXConfig(),
    db.select({ id: niches.id, name: niches.name }).from(niches),
  ]);
  const nicheIds = new Map(nicheRows.map((n) => [n.name, n.id]));
  const result: ClassifyResult = { classified: 0, byRules: 0, byModel: 0, qualified: 0, converted: 0 };
  const maxBatches = options.maxBatches ?? 40;

  for (let i = 0; i < maxBatches; i++) {
    if (options.deadline && Date.now() > options.deadline) break;
    const batch = await claimUnclassified(CLASSIFY_BATCH);
    if (!batch.length) break;

    const decided: (XPostClassification & { by: string })[] = [];
    const forModel: ClaimedPost[] = [];
    for (const post of batch) {
      const verdict = ruleClassify(post, business);
      if (verdict.intent === "seller" || verdict.intent === "noise" || ai.name === "mock" || post.attempts >= MAX_CLASSIFY_ATTEMPTS) {
        decided.push({ ...verdict, by: ai.name === "mock" ? "rules" : post.attempts >= MAX_CLASSIFY_ATTEMPTS ? "rules-fallback" : "rules" });
      } else {
        forModel.push(post);
      }
    }

    if (forModel.length) {
      try {
        const scored = await ai.classifyXPosts({ business, posts: forModel });
        for (const s of scored) decided.push({ ...s, by: `${ai.name}:${ai.model}` });
        result.byModel += scored.length;
      } catch (error) {
        // Hand the unscored posts back; the attempt counter bounds the retries.
        await db.update(xPosts).set({ classifyLeaseUntil: null })
          .where(inArray(xPosts.id, forModel.map((p) => p.id)));
        result.error = `${ai.name}: ${(error as Error).message}`;
      }
    }

    await saveClassifications(decided, nicheIds);
    result.classified += decided.length;
    result.byRules += decided.filter((d) => d.by.startsWith("rules")).length;

    const authorIds = [...new Set(batch.filter((p) => decided.some((d) => d.id === p.id)).map((p) => p.authorId))];
    const promoted = await refreshAuthors(authorIds, config.minRelevance);
    result.qualified += promoted.length;
    if (promoted.length) result.converted += await autoConvert(promoted);

    if (result.error) break;
  }

  // Surface a broken classifier (bad key, quota) on the page, not just in logs.
  if (result.error) {
    await setSetting(KEY_CLASSIFY_ERROR, { message: result.error.slice(0, 500), at: new Date().toISOString() });
  } else if (result.byModel > 0) {
    await db.delete(settings).where(eq(settings.key, KEY_CLASSIFY_ERROR));
  }
  return result;
}

/** Convert newly qualified authors found by searches that opted into it. */
async function autoConvert(authorIds: string[]): Promise<number> {
  const eligible = await db
    .selectDistinct({ id: xAuthors.id })
    .from(xAuthors)
    .innerJoin(xPosts, eq(xPosts.tweetId, xAuthors.bestTweetId))
    .innerJoin(xSearches, eq(xSearches.id, xPosts.searchId))
    .where(and(inArray(xAuthors.id, authorIds), eq(xSearches.autoConvert, true)));
  if (!eligible.length) return 0;
  const { converted } = await convertXAuthors(eligible.map((e) => e.id), null);
  return converted;
}

/* -------------------------------------------------------------------------- */
/* Conversion into the CRM                                                    */
/* -------------------------------------------------------------------------- */

/** Profile links that are not the person's own business site. */
const NOT_A_BUSINESS_SITE = /(^|\.)(linktr\.ee|linktree\.com|beacons\.ai|bio\.link|instagram\.com|facebook\.com|x\.com|twitter\.com|t\.co|youtube\.com|tiktok\.com|linkedin\.com|substack\.com|medium\.com|github\.com|calendly\.com|gumroad\.com|patreon\.com|threads\.net|bsky\.app)$/i;

/**
 * "Jane Smith" reads as a person; "Peak Plumbing & Heating" does not. A single
 * word is usually a brand ("GrowthLoop"), so it is never taken as a name.
 */
function personName(name: string | null): { firstName: string; lastName: string } | null {
  if (!name) return null;
  const clean = name.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  const parts = clean.split(" ");
  if (parts.length < 2 || parts.length > 3) return null;
  if (/\b(llc|inc|ltd|co|group|agency|studio|dental|realty|plumbing|heating|recruit\w*|services?|solutions|clinic|law|homes?|properties|consulting|media|digital|marketing|team|hq)\b/i.test(clean)) return null;
  if (!parts.every((p) => /^\p{Lu}[\p{L}'-]*$/u.test(p))) return null;
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export type ConvertResult = { converted: number; skipped: { authorId: string; reason: string }[] };

/**
 * Turn X authors into a company + contact each.
 *
 * The company is matched on the profile website's domain when there is one,
 * so an author whose business is already in the database lands on that record.
 * Without a website a new company is created rather than guessing by name —
 * two "Sarah"s are not the same business. The X profile URL is stored as the
 * contact's source, and the post that qualified them becomes the first note.
 */
export async function convertXAuthors(authorIds: string[], userId: string | null): Promise<ConvertResult> {
  const result: ConvertResult = { converted: 0, skipped: [] };
  if (!authorIds.length) return result;

  const [source] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.slug, "x")).limit(1);
  const authors = await db
    .select({
      author: xAuthors,
      postText: xPosts.text, postUrl: xPosts.url, postReason: xPosts.reason, postIntent: xPosts.intent,
    })
    .from(xAuthors)
    .leftJoin(xPosts, eq(xPosts.tweetId, xAuthors.bestTweetId))
    .where(inArray(xAuthors.id, authorIds));

  for (const { author, postText, postUrl, postReason, postIntent } of authors) {
    if (author.contactId) { result.skipped.push({ authorId: author.id, reason: "Already in the CRM" }); continue; }

    const profileUrl = `https://x.com/${author.username}`;
    // Converted before under a different author row (e.g. a merged account).
    const [existing] = await db.select({ id: contacts.id, companyId: contacts.companyId })
      .from(contacts).where(eq(contacts.sourceUrl, profileUrl)).limit(1);
    if (existing) {
      await db.update(xAuthors).set({ status: "converted", contactId: existing.id, companyId: existing.companyId, convertedAt: new Date(), updatedAt: new Date() })
        .where(eq(xAuthors.id, author.id));
      result.skipped.push({ authorId: author.id, reason: "Matched an existing lead" });
      continue;
    }

    const rawDomain = normalizeDomain(author.website);
    const domain = rawDomain && !NOT_A_BUSINESS_SITE.test(rawDomain) ? rawDomain : null;
    const website = domain ? normalizeUrl(author.website) : null;

    const reused = domain ? await findCompanyByDomain(domain) : null;
    let companyId: string;
    if (reused) {
      companyId = reused.id;
    } else {
      const [company] = await db.insert(companies).values({
        name: (author.name?.trim() || `@${author.username}`).slice(0, 200),
        website, domain,
        nicheId: author.nicheId,
        location: author.location,
        description: author.bio,
        sourceId: source?.id ?? null,
        sourceUrl: profileUrl,
        sourcedAt: new Date(),
        researchMethod: "x-search",
        ownerId: userId,
      }).returning({ id: companies.id });
      companyId = company.id;
    }

    const person = personName(author.name);
    const [contact] = await db.insert(contacts).values({
      companyId,
      firstName: person?.firstName ?? null,
      lastName: person?.lastName ?? null,
      leadScore: author.bestScore,
      sourceId: source?.id ?? null,
      sourceUrl: profileUrl,
      sourcedAt: new Date(),
      ownerId: userId,
    }).returning({ id: contacts.id });

    await db.insert(notes).values({
      contactId: contact.id, companyId, userId,
      body: [
        `Found on X: @${author.username}${author.followers != null ? ` (${author.followers} followers)` : ""}`,
        author.bio ? `Bio: ${author.bio}` : null,
        postText ? `\nPost (${postIntent ?? "unscored"}, ${author.bestScore ?? "?"}/100): ${postText}` : null,
        postReason ? `Why it qualified: ${postReason}` : null,
        postUrl ? `Link: ${postUrl}` : null,
      ].filter(Boolean).join("\n"),
    });

    await logActivity({
      contactId: contact.id, companyId, userId,
      type: "lead_created",
      subject: `Lead created from X post by @${author.username}${reused ? " (existing company)" : ""}`,
      metadata: { source: "x", username: author.username, tweetId: author.bestTweetId, score: author.bestScore },
    });

    await db.update(xAuthors).set({
      status: "converted", contactId: contact.id, companyId,
      convertedAt: new Date(), updatedAt: new Date(),
    }).where(eq(xAuthors.id, author.id));

    await db.update(xSearches)
      .set({ leadsFound: sql`${xSearches.leadsFound} + 1` })
      .where(sql`${xSearches.id} = (select search_id from x_posts where tweet_id = ${author.bestTweetId ?? ""})`);

    result.converted++;
  }
  return result;
}

export async function setXAuthorStatus(ids: string[], status: "dismissed" | "qualified" | "new"): Promise<number> {
  const rows = await db.update(xAuthors)
    .set({ status, updatedAt: new Date() })
    // Converted authors already own a CRM record; their state lives there now.
    .where(and(inArray(xAuthors.id, ids), sql`${xAuthors.status} <> 'converted'`))
    .returning({ id: xAuthors.id });
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Reads for the UI                                                           */
/* -------------------------------------------------------------------------- */

export type XAuthorFilters = {
  status?: XLeadStatus;
  minScore?: number;
  intent?: string;
  nicheId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listXAuthors(filters: XAuthorFilters = {}) {
  const { page = 1, pageSize = 50 } = filters;
  const clauses: (SQL | undefined)[] = [
    filters.status ? eq(xAuthors.status, filters.status) : undefined,
    filters.minScore ? gte(xAuthors.bestScore, filters.minScore) : undefined,
    filters.intent ? eq(xAuthors.bestIntent, filters.intent) : undefined,
    filters.nicheId ? eq(xAuthors.nicheId, filters.nicheId) : undefined,
    filters.q
      ? or(
          ilike(xAuthors.username, `%${filters.q}%`),
          ilike(xAuthors.name, `%${filters.q}%`),
          ilike(xAuthors.bio, `%${filters.q}%`),
        )
      : undefined,
  ];
  const where = and(...clauses.filter(Boolean) as SQL[]);

  const rows = await db
    .select({
      id: xAuthors.id, username: xAuthors.username, name: xAuthors.name, bio: xAuthors.bio,
      location: xAuthors.location, website: xAuthors.website, followers: xAuthors.followers,
      verified: xAuthors.verified, bestScore: xAuthors.bestScore, bestIntent: xAuthors.bestIntent,
      matchedPosts: xAuthors.matchedPosts, status: xAuthors.status, contactId: xAuthors.contactId,
      lastSeenAt: xAuthors.lastSeenAt, nicheName: niches.name,
      postText: xPosts.text, postUrl: xPosts.url, postReason: xPosts.reason, postedAt: xPosts.postedAt,
      total: sql<number>`count(*) over ()`,
    })
    .from(xAuthors)
    .leftJoin(xPosts, eq(xPosts.tweetId, xAuthors.bestTweetId))
    .leftJoin(niches, eq(niches.id, xAuthors.nicheId))
    .where(where)
    .orderBy(sql`${xAuthors.bestScore} desc nulls last`, desc(xAuthors.lastSeenAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rows: rows.map(({ total: _drop, ...r }) => r),
    total: Number(rows[0]?.total ?? 0),
  };
}

export type XAuthorRow = Awaited<ReturnType<typeof listXAuthors>>["rows"][number];

/** Recent posts, for tuning queries — including the ones that were rejected. */
export async function listRecentXPosts(limit = 100) {
  return db
    .select({
      id: xPosts.id, text: xPosts.text, url: xPosts.url, relevance: xPosts.relevance,
      intent: xPosts.intent, reason: xPosts.reason, classifiedBy: xPosts.classifiedBy,
      postedAt: xPosts.postedAt, discoveredAt: xPosts.discoveredAt,
      username: xAuthors.username, searchName: xSearches.name,
    })
    .from(xPosts)
    .innerJoin(xAuthors, eq(xAuthors.id, xPosts.authorId))
    .leftJoin(xSearches, eq(xSearches.id, xPosts.searchId))
    .orderBy(desc(xPosts.discoveredAt))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* The tick — one unit of worker progress                                     */
/* -------------------------------------------------------------------------- */

export type XTickResult = {
  searches: XSearchRunResult[];
  classify: ClassifyResult;
  durationMs: number;
};

/**
 * Run every due search, then drain the classification queue, within a time
 * budget. Safe to call from any number of processes at once.
 */
export async function runXTick(options: { timeBudgetMs?: number; maxSearches?: number } = {}): Promise<XTickResult> {
  const started = Date.now();
  const deadline = started + (options.timeBudgetMs ?? 55_000);
  const searches: XSearchRunResult[] = [];
  // Skip the search phase entirely when it cannot fetch anything.
  const canSearch = getXClient().isConfigured() && !(await backoffUntil());

  while (canSearch && Date.now() < deadline && searches.length < (options.maxSearches ?? 50)) {
    const search = await claimDueSearch();
    if (!search) break;
    const r = await executeSearch(search);
    searches.push(r);
    // Once X says stop, every other due search would get the same answer.
    if (r.status === "rate_limited" || r.status === "budget" || r.status === "not_configured") break;
  }

  const classify = await classifyPending({ deadline });
  return { searches, classify, durationMs: Date.now() - started };
}

/* -------------------------------------------------------------------------- */
/* In-app scheduler                                                           */
/* -------------------------------------------------------------------------- */

export function isAutorunEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.X_AUTORUN?.trim() ?? "");
}

export function autorunIntervalSeconds(): number {
  const n = Number(process.env.X_AUTORUN_INTERVAL_SECONDS ?? 120);
  return Number.isFinite(n) && n >= 15 ? n : 120;
}

const scheduler = globalThis as unknown as { __xAutorun?: NodeJS.Timeout; __xTickRunning?: boolean };

/**
 * Tick on an interval inside the web server, so leads keep arriving with
 * nothing else deployed. Guarded against HMR re-registering it and against
 * overlapping ticks; the queue leases guard against other processes.
 */
export function startXAutorun(): void {
  if (scheduler.__xAutorun || !isAutorunEnabled()) return;
  const every = autorunIntervalSeconds() * 1000;
  const tick = async () => {
    if (scheduler.__xTickRunning) return;
    scheduler.__xTickRunning = true;
    try {
      const r = await runXTick({ timeBudgetMs: Math.min(every - 5_000, 110_000) });
      const posts = r.searches.reduce((s, x) => s + x.newPosts, 0);
      if (r.searches.length || r.classify.classified) {
        console.log(`[x-autorun] ${r.searches.length} searches, ${posts} new posts, ${r.classify.classified} scored, ${r.classify.qualified} qualified, ${r.classify.converted} converted`);
      }
      if (r.classify.error) console.warn(`[x-autorun] classifier: ${r.classify.error}`);
    } catch (error) {
      console.error("[x-autorun] tick failed:", (error as Error).message);
    } finally {
      scheduler.__xTickRunning = false;
    }
  };
  scheduler.__xAutorun = setInterval(tick, every);
  // First tick shortly after boot rather than a full interval later.
  setTimeout(tick, 10_000);
  console.log(`[x-autorun] scheduler on — every ${every / 1000}s`);
}
