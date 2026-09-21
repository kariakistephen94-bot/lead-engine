import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { niches } from "@/db/schema";
import { slugify } from "@/lib/utils";
import type { z } from "zod";
import type { nicheSchema } from "@/lib/validation";

export type NicheStats = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  targetMarket: string | null;
  targetLocations: string[] | null;
  idealCompanySize: string | null;
  targetJobTitles: string[] | null;
  painPoints: string | null;
  offer: string | null;
  notes: string | null;
  color: string;
  archived: boolean;
  createdAt: Date;
  leadCount: number;
  companyCount: number;
  contactedCount: number;
  replyCount: number;
  positiveCount: number;
  meetingCount: number;
  dealCount: number;
  wonCount: number;
  revenue: number;
};

/**
 * Niche list with rollups.
 *
 * One aggregate pass per relation rather than N+1 per niche — this stays a
 * couple of index scans even with 100 niches and 50k leads.
 */
export async function listNichesWithStats(includeArchived = false): Promise<NicheStats[]> {
  const result = await db.execute<Record<string, string | null>>(sql`
    with lead_stats as (
      select
        c.niche_id,
        count(*)::int                                                            as lead_count,
        count(distinct c.id)::int                                                as company_count,
        count(*) filter (where ct.last_contacted_at is not null
                            or ct.status in ('contacted','follow_up','replied','positive_reply',
                                             'meeting_booked','proposal_sent','negotiation','won','lost',
                                             'not_interested'))::int             as contacted_count,
        count(*) filter (where ct.status in ('replied','positive_reply','meeting_booked',
                                             'proposal_sent','negotiation','won'))::int as reply_count,
        count(*) filter (where ct.status in ('positive_reply','meeting_booked','proposal_sent',
                                             'negotiation','won'))::int          as positive_count,
        count(*) filter (where ct.status in ('meeting_booked','proposal_sent','negotiation','won'))::int
                                                                                 as meeting_count
      from contacts ct
      join companies c on c.id = ct.company_id
      where ct.archived = false and c.niche_id is not null
      group by c.niche_id
    ),
    deal_stats as (
      select
        niche_id,
        count(*)::int                                             as deal_count,
        count(*) filter (where stage = 'won')::int                as won_count,
        coalesce(sum(value) filter (where stage = 'won'), 0)::numeric as revenue
      from deals
      where niche_id is not null
      group by niche_id
    )
    select
      n.*,
      coalesce(ls.lead_count, 0)      as lead_count,
      coalesce(ls.company_count, 0)   as company_count,
      coalesce(ls.contacted_count, 0) as contacted_count,
      coalesce(ls.reply_count, 0)     as reply_count,
      coalesce(ls.positive_count, 0)  as positive_count,
      coalesce(ls.meeting_count, 0)   as meeting_count,
      coalesce(ds.deal_count, 0)      as deal_count,
      coalesce(ds.won_count, 0)       as won_count,
      coalesce(ds.revenue, 0)         as revenue
    from niches n
    left join lead_stats ls on ls.niche_id = n.id
    left join deal_stats ds on ds.niche_id = n.id
    ${includeArchived ? sql`` : sql`where n.archived = false`}
    order by coalesce(ls.lead_count, 0) desc, lower(n.name) asc
  `);

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description,
    targetMarket: row.target_market,
    targetLocations: (row.target_locations as unknown as string[]) ?? null,
    idealCompanySize: row.ideal_company_size,
    targetJobTitles: (row.target_job_titles as unknown as string[]) ?? null,
    painPoints: row.pain_points,
    offer: row.offer,
    notes: row.notes,
    color: String(row.color),
    archived: String(row.archived) === "true",
    createdAt: new Date(String(row.created_at)),
    leadCount: Number(row.lead_count),
    companyCount: Number(row.company_count),
    contactedCount: Number(row.contacted_count),
    replyCount: Number(row.reply_count),
    positiveCount: Number(row.positive_count),
    meetingCount: Number(row.meeting_count),
    dealCount: Number(row.deal_count),
    wonCount: Number(row.won_count),
    revenue: Number(row.revenue),
  }));
}

export async function getNiche(id: string) {
  const [row] = await db.select().from(niches).where(eq(niches.id, id)).limit(1);
  return row ?? null;
}

/** Slugs must be unique; append -2, -3 … rather than rejecting the name. */
async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "niche";
  const existing = await db.select({ slug: niches.slug, id: niches.id }).from(niches);
  const taken = new Set(existing.filter((n) => n.id !== excludeId).map((n) => n.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export async function createNiche(input: z.infer<typeof nicheSchema>) {
  const [row] = await db
    .insert(niches)
    .values({
      name: input.name,
      slug: await uniqueSlug(input.name),
      description: input.description ?? null,
      targetMarket: input.targetMarket ?? null,
      targetLocations: input.targetLocations ?? null,
      idealCompanySize: input.idealCompanySize ?? null,
      targetJobTitles: input.targetJobTitles ?? null,
      painPoints: input.painPoints ?? null,
      offer: input.offer ?? null,
      notes: input.notes ?? null,
      color: input.color ?? "#2563eb",
    })
    .returning();
  return row;
}

export async function updateNiche(id: string, input: Partial<z.infer<typeof nicheSchema>>) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    patch.name = input.name;
    patch.slug = await uniqueSlug(input.name, id);
  }
  for (const key of [
    "description",
    "targetMarket",
    "idealCompanySize",
    "painPoints",
    "offer",
    "notes",
    "color",
    "archived",
  ] as const) {
    if (input[key] !== undefined) {
      const column = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      patch[column] = input[key];
    }
  }
  if (input.targetLocations !== undefined) patch.target_locations = input.targetLocations;
  if (input.targetJobTitles !== undefined) patch.target_job_titles = input.targetJobTitles;

  if (!Object.keys(patch).length) return getNiche(id);

  const assignments = Object.entries(patch).map(
    ([column, value]) => sql`${sql.identifier(column)} = ${value}`,
  );
  await db.execute(
    sql`update niches set ${sql.join(assignments, sql`, `)} where id = ${id}`,
  );
  return getNiche(id);
}

/**
 * Deleting a niche must never delete leads. The FK is ON DELETE SET NULL, so
 * companies simply become unassigned and show up under "No niche".
 */
export async function deleteNiche(id: string): Promise<void> {
  await db.delete(niches).where(eq(niches.id, id));
}

export async function listNichesSimple() {
  return db
    .select({ id: niches.id, name: niches.name, color: niches.color, archived: niches.archived })
    .from(niches)
    .orderBy(asc(niches.name));
}
