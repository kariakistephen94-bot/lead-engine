-- Lock every table against Supabase's public REST API.
--
-- Supabase serves `public` over PostgREST at
-- https://<project>.supabase.co/rest/v1/<table>, authorised by the anon key —
-- a key that ships inside the browser bundle and is meant to be public. With
-- RLS off, that endpoint will hand the entire lead database to anyone who
-- opens devtools. Enabling RLS with no policy denies it outright.
--
-- The application is unaffected: it reaches Postgres directly as the table
-- owner, and an owner bypasses RLS. (Deliberately not FORCE ROW LEVEL
-- SECURITY, which would also apply to the owner and lock the app out of its
-- own data.)
--
-- Adding a policy later is what opens a table up. Until then, the only way in
-- is the server, which is already behind requireUser()/requireApiUser().

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname <> '__drizzle_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
