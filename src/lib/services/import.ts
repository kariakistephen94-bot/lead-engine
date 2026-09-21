import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  companies,
  contacts,
  importRows,
  imports,
  leadSources,
  niches,
  users,
} from "@/db/schema";
import { logActivity } from "@/lib/services/activities";
import {
  findCompanyByDomain,
  findCompanyByName,
  findDuplicateContact,
  mergePreferExisting,
} from "@/lib/services/dedupe";
import {
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedIn,
  normalizePhone,
  normalizeUrl,
} from "@/lib/utils";

export type MappedRow = {
  rowNumber: number;
  data: Record<string, string>;
};

export type ChunkResult = {
  imported: number;
  duplicates: number;
  invalid: number;
  merged: number;
  /** A few examples so the UI can explain *why* rows were rejected. */
  samples: { rowNumber: number; status: string; reason: string }[];
};

export async function createImport(input: {
  filename: string;
  totalRows: number;
  mapping: Record<string, string>;
  nicheId: string | null;
  sourceId: string | null;
  userId: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(imports)
    .values({
      filename: input.filename,
      totalRows: input.totalRows,
      mapping: input.mapping,
      nicheId: input.nicheId,
      sourceId: input.sourceId,
      userId: input.userId,
      status: "processing",
    })
    .returning({ id: imports.id });
  return row.id;
}

/**
 * Process one chunk of an import.
 *
 * Duplicate handling is the important part: a row that matches an existing
 * contact never creates a second record. Instead it fills in blanks on the
 * existing one (never overwriting) and is recorded as `duplicate`/`merged` so
 * the summary is honest about what happened.
 */
export async function processChunk(
  importId: string,
  rows: MappedRow[],
  options: { nicheId: string | null; sourceId: string | null; userId: string | null },
): Promise<ChunkResult> {
  const result: ChunkResult = { imported: 0, duplicates: 0, invalid: 0, merged: 0, samples: [] };

  for (const { rowNumber, data } of rows) {
    const companyName = data.companyName?.trim();
    const email = normalizeEmail(data.email);
    const linkedin = normalizeLinkedIn(data.linkedinUrl);
    const domain = normalizeDomain(data.website) ?? normalizeDomain(data.email);

    // A row must identify a company somehow, or it is not a lead.
    if (!companyName && !domain) {
      result.invalid++;
      await recordRow(importId, rowNumber, data, "invalid", "No company name or website/domain");
      pushSample(result, rowNumber, "invalid", "No company name or website/domain");
      continue;
    }

    // …and it must identify a person somehow, or it is a company, not a lead.
    if (!email && !linkedin && !data.firstName && !data.lastName) {
      result.invalid++;
      await recordRow(importId, rowNumber, data, "invalid", "No contact name, email or LinkedIn");
      pushSample(result, rowNumber, "invalid", "No contact name, email or LinkedIn");
      continue;
    }

    if (data.email && !email) {
      result.invalid++;
      await recordRow(importId, rowNumber, data, "invalid", `Malformed email: ${data.email}`);
      pushSample(result, rowNumber, "invalid", `Malformed email: ${data.email}`);
      continue;
    }

    const duplicate = await findDuplicateContact({ email, linkedinUrl: linkedin });
    if (duplicate) {
      const patch = await fillContactBlanks(duplicate.contactId, data, email, linkedin);
      result.duplicates++;
      if (patch) result.merged++;
      await recordRow(
        importId,
        rowNumber,
        data,
        patch ? "merged" : "duplicate",
        `Matched existing lead on ${duplicate.matchedOn}${patch ? " — filled missing fields" : ""}`,
        duplicate.contactId,
        duplicate.companyId,
      );
      continue;
    }

    try {
      const companyId = await upsertCompany(companyName ?? domain!, data, domain, options, importId);

      const [contact] = await db
        .insert(contacts)
        .values({
          companyId,
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
          jobTitle: data.jobTitle ?? null,
          email,
          phone: normalizePhone(data.phone),
          linkedinUrl: linkedin,
          sourceId: options.sourceId,
          sourceUrl: data.sourceUrl ?? null,
          sourcedAt: new Date(),
          importId,
          ownerId: options.userId,
        })
        .returning({ id: contacts.id });

      await logActivity({
        contactId: contact.id,
        companyId,
        type: "imported",
        subject: "Imported from CSV",
        metadata: { importId, rowNumber },
        userId: options.userId,
      });

      result.imported++;
      await recordRow(importId, rowNumber, data, "imported", null, contact.id, companyId);
    } catch (error) {
      const message = (error as Error).message.slice(0, 200);
      result.invalid++;
      await recordRow(importId, rowNumber, data, "invalid", message);
      pushSample(result, rowNumber, "invalid", message);
    }
  }

  await db
    .update(imports)
    .set({
      importedCount: sql`${imports.importedCount} + ${result.imported}`,
      duplicateCount: sql`${imports.duplicateCount} + ${result.duplicates}`,
      invalidCount: sql`${imports.invalidCount} + ${result.invalid}`,
    })
    .where(eq(imports.id, importId));

  return result;
}

async function upsertCompany(
  name: string,
  data: Record<string, string>,
  domain: string | null,
  options: { nicheId: string | null; sourceId: string | null; userId: string | null },
  importId: string,
): Promise<string> {
  const payload = {
    name,
    website: normalizeUrl(data.website),
    domain,
    industry: data.industry ?? null,
    nicheId: options.nicheId,
    location: data.location ?? null,
    city: data.city ?? null,
    country: data.country ?? null,
    employeeCount: parseIntOrNull(data.employeeCount),
    revenue: parseRevenue(data.revenue),
    description: data.companyDescription ?? null,
    linkedinUrl: data.companyLinkedin ?? null,
    phone: normalizePhone(data.companyPhone),
    sourceId: options.sourceId,
    sourceUrl: data.sourceUrl ?? null,
    sourcedAt: new Date(),
    importId,
    ownerId: options.userId,
  };

  const existing =
    (await findCompanyByDomain(domain)) ?? (domain ? null : await findCompanyByName(name));

  if (existing) {
    const patch = mergePreferExisting(existing, payload);
    delete patch.ownerId;
    delete patch.sourcedAt;
    delete patch.importId;
    if (options.nicheId) patch.nicheId = options.nicheId;
    if (Object.keys(patch).length) {
      await db.update(companies).set(patch).where(eq(companies.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db.insert(companies).values(payload).returning({ id: companies.id });
  return created.id;
}

/** Returns true when the existing contact actually gained data. */
async function fillContactBlanks(
  contactId: string,
  data: Record<string, string>,
  email: string | null,
  linkedin: string | null,
): Promise<boolean> {
  const [existing] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!existing) return false;

  const patch = mergePreferExisting(existing, {
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    jobTitle: data.jobTitle ?? null,
    phone: normalizePhone(data.phone),
    email,
    linkedinUrl: linkedin,
  });

  if (!Object.keys(patch).length) return false;
  await db.update(contacts).set(patch).where(eq(contacts.id, contactId));
  return true;
}

async function recordRow(
  importId: string,
  rowNumber: number,
  raw: Record<string, string>,
  status: "imported" | "duplicate" | "invalid" | "merged",
  error: string | null,
  contactId?: string,
  companyId?: string,
) {
  await db.insert(importRows).values({
    importId,
    rowNumber,
    raw,
    status,
    error,
    contactId: contactId ?? null,
    companyId: companyId ?? null,
  });
}

function pushSample(result: ChunkResult, rowNumber: number, status: string, reason: string) {
  if (result.samples.length < 10) result.samples.push({ rowNumber, status, reason });
}

function parseIntOrNull(value: string | undefined): number | null {
  if (!value) return null;
  // Handles "11-50" style ranges from Apollo by taking the lower bound.
  const digits = value.replace(/,/g, "").match(/\d+/);
  const parsed = digits ? Number(digits[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRevenue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.kmb]/gi, "").toLowerCase();
  const numeric = parseFloat(cleaned);
  if (!Number.isFinite(numeric)) return null;
  const multiplier = cleaned.includes("b") ? 1e9 : cleaned.includes("m") ? 1e6 : cleaned.includes("k") ? 1e3 : 1;
  return String((numeric * multiplier).toFixed(2));
}

export async function finishImport(importId: string) {
  const [row] = await db
    .update(imports)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(imports.id, importId))
    .returning();
  return row;
}

export async function listImports(limit = 25) {
  return db
    .select({
      id: imports.id,
      filename: imports.filename,
      totalRows: imports.totalRows,
      importedCount: imports.importedCount,
      duplicateCount: imports.duplicateCount,
      invalidCount: imports.invalidCount,
      status: imports.status,
      createdAt: imports.createdAt,
      completedAt: imports.completedAt,
      nicheName: niches.name,
      sourceName: leadSources.name,
      userName: users.name,
    })
    .from(imports)
    .leftJoin(niches, eq(imports.nicheId, niches.id))
    .leftJoin(leadSources, eq(imports.sourceId, leadSources.id))
    .leftJoin(users, eq(imports.userId, users.id))
    .orderBy(desc(imports.createdAt))
    .limit(limit);
}

export async function getImportRows(importId: string, status?: string, limit = 100) {
  const base = db
    .select({
      rowNumber: importRows.rowNumber,
      status: importRows.status,
      error: importRows.error,
      raw: importRows.raw,
      contactId: importRows.contactId,
    })
    .from(importRows)
    .$dynamic();

  const filtered = status
    ? base.where(
        sql`${importRows.importId} = ${importId} and ${importRows.status} = ${status}`,
      )
    : base.where(eq(importRows.importId, importId));

  return filtered.orderBy(importRows.rowNumber).limit(limit);
}
