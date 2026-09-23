import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activities, companies, companySignals, contacts, dmDrafts, followUps,
  xAuthors, xPosts, type DmPlatform, type DmStatus,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import type { DmSubject } from "@/lib/ai/types";

const SENDER_NAME = () => process.env.SENDER_NAME?.trim() || "we";

/* -------------------------------------------------------------------------- */
/* Sourcing                                                                   */
/* -------------------------------------------------------------------------- */

export type DmProspect = {
  id: string;
  fullName: string | null;
  companyName: string;
  industry: string | null;
  country: string | null;
  status: string;
  instagram: string | null;
  twitter: string | null;
  /** Path segment plus slug, e.g. "in/jane". Only `in/` profiles are DM-able. */
  linkedin: string | null;
  runsAds: boolean;
  adPlatforms: string[];
  score: number | null;
  opportunities: string[];
  drafted: DmPlatform[];
  /** Surfaced by the X search engine rather than a website scan. */
  fromX: boolean;
};

/**
 * Handles the website scraper caught that are platform plumbing, not profiles:
 * share, login and content routes. A DM can't be sent to any of these, so they
 * read as "no handle".
 */
const JUNK_HANDLES = new Set(["tr", "sharer", "sharer.php", "share.php", "profile.php", "pages", "login", "plugins", "dialog", "hashtag", "groups", "events", "watch", "reel", "stories", "p", "explore", "accounts"]);

const realHandle = (handle: string | null | undefined): string | null =>
  handle && !JUNK_HANDLES.has(handle.toLowerCase()) ? handle : null;

/**
 * Which key in the scraped `social` blob holds each platform's handle.
 *
 * X is stored under "x" because that is what the scraper's pattern is named,
 * while the DM platform enum uses "twitter". Mapping here keeps that mismatch
 * in one place instead of spreading it through every query.
 */
export const SOCIAL_KEY: Record<DmPlatform, string> = {
  instagram: "instagram",
  twitter: "x",
  linkedin: "linkedin",
};

/**
 * Order of preference when a lead has more than one handle.
 *
 * Instagram first because the blueprint's experience is that IG DMs convert
 * best, then LinkedIn where the reader is already in a work mindset, then X.
 */
const PLATFORM_PREFERENCE: DmPlatform[] = ["instagram", "linkedin", "twitter"];

export const PLATFORM_LABEL: Record<DmPlatform, string> = {
  instagram: "Instagram",
  twitter: "X",
  linkedin: "LinkedIn",
};

/** LinkedIn handles are a path, not an @name, so only the others get an @. */
const handleLabel = (platform: DmPlatform, handle: string) =>
  platform === "linkedin" ? handle.replace(/^in\//, "") : `@${handle}`;

export const profileUrl = (platform: DmPlatform, handle: string) => {
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}/`;
    case "twitter":
      return `https://x.com/${handle}`;
    case "linkedin":
      // Newer scans store the path segment ("in/jane"); older rows hold a bare
      // slug, which was almost always a company page.
      return `https://www.linkedin.com/${handle.includes("/") ? handle : `company/${handle}`}`;
  }
};

/**
 * A LinkedIn company page cannot accept a connection request or receive a DM,
 * so only personal profiles are DM-able. Rows scanned before the path segment
 * was captured are bare slugs and cannot be told apart — those are treated as
 * companies, which is what a link on a company website usually is.
 */
export const isDmableLinkedIn = (handle: string) => handle.toLowerCase().startsWith("in/");

/**
 * Leads reachable by DM, from either of two routes:
 *  - their own website links an Instagram, LinkedIn or X account and the site
 *    scan succeeded (verified live), or
 *  - the X search engine found them posting and they were converted — the
 *    handle is verified by definition, since it is where they posted.
 *
 * Ranked ads-first, then by opportunity score — someone already paying for
 * traffic is the blueprint's definition of a serious prospect.
 */
export async function listDmProspects(limit = 200): Promise<DmProspect[]> {
  const siteHasHandle = sql`(${companySignals.error} is null and ${companySignals.social} ?| array['instagram', 'x', 'linkedin'])`;
  const rows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      status: contacts.status,
      companyName: companies.name,
      industry: companies.industry,
      country: companies.country,
      instagram: sql<string | null>`case when ${siteHasHandle} then ${companySignals.social} ->> 'instagram' end`,
      twitter: sql<string | null>`coalesce(${xAuthors.username}, case when ${siteHasHandle} then ${companySignals.social} ->> 'x' end)`,
      linkedin: sql<string | null>`case when ${siteHasHandle} then ${companySignals.social} ->> 'linkedin' end`,
      adPlatforms: companySignals.adPlatforms,
      score: sql<number | null>`coalesce(${companySignals.opportunityScore}, ${xAuthors.bestScore})`,
      opportunities: companySignals.opportunities,
      fromX: sql<boolean>`${xAuthors.id} is not null`,
      // Cast to text[] — node-postgres can't parse a custom enum array and
      // would hand back the raw string '{}', which is truthy.
      drafted: sql<DmPlatform[]>`coalesce(array_agg(${dmDrafts.platform}::text) filter (where ${dmDrafts.id} is not null), '{}')::text[]`,
    })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(companySignals, eq(companySignals.companyId, companies.id))
    .leftJoin(xAuthors, eq(xAuthors.contactId, contacts.id))
    .leftJoin(dmDrafts, eq(dmDrafts.contactId, contacts.id))
    .where(and(
      eq(contacts.archived, false),
      sql`(${siteHasHandle} or ${xAuthors.id} is not null)`,
    ))
    .groupBy(contacts.id, contacts.fullName, contacts.status, companies.name,
      companies.industry, companies.country, companySignals.social, companySignals.error,
      companySignals.adPlatforms, companySignals.opportunityScore, companySignals.opportunities,
      xAuthors.id, xAuthors.username, xAuthors.bestScore)
    .orderBy(
      desc(sql`coalesce(array_length(${companySignals.adPlatforms}, 1), 0) > 0`),
      sql`coalesce(${companySignals.opportunityScore}, ${xAuthors.bestScore}) desc nulls last`,
    )
    .limit(limit);

  return rows
    .map((r) => ({
      ...r,
      instagram: realHandle(r.instagram),
      twitter: realHandle(r.twitter),
      linkedin: r.linkedin && isDmableLinkedIn(r.linkedin) ? r.linkedin : null,
      adPlatforms: r.adPlatforms ?? [],
      opportunities: r.opportunities ?? [],
      runsAds: (r.adPlatforms ?? []).length > 0,
      drafted: r.drafted ?? [],
    }))
    // A row whose only handle was junk (e.g. a share link) or a LinkedIn
    // company page is not DM-able.
    .filter((r) => r.instagram || r.twitter || r.linkedin);
}

/* -------------------------------------------------------------------------- */
/* Drafting                                                                   */
/* -------------------------------------------------------------------------- */

export type DmDraftResult = { created: number; skipped: { contactId: string; reason: string }[] };

/**
 * Write a two-message DM script per contact.
 *
 * Platform is either forced by the caller or chosen by PLATFORM_PREFERENCE from
 * whatever handles the site scan found. On LinkedIn the script also includes
 * the connection-request note, because there the request is the first touch and
 * the message cannot be sent until it is accepted.
 *
 * Like email drafting, nothing is "sent" here: the script is written for the
 * owner to review, copy and send by hand.
 */
export async function draftDmSequences(input: {
  contactIds: string[];
  offer: string;
  /** Force a platform. Omitted, the preference order below decides. */
  platform?: DmPlatform;
}): Promise<DmDraftResult> {
  const ai = getAIProvider();
  const result: DmDraftResult = { created: 0, skipped: [] };

  for (const contactId of input.contactIds) {
    const [row] = await db
      .select({
        contactId: contacts.id, companyId: companies.id,
        fullName: contacts.fullName, jobTitle: contacts.jobTitle,
        companyName: companies.name, industry: companies.industry,
        city: companies.city, country: companies.country, website: companies.website,
        social: companySignals.social,
        adPlatforms: companySignals.adPlatforms,
        hasLiveChat: companySignals.hasLiveChat, hasBooking: companySignals.hasBooking,
        hasVideo: companySignals.hasVideo, hasLeadForm: companySignals.hasLeadForm,
        cms: companySignals.cms, opportunities: companySignals.opportunities,
        signalError: companySignals.error,
        xUsername: xAuthors.username, xBestTweetId: xAuthors.bestTweetId,
      })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .leftJoin(companySignals, eq(companySignals.companyId, companies.id))
      .leftJoin(xAuthors, eq(xAuthors.contactId, contacts.id))
      .where(eq(contacts.id, contactId))
      .limit(1);

    if (!row) { result.skipped.push({ contactId, reason: "Lead not found" }); continue; }

    const raw = (row.social ?? {}) as Record<string, string>;
    const social: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const cleaned = realHandle(value);
      if (cleaned) social[key] = cleaned;
    }
    // A LinkedIn company page is a dead end — it accepts neither a connection
    // request nor a DM — so it never counts as an available handle.
    if (social.linkedin && !isDmableLinkedIn(social.linkedin)) delete social.linkedin;

    // Found on X: that handle is where they are demonstrably active, so it
    // outranks anything linked from their website.
    if (row.xUsername) social.x = row.xUsername;
    const preference: DmPlatform[] = row.xUsername
      ? ["twitter", ...PLATFORM_PREFERENCE.filter((p) => p !== "twitter")]
      : PLATFORM_PREFERENCE;

    const available = preference.filter((candidate) => social[SOCIAL_KEY[candidate]]);
    const platform: DmPlatform | null = input.platform
      ? (available.includes(input.platform) ? input.platform : null)
      : (available[0] ?? null);

    if (!platform) {
      result.skipped.push({
        contactId,
        reason: input.platform
          ? `No usable ${input.platform} handle on file`
          : "No Instagram, LinkedIn or X handle on file",
      });
      continue;
    }

    const handle = social[SOCIAL_KEY[platform]];

    const [bestPost] = row.xBestTweetId
      ? await db.select({ text: xPosts.text }).from(xPosts).where(eq(xPosts.tweetId, row.xBestTweetId)).limit(1)
      : [];

    const subject: DmSubject = {
      companyName: row.companyName, industry: row.industry,
      city: row.city, country: row.country, website: row.website,
      contactName: row.fullName, jobTitle: row.jobTitle,
      signals: row.signalError ? null : {
        runsAds: (row.adPlatforms ?? []).length > 0,
        adPlatforms: row.adPlatforms ?? [],
        hasLiveChat: row.hasLiveChat, hasBooking: row.hasBooking,
        hasVideo: row.hasVideo, hasLeadForm: row.hasLeadForm,
        cms: row.cms,
        socials: Object.keys(social),
        opportunities: row.opportunities ?? [],
      },
      publicPosts: bestPost ? [{ platform: "X", text: bestPost.text }] : undefined,
      offer: input.offer,
      senderName: SENDER_NAME(),
      platform,
      handle,
    };

    let written;
    try {
      written = await ai.writeDmSequence(subject);
    } catch (error) {
      result.skipped.push({ contactId, reason: `Writing failed: ${(error as Error).message}` });
      continue;
    }

    // Regenerating an unsent draft replaces it; a script already in play
    // (first message sent, replied…) is never silently overwritten.
    const [existing] = await db
      .select({ id: dmDrafts.id, status: dmDrafts.status })
      .from(dmDrafts)
      .where(and(eq(dmDrafts.contactId, contactId), eq(dmDrafts.platform, platform)))
      .limit(1);

    if (existing && existing.status !== "draft" && existing.status !== "dismissed") {
      result.skipped.push({ contactId, reason: "A script for this lead is already in progress" });
      continue;
    }

    const values = {
      contactId, companyId: row.companyId, platform, handle,
      connectionNote: written.connectionNote ?? null,
      firstMessage: written.firstMessage, secondMessage: written.secondMessage,
      basisUsed: written.basisUsed, generatedBy: `${ai.name}:${ai.model}`,
      offer: input.offer, status: "draft" as const,
      firstSentAt: null, secondSentAt: null, updatedAt: new Date(),
    };

    if (existing) {
      await db.update(dmDrafts).set(values).where(eq(dmDrafts.id, existing.id));
    } else {
      await db.insert(dmDrafts).values(values);
    }
    result.created++;
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Tracking                                                                   */
/* -------------------------------------------------------------------------- */

export async function listDmDrafts(status?: DmStatus, limit = 200) {
  return db
    .select({
      id: dmDrafts.id, contactId: dmDrafts.contactId, platform: dmDrafts.platform,
      handle: dmDrafts.handle, connectionNote: dmDrafts.connectionNote,
      firstMessage: dmDrafts.firstMessage,
      secondMessage: dmDrafts.secondMessage, basisUsed: dmDrafts.basisUsed,
      generatedBy: dmDrafts.generatedBy, offer: dmDrafts.offer,
      status: dmDrafts.status, firstSentAt: dmDrafts.firstSentAt,
      secondSentAt: dmDrafts.secondSentAt, createdAt: dmDrafts.createdAt,
      fullName: contacts.fullName, companyName: companies.name,
      country: companies.country,
    })
    .from(dmDrafts)
    .innerJoin(contacts, eq(contacts.id, dmDrafts.contactId))
    .innerJoin(companies, eq(companies.id, dmDrafts.companyId))
    .where(status ? eq(dmDrafts.status, status) : undefined)
    .orderBy(desc(dmDrafts.createdAt))
    .limit(limit);
}

/**
 * Advance a script through the manual-send flow and keep the CRM honest about
 * it: sends land on the activity timeline, the lead moves to contacted, and a
 * first send books the blueprint's 3-day follow-up so message two doesn't
 * depend on memory.
 */
export async function setDmStatus(id: string, status: DmStatus): Promise<boolean> {
  const [draft] = await db.select().from(dmDrafts).where(eq(dmDrafts.id, id)).limit(1);
  if (!draft) return false;

  const now = new Date();
  await db.update(dmDrafts)
    .set({
      status,
      // A connection request is the first touch on LinkedIn, so it stamps
      // firstSentAt — otherwise "how long since I reached out" is unanswerable
      // for every LinkedIn lead still waiting on an accept.
      firstSentAt:
        status === "first_sent" || status === "connect_sent" ? now : draft.firstSentAt,
      secondSentAt: status === "second_sent" ? now : draft.secondSentAt,
      updatedAt: now,
    })
    .where(eq(dmDrafts.id, id));

  const OUTBOUND = ["connect_sent", "first_sent", "second_sent"] as const;
  if ((OUTBOUND as readonly string[]).includes(status)) {
    const which =
      status === "connect_sent" ? "connection request"
      : status === "first_sent" ? "opener"
      : "follow-up";
    const body =
      status === "connect_sent" ? (draft.connectionNote ?? "")
      : status === "first_sent" ? draft.firstMessage
      : draft.secondMessage;

    await db.insert(activities).values({
      contactId: draft.contactId, companyId: draft.companyId,
      type: "linkedin_message", // closest outbound-DM activity type on file
      direction: "outbound",
      subject: `${PLATFORM_LABEL[draft.platform]} ${which} sent to ${handleLabel(draft.platform, draft.handle)}`,
      body,
      metadata: { platform: draft.platform, handle: draft.handle, sequence: which },
    });

    await db.update(contacts)
      .set({ lastContactedAt: now, updatedAt: now })
      .where(eq(contacts.id, draft.contactId));
    await db.update(contacts)
      .set({ status: "contacted" })
      .where(and(
        eq(contacts.id, draft.contactId),
        sql`${contacts.status} in ('new', 'researched', 'qualified', 'ready_to_contact')`,
      ));

    // Each outbound step books the check that has to happen next, so neither
    // an unanswered request nor an unsent follow-up depends on memory.
    const nextTask =
      status === "connect_sent"
        ? `Check whether ${handleLabel(draft.platform, draft.handle)} accepted the LinkedIn connection — if so, send the opener from the Social DMs page.`
        : status === "first_sent"
          ? `Send DM follow-up #2 on ${PLATFORM_LABEL[draft.platform]} (${handleLabel(draft.platform, draft.handle)}) if no reply — script is ready on the Social DMs page.`
          : null;

    if (nextTask) {
      await db.insert(followUps).values({
        contactId: draft.contactId,
        dueAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        type: "task",
        priority: "normal",
        notes: nextTask,
      });
    }
  }

  if (status === "replied") {
    await db.update(contacts)
      .set({ status: "replied", updatedAt: now })
      .where(and(
        eq(contacts.id, draft.contactId),
        sql`${contacts.status} not in ('positive_reply', 'meeting_booked', 'proposal_sent', 'negotiation', 'won')`,
      ));
  }

  return true;
}

export async function getDmStats() {
  const rows = await db
    .select({ status: dmDrafts.status, n: sql<number>`count(*)` })
    .from(dmDrafts)
    .groupBy(dmDrafts.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<DmStatus, number>>;
}
