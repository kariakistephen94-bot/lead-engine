import "server-only";

import { and, asc, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  aiResearch,
  companies,
  contacts,
  contactTags,
  leadSources,
  niches,
  users,
  type LeadStatus,
} from "@/db/schema";
import { CONTACTED_STATUSES } from "@/lib/constants";
import type { LeadFilters, LeadQuery, LeadSortColumn } from "@/lib/validation";

export type LeadRow = {
  id: string;
  companyId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  status: LeadStatus;
  leadScore: number | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  createdAt: Date;
  archived: boolean;
  companyName: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  location: string | null;
  country: string | null;
  city: string | null;
  employeeCount: number | null;
  revenue: string | null;
  nicheId: string | null;
  nicheName: string | null;
  nicheColor: string | null;
  sourceId: string | null;
  sourceName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  hasResearch: boolean;
};

const SORT_COLUMNS: Record<LeadSortColumn, SQL | PgColumn> = {
  created_at: contacts.createdAt,
  updated_at: contacts.updatedAt,
  company: sql`lower(${companies.name})`,
  contact: sql`lower(${contacts.fullName})`,
  job_title: sql`lower(${contacts.jobTitle})`,
  niche: sql`lower(${niches.name})`,
  industry: sql`lower(${companies.industry})`,
  location: sql`lower(${companies.location})`,
  employee_count: companies.employeeCount,
  revenue: companies.revenue,
  lead_score: contacts.leadScore,
  status: contacts.status,
  source: sql`lower(${leadSources.name})`,
  last_contacted_at: contacts.lastContactedAt,
  next_follow_up_at: contacts.nextFollowUpAt,
};

/**
 * Translate the filter object into a single SQL predicate.
 *
 * Everything is pushed into Postgres — the app never filters in JS, because at
 * 50k+ rows that would mean shipping the table to the server process first.
 */
export function buildLeadWhere(filters: LeadFilters): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];

  // Archived leads are hidden unless explicitly asked for.
  if (filters.archived === "yes") clauses.push(eq(contacts.archived, true));
  else if (filters.archived !== "any") clauses.push(eq(contacts.archived, false));

  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(
      or(
        ilike(contacts.fullName, term),
        ilike(contacts.email, term),
        ilike(contacts.phone, term),
        ilike(contacts.jobTitle, term),
        ilike(contacts.linkedinUrl, term),
        ilike(companies.name, term),
        ilike(companies.domain, term),
        ilike(companies.website, term),
      ),
    );
  }

  if (filters.statuses?.length) clauses.push(inArray(contacts.status, filters.statuses));
  if (filters.nicheIds?.length) {
    // "none" is a real, useful bucket: leads that still need a niche assigned.
    const ids = filters.nicheIds.filter((id) => id !== "none");
    const wantsNone = filters.nicheIds.includes("none");
    const parts: (SQL | undefined)[] = [];
    if (ids.length) parts.push(inArray(companies.nicheId, ids));
    if (wantsNone) parts.push(isNull(companies.nicheId));
    clauses.push(parts.length > 1 ? or(...parts) : parts[0]);
  }
  if (filters.sourceIds?.length) clauses.push(inArray(contacts.sourceId, filters.sourceIds));
  if (filters.ownerIds?.length) clauses.push(inArray(contacts.ownerId, filters.ownerIds));

  if (filters.tagIds?.length) {
    clauses.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactTags)
          .where(
            and(eq(contactTags.contactId, contacts.id), inArray(contactTags.tagId, filters.tagIds)),
          ),
      ),
    );
  }

  if (filters.industry) clauses.push(ilike(companies.industry, `%${filters.industry}%`));
  if (filters.country) clauses.push(ilike(companies.country, `%${filters.country}%`));
  if (filters.city) clauses.push(ilike(companies.city, `%${filters.city}%`));
  if (filters.jobTitle) clauses.push(ilike(contacts.jobTitle, `%${filters.jobTitle}%`));

  if (filters.minEmployees !== undefined) clauses.push(gte(companies.employeeCount, filters.minEmployees));
  if (filters.maxEmployees !== undefined) clauses.push(lte(companies.employeeCount, filters.maxEmployees));
  if (filters.minRevenue !== undefined) clauses.push(gte(companies.revenue, String(filters.minRevenue)));
  if (filters.maxRevenue !== undefined) clauses.push(lte(companies.revenue, String(filters.maxRevenue)));
  if (filters.minScore !== undefined) clauses.push(gte(contacts.leadScore, filters.minScore));
  if (filters.maxScore !== undefined) clauses.push(lte(contacts.leadScore, filters.maxScore));

  if (filters.contacted === "yes") {
    clauses.push(or(isNotNull(contacts.lastContactedAt), inArray(contacts.status, CONTACTED_STATUSES)));
  } else if (filters.contacted === "no") {
    clauses.push(
      and(isNull(contacts.lastContactedAt), sql`${contacts.status} <> ALL(${CONTACTED_STATUSES})`),
    );
  }

  if (filters.hasEmail === "yes") clauses.push(isNotNull(contacts.email));
  if (filters.hasEmail === "no") clauses.push(isNull(contacts.email));
  if (filters.hasPhone === "yes") clauses.push(isNotNull(contacts.phone));
  if (filters.hasPhone === "no") clauses.push(isNull(contacts.phone));

  if (filters.researched) {
    const hasResearch = exists(
      db
        .select({ one: sql`1` })
        .from(aiResearch)
        .where(eq(aiResearch.companyId, contacts.companyId)),
    );
    clauses.push(filters.researched === "yes" ? hasResearch : sql`not ${hasResearch}`);
  }

  if (filters.createdFrom) clauses.push(gte(contacts.createdAt, new Date(filters.createdFrom)));
  if (filters.createdTo) clauses.push(lte(contacts.createdAt, endOfDay(filters.createdTo)));
  if (filters.lastContactedFrom)
    clauses.push(gte(contacts.lastContactedAt, new Date(filters.lastContactedFrom)));
  if (filters.lastContactedTo)
    clauses.push(lte(contacts.lastContactedAt, endOfDay(filters.lastContactedTo)));
  if (filters.followUpFrom) clauses.push(gte(contacts.nextFollowUpAt, new Date(filters.followUpFrom)));
  if (filters.followUpTo) clauses.push(lte(contacts.nextFollowUpAt, endOfDay(filters.followUpTo)));
  if (filters.importId) clauses.push(eq(contacts.importId, filters.importId));

  const defined = clauses.filter((c): c is SQL => Boolean(c));
  return defined.length ? and(...defined) : undefined;
}

/** A date-only filter bound should include the whole day. */
function endOfDay(value: string): Date {
  const date = new Date(value);
  if (value.length <= 10) date.setHours(23, 59, 59, 999);
  return date;
}

const LEAD_SELECT = {
  id: contacts.id,
  companyId: contacts.companyId,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  fullName: contacts.fullName,
  jobTitle: contacts.jobTitle,
  email: contacts.email,
  phone: contacts.phone,
  linkedinUrl: contacts.linkedinUrl,
  status: contacts.status,
  leadScore: contacts.leadScore,
  lastContactedAt: contacts.lastContactedAt,
  nextFollowUpAt: contacts.nextFollowUpAt,
  createdAt: contacts.createdAt,
  archived: contacts.archived,
  companyName: companies.name,
  website: companies.website,
  domain: companies.domain,
  industry: companies.industry,
  location: companies.location,
  country: companies.country,
  city: companies.city,
  employeeCount: companies.employeeCount,
  revenue: companies.revenue,
  nicheId: companies.nicheId,
  nicheName: niches.name,
  nicheColor: niches.color,
  sourceId: contacts.sourceId,
  sourceName: leadSources.name,
  ownerId: contacts.ownerId,
  ownerName: users.name,
  hasResearch: sql<boolean>`exists (select 1 from ${aiResearch} where ${aiResearch.companyId} = ${contacts.companyId})`,
};

export async function listLeads(query: LeadQuery): Promise<{ rows: LeadRow[]; total: number }> {
  const where = buildLeadWhere(query);
  const column = SORT_COLUMNS[query.sortBy];
  const direction = query.sortDir === "asc" ? asc : desc;

  const rows = await db
    .select({
      ...LEAD_SELECT,
      // Window count avoids a second round trip for the pager.
      totalCount: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .leftJoin(niches, eq(companies.nicheId, niches.id))
    .leftJoin(leadSources, eq(contacts.sourceId, leadSources.id))
    .leftJoin(users, eq(contacts.ownerId, users.id))
    .where(where)
    // `contacts.id` breaks ties so pagination is stable across pages.
    .orderBy(direction(column), desc(contacts.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const total = rows[0]?.totalCount ?? 0;
  return {
    rows: rows.map(({ totalCount: _drop, ...row }) => row as LeadRow),
    total,
  };
}

/** Ids only — used by "select all matching filter" and by export. */
export async function listLeadIds(filters: LeadFilters, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(buildLeadWhere(filters))
    .limit(limit);
  return rows.map((r) => r.id);
}

export async function countLeads(filters: LeadFilters): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(buildLeadWhere(filters));
  return row?.count ?? 0;
}

/** Full record for the lead detail page. */
export async function getLead(id: string) {
  const [row] = await db
    .select({
      ...LEAD_SELECT,
      sourceUrl: contacts.sourceUrl,
      sourcedAt: contacts.sourcedAt,
      importId: contacts.importId,
      updatedAt: contacts.updatedAt,
      companyDescription: companies.description,
      companyLinkedin: companies.linkedinUrl,
      companyPhone: companies.phone,
      companyEmail: companies.email,
      companySourceUrl: companies.sourceUrl,
      companyCreatedAt: companies.createdAt,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .leftJoin(niches, eq(companies.nicheId, niches.id))
    .leftJoin(leadSources, eq(contacts.sourceId, leadSources.id))
    .leftJoin(users, eq(contacts.ownerId, users.id))
    .where(eq(contacts.id, id))
    .limit(1);

  return row ?? null;
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;
