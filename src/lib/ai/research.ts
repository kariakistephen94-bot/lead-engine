import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiResearch, companies, contacts, niches, researchJobs } from "@/db/schema";
import { logActivity } from "@/lib/services/activities";
import { getAIProvider } from "./index";
import type { ResearchSubject } from "./types";
import { fetchWebsiteText } from "./website";

export type ResearchOutcome = {
  researchId: string;
  score: number;
  provider: string;
  model: string;
  websiteRead: boolean;
  websiteError?: string;
};

/**
 * The "Research Lead" pipeline.
 *
 * 1. Gather everything already known about the company and contact.
 * 2. Read the website.
 * 3. Ask the configured AI provider to assess fit.
 * 4. Persist the research, update the lead score, advance the status and log
 *    the activity — all so the result is visible everywhere, not just here.
 */
export async function researchLead(
  contactId: string,
  userId: string | null,
): Promise<ResearchOutcome> {
  const [row] = await db
    .select({
      contactId: contacts.id,
      companyId: companies.id,
      status: contacts.status,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      jobTitle: contacts.jobTitle,
      contactEmail: contacts.email,
      companyName: companies.name,
      website: companies.website,
      domain: companies.domain,
      industry: companies.industry,
      location: companies.location,
      employeeCount: companies.employeeCount,
      revenue: companies.revenue,
      description: companies.description,
      linkedinUrl: companies.linkedinUrl,
      nicheName: niches.name,
      nicheTargetMarket: niches.targetMarket,
      nicheIdealSize: niches.idealCompanySize,
      nicheJobTitles: niches.targetJobTitles,
      nichePainPoints: niches.painPoints,
      nicheOffer: niches.offer,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .leftJoin(niches, eq(companies.nicheId, niches.id))
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!row) throw new Error("Lead not found");

  const site = await fetchWebsiteText(row.website ?? row.domain);

  const subject: ResearchSubject = {
    companyName: row.companyName,
    website: row.website,
    domain: row.domain,
    industry: row.industry,
    location: row.location,
    employeeCount: row.employeeCount,
    revenue: row.revenue,
    description: row.description,
    linkedinUrl: row.linkedinUrl,
    contactName: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
    jobTitle: row.jobTitle,
    contactEmail: row.contactEmail,
    niche: row.nicheName
      ? {
          name: row.nicheName,
          targetMarket: row.nicheTargetMarket,
          idealCompanySize: row.nicheIdealSize,
          targetJobTitles: row.nicheJobTitles,
          painPoints: row.nichePainPoints,
          offer: row.nicheOffer,
        }
      : null,
    websiteText: site?.text ?? null,
  };

  const provider = getAIProvider();
  const result = await provider.researchLead(subject);

  const [saved] = await db
    .insert(aiResearch)
    .values({
      companyId: row.companyId,
      contactId: row.contactId,
      summary: result.summary,
      whatTheyDo: result.whatTheyDo,
      painPoints: result.painPoints,
      automationOpportunities: result.automationOpportunities,
      recommendedOffer: result.recommendedOffer,
      personalization: result.personalization,
      score: result.score,
      scoreReason: result.scoreReason,
      confidence: String(result.confidence.toFixed(3)),
      provider: provider.name,
      model: provider.model,
      sourcesUsed: [
        site?.ok ? `website:${site.url}` : null,
        "crm:company_record",
        row.nicheName ? `niche:${row.nicheName}` : null,
      ].filter((s): s is string => Boolean(s)),
      raw: { websiteError: site?.error ?? null },
    })
    .returning({ id: aiResearch.id });

  await db
    .update(contacts)
    .set({
      leadScore: result.score,
      // "New" leads graduate to "Researched"; anything further along is left alone.
      status: row.status === "new" ? "researched" : row.status,
    })
    .where(eq(contacts.id, contactId));

  await logActivity({
    contactId,
    companyId: row.companyId,
    type: "research_completed",
    subject: `AI research completed — score ${result.score}/100`,
    body: result.summary,
    metadata: {
      provider: provider.name,
      model: provider.model,
      score: result.score,
      websiteRead: Boolean(site?.ok),
    },
    userId,
  });

  return {
    researchId: saved.id,
    score: result.score,
    provider: provider.name,
    model: provider.model,
    websiteRead: Boolean(site?.ok),
    websiteError: site?.error,
  };
}

/** Latest research for a company, newest first. */
export async function getLatestResearch(companyId: string) {
  const [row] = await db
    .select()
    .from(aiResearch)
    .where(eq(aiResearch.companyId, companyId))
    .orderBy(desc(aiResearch.createdAt))
    .limit(1);
  return row ?? null;
}

export async function countQueuedResearch(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(researchJobs)
    .where(eq(researchJobs.status, "queued"));
  return row?.count ?? 0;
}

export type QueueRunSummary = { processed: number; failed: number; remaining: number };

/**
 * Drain up to `limit` queued research jobs.
 *
 * Jobs are claimed with `for update skip locked` so two concurrent runners
 * never pick up the same job — this is what lets the queue be drained by a
 * button today and by a cron worker later without changing the code.
 */
export async function runResearchQueue(limit: number, userId: string | null): Promise<QueueRunSummary> {
  const claimed = await db.execute<{ id: string; contact_id: string | null }>(sql`
    update research_jobs
    set status = 'running', started_at = now(), attempts = attempts + 1
    where id in (
      select id from research_jobs
      where status = 'queued'
      order by created_at
      limit ${limit}
      for update skip locked
    )
    returning id, contact_id
  `);

  let processed = 0;
  let failed = 0;

  for (const job of claimed.rows) {
    if (!job.contact_id) {
      await db
        .update(researchJobs)
        .set({ status: "failed", error: "Job has no contact", completedAt: new Date() })
        .where(eq(researchJobs.id, job.id));
      failed++;
      continue;
    }

    try {
      await researchLead(job.contact_id, userId);
      await db
        .update(researchJobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(researchJobs.id, job.id));
      processed++;
    } catch (error) {
      await db
        .update(researchJobs)
        .set({
          status: "failed",
          error: (error as Error).message.slice(0, 500),
          completedAt: new Date(),
        })
        .where(eq(researchJobs.id, job.id));
      failed++;
    }
  }

  return { processed, failed, remaining: await countQueuedResearch() };
}

/** Queue explicit contacts for research, skipping ones already queued. */
export async function queueResearch(contactIds: string[], userId: string | null): Promise<number> {
  if (!contactIds.length) return 0;

  const rows = await db
    .select({ id: contacts.id, companyId: contacts.companyId })
    .from(contacts)
    .where(inArray(contacts.id, contactIds));

  const alreadyQueued = new Set(
    (
      await db
        .select({ contactId: researchJobs.contactId })
        .from(researchJobs)
        .where(
          and(inArray(researchJobs.contactId, contactIds), eq(researchJobs.status, "queued")),
        )
    ).map((r) => r.contactId),
  );

  const pending = rows.filter((r) => !alreadyQueued.has(r.id));
  if (!pending.length) return 0;

  await db
    .insert(researchJobs)
    .values(pending.map((r) => ({ contactId: r.id, companyId: r.companyId, requestedBy: userId })));

  return pending.length;
}

export async function listResearchJobs(limit = 25) {
  return db
    .select({
      id: researchJobs.id,
      status: researchJobs.status,
      error: researchJobs.error,
      createdAt: researchJobs.createdAt,
      completedAt: researchJobs.completedAt,
      contactId: researchJobs.contactId,
      companyName: companies.name,
    })
    .from(researchJobs)
    .leftJoin(companies, eq(researchJobs.companyId, companies.id))
    .orderBy(asc(researchJobs.status), desc(researchJobs.createdAt))
    .limit(limit);
}
