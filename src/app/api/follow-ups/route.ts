import { eq } from "drizzle-orm";

import { db } from "@/db";
import { contacts, followUps } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activities";
import { followUpSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = followUpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid follow-up", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { contactId, dueAt, type, priority, notes } = parsed.data;
  const [lead] = await db
    .select({ companyId: contacts.companyId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  const due = new Date(dueAt);

  const [created] = await db
    .insert(followUps)
    .values({ contactId, dueAt: due, type, priority, notes: notes ?? null, userId: auth.user.userId })
    .returning();

  // Mirror onto the lead so the table's "Next follow-up" column stays correct
  // without a join to the follow-ups table on every page of the grid.
  await db.update(contacts).set({ nextFollowUpAt: due }).where(eq(contacts.id, contactId));

  await logActivity({
    contactId,
    companyId: lead.companyId,
    type: "follow_up_logged",
    subject: `Follow-up scheduled for ${due.toLocaleDateString("en-US")}`,
    userId: auth.user.userId,
  });

  return Response.json(created, { status: 201 });
}
