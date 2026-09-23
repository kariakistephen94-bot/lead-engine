import { z } from "zod";

import { dealStage, followUpType, leadStatus } from "@/db/schema";
import { MAX_BULK_IDS, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "./constants";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Trim, then treat "" as absent — HTML forms submit empty strings, not null. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/**
 * Accepts a uuid, "", null or undefined and normalises the empty cases to
 * undefined. `null` matters: it is the natural JSON for "no niche"/"no source",
 * and handlers already collapse the result with `?? null`.
 */
const optionalUuid = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
  })
  .optional()
  .refine((v) => v === undefined || z.string().uuid().safeParse(v).success, "Invalid id");

const optionalInt = z
  .union([z.string(), z.number()])
  .transform((v) => (v === "" || v === null ? undefined : Number(v)))
  .optional()
  .refine((v) => v === undefined || (Number.isFinite(v) && !Number.isNaN(v)), "Must be a number");

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), "Invalid date");

/** Query strings send repeated keys or comma lists; accept both. */
export function toArray(value: string | string[] | undefined | null): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const list = (Array.isArray(value) ? value : value.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

/* -------------------------------------------------------------------------- */
/* Lead filters + sorting                                                     */
/* -------------------------------------------------------------------------- */

export const LEAD_SORT_COLUMNS = [
  "created_at",
  "updated_at",
  "company",
  "contact",
  "job_title",
  "niche",
  "industry",
  "location",
  "employee_count",
  "revenue",
  "lead_score",
  "status",
  "source",
  "last_contacted_at",
  "next_follow_up_at",
] as const;
export type LeadSortColumn = (typeof LEAD_SORT_COLUMNS)[number];

export const leadFiltersSchema = z.object({
  q: optionalText,
  nicheIds: z.array(z.string()).optional(),
  statuses: z.array(z.enum(leadStatus.enumValues)).optional(),
  sourceIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  ownerIds: z.array(z.string()).optional(),
  industry: optionalText,
  country: optionalText,
  city: optionalText,
  jobTitle: optionalText,
  minEmployees: optionalInt,
  maxEmployees: optionalInt,
  minRevenue: optionalInt,
  maxRevenue: optionalInt,
  minScore: optionalInt,
  maxScore: optionalInt,
  /** "yes" = has been contacted at least once, "no" = never contacted. */
  contacted: z.enum(["yes", "no"]).optional(),
  hasEmail: z.enum(["yes", "no"]).optional(),
  hasPhone: z.enum(["yes", "no"]).optional(),
  researched: z.enum(["yes", "no"]).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  lastContactedFrom: optionalDate,
  lastContactedTo: optionalDate,
  followUpFrom: optionalDate,
  followUpTo: optionalDate,
  importId: optionalUuid,
  archived: z.enum(["yes", "no", "any"]).optional(),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const leadQuerySchema = leadFiltersSchema.extend({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(LEAD_SORT_COLUMNS).catch("created_at"),
  sortDir: z.enum(["asc", "desc"]).catch("desc"),
});

export type LeadQuery = z.infer<typeof leadQuerySchema>;

/** Parse a URLSearchParams (or a plain record) into a validated lead query. */
export function parseLeadQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): LeadQuery {
  const get = (key: string): string | string[] | undefined =>
    params instanceof URLSearchParams
      ? (params.getAll(key).length > 1 ? params.getAll(key) : (params.get(key) ?? undefined))
      : params[key];

  const raw: Record<string, unknown> = {
    q: get("q"),
    nicheIds: toArray(get("nicheIds") as string | string[] | undefined),
    statuses: toArray(get("statuses") as string | string[] | undefined),
    sourceIds: toArray(get("sourceIds") as string | string[] | undefined),
    tagIds: toArray(get("tagIds") as string | string[] | undefined),
    ownerIds: toArray(get("ownerIds") as string | string[] | undefined),
    industry: get("industry"),
    country: get("country"),
    city: get("city"),
    jobTitle: get("jobTitle"),
    minEmployees: get("minEmployees"),
    maxEmployees: get("maxEmployees"),
    minRevenue: get("minRevenue"),
    maxRevenue: get("maxRevenue"),
    minScore: get("minScore"),
    maxScore: get("maxScore"),
    contacted: get("contacted"),
    hasEmail: get("hasEmail"),
    hasPhone: get("hasPhone"),
    researched: get("researched"),
    createdFrom: get("createdFrom"),
    createdTo: get("createdTo"),
    lastContactedFrom: get("lastContactedFrom"),
    lastContactedTo: get("lastContactedTo"),
    followUpFrom: get("followUpFrom"),
    followUpTo: get("followUpTo"),
    importId: get("importId"),
    archived: get("archived"),
    page: get("page") ?? 1,
    pageSize: get("pageSize") ?? DEFAULT_PAGE_SIZE,
    sortBy: get("sortBy") ?? "created_at",
    sortDir: get("sortDir") ?? "desc",
  };

  // Unknown/invalid single values shouldn't 500 a dashboard — drop them and
  // fall back to defaults, which `.catch()` on the paging fields already does.
  const parsed = leadQuerySchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const cleaned = { ...raw };
  for (const issue of parsed.error.issues) delete cleaned[String(issue.path[0])];
  return leadQuerySchema.parse(cleaned);
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export const createLeadSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  website: optionalText,
  companyPhone: optionalText,
  companyEmail: optionalText,
  companyLinkedin: optionalText,
  industry: optionalText,
  location: optionalText,
  country: optionalText,
  city: optionalText,
  employeeCount: optionalInt,
  revenue: optionalInt,
  companyDescription: optionalText,

  firstName: optionalText,
  lastName: optionalText,
  jobTitle: optionalText,
  email: optionalText,
  phone: optionalText,
  linkedinUrl: optionalText,

  nicheId: optionalUuid,
  sourceId: optionalUuid,
  sourceUrl: optionalText,
  status: z.enum(leadStatus.enumValues).optional(),
  leadScore: optionalInt,
  notes: optionalText,
  tagIds: z.array(z.string()).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  firstName: z.string().trim().nullish(),
  lastName: z.string().trim().nullish(),
  jobTitle: z.string().trim().nullish(),
  email: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  linkedinUrl: z.string().trim().nullish(),
  status: z.enum(leadStatus.enumValues).optional(),
  leadScore: z.number().int().min(0).max(100).nullish(),
  sourceId: z.string().uuid().nullish(),
  ownerId: z.string().uuid().nullish(),
  nextFollowUpAt: z.string().nullish(),
  archived: z.boolean().optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  website: z.string().trim().nullish(),
  industry: z.string().trim().nullish(),
  nicheId: z.string().uuid().nullish(),
  location: z.string().trim().nullish(),
  country: z.string().trim().nullish(),
  city: z.string().trim().nullish(),
  employeeCount: z.number().int().min(0).nullish(),
  revenue: z.number().min(0).nullish(),
  description: z.string().trim().nullish(),
  linkedinUrl: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().nullish(),
  sourceId: z.string().uuid().nullish(),
  sourceUrl: z.string().trim().nullish(),
});

export const nicheSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: optionalText,
  targetMarket: optionalText,
  targetLocations: z.array(z.string().trim().min(1)).optional(),
  idealCompanySize: optionalText,
  targetJobTitles: z.array(z.string().trim().min(1)).optional(),
  painPoints: optionalText,
  offer: optionalText,
  notes: optionalText,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563eb")
    .optional(),
  archived: z.boolean().optional(),
});

export const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    status: z.enum(leadStatus.enumValues),
  }),
  z.object({
    action: z.literal("set_niche"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    nicheId: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal("add_tag"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    tagId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("remove_tag"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    tagId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("mark_contacted"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
  }),
  z.object({
    action: z.literal("archive"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    archived: z.boolean(),
  }),
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
  }),
  z.object({
    action: z.literal("queue_research"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
  }),
  z.object({
    action: z.literal("set_owner"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    ownerId: z.string().uuid().nullable(),
  }),
]);

export type BulkAction = z.infer<typeof bulkActionSchema>;

export const noteSchema = z.object({
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  body: z.string().trim().min(1, "Note cannot be empty").max(5000),
});

export const activitySchema = z.object({
  contactId: z.string().uuid(),
  type: z.enum([
    "email_sent",
    "email_opened",
    "email_replied",
    "call_made",
    "linkedin_message",
    "follow_up_logged",
    "meeting_booked",
    "proposal_sent",
  ]),
  subject: optionalText,
  body: optionalText,
  occurredAt: optionalDate,
});

export const followUpSchema = z.object({
  contactId: z.string().uuid(),
  dueAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  type: z.enum(followUpType.enumValues).default("email"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  notes: optionalText,
});

export const dealSchema = z.object({
  name: z.string().trim().min(1, "Deal name is required").max(200),
  companyId: optionalUuid,
  contactId: optionalUuid,
  value: z.coerce.number().min(0).default(0),
  currency: z.string().trim().length(3).default("USD"),
  stage: z.enum(dealStage.enumValues).default("lead"),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseDate: optionalDate,
  sourceId: optionalUuid,
  nicheId: optionalUuid,
  notes: optionalText,
});

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/* -------------------------------------------------------------------------- */
/* Prospecting                                                                */
/* -------------------------------------------------------------------------- */

/** Upper bound on one search — protects the vendor quota and the review UI. */
export const MAX_PROSPECT_RESULTS = 100;

const stringList = z.array(z.string().trim().min(1)).max(25).optional();

export const prospectSearchSchema = z
  .object({
    description: z.string().trim().min(3, "Describe who you are looking for").max(500),
    locations: stringList,
    industries: stringList,
    jobTitles: stringList,
    keywords: stringList,
    minEmployees: z.coerce.number().int().min(0).max(1_000_000).nullish(),
    maxEmployees: z.coerce.number().int().min(0).max(1_000_000).nullish(),
    limit: z.coerce.number().int().min(1).max(MAX_PROSPECT_RESULTS).default(25),
  })
  .refine(
    (v) => v.minEmployees == null || v.maxEmployees == null || v.minEmployees <= v.maxEmployees,
    { message: "Minimum headcount cannot exceed the maximum", path: ["maxEmployees"] },
  );

export type ProspectSearchInput = z.infer<typeof prospectSearchSchema>;

const prospectContactSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
});

const prospectCompanySchema = z.object({
  name: z.string().trim().min(1),
  website: z.string().nullable(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  employeeCount: z.number().nullable(),
  revenue: z.number().nullable(),
  description: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  phone: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  contacts: z.array(prospectContactSchema),
});

export const prospectSaveSchema = z.object({
  description: z.string().trim().min(1).max(500),
  nicheId: optionalUuid,
  /**
   * Results are posted back rather than re-fetched: the user reviewed *these*
   * records, and a second search could return something different.
   */
  companies: z.array(prospectCompanySchema).min(1).max(MAX_PROSPECT_RESULTS),
});

export const prospectParseSchema = z.object({
  prompt: z.string().trim().min(3, "Describe who you are looking for").max(500),
});


/* -------------------------------------------------------------------------- */
/* X lead engine                                                              */
/* -------------------------------------------------------------------------- */

export const xSearchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  // X's recent-search limit; the service also checks brackets and quotes.
  query: z.string().trim().min(1, "Query is required").max(512, "X allows at most 512 characters"),
  nicheId: z.string().uuid().nullish(),
  enabled: z.boolean().optional(),
  autoConvert: z.boolean().optional(),
  // Under 15 minutes mostly re-asks for nothing new while spending rate limit.
  intervalMinutes: z.coerce.number().int().min(15).max(10_080).optional(),
  maxPostsPerRun: z.coerce.number().int().min(10).max(1000).optional(),
});

export type XSearchInput = z.infer<typeof xSearchSchema>;
