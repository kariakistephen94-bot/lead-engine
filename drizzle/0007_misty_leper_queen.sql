-- Build tracker + content engine, and the outreach expansion to X and LinkedIn.
--
-- The `users` statements drizzle-kit emitted here were removed by hand: they
-- were already applied by 0005_supabase_auth.sql, whose partial unique index on
-- auth_user_id is the definition that should stand. The snapshot is correct;
-- only the generated SQL was redundant.

CREATE TYPE "public"."build_status" AS ENUM('planned', 'active', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."content_format" AS ENUM('text_post', 'video_hook', 'showcase');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'approved', 'scheduled', 'posted', 'archived');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('twitter', 'linkedin', 'contra', 'tiktok', 'youtube', 'instagram');--> statement-breakpoint
ALTER TYPE "public"."dm_platform" ADD VALUE IF NOT EXISTS 'twitter';--> statement-breakpoint
ALTER TYPE "public"."dm_platform" ADD VALUE IF NOT EXISTS 'linkedin';--> statement-breakpoint
ALTER TYPE "public"."dm_status" ADD VALUE IF NOT EXISTS 'connect_sent' BEFORE 'first_sent';--> statement-breakpoint
CREATE TABLE "build_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"logged_on" date NOT NULL,
	"built" text NOT NULL,
	"blockers" text,
	"learned" text,
	"hours" numeric(4, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" smallint NOT NULL,
	"week" smallint NOT NULL,
	"week_theme" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"stack" text[] DEFAULT '{}'::text[] NOT NULL,
	"learning_goals" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "build_status" DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"repo_url" text,
	"demo_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"platform" "social_platform" NOT NULL,
	"format" "content_format" NOT NULL,
	"angle" text NOT NULL,
	"premise" text,
	"basis_used" text[] DEFAULT '{}'::text[] NOT NULL,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"variant" smallint NOT NULL,
	"label" text,
	"hook" text NOT NULL,
	"body" text NOT NULL,
	"cta" text,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"char_count" smallint DEFAULT 0 NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"post_url" text,
	"impressions" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"profile_clicks" integer,
	"metrics_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dm_drafts" ADD COLUMN "connection_note" text;--> statement-breakpoint
ALTER TABLE "build_logs" ADD CONSTRAINT "build_logs_project_id_build_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."build_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_project_id_build_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."build_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_idea_id_content_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."content_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_logs_project_idx" ON "build_logs" USING btree ("project_id","logged_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "build_logs_date_idx" ON "build_logs" USING btree ("logged_on" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "build_projects_number_key" ON "build_projects" USING btree ("number");--> statement-breakpoint
CREATE INDEX "build_projects_status_idx" ON "build_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "build_projects_week_idx" ON "build_projects" USING btree ("week");--> statement-breakpoint
CREATE INDEX "content_ideas_project_idx" ON "content_ideas" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "content_ideas_platform_idx" ON "content_ideas" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "content_ideas_created_idx" ON "content_ideas" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "social_posts_idea_variant_key" ON "social_posts" USING btree ("idea_id","variant");--> statement-breakpoint
CREATE INDEX "social_posts_status_idx" ON "social_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "social_posts_posted_idx" ON "social_posts" USING btree ("posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "social_posts_scheduled_idx" ON "social_posts" USING btree ("scheduled_for");
--> statement-breakpoint
-- Hand-written, as in 0006: that migration enabled RLS by looping over the
-- tables that existed *at the time*, so the four created above are still open
-- to Supabase's PostgREST endpoint under the public anon key. Same reasoning
-- applies — build logs and unposted drafts are not public documents — and the
-- same escape hatch: the app connects as the table owner, which bypasses RLS.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['build_projects', 'build_logs', 'content_ideas', 'social_posts'])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
