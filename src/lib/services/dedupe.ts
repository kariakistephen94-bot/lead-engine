import "server-only";

import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { normalizeDomain, normalizeEmail, normalizeLinkedIn } from "@/lib/utils";

export type DuplicateMatch = {
  contactId: string;
  companyId: string;
  matchedOn: "email" | "linkedin";
  companyName: string;
  fullName: string | null;
  email: string | null;
};

/**
 * Application-level duplicate check.
 *
 * The database also enforces this with partial unique indexes on
 * lower(email) and linkedin_url — this function exists so the UI can *show*
 * the existing record and offer a merge instead of surfacing a raw 23505.
 */
export async function findDuplicateContact(input: {
  email?: string | null;
  linkedinUrl?: string | null;
  excludeContactId?: string;
}): Promise<DuplicateMatch | null> {
  const email = normalizeEmail(input.email);
  const linkedin = normalizeLinkedIn(input.linkedinUrl);
  if (!email && !linkedin) return null;

  const identity = [
    email ? eq(sql`lower(${contacts.email})`, email) : undefined,
    linkedin ? eq(contacts.linkedinUrl, linkedin) : undefined,
  ].filter(Boolean);

  const [row] = await db
    .select({
      contactId: contacts.id,
      companyId: contacts.companyId,
      email: contacts.email,
      linkedinUrl: contacts.linkedinUrl,
      fullName: contacts.fullName,
      companyName: companies.name,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(
      and(
        identity.length > 1 ? or(...identity) : identity[0],
        input.excludeContactId ? ne(contacts.id, input.excludeContactId) : undefined,
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    contactId: row.contactId,
    companyId: row.companyId,
    matchedOn: email && row.email?.toLowerCase() === email ? "email" : "linkedin",
    companyName: row.companyName,
    fullName: row.fullName,
    email: row.email,
  };
}

export async function findCompanyByDomain(domain: string | null | undefined) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.domain, normalized), isNotNull(companies.domain)))
    .limit(1);
  return row ?? null;
}

/** Case-insensitive name match, used only when there is no domain to go on. */
export async function findCompanyByName(name: string) {
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(sql`lower(${companies.name})`, name.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}

/**
 * Fill blanks on an existing record without ever overwriting data that is
 * already there — the imported row is not automatically more trustworthy than
 * what the user already curated.
 */
export function mergePreferExisting<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
): Partial<T> {
  const patch: Partial<T> = {};
  for (const [key, value] of Object.entries(incoming) as [keyof T, T[keyof T]][]) {
    const current = existing[key];
    const currentIsEmpty = current === null || current === undefined || current === "";
    const incomingHasValue = value !== null && value !== undefined && value !== "";
    if (currentIsEmpty && incomingHasValue) patch[key] = value;
  }
  return patch;
}
