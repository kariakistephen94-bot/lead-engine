CREATE TYPE "public"."x_lead_status" AS ENUM('new', 'qualified', 'converted', 'dismissed');--> statement-breakpoint
CREATE TABLE "x_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"x_user_id" text NOT NULL,
	"username" text NOT NULL,
	"name" text,
	"bio" text,
	"location" text,
	"website" text,
	"followers" integer,
	"following" integer,
	"verified" boolean,
	"account_created_at" timestamp with time zone,
	"best_score" smallint,
	"best_intent" text,
	"best_tweet_id" text,
	"matched_posts" integer DEFAULT 0 NOT NULL,
	"status" "x_lead_status" DEFAULT 'new' NOT NULL,
	"niche_id" uuid,
	"contact_id" uuid,
	"company_id" uuid,
	"converted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tweet_id" text NOT NULL,
	"author_id" uuid NOT NULL,
	"search_id" uuid,
	"text" text NOT NULL,
	"lang" text,
	"url" text NOT NULL,
	"is_reply" boolean DEFAULT false NOT NULL,
	"metrics" jsonb,
	"posted_at" timestamp with time zone,
	"relevance" smallint,
	"intent" text,
	"reason" text,
	"niche_id" uuid,
	"classified_by" text,
	"classified_at" timestamp with time zone,
	"classify_lease_until" timestamp with time zone,
	"classify_attempts" smallint DEFAULT 0 NOT NULL,
	"raw" jsonb,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"niche_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_convert" boolean DEFAULT false NOT NULL,
	"interval_minutes" integer DEFAULT 60 NOT NULL,
	"max_posts_per_run" integer DEFAULT 100 NOT NULL,
	"since_id" text,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"posts_found" integer DEFAULT 0 NOT NULL,
	"leads_found" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dm_drafts" ALTER COLUMN "platform" SET DATA TYPE text;--> statement-breakpoint
-- Facebook is no longer a DM channel. Any Facebook script would fail the cast
-- back to the enum below, so it is removed first.
DELETE FROM "dm_drafts" WHERE "platform" = 'facebook';--> statement-breakpoint
DROP TYPE "public"."dm_platform";--> statement-breakpoint
CREATE TYPE "public"."dm_platform" AS ENUM('instagram', 'twitter', 'linkedin');--> statement-breakpoint
ALTER TABLE "dm_drafts" ALTER COLUMN "platform" SET DATA TYPE "public"."dm_platform" USING "platform"::"public"."dm_platform";--> statement-breakpoint
ALTER TABLE "x_authors" ADD CONSTRAINT "x_authors_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_authors" ADD CONSTRAINT "x_authors_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_authors" ADD CONSTRAINT "x_authors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_posts" ADD CONSTRAINT "x_posts_author_id_x_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."x_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_posts" ADD CONSTRAINT "x_posts_search_id_x_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."x_searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_posts" ADD CONSTRAINT "x_posts_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_searches" ADD CONSTRAINT "x_searches_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "x_authors_user_key" ON "x_authors" USING btree ("x_user_id");--> statement-breakpoint
CREATE INDEX "x_authors_status_score_idx" ON "x_authors" USING btree ("status","best_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "x_authors_username_idx" ON "x_authors" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "x_authors_contact_idx" ON "x_authors" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "x_authors_last_seen_idx" ON "x_authors" USING btree ("last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "x_posts_tweet_key" ON "x_posts" USING btree ("tweet_id");--> statement-breakpoint
CREATE INDEX "x_posts_author_idx" ON "x_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "x_posts_search_idx" ON "x_posts" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX "x_posts_unclassified_idx" ON "x_posts" USING btree ("discovered_at") WHERE "x_posts"."classified_at" is null;--> statement-breakpoint
CREATE INDEX "x_posts_relevance_idx" ON "x_posts" USING btree ("relevance" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "x_posts_discovered_idx" ON "x_posts" USING btree ("discovered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "x_searches_due_idx" ON "x_searches" USING btree ("enabled","next_run_at");--> statement-breakpoint
-- Facebook handles captured by earlier website scans. The scanner no longer
-- collects them; strip the old ones so no screen offers them as a channel.
UPDATE "company_signals" SET "social" = "social" - 'facebook' WHERE "social" ? 'facebook';--> statement-breakpoint
-- X replaces Facebook as a system lead source. The Facebook source is removed
-- only if nothing is attributed to it, so no record loses its origin.
INSERT INTO "lead_sources" ("name", "slug", "description", "is_system")
VALUES ('X (Twitter)', 'x', 'Found by the X search engine via the official X API.', true)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
DELETE FROM "lead_sources" s
 WHERE s."slug" = 'facebook'
   AND NOT EXISTS (SELECT 1 FROM "companies" WHERE "source_id" = s."id")
   AND NOT EXISTS (SELECT 1 FROM "contacts" WHERE "source_id" = s."id")
   AND NOT EXISTS (SELECT 1 FROM "imports" WHERE "source_id" = s."id");--> statement-breakpoint
-- Same lock as 0006: no Supabase REST access to the new tables.
ALTER TABLE "x_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "x_authors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "x_posts" ENABLE ROW LEVEL SECURITY;
