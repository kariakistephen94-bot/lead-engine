CREATE TYPE "public"."application_status" AS ENUM('new', 'shortlisted', 'applied', 'interviewing', 'offer', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lead_bucket" AS ENUM('active_buyer', 'needs_you', 'spending_money', 'community', 'social_listening');--> statement-breakpoint
CREATE TABLE "company_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" smallint,
	"final_url" text,
	"error" text,
	"has_live_chat" boolean,
	"chat_vendor" text,
	"has_booking" boolean,
	"booking_vendor" text,
	"has_lead_form" boolean,
	"has_video" boolean,
	"ad_platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"has_analytics" boolean,
	"cms" text,
	"stack" text[] DEFAULT '{}'::text[] NOT NULL,
	"https" boolean,
	"mobile_friendly" boolean,
	"social" jsonb,
	"opportunity_score" smallint,
	"opportunities" text[] DEFAULT '{}'::text[] NOT NULL,
	"suggested_bucket" "lead_bucket",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"company_name" text,
	"company_id" uuid,
	"location" text,
	"remote" boolean DEFAULT false NOT NULL,
	"salary" text,
	"description" text,
	"contact_email" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"bucket" "lead_bucket" DEFAULT 'active_buyer' NOT NULL,
	"score" smallint,
	"posted_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"applied_at" timestamp with time zone,
	"notes" text,
	"owner_id" uuid,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"bucket" "lead_bucket" NOT NULL,
	"terms" text[] DEFAULT '{}'::text[] NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "company_signals" ADD CONSTRAINT "company_signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_signals_company_key" ON "company_signals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_signals_score_idx" ON "company_signals" USING btree ("opportunity_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "company_signals_bucket_idx" ON "company_signals" USING btree ("suggested_bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "job_postings_url_key" ON "job_postings" USING btree ("url");--> statement-breakpoint
CREATE INDEX "job_postings_source_idx" ON "job_postings" USING btree ("source");--> statement-breakpoint
CREATE INDEX "job_postings_status_idx" ON "job_postings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_postings_bucket_idx" ON "job_postings" USING btree ("bucket");--> statement-breakpoint
CREATE INDEX "job_postings_posted_idx" ON "job_postings" USING btree ("posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_postings_company_idx" ON "job_postings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "scrape_runs_started_idx" ON "scrape_runs" USING btree ("started_at" DESC NULLS LAST);