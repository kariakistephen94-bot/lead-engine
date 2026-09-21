CREATE TYPE "public"."email_status" AS ENUM('draft', 'queued', 'sending', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'complained', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('unsubscribed', 'bounced', 'complained', 'manual');--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"domain" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text NOT NULL,
	"reply_to" text,
	"api_key_env" text NOT NULL,
	"daily_cap" integer DEFAULT 75 NOT NULL,
	"warmup_enabled" boolean DEFAULT true NOT NULL,
	"warmup_start" integer DEFAULT 10 NOT NULL,
	"warmup_increment" integer DEFAULT 5 NOT NULL,
	"warmup_started_on" date,
	"min_seconds_between_sends" integer DEFAULT 45 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"company_id" uuid,
	"account_id" uuid,
	"campaign_id" uuid,
	"campaign_name" text,
	"to_email" text NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text,
	"personalisation_basis" text[] DEFAULT '{}'::text[] NOT NULL,
	"personalised_by" text,
	"status" "email_status" DEFAULT 'draft' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"note" text,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_accounts_from_key" ON "email_accounts" USING btree (lower("from_email"));--> statement-breakpoint
CREATE INDEX "email_accounts_active_idx" ON "email_accounts" USING btree ("active");--> statement-breakpoint
CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_messages_account_idx" ON "email_messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_messages_contact_idx" ON "email_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "email_messages_sent_idx" ON "email_messages" USING btree ("sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_unsub_key" ON "email_messages" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_provider_key" ON "email_messages" USING btree ("provider_message_id") WHERE "email_messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_contact_campaign_key" ON "email_messages" USING btree ("contact_id","campaign_id") WHERE "email_messages"."contact_id" is not null and "email_messages"."campaign_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_email_key" ON "email_suppressions" USING btree (lower("email"));