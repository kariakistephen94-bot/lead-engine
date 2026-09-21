# Supabase setup

Run these in the Supabase **SQL Editor**, in numerical order. Every file has
been applied to an empty Postgres and verified to reproduce the local database
exactly — 5,120 leads, 4,727 signal rows, all 43 foreign keys and 103 indexes.

| # | File | What it does |
| --- | --- | --- |
| 1 | `01_schema.sql` | 24 tables, enums, indexes, triggers. ~53 KB. |
| 2 | `02_data_01…12.sql` | The data, in 12 parts. **Run in order.** |
| 3 | `03_auth_user.sql` | Creates the Supabase Auth login and links it to the app account. |
| 4 | `04_enable_rls.sql` | Enables RLS on every table. Do not skip — see below. |

Order matters. `03_auth_user.sql` adopts the `users` row that the data files
create; running it first would insert a second row with the same address and
the data file would then fail on the unique email index.

Each `02_data_*.sql` is wrapped in a transaction, so a file that errors applies
nothing and can be re-run on its own.

## Faster alternative

Twelve pastes is tedious. With `psql` installed the same thing is one command —
set `SUPABASE_DATABASE_URL` in `.env.local` first (Supabase → Connect → Session
pooler → URI):

```bash
psql "$SUPABASE_DATABASE_URL" -f supabase/01_schema.sql && for f in supabase/02_data_*.sql supabase/03_auth_user.sql supabase/04_enable_rls.sql; do psql "$SUPABASE_DATABASE_URL" -f "$f"; done
```

Or skip the SQL files entirely and use the transfer script, which also carries
the audit trail (`activities`, `import_rows`, `job_postings`) that the SQL files
leave out to stay a manageable size:

```bash
DATABASE_URL=$SUPABASE_DATABASE_URL npm run db:migrate
npm run db:transfer -- --dry-run
npm run db:transfer
npm run auth:provision
```

## After loading

Set these in `.env.local` (Supabase → Project Settings → API), then restart:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
DATABASE_URL=<Session pooler URI>
```

The app uses its own cookie session until the two `NEXT_PUBLIC_` values are
present, and switches to Supabase Auth the moment they are — so sign-in keeps
working throughout.

## Why RLS is not optional

Supabase publishes every table in `public` over PostgREST at
`https://<project>.supabase.co/rest/v1/<table>`, authorised by the anon key —
a key that ships inside the browser bundle and is meant to be public. Without
RLS, that endpoint hands the entire lead database to anyone who opens devtools.

`04_enable_rls.sql` turns RLS on with no policies, which denies that endpoint
outright. The app is unaffected: it connects to Postgres directly as the table
owner, and an owner bypasses RLS. Adding a policy is what opens a table up, so
add them deliberately.

## What the SQL files leave out

To keep the paste sizes workable, the `02_data_*` files carry the tables the
product needs — `users`, `niches`, `lead_sources`, `tags`, `imports`,
`companies`, `contacts`, `company_signals` — and omit `activities` (4,051 rows),
`import_rows` (5,233) and `job_postings` (524), which are history rather than
working data and together account for most of the dump's size. Nothing in the
included set has a foreign key into the omitted ones. Use `npm run db:transfer`
if you want everything.
