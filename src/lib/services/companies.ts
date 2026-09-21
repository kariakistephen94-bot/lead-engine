import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { companies, contacts, leadSources, niches } from "@/db/schema";
import { MAX_PAGE_SIZE } from "@/lib/constants";

export type CompanyQuery = {
  q?: string;
  nicheIds?: string[];
  page: number;
  pageSize: number;
  sortBy: "name" | "created_at" | "employee_count" | "contacts";
  sortDir: "asc" | "desc";
};

export function parseCompanyQuery(
  params: Record<string, string | string[] | undefined>,
): CompanyQuery {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const page = Math.max(1, Number(one("page") ?? 1) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(one("pageSize") ?? 50) || 50));
  const sortBy = (["name", "created_at", "employee_count", "contacts"] as const).includes(
    one("sortBy") as never,
  )
    ? (one("sortBy") as CompanyQuery["sortBy"])
    : "created_at";

  return {
    q: one("q")?.trim() || undefined,
    nicheIds: (one("nicheIds") ?? "").split(",").filter(Boolean),
    page,
    pageSize,
    sortBy,
    sortDir: one("sortDir") === "asc" ? "asc" : "desc",
  };
}

export async function listCompanies(query: CompanyQuery) {
  const clauses: (SQL | undefined)[] = [];

  if (query.q) {
    const term = `%${query.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(
      or(
        ilike(companies.name, term),
        ilike(companies.domain, term),
        ilike(companies.website, term),
        ilike(companies.industry, term),
        ilike(companies.location, term),
      ),
    );
  }

  if (query.nicheIds?.length) {
    const ids = query.nicheIds.filter((id) => id !== "none");
    const parts: (SQL | undefined)[] = [];
    if (ids.length) parts.push(inArray(companies.nicheId, ids));
    if (query.nicheIds.includes("none")) parts.push(isNull(companies.nicheId));
    clauses.push(parts.length > 1 ? or(...parts) : parts[0]);
  }

  const defined = clauses.filter((c): c is SQL => Boolean(c));
  const where = defined.length ? and(...defined) : undefined;

  const contactCount = sql<number>`(select count(*) from ${contacts} where ${contacts.companyId} = ${companies.id})`.mapWith(
    Number,
  );

  const sortColumn =
    query.sortBy === "name"
      ? sql`lower(${companies.name})`
      : query.sortBy === "employee_count"
        ? companies.employeeCount
        : query.sortBy === "contacts"
          ? contactCount
          : companies.createdAt;

  const direction = query.sortDir === "asc" ? asc : desc;

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      domain: companies.domain,
      industry: companies.industry,
      location: companies.location,
      country: companies.country,
      employeeCount: companies.employeeCount,
      revenue: companies.revenue,
      createdAt: companies.createdAt,
      nicheName: niches.name,
      nicheColor: niches.color,
      sourceName: leadSources.name,
      contactCount,
      totalCount: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(companies)
    .leftJoin(niches, eq(companies.nicheId, niches.id))
    .leftJoin(leadSources, eq(companies.sourceId, leadSources.id))
    .where(where)
    .orderBy(direction(sortColumn), desc(companies.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return {
    rows: rows.map(({ totalCount: _drop, ...row }) => row),
    total: rows[0]?.totalCount ?? 0,
  };
}

export type CompanyRow = Awaited<ReturnType<typeof listCompanies>>["rows"][number];

export async function getCompany(id: string) {
  const [row] = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      domain: companies.domain,
      industry: companies.industry,
      nicheId: companies.nicheId,
      nicheName: niches.name,
      nicheColor: niches.color,
      location: companies.location,
      country: companies.country,
      city: companies.city,
      employeeCount: companies.employeeCount,
      revenue: companies.revenue,
      description: companies.description,
      linkedinUrl: companies.linkedinUrl,
      phone: companies.phone,
      email: companies.email,
      sourceName: leadSources.name,
      sourceUrl: companies.sourceUrl,
      sourcedAt: companies.sourcedAt,
      researchMethod: companies.researchMethod,
      createdAt: companies.createdAt,
      updatedAt: companies.updatedAt,
    })
    .from(companies)
    .leftJoin(niches, eq(companies.nicheId, niches.id))
    .leftJoin(leadSources, eq(companies.sourceId, leadSources.id))
    .where(eq(companies.id, id))
    .limit(1);

  return row ?? null;
}

export async function listCompanyContacts(companyId: string) {
  return db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      jobTitle: contacts.jobTitle,
      email: contacts.email,
      phone: contacts.phone,
      status: contacts.status,
      leadScore: contacts.leadScore,
      lastContactedAt: contacts.lastContactedAt,
    })
    .from(contacts)
    .where(eq(contacts.companyId, companyId))
    .orderBy(asc(contacts.createdAt));
}
