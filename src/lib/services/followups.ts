import "server-only";

import { asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { companies, contacts, followUps, niches } from "@/db/schema";

export type FollowUpItem = {
  id: string;
  contactId: string;
  dueAt: Date;
  type: string;
  priority: string;
  notes: string | null;
  fullName: string | null;
  jobTitle: string | null;
  email: string | null;
  companyName: string;
  nicheName: string | null;
  nicheColor: string | null;
  status: string;
  leadScore: number | null;
  /** overdue | today | upcoming — computed in SQL against the server's date. */
  bucket: "overdue" | "today" | "upcoming";
};

export async function listOpenFollowUps(limit = 300): Promise<FollowUpItem[]> {
  const rows = await db
    .select({
      id: followUps.id,
      contactId: followUps.contactId,
      dueAt: followUps.dueAt,
      type: followUps.type,
      priority: followUps.priority,
      notes: followUps.notes,
      fullName: contacts.fullName,
      jobTitle: contacts.jobTitle,
      email: contacts.email,
      status: contacts.status,
      leadScore: contacts.leadScore,
      companyName: companies.name,
      nicheName: niches.name,
      nicheColor: niches.color,
      bucket: sql<"overdue" | "today" | "upcoming">`
        case
          when ${followUps.dueAt}::date < current_date then 'overdue'
          when ${followUps.dueAt}::date = current_date then 'today'
          else 'upcoming'
        end`,
    })
    .from(followUps)
    .innerJoin(contacts, eq(followUps.contactId, contacts.id))
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .leftJoin(niches, eq(companies.nicheId, niches.id))
    .where(isNull(followUps.completedAt))
    // Overdue first, then by priority, then soonest — the order you work in.
    .orderBy(
      asc(followUps.dueAt),
      sql`case ${followUps.priority} when 'high' then 0 when 'normal' then 1 else 2 end`,
    )
    .limit(limit);

  return rows as FollowUpItem[];
}
