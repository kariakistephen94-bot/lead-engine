import "server-only";

import { randomUUID, randomBytes } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activities, companies, companySignals, contacts, emailAccounts, emailMessages,
  emailSuppressions, outreachEvents, type EmailMessage,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import type { PersonalisationSubject } from "@/lib/ai/types";
import { isRetryableSendError } from "@/lib/integrations/email/resend";
import { pickAccount, providerFor } from "@/lib/services/email-accounts";
import { normalizeEmail } from "@/lib/utils";

const APP_URL = () => (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SENDER_NAME = () => process.env.SENDER_NAME?.trim() || "";
const SENDER_ADDRESS = () => process.env.SENDER_POSTAL_ADDRESS?.trim() || "";

/* -------------------------------------------------------------------------- */
/* Suppression                                                                */
/* -------------------------------------------------------------------------- */

export async function isSuppressed(email: string): Promise<boolean> {
  const normalised = normalizeEmail(email);
  if (!normalised) return true; // Unusable address — never attempt it.
  const [row] = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(eq(sql`lower(${emailSuppressions.email})`, normalised))
    .limit(1);
  return Boolean(row);
}

export async function suppress(
  email: string,
  reason: "unsubscribed" | "bounced" | "complained" | "manual",
  note?: string,
  messageId?: string,
): Promise<void> {
  const normalised = normalizeEmail(email);
  if (!normalised) return;
  await db
    .insert(emailSuppressions)
    .values({ email: normalised, reason, note: note ?? null, messageId: messageId ?? null })
    .onConflictDoNothing();
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

/** Everything the model is allowed to know, assembled from the database. */
async function buildSubject(contactId: string, offer: string): Promise<PersonalisationSubject | null> {
  const [row] = await db
    .select({
      fullName: contacts.fullName, jobTitle: contacts.jobTitle,
      companyName: companies.name, industry: companies.industry,
      city: companies.city, country: companies.country, website: companies.website,
      runsAds: sql<boolean>`coalesce(array_length(${companySignals.adPlatforms}, 1) > 0, false)`,
      adPlatforms: companySignals.adPlatforms,
      hasLiveChat: companySignals.hasLiveChat, hasBooking: companySignals.hasBooking,
      hasVideo: companySignals.hasVideo, hasLeadForm: companySignals.hasLeadForm,
      cms: companySignals.cms, social: companySignals.social,
      opportunities: companySignals.opportunities, signalError: companySignals.error,
    })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(companySignals, eq(companySignals.companyId, companies.id))
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!row) return null;

  // A site we could not read tells us nothing. Passing its blanks to the model
  // as facts would invite an opener asserting gaps that may not exist.
  const signals = row.signalError
    ? null
    : {
        runsAds: Boolean(row.runsAds),
        adPlatforms: row.adPlatforms ?? [],
        hasLiveChat: row.hasLiveChat, hasBooking: row.hasBooking,
        hasVideo: row.hasVideo, hasLeadForm: row.hasLeadForm,
        cms: row.cms,
        socials: row.social && typeof row.social === "object"
          ? Object.keys(row.social as Record<string, unknown>)
          : [],
        opportunities: row.opportunities ?? [],
      };

  return {
    companyName: row.companyName, industry: row.industry, city: row.city,
    country: row.country, website: row.website, contactName: row.fullName,
    jobTitle: row.jobTitle, signals, offer, senderName: SENDER_NAME() || "we",
  };
}

/** The footer every message carries. Identity and opt-out are not optional. */
function footer(unsubscribeToken: string): { text: string; html: string } {
  const url = `${APP_URL()}/unsubscribe/${unsubscribeToken}`;
  const who = [SENDER_NAME(), SENDER_ADDRESS()].filter(Boolean).join(" · ");
  // Anti-spam law in the UK, EU and US requires a real identity here. Until
  // SENDER_NAME and SENDER_POSTAL_ADDRESS are set the line is simply omitted
  // rather than rendered blank — see the warning on the Outreach page.
  const identity = who ? `${who}\n` : "";
  return {
    text: `\n\n—\n${identity}Don't want to hear from me again? ${url}`,
    html:
      `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px">` +
      `<p style="font:12px system-ui,sans-serif;color:#6b7280;margin:0">` +
      (who ? `${escapeHtml(who)}<br>` : "") +
      `<a href="${url}" style="color:#6b7280">Don't want to hear from me again?</a></p>`,
  };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const toHtml = (text: string) =>
  `<div style="font:15px/1.6 system-ui,-apple-system,sans-serif;color:#111827">` +
  text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("") +
  `</div>`;

export type DraftResult = { created: number; skipped: { contactId: string; reason: string }[] };

/**
 * Write a personalised draft for each contact. Nothing is sent here — drafts
 * exist so the copy can be read before it goes out, which is the only reliable
 * defence against a model saying something wrong about someone's business.
 */
export async function draftCampaign(input: {
  contactIds: string[];
  campaignName: string;
  offer: string;
  campaignId?: string;
}): Promise<DraftResult & { campaignId: string }> {
  const campaignId = input.campaignId ?? randomUUID();
  const ai = getAIProvider();
  const result: DraftResult = { created: 0, skipped: [] };

  for (const contactId of input.contactIds) {
    const [contact] = await db
      .select({ id: contacts.id, email: contacts.email, fullName: contacts.fullName, companyId: contacts.companyId })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    if (!contact?.email) { result.skipped.push({ contactId, reason: "No email address" }); continue; }
    if (await isSuppressed(contact.email)) {
      result.skipped.push({ contactId, reason: "Suppressed (unsubscribed or bounced)" });
      continue;
    }

    const subject = await buildSubject(contactId, input.offer);
    if (!subject) { result.skipped.push({ contactId, reason: "Contact not found" }); continue; }

    let written;
    try {
      written = await ai.personaliseEmail(subject);
    } catch (error) {
      result.skipped.push({ contactId, reason: `Personalisation failed: ${(error as Error).message}` });
      continue;
    }

    const token = randomBytes(24).toString("base64url");
    const foot = footer(token);

    try {
      await db.insert(emailMessages).values({
        contactId: contact.id, companyId: contact.companyId, campaignId,
        campaignName: input.campaignName,
        toEmail: contact.email, toName: contact.fullName,
        subject: written.subject,
        bodyText: written.body + foot.text,
        bodyHtml: toHtml(written.body) + foot.html,
        personalisationBasis: written.basisUsed,
        personalisedBy: `${ai.name}:${ai.model}`,
        unsubscribeToken: token,
        status: "draft",
      });
      result.created++;
    } catch {
      // The unique (contact, campaign) index makes a repeat run idempotent.
      result.skipped.push({ contactId, reason: "Already drafted for this campaign" });
    }
  }

  return { ...result, campaignId };
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

export type SendResult = { sent: number; failed: number; skipped: number; capped: boolean };

/**
 * Send approved messages, one at a time, respecting every limit.
 *
 * Stops the moment capacity runs out rather than queueing past it: the caps
 * exist to protect the sending domains, so quietly exceeding them would defeat
 * the whole arrangement.
 */
export async function sendQueued(limit = 150): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, skipped: 0, capped: false };

  for (let i = 0; i < limit; i++) {
    const capacity = await pickAccount();
    if (!capacity) { result.capped = true; break; }

    const [message] = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.status, "queued"))
      .orderBy(emailMessages.createdAt)
      .limit(1);

    if (!message) break;

    // Re-check immediately before sending: someone may have unsubscribed
    // between drafting and now.
    if (await isSuppressed(message.toEmail)) {
      await db.update(emailMessages)
        .set({ status: "skipped", error: "Suppressed before send", updatedAt: new Date() })
        .where(eq(emailMessages.id, message.id));
      result.skipped++;
      continue;
    }

    await db.update(emailMessages)
      .set({ status: "sending", accountId: capacity.account.id, attempts: message.attempts + 1, updatedAt: new Date() })
      .where(eq(emailMessages.id, message.id));

    try {
      const provider = await providerFor(capacity.account);
      const sent = await provider.sendRich({
        from: `${capacity.account.fromName} <${capacity.account.fromEmail}>`,
        to: message.toEmail,
        subject: message.subject,
        body: message.bodyText,
        html: message.bodyHtml ?? undefined,
        replyTo: capacity.account.replyTo ?? undefined,
        headers: {
          // One-click opt-out in the client's own UI, which mail providers
          // reward and which spares the recipient hunting for the link.
          "List-Unsubscribe": `<${APP_URL()}/unsubscribe/${message.unsubscribeToken}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      await db.update(emailMessages)
        .set({ status: "sent", providerMessageId: sent.id || null, sentAt: new Date(), error: null, updatedAt: new Date() })
        .where(eq(emailMessages.id, message.id));

      await db.update(emailAccounts)
        .set({ lastSentAt: new Date() })
        .where(eq(emailAccounts.id, capacity.account.id));

      await recordSend(message, capacity.account.fromEmail);
      result.sent++;
    } catch (error) {
      const retryable = isRetryableSendError(error);
      await db.update(emailMessages)
        .set({
          // A transient failure goes back in the queue; a rejection does not.
          status: retryable && message.attempts < 3 ? "queued" : "failed",
          error: (error as Error).message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(emailMessages.id, message.id));
      result.failed++;
    }
  }

  return result;
}

/** Log the send against the lead so the CRM timeline tells the whole story. */
async function recordSend(message: EmailMessage, fromEmail: string): Promise<void> {
  if (!message.contactId) return;

  const [activity] = await db.insert(activities).values({
    contactId: message.contactId,
    companyId: message.companyId,
    type: "email_sent",
    subject: message.subject,
    body: message.bodyText,
    metadata: { campaign: message.campaignName, from: fromEmail },
  }).returning({ id: activities.id });

  await db.insert(outreachEvents).values({
    contactId: message.contactId,
    activityId: activity?.id ?? null,
    provider: "resend",
    externalId: message.providerMessageId,
    eventType: "sent",
    payload: { campaign: message.campaignName },
  }).onConflictDoNothing();

  // Move the lead forward, but never backwards — a reply outranks a send.
  await db.update(contacts)
    .set({ lastContactedAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, message.contactId));

  await db.update(contacts)
    .set({ status: "contacted" })
    .where(and(eq(contacts.id, message.contactId), inArray(contacts.status, ["new", "researched", "qualified", "ready_to_contact"])));
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function approveDrafts(campaignId: string, messageIds?: string[]): Promise<number> {
  const where = messageIds?.length
    ? and(eq(emailMessages.campaignId, campaignId), inArray(emailMessages.id, messageIds), eq(emailMessages.status, "draft"))
    : and(eq(emailMessages.campaignId, campaignId), eq(emailMessages.status, "draft"));
  const rows = await db.update(emailMessages)
    .set({ status: "queued", updatedAt: new Date() })
    .where(where)
    .returning({ id: emailMessages.id });
  return rows.length;
}

export async function listMessages(filters: { status?: string; campaignId?: string; limit?: number } = {}) {
  const clauses = [
    filters.status ? eq(emailMessages.status, filters.status as never) : undefined,
    filters.campaignId ? eq(emailMessages.campaignId, filters.campaignId) : undefined,
  ].filter(Boolean);

  return db
    .select({
      id: emailMessages.id, toEmail: emailMessages.toEmail, toName: emailMessages.toName,
      subject: emailMessages.subject, bodyText: emailMessages.bodyText,
      status: emailMessages.status, error: emailMessages.error,
      campaignName: emailMessages.campaignName, campaignId: emailMessages.campaignId,
      basis: emailMessages.personalisationBasis, personalisedBy: emailMessages.personalisedBy,
      sentAt: emailMessages.sentAt, createdAt: emailMessages.createdAt,
      fromEmail: emailAccounts.fromEmail,
      companyName: companies.name,
    })
    .from(emailMessages)
    .leftJoin(emailAccounts, eq(emailAccounts.id, emailMessages.accountId))
    .leftJoin(companies, eq(companies.id, emailMessages.companyId))
    .where(clauses.length ? and(...(clauses as never[])) : undefined)
    .orderBy(desc(emailMessages.createdAt))
    .limit(filters.limit ?? 100);
}

export async function getOutreachStats() {
  const [statuses, suppressed] = await Promise.all([
    db.select({ status: emailMessages.status, n: sql<number>`count(*)` })
      .from(emailMessages).groupBy(emailMessages.status),
    db.select({ n: sql<number>`count(*)` }).from(emailSuppressions),
  ]);
  return {
    statuses: Object.fromEntries(statuses.map((s) => [s.status, Number(s.n)])),
    suppressed: Number(suppressed[0]?.n ?? 0),
  };
}

/** Contacts that can actually be emailed: real address, not already suppressed. */
export async function listSendableContacts(limit = 200, bucket?: "spending_money" | "needs_you") {
  return db
    .select({
      id: contacts.id, email: contacts.email, fullName: contacts.fullName,
      companyName: companies.name, industry: companies.industry,
      country: companies.country,
      score: companySignals.opportunityScore,
      opportunities: companySignals.opportunities,
    })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(companySignals, eq(companySignals.companyId, companies.id))
    .leftJoin(emailSuppressions, eq(sql`lower(${emailSuppressions.email})`, sql`lower(${contacts.email})`))
    .where(and(
      isNotNull(contacts.email),
      eq(contacts.archived, false),
      isNull(emailSuppressions.id),
      isNull(companySignals.error),
      bucket ? eq(companySignals.suggestedBucket, bucket) : undefined,
    ))
    .orderBy(desc(companySignals.opportunityScore))
    .limit(limit);
}
