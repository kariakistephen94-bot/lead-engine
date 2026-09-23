/**
 * AI Lead Engine — relational schema.
 *
 * Design note on "leads": a lead is a `contact` attached to a `company`.
 * There is deliberately no separate `leads` table — that would duplicate the
 * pipeline state across two rows and make status/score ambiguous. The pipeline
 * columns (status, lead_score, last_contacted_at, next_follow_up_at) live on
 * `contacts`; firmographics live on `companies`. One company -> many contacts.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", ["owner", "member"]);

/** Which of the five lead-engine buckets a record came from. */
export const leadBucket = pgEnum("lead_bucket", [
  "active_buyer",      // 1 — already hiring / already paying
  "needs_you",         // 2 — no ad spend, obvious gaps
  "spending_money",    // 3 — running ads, has budget
  "community",         // 4 — forums, threads, groups
  "social_listening",  // 5 — expressed pain
]);

/** Lifecycle of one outbound email. */
export const emailStatus = pgEnum("email_status", [
  "draft", "queued", "sending", "sent", "delivered", "opened",
  "replied", "bounced", "complained", "failed", "skipped",
]);

/** Why an address must never be emailed again. */
export const suppressionReason = pgEnum("suppression_reason", [
  "unsubscribed", "bounced", "complained", "manual",
]);

/** Application pipeline for a scraped job posting. */
export const applicationStatus = pgEnum("application_status", [
  "new",
  "shortlisted",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "archived",
]);

/** Ordered outbound pipeline. Order here is the order shown in the Kanban. */
export const leadStatus = pgEnum("lead_status", [
  "new",
  "researched",
  "qualified",
  "ready_to_contact",
  "contacted",
  "follow_up",
  "replied",
  "positive_reply",
  "meeting_booked",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "not_interested",
  "do_not_contact",
]);

export const dealStage = pgEnum("deal_stage", [
  "lead",
  "qualified",
  "meeting",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

export const activityType = pgEnum("activity_type", [
  "lead_created",
  "research_completed",
  "email_sent",
  "email_opened",
  "email_replied",
  "call_made",
  "linkedin_message",
  "follow_up_logged",
  "status_changed",
  "note_added",
  "meeting_booked",
  "proposal_sent",
  "deal_created",
  "deal_won",
  "deal_lost",
  "imported",
  "enriched",
]);

export const activityDirection = pgEnum("activity_direction", [
  "outbound",
  "inbound",
  "system",
]);

export const followUpType = pgEnum("follow_up_type", [
  "email",
  "call",
  "linkedin",
  "meeting",
  "task",
]);

export const priority = pgEnum("priority", ["low", "normal", "high"]);

export const importStatus = pgEnum("import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const importRowStatus = pgEnum("import_row_status", [
  "imported",
  "duplicate",
  "invalid",
  "merged",
]);

export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

/**
 * Where a cold DM is sent. LinkedIn is the odd one out because the first touch
 * is a connection request with a 300-character note, not a message. Facebook
 * was dropped as a channel in September 2026.
 */
export const dmPlatform = pgEnum("dm_platform", [
  "instagram",
  "twitter",
  "linkedin",
]);

/**
 * Manual-send lifecycle. `connect_sent` exists only for LinkedIn, where the
 * first touch is a connection request that has to be accepted before the
 * opener can be sent at all — collapsing it into `first_sent` would report a
 * message as delivered when it is still sitting behind an unanswered request.
 */
export const dmStatus = pgEnum("dm_status", [
  "draft",
  "connect_sent",
  "first_sent",
  "second_sent",
  "replied",
  "dismissed",
]);

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /*
     * Null once Supabase Auth owns the credentials. The column stays so an
     * existing self-hosted install keeps working through the switchover, and
     * so a row migrated from the old scheme is not silently left unusable.
     */
    passwordHash: text("password_hash"),
    /*
     * The matching `auth.users.id` in Supabase. Kept as a separate column
     * rather than reusing `id`, because `owner_id` on companies, contacts,
     * deals and imports already points at `users.id` — repointing those at an
     * auth uid would rewrite ownership across the whole database.
     */
    authUserId: uuid("auth_user_id"),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("member"),
    dailyTarget: integer("daily_target").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(sql`lower(${t.email})`),
    uniqueIndex("users_auth_user_id_key").on(t.authUserId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Niches                                                                     */
/* -------------------------------------------------------------------------- */

export const niches = pgTable(
  "niches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    targetMarket: text("target_market"),
    targetLocations: text("target_locations").array(),
    idealCompanySize: text("ideal_company_size"),
    targetJobTitles: text("target_job_titles").array(),
    painPoints: text("pain_points"),
    offer: text("offer"),
    notes: text("notes"),
    color: text("color").notNull().default("#2563eb"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("niches_slug_key").on(t.slug),
    index("niches_archived_idx").on(t.archived),
  ],
);

/* -------------------------------------------------------------------------- */
/* Lead sources                                                               */
/* -------------------------------------------------------------------------- */

export const leadSources = pgTable(
  "lead_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /** System sources ship with the app and cannot be deleted. */
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lead_sources_slug_key").on(t.slug)],
);

/* -------------------------------------------------------------------------- */
/* Companies                                                                  */
/* -------------------------------------------------------------------------- */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    website: text("website"),
    /** Normalised registrable domain — the primary dedupe key. */
    domain: text("domain"),
    industry: text("industry"),
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    location: text("location"),
    country: text("country"),
    city: text("city"),
    employeeCount: integer("employee_count"),
    revenue: numeric("revenue", { precision: 14, scale: 2 }),
    description: text("description"),
    linkedinUrl: text("linkedin_url"),
    phone: text("phone"),
    email: text("email"),
    sourceId: uuid("source_id").references(() => leadSources.id, { onDelete: "set null" }),
    sourceUrl: text("source_url"),
    sourcedAt: timestamp("sourced_at", { withTimezone: true }),
    researchMethod: text("research_method"),
    importId: uuid("import_id"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_domain_key").on(t.domain).where(sql`${t.domain} is not null`),
    index("companies_niche_idx").on(t.nicheId),
    index("companies_source_idx").on(t.sourceId),
    index("companies_country_idx").on(t.country),
    index("companies_employee_idx").on(t.employeeCount),
    index("companies_created_idx").on(t.createdAt),
    index("companies_name_lower_idx").on(sql`lower(${t.name})`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Contacts (= leads)                                                         */
/* -------------------------------------------------------------------------- */

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").generatedAlwaysAs(
      sql`btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))`,
    ),
    jobTitle: text("job_title"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    status: leadStatus("status").notNull().default("new"),
    leadScore: smallint("lead_score"),
    sourceId: uuid("source_id").references(() => leadSources.id, { onDelete: "set null" }),
    sourceUrl: text("source_url"),
    sourcedAt: timestamp("sourced_at", { withTimezone: true }),
    importId: uuid("import_id"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_email_key")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
    uniqueIndex("contacts_linkedin_key")
      .on(t.linkedinUrl)
      .where(sql`${t.linkedinUrl} is not null`),
    index("contacts_company_idx").on(t.companyId),
    index("contacts_status_idx").on(t.status),
    index("contacts_score_idx").on(t.leadScore),
    index("contacts_source_idx").on(t.sourceId),
    index("contacts_owner_idx").on(t.ownerId),
    index("contacts_created_idx").on(t.createdAt),
    index("contacts_next_follow_up_idx").on(t.nextFollowUpAt),
    index("contacts_last_contacted_idx").on(t.lastContactedAt),
    index("contacts_archived_idx").on(t.archived),
  ],
);

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color: text("color").notNull().default("#64748b"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_slug_key").on(t.slug)],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    index("contact_tags_tag_idx").on(t.tagId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Activity timeline                                                          */
/* -------------------------------------------------------------------------- */

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    type: activityType("type").notNull(),
    direction: activityDirection("direction").notNull().default("system"),
    subject: text("subject"),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_contact_idx").on(t.contactId, t.occurredAt),
    index("activities_company_idx").on(t.companyId),
    index("activities_type_idx").on(t.type),
    index("activities_occurred_idx").on(t.occurredAt),
  ],
);

/** Raw provider webhook events (Apollo, ESP, …) kept separate from the timeline. */
export const outreachEvents = pgTable(
  "outreach_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outreach_events_contact_idx").on(t.contactId),
    uniqueIndex("outreach_events_external_key")
      .on(t.provider, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Notes & follow-ups                                                         */
/* -------------------------------------------------------------------------- */

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_contact_idx").on(t.contactId, t.createdAt)],
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    type: followUpType("type").notNull().default("email"),
    priority: priority("priority").notNull().default("normal"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("follow_ups_due_idx").on(t.dueAt),
    index("follow_ups_contact_idx").on(t.contactId),
    index("follow_ups_open_idx").on(t.completedAt, t.dueAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Deals                                                                      */
/* -------------------------------------------------------------------------- */

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    value: numeric("value", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    stage: dealStage("stage").notNull().default("lead"),
    probability: smallint("probability").notNull().default(10),
    expectedCloseDate: date("expected_close_date"),
    sourceId: uuid("source_id").references(() => leadSources.id, { onDelete: "set null" }),
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deals_stage_idx").on(t.stage),
    index("deals_niche_idx").on(t.nicheId),
    index("deals_company_idx").on(t.companyId),
    index("deals_created_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* AI research                                                                */
/* -------------------------------------------------------------------------- */

export const aiResearch = pgTable(
  "ai_research",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    whatTheyDo: text("what_they_do"),
    painPoints: jsonb("pain_points").$type<string[]>(),
    automationOpportunities: jsonb("automation_opportunities").$type<string[]>(),
    recommendedOffer: text("recommended_offer"),
    personalization: jsonb("personalization").$type<string[]>(),
    score: smallint("score"),
    scoreReason: text("score_reason"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    provider: text("provider").notNull(),
    model: text("model"),
    sourcesUsed: jsonb("sources_used").$type<string[]>(),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_research_company_idx").on(t.companyId, t.createdAt),
    index("ai_research_contact_idx").on(t.contactId),
  ],
);

/** Queue backing "Research lead" and bulk "Queue for AI research". */
export const researchJobs = pgTable(
  "research_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("research"),
    status: jobStatus("status").notNull().default("queued"),
    attempts: smallint("attempts").notNull().default(0),
    error: text("error"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("research_jobs_status_idx").on(t.status, t.createdAt),
    index("research_jobs_company_idx").on(t.companyId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filename: text("filename").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    invalidCount: integer("invalid_count").notNull().default(0),
    status: importStatus("status").notNull().default("pending"),
    mapping: jsonb("mapping").$type<Record<string, string>>(),
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => leadSources.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("imports_created_idx").on(t.createdAt)],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").$type<Record<string, string>>().notNull(),
    status: importRowStatus("status").notNull(),
    error: text("error"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  },
  (t) => [index("import_rows_import_idx").on(t.importId, t.status)],
);

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export const settings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Lead engine — scraped job postings                                         */
/* -------------------------------------------------------------------------- */

/**
 * A job posting found by a scraper.
 *
 * Kept separate from `contacts` on purpose: a posting is an *opportunity*, not a
 * person, and it carries its own application pipeline. When the posting can be
 * tied to a company in the database, `companyId` links them; otherwise the raw
 * `companyName` is retained so the lead is still actionable.
 */
export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Adapter that found it, e.g. "remoteok", "hackernews", "greenhouse". */
    source: text("source").notNull(),
    /** The source's own id, so re-scrapes update rather than duplicate. */
    sourceId: text("source_id"),
    /** Canonical apply/permalink. The dedupe key. */
    url: text("url").notNull(),
    title: text("title").notNull(),
    companyName: text("company_name"),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    location: text("location"),
    remote: boolean("remote").notNull().default(false),
    salary: text("salary"),
    description: text("description"),
    /** Contact route found in the posting, when the source exposes one. */
    contactEmail: text("contact_email"),
    /** Search terms that matched — why this is a lead. */
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    bucket: leadBucket("bucket").notNull().default("active_buyer"),
    /** Keyword-match relevance, 0-100. */
    score: smallint("score"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    status: applicationStatus("status").notNull().default("new"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Whole original record, so nothing found is ever thrown away. */
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("job_postings_url_key").on(t.url),
    index("job_postings_source_idx").on(t.source),
    index("job_postings_status_idx").on(t.status),
    index("job_postings_bucket_idx").on(t.bucket),
    index("job_postings_posted_idx").on(t.postedAt.desc()),
    index("job_postings_company_idx").on(t.companyId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Lead engine — website qualification signals                                */
/* -------------------------------------------------------------------------- */

/**
 * What a scan of the company's own website found.
 *
 * This is how buckets 2, 3 and 5 are qualified without scraping any platform
 * that forbids it: ad pixels on the site are direct evidence of ad spend, and
 * missing chat/booking/video is direct evidence of an opening.
 */
export const companySignals = pgTable(
  "company_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null when the site could not be reached — an unknown, not a "no". */
    httpStatus: smallint("http_status"),
    finalUrl: text("final_url"),
    error: text("error"),

    hasLiveChat: boolean("has_live_chat"),
    chatVendor: text("chat_vendor"),
    hasBooking: boolean("has_booking"),
    bookingVendor: text("booking_vendor"),
    hasLeadForm: boolean("has_lead_form"),
    hasVideo: boolean("has_video"),
    /** Ad pixels found — evidence they are already buying traffic. */
    adPlatforms: text("ad_platforms").array().notNull().default(sql`'{}'::text[]`),
    hasAnalytics: boolean("has_analytics"),
    cms: text("cms"),
    stack: text("stack").array().notNull().default(sql`'{}'::text[]`),
    https: boolean("https"),
    mobileFriendly: boolean("mobile_friendly"),
    /** Handles found on the site: instagram, tiktok, youtube, linkedin, x… */
    social: jsonb("social"),

    /** 0-100. Higher = more obvious opportunity. */
    opportunityScore: smallint("opportunity_score"),
    /** Human-readable openings, e.g. "No live chat", "Runs ads but no chatbot". */
    opportunities: text("opportunities").array().notNull().default(sql`'{}'::text[]`),
    suggestedBucket: leadBucket("suggested_bucket"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_signals_company_key").on(t.companyId),
    index("company_signals_score_idx").on(t.opportunityScore.desc()),
    index("company_signals_bucket_idx").on(t.suggestedBucket),
  ],
);

/* -------------------------------------------------------------------------- */
/* Lead engine — scrape run log                                               */
/* -------------------------------------------------------------------------- */

/** One row per scraper run, so results are auditable and re-runnable. */
export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    bucket: leadBucket("bucket").notNull(),
    terms: text("terms").array().notNull().default(sql`'{}'::text[]`),
    found: integer("found").notNull().default(0),
    inserted: integer("inserted").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    status: text("status").notNull().default("running"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("scrape_runs_started_idx").on(t.startedAt.desc())],
);

/* -------------------------------------------------------------------------- */
/* Outbound email                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A sending identity: one domain on one Resend account.
 *
 * Rows rather than config, because the daily allowance and warm-up position are
 * state that changes every day, and because volume is split across domains —
 * a shared counter would defeat the point of separating them.
 *
 * The API key is never stored. Only the *name* of the environment variable
 * holding it, so a database dump can never leak a credential.
 */
export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    provider: text("provider").notNull().default("resend"),
    domain: text("domain").notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name").notNull(),
    replyTo: text("reply_to"),
    apiKeyEnv: text("api_key_env").notNull(),
    dailyCap: integer("daily_cap").notNull().default(75),
    warmupEnabled: boolean("warmup_enabled").notNull().default(true),
    warmupStart: integer("warmup_start").notNull().default(10),
    warmupIncrement: integer("warmup_increment").notNull().default(5),
    warmupStartedOn: date("warmup_started_on"),
    minSecondsBetweenSends: integer("min_seconds_between_sends").notNull().default(45),
    active: boolean("active").notNull().default(true),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_accounts_from_key").on(sql`lower(${t.fromEmail})`),
    index("email_accounts_active_idx").on(t.active),
  ],
);

/**
 * One outbound email. Every send is a row before it is an email: the copy is
 * written and stored first so it can be reviewed, and so failure is never silent.
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => emailAccounts.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id"),
    campaignName: text("campaign_name"),

    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),

    /** Evidence the opener was built from, so any claim can be traced back. */
    personalisationBasis: text("personalisation_basis").array().notNull().default(sql`'{}'::text[]`),
    personalisedBy: text("personalised_by"),

    status: emailStatus("status").notNull().default("draft"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    attempts: smallint("attempts").notNull().default(0),
    unsubscribeToken: text("unsubscribe_token").notNull(),

    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_messages_status_idx").on(t.status),
    index("email_messages_account_idx").on(t.accountId),
    index("email_messages_contact_idx").on(t.contactId),
    index("email_messages_sent_idx").on(t.sentAt.desc()),
    uniqueIndex("email_messages_unsub_key").on(t.unsubscribeToken),
    uniqueIndex("email_messages_provider_key")
      .on(t.providerMessageId)
      .where(sql`${t.providerMessageId} is not null`),
    /** One send per contact per campaign — the guard against double-emailing. */
    uniqueIndex("email_messages_contact_campaign_key")
      .on(t.contactId, t.campaignId)
      .where(sql`${t.contactId} is not null and ${t.campaignId} is not null`),
  ],
);

/**
 * Addresses that must never be contacted again. Checked before every send.
 * Unsubscribing is a legal right for the UK, Irish and French businesses on
 * this list, and a bounce that keeps being retried is what gets a domain blocked.
 */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    reason: suppressionReason("reason").notNull(),
    note: text("note"),
    messageId: uuid("message_id").references(() => emailMessages.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_suppressions_email_key").on(sql`lower(${t.email})`)],
);

/* -------------------------------------------------------------------------- */
/* Social DM scripts — Instagram / X / LinkedIn outreach                      */
/* -------------------------------------------------------------------------- */

/**
 * A generated two-message DM sequence for one lead on one platform.
 *
 * DMs cannot be sent by the app (no platform offers a messaging API for cold
 * outreach), so the unit here is a *script* the owner sends by hand and then
 * marks off. Statuses mirror that manual flow: draft → first_sent →
 * second_sent, with replied/dismissed as exits at any point.
 */
export const dmDrafts = pgTable(
  "dm_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    platform: dmPlatform("platform").notNull(),
    /** Handle as found on their website, without the @. */
    handle: text("handle").notNull(),
    /**
     * LinkedIn only: the note attached to the connection request, which is
     * capped at 300 characters and is the *only* thing they read before
     * deciding. Null on every other platform, where you can message directly.
     */
    connectionNote: text("connection_note"),
    /** The opener: 2–4 sentences, curiosity CTA, no pitch. */
    firstMessage: text("first_message").notNull(),
    /** Follow-up for 3–5 days later if the opener gets no reply. */
    secondMessage: text("second_message").notNull(),
    /** Which observed facts the writer actually used, for review. */
    basisUsed: text("basis_used").array().notNull().default(sql`'{}'::text[]`),
    generatedBy: text("generated_by"),
    offer: text("offer"),
    status: dmStatus("status").notNull().default("draft"),
    firstSentAt: timestamp("first_sent_at", { withTimezone: true }),
    secondSentAt: timestamp("second_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One live script per lead per platform — regenerating replaces, not stacks.
    uniqueIndex("dm_drafts_contact_platform_key").on(t.contactId, t.platform),
    index("dm_drafts_status_idx").on(t.status),
    index("dm_drafts_created_idx").on(t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Niche = typeof niches.$inferSelect;
export type NewNiche = typeof niches.$inferInsert;
export type LeadSource = typeof leadSources.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type AiResearch = typeof aiResearch.$inferSelect;
export type ResearchJob = typeof researchJobs.$inferSelect;
export type Import = typeof imports.$inferSelect;
export type ImportRow = typeof importRows.$inferSelect;

export type LeadStatus = (typeof leadStatus.enumValues)[number];
export type DealStage = (typeof dealStage.enumValues)[number];
export type ActivityType = (typeof activityType.enumValues)[number];
export type FollowUpType = (typeof followUpType.enumValues)[number];
export type JobPosting = typeof jobPostings.$inferSelect;
export type NewJobPosting = typeof jobPostings.$inferInsert;
export type CompanySignals = typeof companySignals.$inferSelect;
export type NewCompanySignals = typeof companySignals.$inferInsert;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
export type LeadBucket = (typeof leadBucket.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type NewEmailAccount = typeof emailAccounts.$inferInsert;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type EmailStatus = (typeof emailStatus.enumValues)[number];
export type SuppressionReason = (typeof suppressionReason.enumValues)[number];
export type DmDraft = typeof dmDrafts.$inferSelect;
export type NewDmDraft = typeof dmDrafts.$inferInsert;
export type DmPlatform = (typeof dmPlatform.enumValues)[number];
export type DmStatus = (typeof dmStatus.enumValues)[number];

/* -------------------------------------------------------------------------- */
/* Build tracker + content engine                                             */
/* -------------------------------------------------------------------------- */

/**
 * The six platforms in focus from 1 September 2026.
 *
 * Deliberately a closed set rather than free text: every prompt, character
 * limit and metric column below is written per-platform, so a platform that
 * isn't in this list has no rules and would produce unusable copy.
 */
export const socialPlatform = pgEnum("social_platform", [
  "twitter",
  "linkedin",
  "contra",
  "tiktok",
  "youtube",
  "instagram",
]);

/**
 * What shape the writer produces. Derived from the platform, but stored on the
 * row so an old post keeps the shape it was written in even if a platform's
 * treatment is later changed.
 */
export const contentFormat = pgEnum("content_format", [
  "text_post", // twitter, linkedin — the post itself, three angles
  "video_hook", // tiktok, youtube, instagram — hook + caption, no script
  "showcase", // contra — a portfolio writeup aimed at someone hiring
]);

/** Lifecycle of one written post. Posting is manual, so `posted` is a claim you make. */
export const postStatus = pgEnum("post_status", [
  "draft",
  "approved",
  "scheduled",
  "posted",
  "archived",
]);

export const buildStatus = pgEnum("build_status", [
  "planned",
  "active",
  "completed",
  "paused",
]);

/**
 * A project written up for someone deciding whether to hire you.
 *
 * Deliberately has no field for results or metrics. These are portfolio
 * builds with no users and no revenue, and a case study is exactly where the
 * temptation to invent them is strongest — so the shape simply does not offer
 * anywhere to put one. What it offers instead is `demonstrates`: what the
 * build proves you can do, which is a claim that can be backed.
 */
export type CaseStudy = {
  /** Outcome-shaped headline, under 70 characters. */
  headline: string;
  /** One or two sentences: what the thing is. */
  intro: string;
  /** The problem this kind of system solves for a business. */
  problem: string;
  /** How it was built, in plain language. */
  approach: string;
  /** Three to five steps describing the mechanism. */
  howItWorks: string[];
  /** What it proves the builder can do for a client. */
  demonstrates: string[];
  /** Which project facts and log entries the writer used. */
  basisUsed: string[];
};

/**
 * One project from the 9-week curriculum.
 *
 * `number` is the curriculum's own 1–27 numbering and is the natural key —
 * re-seeding updates a row rather than stacking a second copy of Project 7.
 * The content engine reads `status = 'active'` to decide what you are
 * currently building, which is what it writes about.
 */
export const buildProjects = pgTable(
  "build_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 1–27, as numbered in the curriculum. */
    number: smallint("number").notNull(),
    /** 1–9. */
    week: smallint("week").notNull(),
    /** e.g. "FastAPI Backend Engineering" — repeated per project so one row is self-contained. */
    weekTheme: text("week_theme").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    /** The feature list, verbatim from the plan. Raw material for the writer. */
    features: text("features").array().notNull().default(sql`'{}'::text[]`),
    /** Tools this project is built with. */
    stack: text("stack").array().notNull().default(sql`'{}'::text[]`),
    /** That week's "Learn" list — the skills the project is meant to prove. */
    learningGoals: text("learning_goals").array().notNull().default(sql`'{}'::text[]`),
    status: buildStatus("status").notNull().default("planned"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    repoUrl: text("repo_url"),
    demoUrl: text("demo_url"),
    /** Walkthrough or tutorial video, when one exists. */
    youtubeUrl: text("youtube_url"),
    notes: text("notes"),
    /**
     * The client-facing writeup, generated from the project record and its
     * build logs and then editable by hand.
     *
     * Stored as one document rather than six columns because it is read and
     * written as a whole, never queried by part — and because a half-written
     * case study should be one nullable value, not six columns each carrying
     * their own idea of "not done yet".
     */
    caseStudy: jsonb("case_study").$type<CaseStudy>(),
    caseStudyGeneratedBy: text("case_study_generated_by"),
    /**
     * Whether this project appears on the public Kiln site.
     *
     * Opt-in rather than derived from `completed`: finishing a learning
     * exercise and being willing to show it to a paying client are different
     * decisions, and only one of them is yours to make deliberately.
     */
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("build_projects_number_key").on(t.number),
    index("build_projects_published_idx").on(t.published),
    index("build_projects_status_idx").on(t.status),
    index("build_projects_week_idx").on(t.week),
  ],
);

/**
 * A day's progress on a project — the "how I'm building it" record.
 *
 * This exists as much for the content engine as for you: `built` and
 * `learned` are the only honest source of specifics the writer has. Without
 * a log the model can only describe the plan, and plan-shaped posts read like
 * everyone else's.
 */
export const buildLogs = pgTable(
  "build_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => buildProjects.id, { onDelete: "cascade" }),
    loggedOn: date("logged_on").notNull(),
    /** What actually got working. Specifics, not intentions. */
    built: text("built").notNull(),
    /** What fought back. The most postable material you produce. */
    blockers: text("blockers"),
    learned: text("learned"),
    hours: numeric("hours", { precision: 4, scale: 1 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("build_logs_project_idx").on(t.projectId, t.loggedOn.desc()),
    index("build_logs_date_idx").on(t.loggedOn.desc()),
  ],
);

/**
 * One post idea, for one platform.
 *
 * The idea is the unit that gets three variations hung off it: same premise,
 * three different angles on it. Grouping them this way is what makes "give me
 * another take on that" cheap and keeps the tracker able to answer which
 * *angle* performs, not just which post.
 */
export const contentIdeas = pgTable(
  "content_ideas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for a free-form topic not tied to a curriculum project. */
    projectId: uuid("project_id").references(() => buildProjects.id, { onDelete: "cascade" }),
    platform: socialPlatform("platform").notNull(),
    format: contentFormat("format").notNull(),
    /** The one-line idea, e.g. "the async bug that cost me an afternoon". */
    angle: text("angle").notNull(),
    /** A sentence or two of shared premise the variations each attack differently. */
    premise: text("premise"),
    /** Which project facts and log entries the writer actually used. */
    basisUsed: text("basis_used").array().notNull().default(sql`'{}'::text[]`),
    generatedBy: text("generated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("content_ideas_project_idx").on(t.projectId),
    index("content_ideas_platform_idx").on(t.platform),
    index("content_ideas_created_idx").on(t.createdAt.desc()),
  ],
);

/**
 * One writable variation of an idea, plus how it did once posted.
 *
 * Metrics are explicit integer columns rather than a jsonb blob so the
 * tracker can sort and average in SQL — the whole point is to find out which
 * hook style earns attention, and that is an aggregate question.
 */
export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => contentIdeas.id, { onDelete: "cascade" }),
    /** 1–3 for text and video, always 1 for a Contra showcase. */
    variant: smallint("variant").notNull(),
    /** What makes this variation different, e.g. "contrarian" or "build log". */
    label: text("label"),
    /** The first line. On every one of these platforms it is most of the outcome. */
    hook: text("hook").notNull(),
    /** The full post, caption or showcase body — whatever you paste in. */
    body: text("body").notNull(),
    cta: text("cta"),
    hashtags: text("hashtags").array().notNull().default(sql`'{}'::text[]`),
    /** Length of what gets pasted, so a limit breach is visible without recounting. */
    charCount: smallint("char_count").notNull().default(0),
    status: postStatus("status").notNull().default("draft"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postUrl: text("post_url"),
    impressions: integer("impressions"),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    profileClicks: integer("profile_clicks"),
    metricsUpdatedAt: timestamp("metrics_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("social_posts_idea_variant_key").on(t.ideaId, t.variant),
    index("social_posts_status_idx").on(t.status),
    index("social_posts_posted_idx").on(t.postedAt.desc()),
    index("social_posts_scheduled_idx").on(t.scheduledFor),
  ],
);

export type BuildProject = typeof buildProjects.$inferSelect;
export type NewBuildProject = typeof buildProjects.$inferInsert;
export type BuildLog = typeof buildLogs.$inferSelect;
export type NewBuildLog = typeof buildLogs.$inferInsert;
export type ContentIdea = typeof contentIdeas.$inferSelect;
export type NewContentIdea = typeof contentIdeas.$inferInsert;
export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;
export type SocialPlatform = (typeof socialPlatform.enumValues)[number];
export type ContentFormat = (typeof contentFormat.enumValues)[number];
export type PostStatus = (typeof postStatus.enumValues)[number];
export type BuildStatus = (typeof buildStatus.enumValues)[number];

/* -------------------------------------------------------------------------- */
/* X (Twitter) lead sourcing                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pipeline state of an X author. The *author* is the lead, not the post: one
 * person tweeting about the same pain five times is one prospect, and at scale
 * collapsing on the author is what keeps the review queue workable.
 */
export const xLeadStatus = pgEnum("x_lead_status", [
  "new",        // seen, not yet above the relevance threshold
  "qualified",  // a post scored at or above the threshold
  "converted",  // turned into a company + contact in the CRM
  "dismissed",  // reviewed and rejected; never resurfaced
]);

/**
 * A saved X search, run on a schedule by the worker.
 *
 * `sinceId` is the newest post id already fetched, so every run after the first
 * asks X only for what is new — X bills per post read, and re-reading the same
 * week of results every hour would multiply the cost for zero new leads.
 *
 * `lockedUntil` is a lease rather than a flag: a worker that dies mid-run
 * simply lets it expire, and the next worker picks the search back up.
 */
export const xSearches = pgTable(
  "x_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** X search syntax, e.g. `("need help" OR "recommend") (zapier OR n8n) -is:retweet lang:en`. */
    query: text("query").notNull(),
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    enabled: boolean("enabled").notNull().default(true),
    /** Turn qualified authors into CRM leads without waiting for a review. */
    autoConvert: boolean("auto_convert").notNull().default(false),
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    /** Upper bound on posts read per run, so one noisy query cannot drain the monthly cap. */
    maxPostsPerRun: integer("max_posts_per_run").notNull().default(100),
    sinceId: text("since_id"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
    postsFound: integer("posts_found").notNull().default(0),
    leadsFound: integer("leads_found").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("x_searches_due_idx").on(t.enabled, t.nextRunAt)],
);

/** One X account that posted something a search matched. */
export const xAuthors = pgTable(
  "x_authors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** X's numeric user id — stable across handle changes, so it is the dedupe key. */
    xUserId: text("x_user_id").notNull(),
    username: text("username").notNull(),
    name: text("name"),
    bio: text("bio"),
    location: text("location"),
    /** The website on their profile, already expanded out of t.co. */
    website: text("website"),
    followers: integer("followers"),
    following: integer("following"),
    verified: boolean("verified"),
    accountCreatedAt: timestamp("account_created_at", { withTimezone: true }),
    bestScore: smallint("best_score"),
    bestIntent: text("best_intent"),
    bestTweetId: text("best_tweet_id"),
    matchedPosts: integer("matched_posts").notNull().default(0),
    status: xLeadStatus("status").notNull().default("new"),
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("x_authors_user_key").on(t.xUserId),
    index("x_authors_status_score_idx").on(t.status, t.bestScore.desc()),
    index("x_authors_username_idx").on(sql`lower(${t.username})`),
    index("x_authors_contact_idx").on(t.contactId),
    index("x_authors_last_seen_idx").on(t.lastSeenAt.desc()),
  ],
);

/**
 * Every post a search returned, kept whether or not it qualified — the reason
 * a post was rejected is as useful for tuning a query as the ones that passed.
 *
 * Classification is a queue: rows with `classifiedAt` null are claimed in
 * batches under a lease (`classifyLeaseUntil`) with SKIP LOCKED, so any number
 * of workers can drain it without scoring the same post twice.
 */
export const xPosts = pgTable(
  "x_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tweetId: text("tweet_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => xAuthors.id, { onDelete: "cascade" }),
    searchId: uuid("search_id").references(() => xSearches.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    lang: text("lang"),
    url: text("url").notNull(),
    isReply: boolean("is_reply").notNull().default(false),
    metrics: jsonb("metrics").$type<Record<string, number>>(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** 0–100 fit with the business, from the classifier. */
    relevance: smallint("relevance"),
    /** buyer | pain | hiring | peer | seller | noise */
    intent: text("intent"),
    reason: text("reason"),
    /** Niche the classifier matched the author to, when it matched one. */
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    /** "rules" when the prefilter rejected it before any model saw it. */
    classifiedBy: text("classified_by"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    classifyLeaseUntil: timestamp("classify_lease_until", { withTimezone: true }),
    classifyAttempts: smallint("classify_attempts").notNull().default(0),
    raw: jsonb("raw"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("x_posts_tweet_key").on(t.tweetId),
    index("x_posts_author_idx").on(t.authorId),
    index("x_posts_search_idx").on(t.searchId),
    index("x_posts_unclassified_idx").on(t.discoveredAt).where(sql`${t.classifiedAt} is null`),
    index("x_posts_relevance_idx").on(t.relevance.desc()),
    index("x_posts_discovered_idx").on(t.discoveredAt.desc()),
  ],
);

export type XSearch = typeof xSearches.$inferSelect;
export type NewXSearch = typeof xSearches.$inferInsert;
export type XAuthor = typeof xAuthors.$inferSelect;
export type XPost = typeof xPosts.$inferSelect;
export type XLeadStatus = (typeof xLeadStatus.enumValues)[number];
