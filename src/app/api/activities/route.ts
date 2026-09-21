import { eq } from "drizzle-orm";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activities";
import { updateLeadStatus } from "@/lib/services/lead-writes";
import { activitySchema } from "@/lib/validation";

const INBOUND = new Set(["email_replied"]);

/**
 * Logging outreach also moves the lead: recording a sent email on an untouched
 * lead should not leave it sitting in "New".
 */
const STATUS_EFFECT: Record<string, "contacted" | "replied" | "meeting_booked" | "proposal_sent"> = {
  email_sent: "contacted",
  call_made: "contacted",
  linkedin_message: "contacted",
  email_replied: "replied",
  meeting_booked: "meeting_booked",
  proposal_sent: "proposal_sent",
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = activitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid activity", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { contactId, type, subject, body, occurredAt } = parsed.data;

  const [lead] = await db
    .select({ companyId: contacts.companyId, status: contacts.status })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  const when = occurredAt ? new Date(occurredAt) : new Date();

  await logActivity({
    contactId,
    companyId: lead.companyId,
    type,
    direction: INBOUND.has(type) ? "inbound" : "outbound",
    subject: subject ?? null,
    body: body ?? null,
    occurredAt: when,
    userId: auth.user.userId,
  });

  if (!INBOUND.has(type)) {
    await db.update(contacts).set({ lastContactedAt: when }).where(eq(contacts.id, contactId));
  }

  const nextStatus = STATUS_EFFECT[type];
  // Only ever move a lead forward — logging a call must not undo "Meeting booked".
  if (nextStatus && shouldAdvance(lead.status, nextStatus)) {
    await updateLeadStatus(contactId, nextStatus, auth.user.userId);
  }

  return Response.json({ ok: true }, { status: 201 });
}

const ORDER = [
  "new","researched","qualified","ready_to_contact","contacted","follow_up",
  "replied","positive_reply","meeting_booked","proposal_sent","negotiation","won",
];

function shouldAdvance(current: string, next: string): boolean {
  const currentIndex = ORDER.indexOf(current);
  const nextIndex = ORDER.indexOf(next);
  // Leave terminal states (lost / not interested / DNC) exactly where they are.
  if (currentIndex === -1) return false;
  return nextIndex > currentIndex;
}
