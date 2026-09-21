CREATE TYPE "public"."dm_platform" AS ENUM('instagram', 'facebook');--> statement-breakpoint
CREATE TYPE "public"."dm_status" AS ENUM('draft', 'first_sent', 'second_sent', 'replied', 'dismissed');--> statement-breakpoint
CREATE TABLE "dm_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"platform" "dm_platform" NOT NULL,
	"handle" text NOT NULL,
	"first_message" text NOT NULL,
	"second_message" text NOT NULL,
	"basis_used" text[] DEFAULT '{}'::text[] NOT NULL,
	"generated_by" text,
	"offer" text,
	"status" "dm_status" DEFAULT 'draft' NOT NULL,
	"first_sent_at" timestamp with time zone,
	"second_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dm_drafts" ADD CONSTRAINT "dm_drafts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_drafts" ADD CONSTRAINT "dm_drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dm_drafts_contact_platform_key" ON "dm_drafts" USING btree ("contact_id","platform");--> statement-breakpoint
CREATE INDEX "dm_drafts_status_idx" ON "dm_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dm_drafts_created_idx" ON "dm_drafts" USING btree ("created_at");