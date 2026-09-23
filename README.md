# AI Lead Engine

An internal lead database, prospecting engine and sales pipeline. Next.js 16 (App
Router) + Postgres via Drizzle, with pluggable AI and lead-data providers that
run against offline mock adapters until you supply real API keys.

## Getting started

You need Node 20+ and a Postgres you can reach.

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

At minimum set `DATABASE_URL` and an `AUTH_SECRET`:

```bash
openssl rand -base64 48
```

Create the schema and a seeded owner account:

```bash
npm run db:migrate && npm run db:seed
```

Then start the dev server:

```bash
npm run dev
```

Open http://localhost:3000 and sign in with the `SEED_USER_EMAIL` /
`SEED_USER_PASSWORD` from your `.env.local`.

### Demo data

`npm run db:seed` on its own creates only what the app needs to work: the owner
account, 10 lead sources, 10 tags and the 5 starting niches. It adds no leads.

To explore against a populated database:

```bash
npm run db:seed -- --demo        # ~90 companies / ~114 leads, plus deals and follow-ups
npm run db:seed -- --clear-demo  # removes them and their deals completely
```

Every demo company carries `research_method = 'seed-demo'`, so sample data is
always identifiable and can never be confused with real records.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` / `npm run typecheck` | ESLint and `tsc --noEmit` |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push the schema straight to the database (dev only) |
| `npm run db:seed` | Seed reference data (`--demo` / `--clear-demo` for sample leads) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:transfer` | Copy the whole database into Supabase (`--dry-run`, `--truncate`) |
| `npm run auth:provision` | Create the Supabase Auth user and link it to an account |
| `npm run scrape` | Run the job-board scrapers and scan company websites |
| `npm run harvest` | Harvest and verify local businesses from OpenStreetMap |
| `npm run x:worker` | X lead engine worker (`--once` for cron, `--status` for state) |

## Harvesting local businesses

`npm run harvest` builds leads out of mapped businesses rather than job
postings. It is the source behind the bulk of the database.

```bash
npm run harvest -- --country=us --target=900   # us ca uk de fr au
npm run harvest -- --country=ca --target=300
npm run harvest -- --country=us --target=50 --dry-run
```

Three phases:

1. **Harvest** — bounding-box Overpass queries over ~80 US metros or ~25 UK
   cities, for the tag combinations that identify each niche (`amenity=dentist`,
   `office=estate_agent`, `craft=plumber` and so on). Responses are cached in
   `.harvest/`, so re-running never re-asks a donated public service for data
   already on disk. Area (`ISO3166`) lookups are deliberately avoided — they go
   through the Overpass dispatcher and are the first thing to time out.
2. **Qualify** — every candidate's own website is read, once, and it becomes a
   lead only if the page proves all three of:
   - the site answers (HTTP 2xx — the business is still trading),
   - it publishes a contact address on **its own domain or a mainstream mailbox
     provider** — an address on some third party's domain is rejected outright,
     because writing to it would contact a stranger,
   - and there is current marketing activity: a linked Instagram, TikTok,
     LinkedIn or YouTube profile, an advertising pixel, or a live
     booking/chat tool. A site that was built once and abandoned does not pass.

   Every rejection is counted with its reason, and the evidence behind each
   accepted lead is stored on the record.
3. **Ingest** — through the CSV import pipeline, so harvested leads get the same
   duplicate detection, blank-filling merge and per-row audit trail as any other
   import. Website signals gathered while qualifying are written at the same
   time, so the engine's opportunity view is populated without a second fetch.

Filtered out before anything is fetched: domains already in the database,
aggregator and social URLs (they are not the business's own site), and any
domain mapped in four or more different towns — a national chain or franchise
portal, whose marketing is not bought locally.

**No social platform is scraped.** Handles come from the links a company puts on
its own homepage, which is also why they can be trusted to be current.

## X lead engine

**X Leads** (`/x`) finds people on X who are asking for, or describing the
problem behind, what the business sells — and turns them into leads. It uses
X's official API v2 (recent search); nothing scrapes x.com.

```
saved searches ──(due)──▶ X recent search ──▶ x_posts + x_authors
                                                   │
                     rules prefilter ─▶ AI classifier (25 posts per call)
                                                   │
                  author's best post ≥ threshold → "qualified" → CRM lead
```

1. **Searches** are X queries saved with a niche, a schedule and a per-run cap.
   "Generate from my niches" writes three per niche (with the configured AI
   provider, or templates without one) and creates them paused for review.
   Each run passes `since_id`, so X only returns posts newer than the last run.
2. **Scoring.** Every post is judged against the business description on the
   page's Scoring tab plus each niche's target market, pain points and offer.
   The intent is one of `buyer`, `pain`, `hiring`, `peer`, `seller` or `noise`,
   with a 0–100 relevance. Vendors and spam are rejected by rules before any
   model is paid for. If the model fails, posts are retried and, after four
   attempts, scored by the rules so the queue never stalls.
3. **Leads.** The *author* is the lead. When their best post clears the
   threshold (60 by default) they appear on the Leads tab for one-click
   "Add to CRM" — or automatically, for searches with auto-add switched on.
   Conversion creates a company (matched on the profile website's domain) and
   a contact with source **X (Twitter)**, the qualifying post as the first
   note, and a timeline entry. Converted authors then appear on **Social DMs**
   with their X handle, and the DM writer uses their own post as the opener.

### Setup

Create an app at developer.x.com, buy API credits, and set in `.env.local`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `X_BEARER_TOKEN` | — | The app's Bearer Token. Required. |
| `X_AUTORUN` | off | `true` runs due searches inside the web server |
| `X_AUTORUN_INTERVAL_SECONDS` | `120` | How often the in-app scheduler ticks |
| `X_MONTHLY_READ_BUDGET` | `10000` | Posts read per calendar month before searching stops; `0` = no cap |
| `X_MIN_RELEVANCE` | `60` | Qualification threshold (also editable on the page) |
| `CRON_SECRET` | — | Enables `GET/POST /api/cron/x` for an external scheduler |
| `X_PROVIDER` | — | `mock` for offline testing only: invented `mock_…` accounts on `.example` sites |

**Cost.** X bills pay-per-use: $0.005 per post read, capped by X at 3 million
reads per month (docs.x.com, September 2026). The monthly budget is enforced
before every request and is on by default, because an uncapped scheduler is an
uncapped bill. The page shows reads and estimated spend for the month.

### Running at scale

Three ways to drive it, usable together:

- **In-app** — `X_AUTORUN=true`. Nothing else to deploy.
- **Workers** — `npm run x:worker` (loops) on any number of machines.
- **Cron** — `npm run x:worker -- --once`, or call `/api/cron/x` with
  `Authorization: Bearer $CRON_SECRET` (the header Vercel Cron sends).

Searches and the scoring queue are claimed with leases and
`FOR UPDATE SKIP LOCKED`, so extra workers split the work rather than
repeating it, and a crashed worker's lease simply expires. A 429 or an empty
credit balance sets a backoff shared by every worker. A query X rejects, or a
revoked token, pauses the search instead of failing every hour.

## Providers

External services sit behind interfaces in `src/lib/integrations/types.ts` and
`src/lib/ai/types.ts`. Each factory falls back to its mock adapter when the
requested vendor has no credentials, so the app stays fully usable offline and
the UI states plainly which provider actually answered.

| Variable | Options | Needs |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic`, `gemini`, `mock` | `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` |
| `LEAD_PROVIDER` | `apollo`, `mock` | `APOLLO_API_KEY` |
| `ENRICHMENT_PROVIDER` | `mock` | — |
| `EMAIL_PROVIDER` | `mock` | — |

Mock lead results are generated deterministically on RFC 2606 `.example`
domains, so offline data can never be mistaken for real sourced records.

Adding a vendor means writing an adapter and an env var — no page or service
changes.

## Layout

```
src/
  app/(app)/        Authenticated pages — dashboard, leads, pipeline, deals…
  app/api/          Route handlers
  components/       UI primitives and per-feature views
  db/               Drizzle schema, migrate and seed
  lib/ai/           AI provider interface + Anthropic and mock adapters
  lib/integrations/ Lead, enrichment and email provider adapters
  lib/services/     Data access and business logic (server-only)
  lib/validation.ts Zod schemas shared by routes and forms
```

Anything importing the database is marked `server-only`, so a stray client
import fails the build rather than shipping `pg` to the browser.

## The data model

A **lead is a contact attached to a company**. There is deliberately no separate
`leads` table — it would duplicate pipeline state across two rows and make
status and score ambiguous. Firmographics live on `companies`; pipeline state
(`status`, `lead_score`, `last_contacted_at`, `next_follow_up_at`) lives on
`contacts`. One company has many contacts.

Core tables: `users`, `niches`, `companies`, `contacts`, `lead_sources`, `tags`,
`contact_tags`, `activities`, `outreach_events`, `notes`, `follow_ups`, `deals`,
`ai_research`, `research_jobs`, `imports`, `import_rows`, `settings`. The X
lead engine adds `x_searches`, `x_authors` and `x_posts`.

## Built for 50k+ leads

- **Everything runs in Postgres.** Filtering, sorting, searching and paging are
  all server-side; the browser only ever receives the current page of rows.
- **72 indexes**, including trigram GIN indexes on the columns global search
  actually queries, so `ILIKE '%term%'` stays indexed
  (`drizzle/0001_search_indexes.sql`).
- **Windowed counts** (`count(*) over()`) return a page and its total in one
  round trip instead of two.
- **Streamed CSV export** in batches of 1,000 rows — the result set is never
  materialised in memory.
- **Chunked import** — a 50k-row CSV is posted in 200-row chunks, so no single
  request is unbounded.
- **Bounded bulk actions** (1,000 ids) and per-column Kanban limits, with the
  real totals still displayed.

## Duplicate detection

Enforced at two levels:

1. **Database** — partial unique indexes on `lower(email)`, `linkedin_url` and
   company `domain`.
2. **Application** — every write path checks first, so the UI can show the
   existing record and offer a merge instead of surfacing a raw constraint
   violation.

CSV import and prospect search share one pipeline, so a duplicate fills in
blanks on the existing record — **never overwriting** — and is reported rather
than silently re-created. Re-running an identical prospect search imports
nothing and reports every result as a duplicate.

## AI research

With `AI_PROVIDER=anthropic` and a key set, **Research lead** fetches the
company website (12s timeout, 400KB cap, no JS execution), combines it with the
niche's ICP definition, and asks the model — through a forced tool schema, so
the response shape is guaranteed — for a summary, pain points, automation
opportunities, a recommended offer, personalization hooks, a 0–100 score, the
reason for that score and a confidence value. Results are written to
`ai_research`, the lead's score and status update, and the run is recorded on
the activity timeline.

Research can also be queued in bulk. Jobs are claimed with
`FOR UPDATE SKIP LOCKED`, so the in-app runner and a future cron worker can
drain the same queue without collisions.

## Security

- Every page is behind `requireUser()`; every API route behind
  `requireApiUser()`, which returns 401 JSON rather than redirecting an API call
  to an HTML login page.
- Middleware verifies the session on every request and refreshes the Supabase
  access token; **record-level authorisation always happens server-side**, in
  the guards, where data is actually read.
- Passwords are handled by Supabase Auth. Login responses never reveal whether
  an email exists — the one exception is an unconfirmed address, which is an
  instruction rather than a fact about the account.
- Session cookies are `httpOnly`, `sameSite=lax`, and `secure` in production.
- Secrets stay server-side. The only `NEXT_PUBLIC_` values are the Supabase URL
  and publishable key, both of which are designed to be public; the
  service-role key never leaves the server.
- **RLS is enabled on every table** (`drizzle/0006_enable_rls.sql`). This is not
  optional on Supabase: PostgREST publishes `public` at
  `https://<project>.supabase.co/rest/v1/<table>` under the anon key, which is
  in the browser bundle. With no policy defined, that endpoint returns nothing.
  The app is unaffected because it connects as the table owner, which bypasses
  RLS. Adding a policy is what opens a table up — do it deliberately.
- Every request body is validated with Zod before reaching a service.

## Auth

Supabase Auth, with a deliberate fallback: while `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset, the app signs sessions with its own
`AUTH_SECRET` cookie instead. Sign-in therefore keeps working before, during and
after the switchover rather than breaking the moment the migration starts.

`users.auth_user_id` links an application account to its `auth.users` row.
`users.id` is left alone on purpose — `owner_id` on companies, contacts, deals
and imports already points at it, and repointing those at an auth uid would
rewrite ownership across the whole database. On first sign-in an identity is
matched by auth id, then by email, so an account created before Supabase is
adopted instead of being duplicated.

## Moving to Supabase

1. Create a Supabase project.
2. Fill in `.env.local` from Project Settings → API:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`; and `SUPABASE_DATABASE_URL` from
   Connect → Session pooler.
3. Create the schema on Supabase:
   `DATABASE_URL=$SUPABASE_DATABASE_URL npm run db:migrate`
4. Copy the data across — reads `DATABASE_URL`, writes `SUPABASE_DATABASE_URL`:

   ```bash
   npm run db:transfer -- --dry-run   # plan first
   npm run db:transfer                # then for real
   ```

   Table order is derived from the live foreign keys, generated columns are
   skipped, and every row is inserted `on conflict do nothing`, so an
   interrupted run is resumed by simply running it again. Row counts are
   compared against the source at the end.

5. Create the matching Supabase Auth user and link it to the existing account:
   `npm run auth:provision`
6. Point `DATABASE_URL` at Supabase and restart.

TLS is enabled automatically for any non-localhost connection.

## Current limitations

Stated plainly so nothing here reads as more finished than it is:

- **Apollo** — the adapter is written against Apollo's people-search API but has
  not been exercised against a live key. It stays inert until `APOLLO_API_KEY`
  is set.
- **Enrichment and email** — interfaces and mock adapters only; no live vendor
  adapter yet. The mock enrichment adapter deliberately derives only
  provably-true fields (a domain from an email address) and invents nothing.
- **Outreach events** — the `outreach_events` table and provider webhook shape
  exist, but no inbound webhook endpoint is wired up.
- **Research queue** — drained by an in-app button; no scheduled worker is
  deployed, though the queue is already safe for one.
- **Single workspace** — users exist and own records, but there is no
  multi-tenant isolation or invite flow.
