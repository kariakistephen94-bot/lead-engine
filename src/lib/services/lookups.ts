import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { leadSources, niches, tags, users } from "@/db/schema";

/**
 * Small reference lists shared by every filter bar and form. These are tiny
 * tables (tens of rows), so they are safe to load in full.
 */
export type Lookups = {
  niches: { id: string; name: string; color: string }[];
  sources: { id: string; name: string; slug: string }[];
  tags: { id: string; name: string; color: string }[];
  owners: { id: string; name: string }[];
};

export async function getLookups(): Promise<Lookups> {
  const [nicheRows, sourceRows, tagRows, userRows] = await Promise.all([
    db
      .select({ id: niches.id, name: niches.name, color: niches.color })
      .from(niches)
      .where(eq(niches.archived, false))
      .orderBy(asc(niches.name)),
    db
      .select({ id: leadSources.id, name: leadSources.name, slug: leadSources.slug })
      .from(leadSources)
      .orderBy(asc(leadSources.name)),
    db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).orderBy(asc(tags.name)),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
  ]);

  return { niches: nicheRows, sources: sourceRows, tags: tagRows, owners: userRows };
}

export async function getSourceIdBySlug(slug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(eq(leadSources.slug, slug))
    .limit(1);
  return row?.id ?? null;
}

/** Distinct industry values, for the industry filter's suggestion list. */
export async function listIndustries(limit = 200): Promise<string[]> {
  const rows = await db.execute<{ industry: string }>(
    sql`select distinct industry from companies where industry is not null and industry <> '' order by industry limit ${limit}`,
  );
  return rows.rows.map((r) => r.industry);
}

export async function listCountries(limit = 200): Promise<string[]> {
  const rows = await db.execute<{ country: string }>(
    sql`select distinct country from companies where country is not null and country <> '' order by country limit ${limit}`,
  );
  return rows.rows.map((r) => r.country);
}
