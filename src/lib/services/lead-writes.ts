import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  companies,
  contacts,
  contactTags,
  notes,
  researchJobs,
  type LeadStatus,
} from "@/db/schema";
import { normalizeDomain, normalizeEmail, normalizeLinkedIn, normalizePhone, normalizeUrl } from "@/lib/utils";
import type { BulkAction, CreateLeadInput } from "@/lib/validation";
import { logActivity } from "./activities";
import { findCompanyByDomain, findCompanyByName, findDuplicateContact, mergePreferExisting } from "./dedupe";

export type CreateLeadResult =
  | { status: "created"; contactId: string; companyId: string; companyReused: boolean }
  | {
      status: "duplicate";
      contactId: string;
      companyId: string;
      matchedOn: "email" | "linkedin";
      existing: { companyName: string; fullName: string | null; email: string | null };
    };

/**
 * Create a lead (company + contact), reusing the company when the domain
 * already exists and refusing to create a second contact for the same
 * email/LinkedIn.
 */
export async function createLead(
  input: CreateLeadInput,
  userId: string | null,
): Promise<CreateLeadResult> {
  const email = normalizeEmail(input.email);
  const linkedin = normalizeLinkedIn(input.linkedinUrl);

  const duplicate = await findDuplicateContact({ email, linkedinUrl: linkedin });
  if (duplicate) {
    return {
      status: "duplicate",
      contactId: duplicate.contactId,
      companyId: duplicate.companyId,
      matchedOn: duplicate.matchedOn,
      existing: {
        companyName: duplicate.companyName,
        fullName: duplicate.fullName,
        email: duplicate.email,
      },
    };
  }

  const domain = normalizeDomain(input.website) ?? normalizeDomain(email);
  const companyPayload = {
    name: input.companyName.trim(),
    website: normalizeUrl(input.website),
    domain,
    industry: input.industry ?? null,
    nicheId: input.nicheId ?? null,
    location: input.location ?? null,
    country: input.country ?? null,
    city: input.city ?? null,
    employeeCount: input.employeeCount ?? null,
    revenue: input.revenue !== undefined ? String(input.revenue) : null,
    description: input.companyDescription ?? null,
    linkedinUrl: input.companyLinkedin ?? null,
    phone: normalizePhone(input.companyPhone),
    email: input.companyEmail ?? null,
    sourceId: input.sourceId ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourcedAt: new Date(),
    ownerId: userId,
  };

  const existingCompany =
    (await findCompanyByDomain(domain)) ?? (domain ? null : await findCompanyByName(input.companyName));

  let companyId: string;
  const companyReused = Boolean(existingCompany);

  if (existingCompany) {
    companyId = existingCompany.id;
    const patch = mergePreferExisting(existingCompany, companyPayload);
    // Niche is an explicit user decision, so it always wins over the old value.
    if (input.nicheId) patch.nicheId = input.nicheId;
    delete patch.ownerId;
    delete patch.sourcedAt;
    if (Object.keys(patch).length) {
      await db.update(companies).set(patch).where(eq(companies.id, companyId));
    }
  } else {
    const [created] = await db.insert(companies).values(companyPayload).returning({ id: companies.id });
    companyId = created.id;
  }

  const [contact] = await db
    .insert(contacts)
    .values({
      companyId,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      jobTitle: input.jobTitle ?? null,
      email,
      phone: normalizePhone(input.phone),
      linkedinUrl: linkedin,
      status: input.status ?? "new",
      leadScore: input.leadScore ?? null,
      sourceId: input.sourceId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      sourcedAt: new Date(),
      ownerId: userId,
    })
    .returning({ id: contacts.id });

  if (input.tagIds?.length) {
    await db
      .insert(contactTags)
      .values(input.tagIds.map((tagId) => ({ contactId: contact.id, tagId })))
      .onConflictDoNothing();
  }

  if (input.notes) {
    await db.insert(notes).values({ contactId: contact.id, companyId, body: input.notes, userId });
  }

  await logActivity({
    contactId: contact.id,
    companyId,
    type: "lead_created",
    subject: `Lead created${companyReused ? " on existing company" : ""}`,
    userId,
  });

  return { status: "created", contactId: contact.id, companyId, companyReused };
}

export async function updateLeadStatus(
  contactId: string,
  status: LeadStatus,
  userId: string | null,
): Promise<void> {
  const [current] = await db
    .select({ status: contacts.status, companyId: contacts.companyId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!current || current.status === status) return;

  const nowContacted = ["contacted", "follow_up"].includes(status);

  await db
    .update(contacts)
    .set({
      status,
      ...(nowContacted ? { lastContactedAt: new Date() } : {}),
    })
    .where(eq(contacts.id, contactId));

  await logActivity({
    contactId,
    companyId: current.companyId,
    type: status === "meeting_booked" ? "meeting_booked" : "status_changed",
    subject: `Status: ${current.status} → ${status}`,
    metadata: { from: current.status, to: status },
    userId,
  });
}

export type BulkResult = { affected: number; message: string };

export async function runBulkAction(action: BulkAction, userId: string | null): Promise<BulkResult> {
  const { ids } = action;

  switch (action.action) {
    case "set_status": {
      const rows = await db
        .select({ id: contacts.id, companyId: contacts.companyId, status: contacts.status })
        .from(contacts)
        .where(inArray(contacts.id, ids));
      const changed = rows.filter((r) => r.status !== action.status);
      if (!changed.length) return { affected: 0, message: "No leads needed a status change" };

      await db
        .update(contacts)
        .set({
          status: action.status,
          ...(["contacted", "follow_up"].includes(action.status)
            ? { lastContactedAt: new Date() }
            : {}),
        })
        .where(inArray(contacts.id, changed.map((r) => r.id)));

      await logActivity(
        changed.map((r) => ({
          contactId: r.id,
          companyId: r.companyId,
          type: "status_changed" as const,
          subject: `Status: ${r.status} → ${action.status}`,
          metadata: { from: r.status, to: action.status, bulk: true },
          userId,
        })),
      );
      return { affected: changed.length, message: `Moved ${changed.length} leads` };
    }

    case "set_niche": {
      // Niche lives on the company, so update the companies these leads belong to.
      const rows = await db
        .select({ companyId: contacts.companyId })
        .from(contacts)
        .where(inArray(contacts.id, ids));
      const companyIds = [...new Set(rows.map((r) => r.companyId))];
      if (!companyIds.length) return { affected: 0, message: "No leads found" };

      await db
        .update(companies)
        .set({ nicheId: action.nicheId })
        .where(inArray(companies.id, companyIds));
      return {
        affected: ids.length,
        message: `Updated niche on ${companyIds.length} companies (${ids.length} leads)`,
      };
    }

    case "add_tag": {
      await db
        .insert(contactTags)
        .values(ids.map((contactId) => ({ contactId, tagId: action.tagId })))
        .onConflictDoNothing();
      return { affected: ids.length, message: `Tagged ${ids.length} leads` };
    }

    case "remove_tag": {
      await db
        .delete(contactTags)
        .where(and(inArray(contactTags.contactId, ids), eq(contactTags.tagId, action.tagId)));
      return { affected: ids.length, message: `Removed tag from ${ids.length} leads` };
    }

    case "mark_contacted": {
      const rows = await db
        .select({ id: contacts.id, companyId: contacts.companyId, status: contacts.status })
        .from(contacts)
        .where(inArray(contacts.id, ids));

      await db
        .update(contacts)
        .set({
          lastContactedAt: new Date(),
          // Only advance leads that have not already moved past "contacted".
          status: sql`case when ${contacts.status} in ('new','researched','qualified','ready_to_contact') then 'contacted'::lead_status else ${contacts.status} end`,
        })
        .where(inArray(contacts.id, ids));

      await logActivity(
        rows.map((r) => ({
          contactId: r.id,
          companyId: r.companyId,
          type: "email_sent" as const,
          direction: "outbound" as const,
          subject: "Marked as contacted",
          metadata: { bulk: true },
          userId,
        })),
      );
      return { affected: rows.length, message: `Marked ${rows.length} leads as contacted` };
    }

    case "archive": {
      await db.update(contacts).set({ archived: action.archived }).where(inArray(contacts.id, ids));
      return {
        affected: ids.length,
        message: `${action.archived ? "Archived" : "Restored"} ${ids.length} leads`,
      };
    }

    case "set_owner": {
      await db.update(contacts).set({ ownerId: action.ownerId }).where(inArray(contacts.id, ids));
      return { affected: ids.length, message: `Reassigned ${ids.length} leads` };
    }

    case "delete": {
      const deleted = await db
        .delete(contacts)
        .where(inArray(contacts.id, ids))
        .returning({ id: contacts.id });
      return { affected: deleted.length, message: `Deleted ${deleted.length} leads` };
    }

    case "queue_research": {
      const rows = await db
        .select({ id: contacts.id, companyId: contacts.companyId })
        .from(contacts)
        .where(inArray(contacts.id, ids));
      if (!rows.length) return { affected: 0, message: "No leads found" };

      await db
        .insert(researchJobs)
        .values(
          rows.map((r) => ({ contactId: r.id, companyId: r.companyId, requestedBy: userId })),
        );
      return { affected: rows.length, message: `Queued ${rows.length} leads for AI research` };
    }
  }
}
