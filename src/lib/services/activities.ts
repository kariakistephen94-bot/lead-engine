import "server-only";

import { desc, eq, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities, users, type ActivityType, type NewActivity } from "@/db/schema";

type LogInput = {
  contactId?: string | null;
  companyId?: string | null;
  type: ActivityType;
  direction?: "outbound" | "inbound" | "system";
  subject?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  userId?: string | null;
};

/**
 * Every state change writes here. The timeline is append-only — nothing in the
 * app updates or deletes an activity, so it stays a trustworthy audit trail.
 */
export async function logActivity(input: LogInput | LogInput[]): Promise<void> {
  const list = Array.isArray(input) ? input : [input];
  if (!list.length) return;

  const rows: NewActivity[] = list.map((entry) => ({
    contactId: entry.contactId ?? null,
    companyId: entry.companyId ?? null,
    type: entry.type,
    direction: entry.direction ?? "system",
    subject: entry.subject ?? null,
    body: entry.body ?? null,
    metadata: entry.metadata ?? null,
    occurredAt: entry.occurredAt ?? new Date(),
    userId: entry.userId ?? null,
  }));

  await db.insert(activities).values(rows);
}

export async function listActivitiesForLead(contactId: string, companyId: string, limit = 100) {
  return db
    .select({
      id: activities.id,
      type: activities.type,
      direction: activities.direction,
      subject: activities.subject,
      body: activities.body,
      metadata: activities.metadata,
      occurredAt: activities.occurredAt,
      userName: users.name,
    })
    .from(activities)
    .leftJoin(users, eq(activities.userId, users.id))
    .where(or(eq(activities.contactId, contactId), eq(activities.companyId, companyId)))
    .orderBy(desc(activities.occurredAt), desc(activities.id))
    .limit(limit);
}

export async function listRecentActivity(limit = 12) {
  return db
    .select({
      id: activities.id,
      type: activities.type,
      subject: activities.subject,
      occurredAt: activities.occurredAt,
      contactId: activities.contactId,
      userName: users.name,
    })
    .from(activities)
    .leftJoin(users, eq(activities.userId, users.id))
    .orderBy(desc(activities.occurredAt), desc(activities.id))
    .limit(limit);
}

export async function countActivitiesSince(types: ActivityType[], since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(activities)
    .where(sql`${activities.type} = ANY(${types}) and ${activities.occurredAt} >= ${since}`);
  return row?.count ?? 0;
}
