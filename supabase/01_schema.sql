--
-- AI Lead Engine — schema for Supabase.
-- Paste into the Supabase SQL Editor and run. Safe on an empty project.
--
-- Adjusted from a plain pg_dump so it works on Supabase specifically:
--   * psql-only \restrict directives removed (the editor is not psql),
--   * search_path includes `extensions`, and the trigram operator classes are
--     left unqualified — Supabase installs pg_trgm into `extensions`, so a
--     dump that says `public.gin_trgm_ops` fails on every trigram index.
--

--
-- PostgreSQL database dump
--


-- Dumped from database version 14.20 (Homebrew)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public, extensions', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm;


--
-- Name: activity_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_direction AS ENUM (
    'outbound',
    'inbound',
    'system'
);


--
-- Name: activity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_type AS ENUM (
    'lead_created',
    'research_completed',
    'email_sent',
    'email_opened',
    'email_replied',
    'call_made',
    'linkedin_message',
    'follow_up_logged',
    'status_changed',
    'note_added',
    'meeting_booked',
    'proposal_sent',
    'deal_created',
    'deal_won',
    'deal_lost',
    'imported',
    'enriched'
);


--
-- Name: application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.application_status AS ENUM (
    'new',
    'shortlisted',
    'applied',
    'interviewing',
    'offer',
    'rejected',
    'archived'
);


--
-- Name: deal_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deal_stage AS ENUM (
    'lead',
    'qualified',
    'meeting',
    'proposal',
    'negotiation',
    'won',
    'lost'
);


--
-- Name: dm_platform; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dm_platform AS ENUM (
    'instagram',
    'facebook'
);


--
-- Name: dm_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dm_status AS ENUM (
    'draft',
    'first_sent',
    'second_sent',
    'replied',
    'dismissed'
);


--
-- Name: email_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.email_status AS ENUM (
    'draft',
    'queued',
    'sending',
    'sent',
    'delivered',
    'opened',
    'replied',
    'bounced',
    'complained',
    'failed',
    'skipped'
);


--
-- Name: follow_up_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.follow_up_type AS ENUM (
    'email',
    'call',
    'linkedin',
    'meeting',
    'task'
);


--
-- Name: import_row_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.import_row_status AS ENUM (
    'imported',
    'duplicate',
    'invalid',
    'merged'
);


--
-- Name: import_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.import_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.job_status AS ENUM (
    'queued',
    'running',
    'completed',
    'failed'
);


--
-- Name: lead_bucket; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_bucket AS ENUM (
    'active_buyer',
    'needs_you',
    'spending_money',
    'community',
    'social_listening'
);


--
-- Name: lead_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_status AS ENUM (
    'new',
    'researched',
    'qualified',
    'ready_to_contact',
    'contacted',
    'follow_up',
    'replied',
    'positive_reply',
    'meeting_booked',
    'proposal_sent',
    'negotiation',
    'won',
    'lost',
    'not_interested',
    'do_not_contact'
);


--
-- Name: priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority AS ENUM (
    'low',
    'normal',
    'high'
);


--
-- Name: suppression_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.suppression_reason AS ENUM (
    'unsubscribed',
    'bounced',
    'complained',
    'manual'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'member'
);


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    company_id uuid,
    type public.activity_type NOT NULL,
    direction public.activity_direction DEFAULT 'system'::public.activity_direction NOT NULL,
    subject text,
    body text,
    metadata jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_research; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_research (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    contact_id uuid,
    summary text NOT NULL,
    what_they_do text,
    pain_points jsonb,
    automation_opportunities jsonb,
    recommended_offer text,
    personalization jsonb,
    score smallint,
    score_reason text,
    confidence numeric(4,3),
    provider text NOT NULL,
    model text,
    sources_used jsonb,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    website text,
    domain text,
    industry text,
    niche_id uuid,
    location text,
    country text,
    city text,
    employee_count integer,
    revenue numeric(14,2),
    description text,
    linkedin_url text,
    phone text,
    email text,
    source_id uuid,
    source_url text,
    sourced_at timestamp with time zone,
    research_method text,
    import_id uuid,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    http_status smallint,
    final_url text,
    error text,
    has_live_chat boolean,
    chat_vendor text,
    has_booking boolean,
    booking_vendor text,
    has_lead_form boolean,
    has_video boolean,
    ad_platforms text[] DEFAULT '{}'::text[] NOT NULL,
    has_analytics boolean,
    cms text,
    stack text[] DEFAULT '{}'::text[] NOT NULL,
    https boolean,
    mobile_friendly boolean,
    social jsonb,
    opportunity_score smallint,
    opportunities text[] DEFAULT '{}'::text[] NOT NULL,
    suggested_bucket public.lead_bucket,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_tags (
    contact_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    first_name text,
    last_name text,
    full_name text GENERATED ALWAYS AS (btrim(((COALESCE(first_name, ''::text) || ' '::text) || COALESCE(last_name, ''::text)))) STORED,
    job_title text,
    email text,
    phone text,
    linkedin_url text,
    status public.lead_status DEFAULT 'new'::public.lead_status NOT NULL,
    lead_score smallint,
    source_id uuid,
    source_url text,
    sourced_at timestamp with time zone,
    import_id uuid,
    owner_id uuid,
    last_contacted_at timestamp with time zone,
    next_follow_up_at timestamp with time zone,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    company_id uuid,
    contact_id uuid,
    value numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    stage public.deal_stage DEFAULT 'lead'::public.deal_stage NOT NULL,
    probability smallint DEFAULT 10 NOT NULL,
    expected_close_date date,
    source_id uuid,
    niche_id uuid,
    notes text,
    owner_id uuid,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dm_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    company_id uuid NOT NULL,
    platform public.dm_platform NOT NULL,
    handle text NOT NULL,
    first_message text NOT NULL,
    second_message text NOT NULL,
    basis_used text[] DEFAULT '{}'::text[] NOT NULL,
    generated_by text,
    offer text,
    status public.dm_status DEFAULT 'draft'::public.dm_status NOT NULL,
    first_sent_at timestamp with time zone,
    second_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    provider text DEFAULT 'resend'::text NOT NULL,
    domain text NOT NULL,
    from_email text NOT NULL,
    from_name text NOT NULL,
    reply_to text,
    api_key_env text NOT NULL,
    daily_cap integer DEFAULT 75 NOT NULL,
    warmup_enabled boolean DEFAULT true NOT NULL,
    warmup_start integer DEFAULT 10 NOT NULL,
    warmup_increment integer DEFAULT 5 NOT NULL,
    warmup_started_on date,
    min_seconds_between_sends integer DEFAULT 45 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    company_id uuid,
    account_id uuid,
    campaign_id uuid,
    campaign_name text,
    to_email text NOT NULL,
    to_name text,
    subject text NOT NULL,
    body_text text NOT NULL,
    body_html text,
    personalisation_basis text[] DEFAULT '{}'::text[] NOT NULL,
    personalised_by text,
    status public.email_status DEFAULT 'draft'::public.email_status NOT NULL,
    provider_message_id text,
    error text,
    attempts smallint DEFAULT 0 NOT NULL,
    unsubscribe_token text NOT NULL,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason public.suppression_reason NOT NULL,
    note text,
    message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    due_at timestamp with time zone NOT NULL,
    type public.follow_up_type DEFAULT 'email'::public.follow_up_type NOT NULL,
    priority public.priority DEFAULT 'normal'::public.priority NOT NULL,
    notes text,
    completed_at timestamp with time zone,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: import_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    row_number integer NOT NULL,
    raw jsonb NOT NULL,
    status public.import_row_status NOT NULL,
    error text,
    contact_id uuid,
    company_id uuid
);


--
-- Name: imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    duplicate_count integer DEFAULT 0 NOT NULL,
    invalid_count integer DEFAULT 0 NOT NULL,
    status public.import_status DEFAULT 'pending'::public.import_status NOT NULL,
    mapping jsonb,
    niche_id uuid,
    source_id uuid,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: job_postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_postings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    source_id text,
    url text NOT NULL,
    title text NOT NULL,
    company_name text,
    company_id uuid,
    location text,
    remote boolean DEFAULT false NOT NULL,
    salary text,
    description text,
    contact_email text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    bucket public.lead_bucket DEFAULT 'active_buyer'::public.lead_bucket NOT NULL,
    score smallint,
    posted_at timestamp with time zone,
    discovered_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.application_status DEFAULT 'new'::public.application_status NOT NULL,
    applied_at timestamp with time zone,
    notes text,
    owner_id uuid,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: niches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.niches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    target_market text,
    target_locations text[],
    ideal_company_size text,
    target_job_titles text[],
    pain_points text,
    offer text,
    notes text,
    color text DEFAULT '#2563eb'::text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    company_id uuid,
    body text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outreach_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    activity_id uuid,
    provider text NOT NULL,
    external_id text,
    event_type text NOT NULL,
    payload jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: research_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    company_id uuid NOT NULL,
    kind text DEFAULT 'research'::text NOT NULL,
    status public.job_status DEFAULT 'queued'::public.job_status NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    error text,
    requested_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone
);


--
-- Name: scrape_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scrape_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    bucket public.lead_bucket NOT NULL,
    terms text[] DEFAULT '{}'::text[] NOT NULL,
    found integer DEFAULT 0 NOT NULL,
    inserted integer DEFAULT 0 NOT NULL,
    updated integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    color text DEFAULT '#64748b'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    name text NOT NULL,
    role public.user_role DEFAULT 'member'::public.user_role NOT NULL,
    daily_target integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_user_id uuid
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: ai_research ai_research_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_research
    ADD CONSTRAINT ai_research_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_signals company_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_signals
    ADD CONSTRAINT company_signals_pkey PRIMARY KEY (id);


--
-- Name: contact_tags contact_tags_contact_id_tag_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_tag_id_pk PRIMARY KEY (contact_id, tag_id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: dm_drafts dm_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_drafts
    ADD CONSTRAINT dm_drafts_pkey PRIMARY KEY (id);


--
-- Name: email_accounts email_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_accounts
    ADD CONSTRAINT email_accounts_pkey PRIMARY KEY (id);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);


--
-- Name: email_suppressions email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: import_rows import_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_pkey PRIMARY KEY (id);


--
-- Name: imports imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);


--
-- Name: job_postings job_postings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_postings
    ADD CONSTRAINT job_postings_pkey PRIMARY KEY (id);


--
-- Name: lead_sources lead_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_sources
    ADD CONSTRAINT lead_sources_pkey PRIMARY KEY (id);


--
-- Name: niches niches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niches
    ADD CONSTRAINT niches_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: outreach_events outreach_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_events
    ADD CONSTRAINT outreach_events_pkey PRIMARY KEY (id);


--
-- Name: research_jobs research_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_jobs
    ADD CONSTRAINT research_jobs_pkey PRIMARY KEY (id);


--
-- Name: scrape_runs scrape_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrape_runs
    ADD CONSTRAINT scrape_runs_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: activities_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_company_idx ON public.activities USING btree (company_id);


--
-- Name: activities_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_contact_idx ON public.activities USING btree (contact_id, occurred_at);


--
-- Name: activities_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_occurred_idx ON public.activities USING btree (occurred_at);


--
-- Name: activities_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_type_idx ON public.activities USING btree (type);


--
-- Name: ai_research_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_research_company_idx ON public.ai_research USING btree (company_id, created_at);


--
-- Name: ai_research_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_research_contact_idx ON public.ai_research USING btree (contact_id);


--
-- Name: companies_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_country_idx ON public.companies USING btree (country);


--
-- Name: companies_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_created_idx ON public.companies USING btree (created_at);


--
-- Name: companies_domain_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX companies_domain_key ON public.companies USING btree (domain) WHERE (domain IS NOT NULL);


--
-- Name: companies_domain_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_domain_trgm_idx ON public.companies USING gin (domain gin_trgm_ops);


--
-- Name: companies_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_employee_idx ON public.companies USING btree (employee_count);


--
-- Name: companies_industry_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_industry_trgm_idx ON public.companies USING gin (industry gin_trgm_ops);


--
-- Name: companies_location_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_location_trgm_idx ON public.companies USING gin (location gin_trgm_ops);


--
-- Name: companies_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_name_lower_idx ON public.companies USING btree (lower(name));


--
-- Name: companies_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_name_trgm_idx ON public.companies USING gin (name gin_trgm_ops);


--
-- Name: companies_niche_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_niche_idx ON public.companies USING btree (niche_id);


--
-- Name: companies_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_source_idx ON public.companies USING btree (source_id);


--
-- Name: companies_website_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_website_trgm_idx ON public.companies USING gin (website gin_trgm_ops);


--
-- Name: company_signals_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_signals_bucket_idx ON public.company_signals USING btree (suggested_bucket);


--
-- Name: company_signals_company_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX company_signals_company_key ON public.company_signals USING btree (company_id);


--
-- Name: company_signals_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_signals_score_idx ON public.company_signals USING btree (opportunity_score DESC NULLS LAST);


--
-- Name: contact_tags_tag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_tags_tag_idx ON public.contact_tags USING btree (tag_id);


--
-- Name: contacts_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_archived_idx ON public.contacts USING btree (archived);


--
-- Name: contacts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_company_idx ON public.contacts USING btree (company_id);


--
-- Name: contacts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_created_idx ON public.contacts USING btree (created_at);


--
-- Name: contacts_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_email_key ON public.contacts USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: contacts_email_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_email_trgm_idx ON public.contacts USING gin (email gin_trgm_ops);


--
-- Name: contacts_full_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_full_name_trgm_idx ON public.contacts USING gin (full_name gin_trgm_ops);


--
-- Name: contacts_job_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_job_title_trgm_idx ON public.contacts USING gin (job_title gin_trgm_ops);


--
-- Name: contacts_last_contacted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_last_contacted_idx ON public.contacts USING btree (last_contacted_at);


--
-- Name: contacts_linkedin_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_linkedin_key ON public.contacts USING btree (linkedin_url) WHERE (linkedin_url IS NOT NULL);


--
-- Name: contacts_linkedin_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_linkedin_trgm_idx ON public.contacts USING gin (linkedin_url gin_trgm_ops);


--
-- Name: contacts_next_follow_up_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_next_follow_up_idx ON public.contacts USING btree (next_follow_up_at);


--
-- Name: contacts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_owner_idx ON public.contacts USING btree (owner_id);


--
-- Name: contacts_phone_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_phone_trgm_idx ON public.contacts USING gin (phone gin_trgm_ops);


--
-- Name: contacts_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_score_idx ON public.contacts USING btree (lead_score);


--
-- Name: contacts_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_source_idx ON public.contacts USING btree (source_id);


--
-- Name: contacts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_status_idx ON public.contacts USING btree (status);


--
-- Name: deals_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_company_idx ON public.deals USING btree (company_id);


--
-- Name: deals_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_created_idx ON public.deals USING btree (created_at);


--
-- Name: deals_niche_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_niche_idx ON public.deals USING btree (niche_id);


--
-- Name: deals_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_stage_idx ON public.deals USING btree (stage);


--
-- Name: dm_drafts_contact_platform_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dm_drafts_contact_platform_key ON public.dm_drafts USING btree (contact_id, platform);


--
-- Name: dm_drafts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dm_drafts_created_idx ON public.dm_drafts USING btree (created_at);


--
-- Name: dm_drafts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dm_drafts_status_idx ON public.dm_drafts USING btree (status);


--
-- Name: email_accounts_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_accounts_active_idx ON public.email_accounts USING btree (active);


--
-- Name: email_accounts_from_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_accounts_from_key ON public.email_accounts USING btree (lower(from_email));


--
-- Name: email_messages_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_messages_account_idx ON public.email_messages USING btree (account_id);


--
-- Name: email_messages_contact_campaign_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_messages_contact_campaign_key ON public.email_messages USING btree (contact_id, campaign_id) WHERE ((contact_id IS NOT NULL) AND (campaign_id IS NOT NULL));


--
-- Name: email_messages_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_messages_contact_idx ON public.email_messages USING btree (contact_id);


--
-- Name: email_messages_provider_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_messages_provider_key ON public.email_messages USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: email_messages_sent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_messages_sent_idx ON public.email_messages USING btree (sent_at DESC NULLS LAST);


--
-- Name: email_messages_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_messages_status_idx ON public.email_messages USING btree (status);


--
-- Name: email_messages_unsub_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_messages_unsub_key ON public.email_messages USING btree (unsubscribe_token);


--
-- Name: email_suppressions_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_suppressions_email_key ON public.email_suppressions USING btree (lower(email));


--
-- Name: follow_ups_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_contact_idx ON public.follow_ups USING btree (contact_id);


--
-- Name: follow_ups_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_due_idx ON public.follow_ups USING btree (due_at);


--
-- Name: follow_ups_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_open_idx ON public.follow_ups USING btree (completed_at, due_at);


--
-- Name: import_rows_import_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_rows_import_idx ON public.import_rows USING btree (import_id, status);


--
-- Name: imports_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX imports_created_idx ON public.imports USING btree (created_at);


--
-- Name: job_postings_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_postings_bucket_idx ON public.job_postings USING btree (bucket);


--
-- Name: job_postings_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_postings_company_idx ON public.job_postings USING btree (company_id);


--
-- Name: job_postings_posted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_postings_posted_idx ON public.job_postings USING btree (posted_at DESC NULLS LAST);


--
-- Name: job_postings_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_postings_source_idx ON public.job_postings USING btree (source);


--
-- Name: job_postings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_postings_status_idx ON public.job_postings USING btree (status);


--
-- Name: job_postings_url_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX job_postings_url_key ON public.job_postings USING btree (url);


--
-- Name: lead_sources_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_sources_slug_key ON public.lead_sources USING btree (slug);


--
-- Name: niches_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX niches_archived_idx ON public.niches USING btree (archived);


--
-- Name: niches_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX niches_slug_key ON public.niches USING btree (slug);


--
-- Name: notes_body_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notes_body_trgm_idx ON public.notes USING gin (body gin_trgm_ops);


--
-- Name: notes_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notes_contact_idx ON public.notes USING btree (contact_id, created_at);


--
-- Name: outreach_events_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_events_contact_idx ON public.outreach_events USING btree (contact_id);


--
-- Name: outreach_events_external_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outreach_events_external_key ON public.outreach_events USING btree (provider, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: research_jobs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX research_jobs_company_idx ON public.research_jobs USING btree (company_id);


--
-- Name: research_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX research_jobs_status_idx ON public.research_jobs USING btree (status, created_at);


--
-- Name: scrape_runs_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scrape_runs_started_idx ON public.scrape_runs USING btree (started_at DESC NULLS LAST);


--
-- Name: tags_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_slug_key ON public.tags USING btree (slug);


--
-- Name: users_auth_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_auth_user_id_key ON public.users USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (lower(email));


--
-- Name: companies companies_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contacts contacts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deals deals_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER deals_set_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: niches niches_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER niches_set_updated_at BEFORE UPDATE ON public.niches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notes notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activities activities_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: activities activities_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: activities activities_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_research ai_research_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_research
    ADD CONSTRAINT ai_research_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ai_research ai_research_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_research
    ADD CONSTRAINT ai_research_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: companies companies_niche_id_niches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_niche_id_niches_id_fk FOREIGN KEY (niche_id) REFERENCES public.niches(id) ON DELETE SET NULL;


--
-- Name: companies companies_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: companies companies_source_id_lead_sources_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_source_id_lead_sources_id_fk FOREIGN KEY (source_id) REFERENCES public.lead_sources(id) ON DELETE SET NULL;


--
-- Name: company_signals company_signals_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_signals
    ADD CONSTRAINT company_signals_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_tag_id_tags_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_tag_id_tags_id_fk FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_source_id_lead_sources_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_source_id_lead_sources_id_fk FOREIGN KEY (source_id) REFERENCES public.lead_sources(id) ON DELETE SET NULL;


--
-- Name: deals deals_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: deals deals_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: deals deals_niche_id_niches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_niche_id_niches_id_fk FOREIGN KEY (niche_id) REFERENCES public.niches(id) ON DELETE SET NULL;


--
-- Name: deals deals_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: deals deals_source_id_lead_sources_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_source_id_lead_sources_id_fk FOREIGN KEY (source_id) REFERENCES public.lead_sources(id) ON DELETE SET NULL;


--
-- Name: dm_drafts dm_drafts_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_drafts
    ADD CONSTRAINT dm_drafts_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: dm_drafts dm_drafts_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_drafts
    ADD CONSTRAINT dm_drafts_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_account_id_email_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_account_id_email_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.email_accounts(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: email_messages email_messages_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: email_suppressions email_suppressions_message_id_email_messages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_message_id_email_messages_id_fk FOREIGN KEY (message_id) REFERENCES public.email_messages(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: import_rows import_rows_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: import_rows import_rows_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: import_rows import_rows_import_id_imports_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_import_id_imports_id_fk FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE CASCADE;


--
-- Name: imports imports_niche_id_niches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_niche_id_niches_id_fk FOREIGN KEY (niche_id) REFERENCES public.niches(id) ON DELETE SET NULL;


--
-- Name: imports imports_source_id_lead_sources_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_source_id_lead_sources_id_fk FOREIGN KEY (source_id) REFERENCES public.lead_sources(id) ON DELETE SET NULL;


--
-- Name: imports imports_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: job_postings job_postings_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_postings
    ADD CONSTRAINT job_postings_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: job_postings job_postings_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_postings
    ADD CONSTRAINT job_postings_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notes notes_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notes notes_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: notes notes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: outreach_events outreach_events_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_events
    ADD CONSTRAINT outreach_events_activity_id_activities_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE SET NULL;


--
-- Name: outreach_events outreach_events_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_events
    ADD CONSTRAINT outreach_events_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: research_jobs research_jobs_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_jobs
    ADD CONSTRAINT research_jobs_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: research_jobs research_jobs_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_jobs
    ADD CONSTRAINT research_jobs_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: research_jobs research_jobs_requested_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_jobs
    ADD CONSTRAINT research_jobs_requested_by_users_id_fk FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_research; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_research ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: dm_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dm_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: email_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: import_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

--
-- Name: job_postings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: niches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.niches ENABLE ROW LEVEL SECURITY;

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_events ENABLE ROW LEVEL SECURITY;

--
-- Name: research_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: scrape_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



--
-- Post-restore fixes (added by hand, not by pg_dump)
--

-- 1. Silence the "table without RLS" warning on Drizzle's bookkeeping table.
--
-- The practical exposure here is nil: this table lives in the `drizzle` schema,
-- and PostgREST only publishes the schemas listed in the project's exposed
-- schemas (by default `public`), so the anon key has no route to it. It also
-- holds nothing but migration hashes. Enabling RLS costs nothing though, and a
-- warning that is always present is a warning nobody reads.
ALTER TABLE drizzle.__drizzle_migrations ENABLE ROW LEVEL SECURITY;

-- 2. Record the migrations this schema already contains.
--
-- This dump *is* the result of migrations 0000-0006, but a schema-only dump
-- copies the bookkeeping table empty. Left that way, the next
-- `npm run db:migrate` would believe nothing had been applied and try to
-- re-run 0000_init against tables that already exist, which fails outright.
-- Seeding the hashes makes the first run against Supabase a no-op, which is
-- the truth.
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES
  (1, '3be3dbf91e7edff11b7e6241f14b00f61f8f7ad9ca2918f5f1989c401ca60f4b', 1787223256958),
  (2, 'd31338c7c71ff2d7be308bd5ee2375f430e70a112cf1ea35bedc306a241c2be6', 1787223277919),
  (3, '938514de9700e986727cb99f7c7ddb7eefec538383b062b04bb227f6c8ab17d1', 1787237125975),
  (4, '4088e10d6f473a88e56135b78fb483f04d86c5e89321645be991098175cb7845', 1787264485694),
  (5, '20a1ae09d3ccec3e6e36f661fb2a36e3a12b781e35ce492bd431046333ecd88d', 1787775067372),
  (6, '403728dd757abe8baeeff034022bd0d2cba405c5424a678554e099c70b2a2136', 1787861467372),
  (7, 'e447bf50d7b0732226f2a6bf21492766217f350dd6820d36f68f2036a1dec480', 1787865067372)
ON CONFLICT (id) DO NOTHING;

-- Keep the sequence ahead of the rows just inserted, so a future migration
-- does not collide on the primary key.
SELECT setval('drizzle.__drizzle_migrations_id_seq',
              (SELECT COALESCE(max(id), 1) FROM drizzle.__drizzle_migrations));
