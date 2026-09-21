import "server-only";

import { and, count, desc, eq, gte, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { companies, companySignals, jobPostings, scrapeRuns, type LeadBucket } from "@/db/schema";
import { getScraper, SCRAPERS } from "@/lib/scrapers";
import { ALL_KEYWORDS, scoreMatch } from "@/lib/scrapers/keywords";
import { scanWebsite } from "@/lib/scrapers/signals";
import { findCompanyOpenings, toAtsSlug } from "@/lib/scrapers/sources/ats";

export type RunResult = {
  runId: string;
  source: string;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
};

/**
 * Run one scraper and persist what it found.
 *
 * Postings are keyed on their URL, so re-running a source refreshes existing
 * rows instead of duplicating them — and crucially never resets the application
 * status, because clobbering "applied" with "new" would lose real work.
 */
export async function runScraper(
  name: string,
  options: { terms?: string[]; limit?: number; minScore?: number } = {},
): Promise<RunResult> {
  const scraper = getScraper(name);
  if (!scraper) throw new Error(`Unknown scraper: ${name}`);

  const terms = options.terms?.length ? options.terms : ALL_KEYWORDS;
  const minScore = options.minScore ?? 1;

  const [run] = await db
    .insert(scrapeRuns)
    .values({ source: name, bucket: scraper.bucket, terms })
    .returning({ id: scrapeRuns.id });

  try {
    const jobs = await scraper.scrape({ terms, limit: options.limit });
    let inserted = 0, updated = 0, skipped = 0;

    for (const job of jobs) {
      const { score, hits } = scoreMatch(job.title, job.description ?? "", terms);
      if (score < minScore) { skipped++; continue; }

      // Tie the posting to a company already in the database when the name matches.
      const companyId = job.companyName ? await matchCompany(job.companyName) : null;

      const values = {
        source: job.source,
        sourceId: job.sourceId ?? null,
        url: job.url,
        title: job.title.slice(0, 500),
        companyName: job.companyName?.slice(0, 255) ?? null,
        companyId,
        location: job.location?.slice(0, 255) ?? null,
        remote: job.remote ?? false,
        salary: job.salary?.slice(0, 120) ?? null,
        description: job.description?.slice(0, 8000) ?? null,
        contactEmail: job.contactEmail ?? null,
        keywords: hits,
        bucket: job.bucket,
        score,
        postedAt: job.postedAt ?? null,
        raw: job.raw ?? null,
      };

      const [row] = await db
        .insert(jobPostings)
        .values(values)
        .onConflictDoUpdate({
          target: jobPostings.url,
          set: {
            // Refresh what the source knows; leave status/appliedAt/notes alone,
            // or a re-scrape would wipe out work already done on the lead.
            title: values.title, companyName: values.companyName, companyId: values.companyId,
            location: values.location, salary: values.salary, description: values.description,
            contactEmail: values.contactEmail, keywords: values.keywords, score: values.score,
            postedAt: values.postedAt, raw: values.raw, updatedAt: new Date(),
          },
        })
        // In Postgres, xmax = 0 on an upsert means the row was freshly inserted
        // rather than updated — an exact split without a second query.
        .returning({ isNew: sql<boolean>`(xmax = 0)` });

      if (row?.isNew) inserted++;
      else updated++;
    }

    await db.update(scrapeRuns)
      .set({ found: jobs.length, inserted, updated, skipped, status: "completed", finishedAt: new Date() })
      .where(eq(scrapeRuns.id, run.id));

    return { runId: run.id, source: name, found: jobs.length, inserted, updated, skipped };
  } catch (error) {
    await db.update(scrapeRuns)
      .set({ status: "failed", error: (error as Error).message.slice(0, 500), finishedAt: new Date() })
      .where(eq(scrapeRuns.id, run.id));
    throw error;
  }
}

/** Case-insensitive company match, so postings link to existing records. */
async function matchCompany(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (trimmed.length < 3) return null;
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(sql`lower(${companies.name})`, trimmed.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

export async function runAllScrapers(
  options: { limit?: number; minScore?: number; terms?: string[] } = {},
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const scraper of SCRAPERS) {
    try {
      results.push(await runScraper(scraper.name, options));
    } catch (error) {
      results.push({ runId: "", source: scraper.name, found: 0, inserted: 0, updated: 0, skipped: 0 });
      console.error(`[lead-engine] ${scraper.name} failed:`, (error as Error).message);
    }
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/* Website signals                                                            */
/* -------------------------------------------------------------------------- */

export type ScanResult = { scanned: number; reachable: number; unreachable: number; spending: number };

/**
 * Scan company websites and store what was found.
 *
 * Runs in small concurrent batches: sequential would take hours over a thousand
 * sites, and firing them all at once would look like an attack.
 */
export async function scanCompanySignals(
  options: { limit?: number; rescanOlderThanDays?: number; concurrency?: number } = {},
): Promise<ScanResult> {
  const { limit = 100, rescanOlderThanDays, concurrency = 6 } = options;

  const stale = rescanOlderThanDays
    ? sql`${companySignals.checkedAt} < now() - ${`${rescanOlderThanDays} days`}::interval`
    : undefined;

  const targets = await db
    .select({ id: companies.id, website: companies.website })
    .from(companies)
    .leftJoin(companySignals, eq(companySignals.companyId, companies.id))
    .where(and(isNotNull(companies.website), stale ? or(isNull(companySignals.id), stale) : isNull(companySignals.id)))
    .limit(limit);

  const result: ScanResult = { scanned: 0, reachable: 0, unreachable: 0, spending: 0 };

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(batch.map(async (target) => {
      if (!target.website) return;
      const report = await scanWebsite(target.website);
      result.scanned++;
      if (report.error) result.unreachable++;
      else {
        result.reachable++;
        if (report.suggestedBucket === "spending_money") result.spending++;
      }

      await db.insert(companySignals).values({
        companyId: target.id,
        httpStatus: report.httpStatus, finalUrl: report.finalUrl, error: report.error,
        hasLiveChat: report.hasLiveChat, chatVendor: report.chatVendor,
        hasBooking: report.hasBooking, bookingVendor: report.bookingVendor,
        hasLeadForm: report.hasLeadForm, hasVideo: report.hasVideo,
        adPlatforms: report.adPlatforms, hasAnalytics: report.hasAnalytics,
        cms: report.cms, stack: report.stack, https: report.https,
        mobileFriendly: report.mobileFriendly, social: report.social,
        opportunityScore: report.opportunityScore, opportunities: report.opportunities,
        suggestedBucket: report.suggestedBucket,
        checkedAt: new Date(),
      }).onConflictDoUpdate({
        target: companySignals.companyId,
        set: {
          httpStatus: report.httpStatus, finalUrl: report.finalUrl, error: report.error,
          hasLiveChat: report.hasLiveChat, chatVendor: report.chatVendor,
          hasBooking: report.hasBooking, bookingVendor: report.bookingVendor,
          hasLeadForm: report.hasLeadForm, hasVideo: report.hasVideo,
          adPlatforms: report.adPlatforms, hasAnalytics: report.hasAnalytics,
          cms: report.cms, stack: report.stack, https: report.https,
          mobileFriendly: report.mobileFriendly, social: report.social,
          opportunityScore: report.opportunityScore, opportunities: report.opportunities,
          suggestedBucket: report.suggestedBucket, checkedAt: new Date(),
        },
      });
    }));
  }

  return result;
}

/** What is this company hiring for right now, via their ATS board. */
export async function scrapeCompanyOpenings(companyName: string): Promise<number> {
  const jobs = await findCompanyOpenings(toAtsSlug(companyName));
  if (!jobs.length) return 0;
  const companyId = await matchCompany(companyName);
  let saved = 0;
  for (const job of jobs) {
    const { score, hits } = scoreMatch(job.title, job.description ?? "", ALL_KEYWORDS);
    await db.insert(jobPostings).values({
      source: job.source, sourceId: job.sourceId ?? null, url: job.url,
      title: job.title.slice(0, 500), companyName, companyId,
      location: job.location ?? null, remote: job.remote ?? false,
      description: job.description?.slice(0, 8000) ?? null,
      contactEmail: job.contactEmail ?? null, keywords: hits, bucket: "active_buyer",
      score, postedAt: job.postedAt ?? null, raw: job.raw ?? null,
    }).onConflictDoNothing({ target: jobPostings.url });
    saved++;
  }
  return saved;
}

/* -------------------------------------------------------------------------- */
/* Reads for the UI                                                           */
/* -------------------------------------------------------------------------- */

export async function getEngineStats() {
  const [buckets, statuses, sources, signals, runs] = await Promise.all([
    db.select({ bucket: jobPostings.bucket, n: count() }).from(jobPostings).groupBy(jobPostings.bucket),
    db.select({ status: jobPostings.status, n: count() }).from(jobPostings).groupBy(jobPostings.status),
    db.select({ source: jobPostings.source, n: count(), best: sql<number>`max(${jobPostings.score})` })
      .from(jobPostings).groupBy(jobPostings.source).orderBy(desc(count())),
    db.select({
      scanned: count(),
      reachable: sql<number>`count(*) filter (where ${companySignals.error} is null)`,
      spending: sql<number>`count(*) filter (where ${companySignals.suggestedBucket} = 'spending_money')`,
      noChat: sql<number>`count(*) filter (where ${companySignals.hasLiveChat} = false)`,
      noBooking: sql<number>`count(*) filter (where ${companySignals.hasBooking} = false)`,
      noVideo: sql<number>`count(*) filter (where ${companySignals.hasVideo} = false)`,
    }).from(companySignals),
    db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.startedAt)).limit(12),
  ]);

  return {
    buckets: Object.fromEntries(buckets.map((b) => [b.bucket, Number(b.n)])) as Record<LeadBucket, number>,
    statuses: Object.fromEntries(statuses.map((s) => [s.status, Number(s.n)])),
    sources: sources.map((s) => ({ source: s.source, count: Number(s.n), best: Number(s.best ?? 0) })),
    signals: signals[0] ?? { scanned: 0, reachable: 0, spending: 0, noChat: 0, noBooking: 0, noVideo: 0 },
    runs,
  };
}

export type JobFilters = {
  bucket?: LeadBucket;
  status?: string;
  source?: string;
  q?: string;
  minScore?: number;
  page?: number;
  pageSize?: number;
};

export async function listJobPostings(filters: JobFilters = {}) {
  const { page = 1, pageSize = 50 } = filters;
  const clauses: (SQL | undefined)[] = [
    filters.bucket ? eq(jobPostings.bucket, filters.bucket) : undefined,
    filters.status ? eq(jobPostings.status, filters.status as never) : undefined,
    filters.source ? eq(jobPostings.source, filters.source) : undefined,
    filters.minScore ? gte(jobPostings.score, filters.minScore) : undefined,
    filters.q
      ? or(
          ilike(jobPostings.title, `%${filters.q}%`),
          ilike(jobPostings.companyName, `%${filters.q}%`),
          ilike(jobPostings.description, `%${filters.q}%`),
        )
      : undefined,
  ].filter(Boolean);
  const where = clauses.length ? and(...(clauses as SQL[])) : undefined;

  const rows = await db
    .select({
      id: jobPostings.id, source: jobPostings.source, url: jobPostings.url,
      title: jobPostings.title, companyName: jobPostings.companyName,
      companyId: jobPostings.companyId, location: jobPostings.location,
      remote: jobPostings.remote, salary: jobPostings.salary,
      contactEmail: jobPostings.contactEmail, keywords: jobPostings.keywords,
      bucket: jobPostings.bucket, score: jobPostings.score,
      postedAt: jobPostings.postedAt, discoveredAt: jobPostings.discoveredAt,
      status: jobPostings.status, appliedAt: jobPostings.appliedAt, notes: jobPostings.notes,
      total: sql<number>`count(*) over ()`,
    })
    .from(jobPostings)
    .where(where)
    .orderBy(desc(jobPostings.score), desc(jobPostings.postedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rows: rows.map(({ total: _drop, ...r }) => r),
    total: Number(rows[0]?.total ?? 0),
  };
}

export type JobRow = Awaited<ReturnType<typeof listJobPostings>>["rows"][number];

export async function updateJobPosting(
  id: string,
  patch: { status?: string; notes?: string | null },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status) {
    set.status = patch.status;
    // Stamp the application date the moment it moves to applied.
    if (patch.status === "applied") set.appliedAt = new Date();
  }
  if (patch.notes !== undefined) set.notes = patch.notes;
  const [row] = await db.update(jobPostings).set(set).where(eq(jobPostings.id, id)).returning();
  return row ?? null;
}

/** Companies with the biggest gaps, for the "needs you" / "spending money" buckets. */
export async function listOpportunities(bucket?: LeadBucket, limit = 100) {
  return db
    .select({
      companyId: companies.id, name: companies.name, website: companies.website,
      city: companies.city, country: companies.country, industry: companies.industry,
      score: companySignals.opportunityScore, opportunities: companySignals.opportunities,
      adPlatforms: companySignals.adPlatforms, chatVendor: companySignals.chatVendor,
      bookingVendor: companySignals.bookingVendor, cms: companySignals.cms,
      social: companySignals.social, bucket: companySignals.suggestedBucket,
      checkedAt: companySignals.checkedAt,
    })
    .from(companySignals)
    .innerJoin(companies, eq(companies.id, companySignals.companyId))
    .where(and(isNull(companySignals.error), bucket ? eq(companySignals.suggestedBucket, bucket) : undefined))
    .orderBy(desc(companySignals.opportunityScore))
    .limit(limit);
}
