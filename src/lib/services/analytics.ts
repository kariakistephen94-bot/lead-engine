import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DealStage, LeadStatus } from "@/db/schema";

/* Shared SQL fragments — one definition of "contacted"/"replied" for the whole app. */
const CONTACTED = sql`(ct.last_contacted_at is not null or ct.status in
  ('contacted','follow_up','replied','positive_reply','meeting_booked','proposal_sent','negotiation','won','lost','not_interested'))`;
const REPLIED = sql`ct.status in ('replied','positive_reply','meeting_booked','proposal_sent','negotiation','won')`;
const POSITIVE = sql`ct.status in ('positive_reply','meeting_booked','proposal_sent','negotiation','won')`;
const MEETING = sql`ct.status in ('meeting_booked','proposal_sent','negotiation','won')`;

export type DashboardMetrics = {
  totalLeads: number;
  totalCompanies: number;
  newToday: number;
  contactedToday: number;
  researchedToday: number;
  repliesToday: number;
  meetingsToday: number;
  contacted: number;
  replied: number;
  positive: number;
  meetings: number;
  proposals: number;
  openDeals: number;
  openPipelineValue: number;
  wonDeals: number;
  wonRevenue: number;
  lostDeals: number;
  followUpsDue: number;
  followUpsOverdue: number;
  researchQueued: number;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const result = await db.execute<Record<string, string>>(sql`
    with lead_agg as (
      select
        count(*)::int                                                     as total_leads,
        count(distinct ct.company_id)::int                                as total_companies,
        count(*) filter (where ct.created_at >= current_date)::int        as new_today,
        count(*) filter (where ct.last_contacted_at >= current_date)::int as contacted_today,
        count(*) filter (where ${CONTACTED})::int                         as contacted,
        count(*) filter (where ${REPLIED})::int                           as replied,
        count(*) filter (where ${POSITIVE})::int                          as positive,
        count(*) filter (where ${MEETING})::int                           as meetings,
        count(*) filter (where ct.status in ('proposal_sent','negotiation','won'))::int as proposals
      from contacts ct
      where ct.archived = false
    ),
    activity_agg as (
      select
        count(*) filter (where type = 'research_completed' and occurred_at >= current_date)::int as researched_today,
        count(*) filter (where type = 'email_replied' and occurred_at >= current_date)::int      as replies_today,
        count(*) filter (where type = 'meeting_booked' and occurred_at >= current_date)::int     as meetings_today
      from activities
    ),
    deal_agg as (
      select
        count(*) filter (where stage not in ('won','lost'))::int                             as open_deals,
        coalesce(sum(value) filter (where stage not in ('won','lost')), 0)::numeric          as open_value,
        count(*) filter (where stage = 'won')::int                                           as won_deals,
        coalesce(sum(value) filter (where stage = 'won'), 0)::numeric                        as won_revenue,
        count(*) filter (where stage = 'lost')::int                                          as lost_deals
      from deals
    ),
    follow_up_agg as (
      select
        count(*) filter (where completed_at is null and due_at::date = current_date)::int as due_today,
        count(*) filter (where completed_at is null and due_at < current_date)::int       as overdue
      from follow_ups
    ),
    job_agg as (
      select count(*) filter (where status = 'queued')::int as queued from research_jobs
    )
    select * from lead_agg, activity_agg, deal_agg, follow_up_agg, job_agg
  `);

  const row = result.rows[0] ?? {};
  const n = (key: string) => Number(row[key] ?? 0);

  return {
    totalLeads: n("total_leads"),
    totalCompanies: n("total_companies"),
    newToday: n("new_today"),
    contactedToday: n("contacted_today"),
    researchedToday: n("researched_today"),
    repliesToday: n("replies_today"),
    meetingsToday: n("meetings_today"),
    contacted: n("contacted"),
    replied: n("replied"),
    positive: n("positive"),
    meetings: n("meetings"),
    proposals: n("proposals"),
    openDeals: n("open_deals"),
    openPipelineValue: n("open_value"),
    wonDeals: n("won_deals"),
    wonRevenue: n("won_revenue"),
    lostDeals: n("lost_deals"),
    followUpsDue: n("due_today"),
    followUpsOverdue: n("overdue"),
    researchQueued: n("queued"),
  };
}

export async function getLeadsByStatus(): Promise<{ status: LeadStatus; count: number }[]> {
  const result = await db.execute<{ status: LeadStatus; count: string }>(sql`
    select status, count(*)::text as count
    from contacts where archived = false
    group by status
  `);
  return result.rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

export type SegmentPerformance = {
  id: string | null;
  name: string;
  color: string | null;
  leads: number;
  contacted: number;
  replied: number;
  positive: number;
  meetings: number;
  won: number;
  revenue: number;
};

/** Per-niche funnel — the "which niche deserves more attention" view. */
export async function getNichePerformance(): Promise<SegmentPerformance[]> {
  const result = await db.execute<Record<string, string | null>>(sql`
    select
      n.id                                          as id,
      coalesce(n.name, 'No niche')                  as name,
      n.color                                       as color,
      count(ct.id)::int                             as leads,
      count(ct.id) filter (where ${CONTACTED})::int as contacted,
      count(ct.id) filter (where ${REPLIED})::int   as replied,
      count(ct.id) filter (where ${POSITIVE})::int  as positive,
      count(ct.id) filter (where ${MEETING})::int   as meetings,
      count(ct.id) filter (where ct.status = 'won')::int as won,
      coalesce((select sum(d.value) from deals d where d.niche_id is not distinct from n.id and d.stage = 'won'), 0)::numeric as revenue
    from contacts ct
    join companies c on c.id = ct.company_id
    left join niches n on n.id = c.niche_id
    where ct.archived = false
    group by n.id, n.name, n.color
    order by leads desc
  `);
  return result.rows.map(mapSegment);
}

/** Per-source funnel — the "which lead source produces clients" view. */
export async function getSourcePerformance(): Promise<SegmentPerformance[]> {
  const result = await db.execute<Record<string, string | null>>(sql`
    select
      s.id                                          as id,
      coalesce(s.name, 'Unspecified')               as name,
      null                                          as color,
      count(ct.id)::int                             as leads,
      count(ct.id) filter (where ${CONTACTED})::int as contacted,
      count(ct.id) filter (where ${REPLIED})::int   as replied,
      count(ct.id) filter (where ${POSITIVE})::int  as positive,
      count(ct.id) filter (where ${MEETING})::int   as meetings,
      count(ct.id) filter (where ct.status = 'won')::int as won,
      coalesce((select sum(d.value) from deals d where d.source_id is not distinct from s.id and d.stage = 'won'), 0)::numeric as revenue
    from contacts ct
    left join lead_sources s on s.id = ct.source_id
    where ct.archived = false
    group by s.id, s.name
    order by leads desc
  `);
  return result.rows.map(mapSegment);
}

function mapSegment(row: Record<string, string | null>): SegmentPerformance {
  return {
    id: row.id,
    name: String(row.name),
    color: row.color,
    leads: Number(row.leads),
    contacted: Number(row.contacted),
    replied: Number(row.replied),
    positive: Number(row.positive),
    meetings: Number(row.meetings),
    won: Number(row.won),
    revenue: Number(row.revenue),
  };
}

/** Daily added/contacted counts for the dashboard trend chart. */
export async function getDailyTrend(days = 30): Promise<
  { date: string; added: number; contacted: number }[]
> {
  const result = await db.execute<{ date: string; added: string; contacted: string }>(sql`
    with span as (
      select generate_series(current_date - ${days - 1}::int, current_date, '1 day')::date as date
    )
    select
      to_char(span.date, 'YYYY-MM-DD') as date,
      (select count(*) from contacts where created_at::date = span.date and archived = false)::text as added,
      (select count(*) from contacts where last_contacted_at::date = span.date)::text as contacted
    from span
    order by span.date
  `);
  return result.rows.map((r) => ({
    date: r.date,
    added: Number(r.added),
    contacted: Number(r.contacted),
  }));
}

export type DealMetrics = {
  byStage: { stage: DealStage; count: number; value: number }[];
  pipelineValue: number;
  weightedValue: number;
  wonRevenue: number;
  averageDealSize: number;
  winRate: number;
};

export async function getDealMetrics(): Promise<DealMetrics> {
  const result = await db.execute<{ stage: DealStage; count: string; value: string }>(sql`
    select stage, count(*)::text as count, coalesce(sum(value), 0)::text as value
    from deals group by stage
  `);
  const byStage = result.rows.map((r) => ({
    stage: r.stage,
    count: Number(r.count),
    value: Number(r.value),
  }));

  const open = byStage.filter((s) => s.stage !== "won" && s.stage !== "lost");
  const won = byStage.find((s) => s.stage === "won");
  const lost = byStage.find((s) => s.stage === "lost");

  const [weighted] = (
    await db.execute<{ weighted: string }>(
      sql`select coalesce(sum(value * probability / 100.0), 0)::text as weighted
          from deals where stage not in ('won','lost')`,
    )
  ).rows;

  const closed = (won?.count ?? 0) + (lost?.count ?? 0);

  return {
    byStage,
    pipelineValue: open.reduce((sum, s) => sum + s.value, 0),
    weightedValue: Number(weighted?.weighted ?? 0),
    wonRevenue: won?.value ?? 0,
    averageDealSize: won?.count ? won.value / won.count : 0,
    winRate: closed > 0 ? ((won?.count ?? 0) / closed) * 100 : 0,
  };
}

/** "Today's Prospecting" counters, scoped to real events rather than statuses. */
export async function getTodayMetrics(): Promise<{
  added: number;
  researched: number;
  contacted: number;
  replies: number;
  positive: number;
  meetings: number;
  dealsWon: number;
  followUpsDue: number;
  followUpsOverdue: number;
}> {
  const result = await db.execute<Record<string, string>>(sql`
    select
      (select count(*) from contacts where created_at >= current_date and archived = false)::text as added,
      (select count(*) from activities where type = 'research_completed' and occurred_at >= current_date)::text as researched,
      (select count(*) from contacts where last_contacted_at >= current_date)::text as contacted,
      (select count(*) from activities where type = 'email_replied' and occurred_at >= current_date)::text as replies,
      (select count(*) from activities where type = 'status_changed'
         and occurred_at >= current_date
         and metadata->>'to' in ('positive_reply','meeting_booked'))::text as positive,
      (select count(*) from activities where type = 'meeting_booked' and occurred_at >= current_date)::text as meetings,
      (select count(*) from deals where stage = 'won' and closed_at >= current_date)::text as deals_won,
      (select count(*) from follow_ups where completed_at is null and due_at::date = current_date)::text as follow_ups_due,
      (select count(*) from follow_ups where completed_at is null and due_at < current_date)::text as follow_ups_overdue
  `);
  const row = result.rows[0] ?? {};
  const n = (k: string) => Number(row[k] ?? 0);
  return {
    added: n("added"),
    researched: n("researched"),
    contacted: n("contacted"),
    replies: n("replies"),
    positive: n("positive"),
    meetings: n("meetings"),
    dealsWon: n("deals_won"),
    followUpsDue: n("follow_ups_due"),
    followUpsOverdue: n("follow_ups_overdue"),
  };
}
