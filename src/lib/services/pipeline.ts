import "server-only";

import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { companies, contacts, niches, type LeadStatus } from "@/db/schema";
import { CARDS_PER_COLUMN, KANBAN_STATUSES } from "@/lib/constants";

export type PipelineCard = {
  id: string;
  fullName: string | null;
  companyName: string;
  jobTitle: string | null;
  leadScore: number | null;
  nicheName: string | null;
  nicheColor: string | null;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
  status: LeadStatus;
};

export type PipelineColumn = {
  status: LeadStatus;
  total: number;
  cards: PipelineCard[];
};

/**
 * Board data.
 *
 * A Kanban over 50k leads cannot load every card, so each column is capped and
 * the true count is reported separately — the header shows the real total while
 * only the visible slice is transferred.
 */
export async function getPipeline(nicheIds: string[] = []): Promise<PipelineColumn[]> {
  const nicheFilter = buildNicheFilter(nicheIds);
  const base = and(eq(contacts.archived, false), inArray(contacts.status, KANBAN_STATUSES), nicheFilter);

  const counts = await db
    .select({ status: contacts.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(base)
    .groupBy(contacts.status);

  const countByStatus = new Map(counts.map((c) => [c.status, c.count]));

  // One query with a per-status window rank beats one query per column.
  const rows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      jobTitle: contacts.jobTitle,
      leadScore: contacts.leadScore,
      status: contacts.status,
      nextFollowUpAt: contacts.nextFollowUpAt,
      lastContactedAt: contacts.lastContactedAt,
      companyName: companies.name,
      nicheName: niches.name,
      nicheColor: niches.color,
      rank: sql<number>`row_number() over (partition by ${contacts.status} order by ${contacts.leadScore} desc nulls last, ${contacts.updatedAt} desc)`.mapWith(
        Number,
      ),
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .leftJoin(niches, eq(companies.nicheId, niches.id))
    .where(base)
    .orderBy(desc(contacts.leadScore));

  const byStatus = new Map<LeadStatus, PipelineCard[]>();
  for (const row of rows) {
    if (row.rank > CARDS_PER_COLUMN) continue;
    const { rank: _rank, ...card } = row;
    const list = byStatus.get(row.status) ?? [];
    list.push(card as PipelineCard);
    byStatus.set(row.status, list);
  }

  return KANBAN_STATUSES.map((status) => ({
    status,
    total: countByStatus.get(status) ?? 0,
    cards: byStatus.get(status) ?? [],
  }));
}

function buildNicheFilter(nicheIds: string[]): SQL | undefined {
  if (!nicheIds.length) return undefined;
  const ids = nicheIds.filter((id) => id !== "none");
  const parts: (SQL | undefined)[] = [];
  if (ids.length) parts.push(inArray(companies.nicheId, ids));
  if (nicheIds.includes("none")) parts.push(isNull(companies.nicheId));
  return parts.length > 1 ? or(...parts) : parts[0];
}
