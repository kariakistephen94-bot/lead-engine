import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { contacts, followUps } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activities";

type Params = { params: Promise<{ id: string }> };

/** Mark a follow-up done, then repoint the lead at its next open one. */
export async function PATCH(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const [updated] = await db
    .update(followUps)
    .set({ completedAt: new Date() })
    .where(and(eq(followUps.id, id), isNull(followUps.completedAt)))
    .returning();

  if (!updated) return Response.json({ error: "Follow-up not found or already done" }, { status: 404 });

  const [next] = await db
    .select({ dueAt: followUps.dueAt })
    .from(followUps)
    .where(and(eq(followUps.contactId, updated.contactId), isNull(followUps.completedAt)))
    .orderBy(asc(followUps.dueAt))
    .limit(1);

  await db
    .update(contacts)
    .set({ nextFollowUpAt: next?.dueAt ?? null })
    .where(eq(contacts.id, updated.contactId));

  const [lead] = await db
    .select({ companyId: contacts.companyId })
    .from(contacts)
    .where(eq(contacts.id, updated.contactId))
    .limit(1);

  await logActivity({
    contactId: updated.contactId,
    companyId: lead?.companyId ?? null,
    type: "follow_up_logged",
    subject: "Follow-up completed",
    userId: auth.user.userId,
  });

  return Response.json({ ok: true, nextDueAt: next?.dueAt ?? null });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const [deleted] = await db
    .delete(followUps)
    .where(eq(followUps.id, (await params).id))
    .returning();
  if (!deleted) return Response.json({ error: "Follow-up not found" }, { status: 404 });

  const [next] = await db
    .select({ dueAt: followUps.dueAt })
    .from(followUps)
    .where(and(eq(followUps.contactId, deleted.contactId), isNull(followUps.completedAt), gt(followUps.dueAt, new Date(0))))
    .orderBy(asc(followUps.dueAt))
    .limit(1);

  await db
    .update(contacts)
    .set({ nextFollowUpAt: next?.dueAt ?? null })
    .where(eq(contacts.id, deleted.contactId));

  return Response.json({ ok: true });
}
