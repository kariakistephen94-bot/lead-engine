import { eq } from "drizzle-orm";

import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activities";
import { findDuplicateContact } from "@/lib/services/dedupe";
import { getLead } from "@/lib/services/leads";
import { updateLeadStatus } from "@/lib/services/lead-writes";
import { normalizeDomain, normalizeEmail, normalizeLinkedIn, normalizePhone, normalizeUrl } from "@/lib/utils";
import { updateCompanySchema, updateLeadSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const lead = await getLead((await params).id);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });
  return Response.json(lead);
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid update", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [existing] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Lead not found" }, { status: 404 });

  const { status, ...fields } = parsed.data;
  const patch: Record<string, unknown> = {};

  if (fields.firstName !== undefined) patch.firstName = fields.firstName || null;
  if (fields.lastName !== undefined) patch.lastName = fields.lastName || null;
  if (fields.jobTitle !== undefined) patch.jobTitle = fields.jobTitle || null;
  if (fields.phone !== undefined) patch.phone = normalizePhone(fields.phone);
  if (fields.leadScore !== undefined) patch.leadScore = fields.leadScore;
  if (fields.sourceId !== undefined) patch.sourceId = fields.sourceId;
  if (fields.ownerId !== undefined) patch.ownerId = fields.ownerId;
  if (fields.archived !== undefined) patch.archived = fields.archived;
  if (fields.nextFollowUpAt !== undefined) {
    patch.nextFollowUpAt = fields.nextFollowUpAt ? new Date(fields.nextFollowUpAt) : null;
  }

  // Changing an identity field can collide with another lead — check first so
  // the user gets a real message rather than a unique-constraint error.
  if (fields.email !== undefined || fields.linkedinUrl !== undefined) {
    const email = fields.email !== undefined ? normalizeEmail(fields.email) : existing.email;
    const linkedin =
      fields.linkedinUrl !== undefined ? normalizeLinkedIn(fields.linkedinUrl) : existing.linkedinUrl;

    const duplicate = await findDuplicateContact({
      email: fields.email !== undefined ? email : null,
      linkedinUrl: fields.linkedinUrl !== undefined ? linkedin : null,
      excludeContactId: id,
    });
    if (duplicate) {
      return Response.json(
        {
          error: `Another lead already uses this ${duplicate.matchedOn} (${duplicate.fullName ?? duplicate.email} at ${duplicate.companyName}).`,
          duplicate,
        },
        { status: 409 },
      );
    }
    if (fields.email !== undefined) patch.email = email;
    if (fields.linkedinUrl !== undefined) patch.linkedinUrl = linkedin;
  }

  if (Object.keys(patch).length) {
    await db.update(contacts).set(patch).where(eq(contacts.id, id));
  }
  if (status) await updateLeadStatus(id, status, auth.user.userId);

  return Response.json(await getLead(id));
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const deleted = await db
    .delete(contacts)
    .where(eq(contacts.id, (await params).id))
    .returning({ id: contacts.id });

  if (!deleted.length) return Response.json({ error: "Lead not found" }, { status: 404 });
  return Response.json({ ok: true });
}

/** Company fields are edited from the lead page, so they get their own verb here. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = updateCompanySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid company update", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [lead] = await db
    .select({ companyId: contacts.companyId })
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  const input = parsed.data;
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.website !== undefined) {
    patch.website = normalizeUrl(input.website);
    patch.domain = normalizeDomain(input.website);
  }
  if (input.industry !== undefined) patch.industry = input.industry || null;
  if (input.nicheId !== undefined) patch.nicheId = input.nicheId;
  if (input.location !== undefined) patch.location = input.location || null;
  if (input.country !== undefined) patch.country = input.country || null;
  if (input.city !== undefined) patch.city = input.city || null;
  if (input.employeeCount !== undefined) patch.employeeCount = input.employeeCount;
  if (input.revenue !== undefined) patch.revenue = input.revenue === null ? null : String(input.revenue);
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.linkedinUrl !== undefined) patch.linkedinUrl = input.linkedinUrl || null;
  if (input.phone !== undefined) patch.phone = normalizePhone(input.phone);
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.sourceId !== undefined) patch.sourceId = input.sourceId;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl || null;

  if (Object.keys(patch).length) {
    try {
      await db.update(companies).set(patch).where(eq(companies.id, lead.companyId));
    } catch (error) {
      // The unique domain index is the company-level dedupe guarantee.
      if ((error as { code?: string }).code === "23505") {
        return Response.json(
          { error: "Another company already uses that domain." },
          { status: 409 },
        );
      }
      throw error;
    }
    await logActivity({
      contactId: id,
      companyId: lead.companyId,
      type: "note_added",
      subject: "Company details updated",
      metadata: { fields: Object.keys(patch) },
      userId: auth.user.userId,
    });
  }

  return Response.json(await getLead(id));
}
