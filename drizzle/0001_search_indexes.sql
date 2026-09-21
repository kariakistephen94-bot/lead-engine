-- Global search support.
--
-- Search here is substring-oriented ("dent" should match "Dentistry"), so we
-- accelerate ILIKE with trigram GIN indexes rather than tsvector. pg_trgm ships
-- with core Postgres and is available on Supabase.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON companies USING gin (name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS companies_domain_trgm_idx ON companies USING gin (domain gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS companies_website_trgm_idx ON companies USING gin (website gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS companies_industry_trgm_idx ON companies USING gin (industry gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS companies_location_trgm_idx ON companies USING gin (location gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS contacts_full_name_trgm_idx ON contacts USING gin (full_name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS contacts_email_trgm_idx ON contacts USING gin (email gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS contacts_phone_trgm_idx ON contacts USING gin (phone gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS contacts_job_title_trgm_idx ON contacts USING gin (job_title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS contacts_linkedin_trgm_idx ON contacts USING gin (linkedin_url gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS notes_body_trgm_idx ON notes USING gin (body gin_trgm_ops);
--> statement-breakpoint

-- Keep `updated_at` honest without every service remembering to set it.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','niches','companies','contacts','notes','deals']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
