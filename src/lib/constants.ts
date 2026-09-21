import type { DealStage, LeadStatus } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Lead pipeline                                                              */
/* -------------------------------------------------------------------------- */

export type StatusTone = "slate" | "blue" | "indigo" | "amber" | "green" | "red";

export const LEAD_STATUSES: {
  value: LeadStatus;
  label: string;
  tone: StatusTone;
  /** Shown as a Kanban column. Terminal states are hidden by default. */
  kanban: boolean;
  /** Counts as "the lead has been contacted at least once". */
  contacted: boolean;
}[] = [
  { value: "new", label: "New", tone: "slate", kanban: true, contacted: false },
  { value: "researched", label: "Researched", tone: "slate", kanban: true, contacted: false },
  { value: "qualified", label: "Qualified", tone: "blue", kanban: true, contacted: false },
  { value: "ready_to_contact", label: "Ready to Contact", tone: "blue", kanban: true, contacted: false },
  { value: "contacted", label: "Contacted", tone: "indigo", kanban: true, contacted: true },
  { value: "follow_up", label: "Follow-up", tone: "indigo", kanban: true, contacted: true },
  { value: "replied", label: "Replied", tone: "amber", kanban: true, contacted: true },
  { value: "positive_reply", label: "Positive Reply", tone: "green", kanban: true, contacted: true },
  { value: "meeting_booked", label: "Meeting Booked", tone: "green", kanban: true, contacted: true },
  { value: "proposal_sent", label: "Proposal Sent", tone: "green", kanban: true, contacted: true },
  { value: "negotiation", label: "Negotiation", tone: "green", kanban: true, contacted: true },
  { value: "won", label: "Won", tone: "green", kanban: true, contacted: true },
  { value: "lost", label: "Lost", tone: "red", kanban: false, contacted: true },
  { value: "not_interested", label: "Not Interested", tone: "red", kanban: false, contacted: true },
  { value: "do_not_contact", label: "Do Not Contact", tone: "red", kanban: false, contacted: false },
];

export const STATUS_LABEL = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.value, s.label]),
) as Record<LeadStatus, string>;

export const STATUS_TONE = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.value, s.tone]),
) as Record<LeadStatus, StatusTone>;

export const CONTACTED_STATUSES = LEAD_STATUSES.filter((s) => s.contacted).map((s) => s.value);
export const POSITIVE_REPLY_STATUSES: LeadStatus[] = [
  "positive_reply",
  "meeting_booked",
  "proposal_sent",
  "negotiation",
  "won",
];
export const REPLIED_STATUSES: LeadStatus[] = ["replied", ...POSITIVE_REPLY_STATUSES];
export const MEETING_STATUSES: LeadStatus[] = [
  "meeting_booked",
  "proposal_sent",
  "negotiation",
  "won",
];
export const KANBAN_STATUSES = LEAD_STATUSES.filter((s) => s.kanban).map((s) => s.value);

/* -------------------------------------------------------------------------- */
/* Deals                                                                      */
/* -------------------------------------------------------------------------- */

export const DEAL_STAGES: {
  value: DealStage;
  label: string;
  probability: number;
  tone: StatusTone;
  open: boolean;
}[] = [
  { value: "lead", label: "Lead", probability: 10, tone: "slate", open: true },
  { value: "qualified", label: "Qualified", probability: 25, tone: "blue", open: true },
  { value: "meeting", label: "Meeting", probability: 40, tone: "indigo", open: true },
  { value: "proposal", label: "Proposal", probability: 60, tone: "amber", open: true },
  { value: "negotiation", label: "Negotiation", probability: 80, tone: "amber", open: true },
  { value: "won", label: "Won", probability: 100, tone: "green", open: false },
  { value: "lost", label: "Lost", probability: 0, tone: "red", open: false },
];

export const DEAL_STAGE_LABEL = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.value, s.label]),
) as Record<DealStage, string>;

export const OPEN_DEAL_STAGES = DEAL_STAGES.filter((s) => s.open).map((s) => s.value);

/* -------------------------------------------------------------------------- */
/* Sources seeded on first run                                                */
/* -------------------------------------------------------------------------- */

export const SYSTEM_SOURCES = [
  { name: "Apollo", slug: "apollo" },
  { name: "Manual Research", slug: "manual-research" },
  { name: "Google Maps", slug: "google-maps" },
  { name: "OpenStreetMap", slug: "openstreetmap" },
  { name: "LinkedIn", slug: "linkedin" },
  { name: "Instagram", slug: "instagram" },
  { name: "Facebook", slug: "facebook" },
  { name: "Website Research", slug: "website-research" },
  { name: "Referral", slug: "referral" },
  { name: "CSV Import", slug: "csv-import" },
  { name: "AI Research", slug: "ai-research" },
  { name: "Advertisement", slug: "advertisement" },
  { name: "Other", slug: "other" },
];

export const DEFAULT_TAGS = [
  { name: "High Intent", slug: "high-intent", color: "#dc2626" },
  { name: "High Value", slug: "high-value", color: "#ea580c" },
  { name: "AI Opportunity", slug: "ai-opportunity", color: "#7c3aed" },
  { name: "Needs Follow-up", slug: "needs-follow-up", color: "#2563eb" },
  { name: "Hot", slug: "hot", color: "#dc2626" },
  { name: "Warm", slug: "warm", color: "#f59e0b" },
  { name: "Cold", slug: "cold", color: "#0891b2" },
  { name: "Decision Maker", slug: "decision-maker", color: "#16a34a" },
  { name: "Website Visitor", slug: "website-visitor", color: "#64748b" },
  { name: "Referral", slug: "referral", color: "#059669" },
];

/* -------------------------------------------------------------------------- */
/* Table / paging                                                             */
/* -------------------------------------------------------------------------- */

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;
/** Hard ceiling so a crafted ?pageSize= cannot pull the whole table. */
export const MAX_PAGE_SIZE = 200;
/** Bulk actions stream ids; cap protects the request body and the query planner. */
export const MAX_BULK_IDS = 1000;
/** Export streams row-by-row but still needs a sane ceiling. */
export const MAX_EXPORT_ROWS = 50_000;

export const SETTINGS_KEYS = {
  dailyTarget: "daily_target",
} as const;

/**
 * Cards rendered per pipeline column. Lives here rather than in the pipeline
 * service so the board (a client component) can read it without pulling the
 * server-only data layer — and `pg` with it — into the browser bundle.
 */
export const CARDS_PER_COLUMN = 25;
