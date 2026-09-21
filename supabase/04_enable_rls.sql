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

-- `drizzle` is covered as well as `public`. That schema is not in Supabase's
-- exposed-schemas list by default, so PostgREST will not serve
-- drizzle.__drizzle_migrations today — but that is a dashboard setting rather
-- than a property of the database, and a security boundary that depends on a
-- toggle nobody has touched yet is not one worth keeping. Turning RLS on here
-- also clears the SQL Editor's warning, so the warning stays meaningful the
-- next time it appears.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle')
       AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                   r.schema_name, r.table_name);
  END LOOP;
END $$;

-- Anything still unprotected shows up here. Expect zero rows.
SELECT n.nspname AS schema, c.relname AS unprotected_table
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public', 'drizzle')
   AND c.relkind = 'r'
   AND NOT c.relrowsecurity;
