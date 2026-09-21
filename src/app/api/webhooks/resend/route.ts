import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailMessages, outreachEvents } from "@/db/schema";
import { suppress } from "@/lib/services/outreach";

/**
 * Resend delivery webhook.
 *
 * This is what keeps the suppression list honest without anyone maintaining it:
 * a hard bounce or a spam complaint removes the address immediately, which is
 * the single most effective thing you can do to protect a sending domain.
 *
 * Point Resend at:  POST {APP_URL}/api/webhooks/resend
 */
type ResendEvent = {
  type?: string;
  data?: { email_id?: string; to?: string[]; bounce?: { type?: string } };
};

const STATUS_FOR: Record<string, string> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (secret) {
    // Resend signs with Svix headers; reject anything unsigned when a secret is set.
    const signature = request.headers.get("svix-signature");
    if (!signature) return Response.json({ error: "Unsigned request" }, { status: 401 });
  }

  const event = (await request.json().catch(() => null)) as ResendEvent | null;
  const type = event?.type;
  const providerId = event?.data?.email_id;
  if (!type || !providerId) return Response.json({ ok: true, ignored: true });

  const [message] = await db
    .select({ id: emailMessages.id, contactId: emailMessages.contactId, toEmail: emailMessages.toEmail })
    .from(emailMessages)
    .where(eq(emailMessages.providerMessageId, providerId))
    .limit(1);

  if (!message) return Response.json({ ok: true, unknown: true });

  const status = STATUS_FOR[type];
  if (status) {
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "delivered") patch.deliveredAt = new Date();
    if (status === "opened") patch.openedAt = new Date();
    await db.update(emailMessages).set(patch).where(eq(emailMessages.id, message.id));
  }

  // A soft bounce may recover; a hard bounce or a complaint never does.
  if (type === "email.complained") {
    await suppress(message.toEmail, "complained", "Marked as spam", message.id);
  } else if (type === "email.bounced" && event?.data?.bounce?.type !== "Transient") {
    await suppress(message.toEmail, "bounced", "Hard bounce", message.id);
  }

  await db.insert(outreachEvents).values({
    contactId: message.contactId,
    provider: "resend",
    externalId: `${providerId}:${type}`,
    eventType: type,
    payload: event as Record<string, unknown>,
  }).onConflictDoNothing();

  return Response.json({ ok: true });
}
