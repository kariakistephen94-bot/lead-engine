import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";

import { db } from "@/db";
import { companies, contacts, deals, leadSources, niches, users } from "@/db/schema";
import { DEAL_STAGES } from "@/lib/constants";
import { logActivity } from "@/lib/services/activities";
import type { dealSchema } from "@/lib/validation";

export async function listDeals() {
  return db
    .select({
      id: deals.id,
      name: deals.name,
      value: deals.value,
      currency: deals.currency,
      stage: deals.stage,
      probability: deals.probability,
      expectedCloseDate: deals.expectedCloseDate,
      notes: deals.notes,
      createdAt: deals.createdAt,
      closedAt: deals.closedAt,
      companyId: deals.companyId,
      companyName: companies.name,
      contactId: deals.contactId,
      contactName: contacts.fullName,
      nicheName: niches.name,
      nicheColor: niches.color,
      sourceName: leadSources.name,
      ownerName: users.name,
    })
    .from(deals)
    .leftJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(niches, eq(deals.nicheId, niches.id))
    .leftJoin(leadSources, eq(deals.sourceId, leadSources.id))
    .leftJoin(users, eq(deals.ownerId, users.id))
    .orderBy(desc(deals.createdAt));
}

export type DealRow = Awaited<ReturnType<typeof listDeals>>[number];

export async function createDeal(input: z.infer<typeof dealSchema>, userId: string | null) {
  const stageDefault = DEAL_STAGES.find((s) => s.value === input.stage);

  // Derive niche and source from the company/contact so per-niche and
  // per-source revenue reporting works without the user re-entering them.
  let nicheId = input.nicheId ?? null;
  let sourceId = input.sourceId ?? null;
  if (input.companyId && (!nicheId || !sourceId)) {
    const [company] = await db
      .select({ nicheId: companies.nicheId, sourceId: companies.sourceId })
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    nicheId ??= company?.nicheId ?? null;
    sourceId ??= company?.sourceId ?? null;
  }

  const [created] = await db
    .insert(deals)
    .values({
      name: input.name,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      value: String(input.value ?? 0),
      currency: input.currency ?? "USD",
      stage: input.stage ?? "lead",
      probability: input.probability ?? stageDefault?.probability ?? 10,
      expectedCloseDate: input.expectedCloseDate ?? null,
      nicheId,
      sourceId,
      notes: input.notes ?? null,
      ownerId: userId,
      closedAt: input.stage === "won" || input.stage === "lost" ? new Date() : null,
    })
    .returning();

  await logActivity({
    contactId: input.contactId ?? null,
    companyId: input.companyId ?? null,
    type: "deal_created",
    subject: `Deal created: ${input.name}`,
    metadata: { dealId: created.id, value: input.value },
    userId,
  });

  return created;
}

export async function updateDealStage(
  dealId: string,
  stage: (typeof DEAL_STAGES)[number]["value"],
  userId: string | null,
) {
  const stageDefault = DEAL_STAGES.find((s) => s.value === stage);
  const closing = stage === "won" || stage === "lost";

  const [updated] = await db
    .update(deals)
    .set({
      stage,
      probability: stageDefault?.probability ?? 10,
      closedAt: closing ? new Date() : null,
    })
    .where(eq(deals.id, dealId))
    .returning();

  if (!updated) return null;

  await logActivity({
    contactId: updated.contactId,
    companyId: updated.companyId,
    type: stage === "won" ? "deal_won" : stage === "lost" ? "deal_lost" : "deal_created",
    subject: `Deal moved to ${stageDefault?.label ?? stage}`,
    metadata: { dealId, stage, value: updated.value },
    userId,
  });

  // Winning a deal should be reflected on the lead too.
  if (updated.contactId && closing) {
    await db
      .update(contacts)
      .set({ status: stage === "won" ? "won" : "lost" })
      .where(eq(contacts.id, updated.contactId));
  }

  return updated;
}

export async function deleteDeal(dealId: string) {
  const [deleted] = await db.delete(deals).where(eq(deals.id, dealId)).returning({ id: deals.id });
  return deleted ?? null;
}

/** Companies with at least one contact, for the deal form's picker. */
export async function listDealTargets(limit = 500) {
  return db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      contactId: sql<string | null>`(
        select c.id from contacts c
        where c.company_id = ${companies.id}
        order by c.lead_score desc nulls last
        limit 1
      )`,
    })
    .from(companies)
    .orderBy(companies.name)
    .limit(limit);
}
