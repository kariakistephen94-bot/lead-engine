/**
 * Business-lead harvester — map data in, verified leads out.
 *
 *   npm run harvest -- --country=us --target=900
 *   npm run harvest -- --country=uk --target=100
 *   npm run harvest -- --country=us --target=50 --dry-run
 *
 * Three phases, each resumable:
 *   1. HARVEST  Overpass bounding-box queries per metro, cached to .harvest/
 *   2. QUALIFY  read each candidate's own website — live? contactable? active?
 *   3. INGEST   through the CSV import pipeline, so dedupe and audit apply
 *
 * The cache is the reason phase 1 is not repeated: Overpass is a donated public
 * service, and re-asking it for data already on disk is the one thing that gets
 * a client blocked.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";

import type { OsmArea, OsmPlace } from "../lib/scrapers/sources/osm";
import type { Qualified } from "../lib/services/harvest";

config({ path: ".env.local" });

// See scrape.ts — lets a CLI import the `server-only` service layer.
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: "server-only", filename: "server-only", loaded: true, exports: {},
} as unknown as NodeModule;

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const CACHE_DIR = ".harvest";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { US_METROS, UK_AREAS, CA_METROS, DE_AREAS, FR_AREAS, AU_AREAS, harvestArea } =
    await import("../lib/scrapers/sources/osm");
  const { qualifyPlaces, ingestLeads, existingDomains, existingEmails } = await import("../lib/services/harvest");
  const { normalizeDomain } = await import("../lib/utils");
  const { db } = await import("../db");
  const { users } = await import("../db/schema");

  const country = (arg("country") ?? "us").toLowerCase();
  const target = Number(arg("target") ?? 100);
  const AREAS_BY_COUNTRY: Record<string, OsmArea[]> = {
    us: US_METROS, uk: UK_AREAS, ca: CA_METROS,
    de: DE_AREAS, fr: FR_AREAS, au: AU_AREAS,
  };
  const areas: OsmArea[] = AREAS_BY_COUNTRY[country] ?? US_METROS;
  if (!AREAS_BY_COUNTRY[country])
    console.log(`  ! unknown --country=${country}; falling back to US. Valid: ${Object.keys(AREAS_BY_COUNTRY).join(", ")}`);
  const maxAreas = Number(arg("areas") ?? areas.length);
  const concurrency = Number(arg("concurrency") ?? 8);
  const dryRun = flag("dry-run");

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  /* ---------------------------------------------------------------- phase 1 */
  console.log(`\n[1/3] HARVEST — ${Math.min(maxAreas, areas.length)} ${country.toUpperCase()} areas from OpenStreetMap`);
  const candidates: OsmPlace[] = [];

  /*
   * Visit the list in strides rather than in order. `US_METROS` is written
   * geographically, north-east to west, so working straight down it would spend
   * an hour on the eastern seaboard before reaching Texas. Striding means the
   * candidates in hand at any moment already span the country, and a run cut
   * short by a slow Overpass is still a national list rather than a regional one.
   */
  const STRIDE = 17;
  const ordered_areas: OsmArea[] = [];
  for (let offset = 0; offset < STRIDE && ordered_areas.length < areas.length; offset++)
    for (let i = offset; i < areas.length; i += STRIDE) ordered_areas.push(areas[i]);
  const queue = ordered_areas.slice(0, maxAreas);
  const failed: OsmArea[] = [];

  const cacheFileFor = (area: OsmArea) =>
    join(CACHE_DIR, `${country}-${area.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);

  async function fetchArea(area: OsmArea, offset: number): Promise<boolean> {
    const cacheFile = cacheFileFor(area);
    if (existsSync(cacheFile)) {
      const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as OsmPlace[];
      candidates.push(...cached);
      console.log(`  ${area.city.padEnd(18)} ${String(cached.length).padStart(4)} (cached)`);
      return true;
    }
    try {
      const found = await harvestArea(area, undefined, offset);
      writeFileSync(cacheFile, JSON.stringify(found));
      candidates.push(...found);
      console.log(`  ${area.city.padEnd(18)} ${String(found.length).padStart(4)}`);
      return true;
    } catch (e) {
      console.log(`  ${area.city.padEnd(18)}    ! ${(e as Error).message.slice(0, 90)}`);
      return false;
    }
  }

  /*
   * One worker per mirror, each pinned to a different one, so no server ever
   * has two of our queries in flight. Sequential was costing minutes per busy
   * instance; firing all eighty at once would be an attack on a donated service.
   */
  const WORKERS = Number(arg("workers") ?? 4);
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async (_unused, worker) => {
      for (;;) {
        const index = next++;
        if (index >= queue.length) return;
        const area = queue[index];
        if (!(await fetchArea(area, worker))) failed.push(area);
        await sleep(1_200);
      }
    }),
  );

  // One retry pass: most failures are a mirror shedding load for a minute, and
  // dropping a whole metro because of that would silently skew the coverage.
  if (failed.length) {
    console.log(`\n  retrying ${failed.length} area(s) that failed`);
    for (const area of failed) {
      await fetchArea(area, 2);
      await sleep(1_200);
    }
  }

  /* ---------------------------------------------------------------- filter  */
  const knownDomains = await existingDomains();
  const knownEmails = await existingEmails();
  const seenDomain = new Set<string>();
  const fresh: OsmPlace[] = [];
  let dupSkipped = 0;
  let chainSkipped = 0;

  /*
   * Domains already read and found wanting. Without this every run re-reads
   * the same rejects before reaching anything new — the qualify pass walks a
   * deterministic order, and only *accepted* candidates leave it (they become
   * known domains). Re-checking them cost this run most of its window.
   *
   * Only durable verdicts are remembered. A timeout or a 5xx says the server
   * was having a moment, not that the business fails the bar, so those are
   * left to be tried again.
   */
  const REJECT_FILE = join(CACHE_DIR, `rejected-${country}.json`);
  const rejectedDomains = new Set<string>(
    existsSync(REJECT_FILE) ? (JSON.parse(readFileSync(REJECT_FILE, "utf8")) as string[]) : [],
  );
  const transient = /timed out|HTTP 5\d\d|HTTP 429|HTTP 408/i;
  let rejectsSinceSave = 0;
  const saveRejects = () => writeFileSync(REJECT_FILE, JSON.stringify([...rejectedDomains]));
  let rejectSkipped = 0;

  /*
   * A domain mapped in several different towns is a national chain or a
   * franchise portal. Their marketing is bought at head office, so they are not
   * the buyer this list is for, and one of their branches would otherwise slip
   * through de-duplication as a perfectly ordinary-looking lead.
   */
  const citiesPerDomain = new Map<string, Set<string>>();
  for (const place of candidates) {
    const domain = normalizeDomain(place.website);
    if (!domain) continue;
    (citiesPerDomain.get(domain) ?? citiesPerDomain.set(domain, new Set()).get(domain)!).add(place.city);
  }

  for (const place of candidates) {
    const domain = normalizeDomain(place.website);
    // Aggregators and social pages are not the business's own site, so there is
    // nothing on them that could verify *this* business.
    if (!domain || /(facebook|instagram|linkedin|twitter|x|tiktok|google|yelp|wixsite|blogspot|wordpress)\.com$/.test(domain)) continue;
    if (knownDomains.has(domain) || seenDomain.has(domain)) { dupSkipped++; continue; }
    if (rejectedDomains.has(domain)) { rejectSkipped++; continue; }
    if ((citiesPerDomain.get(domain)?.size ?? 0) >= 4) { chainSkipped++; continue; }
    if (place.email && knownEmails.has(place.email.toLowerCase())) { dupSkipped++; continue; }
    seenDomain.add(domain);
    fresh.push(place);
  }

  console.log(`\n  ${candidates.length} candidates -> ${fresh.length} new (${dupSkipped} already known, ${rejectSkipped} previously rejected, ${chainSkipped} multi-city chains)`);

  /*
   * Interleave by niche and city before verifying. Checking the list in the
   * order it was harvested would spend the whole target on dentists in the
   * first four metros; round-robin means stopping early still leaves a spread.
   */
  const groups = new Map<string, OsmPlace[]>();
  for (const place of fresh) {
    const key = `${place.niche}|${place.city}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(place);
  }
  const ordered: OsmPlace[] = [];
  const keys = [...groups.keys()];
  for (let round = 0; ordered.length < fresh.length; round++) {
    for (const key of keys) {
      const item = groups.get(key)![round];
      if (item) ordered.push(item);
    }
    if (round > 5_000) break;
  }

  /* ---------------------------------------------------------------- phase 2 */
  console.log(`\n[2/3] QUALIFY — reading websites until ${target} leads qualify (concurrency ${concurrency})`);
  const reasons = new Map<string, number>();
  let done = 0;

  const [owner] = await db.select({ id: users.id }).from(users).limit(1);
  const label = `OpenStreetMap harvest — ${country.toUpperCase()} ${new Date().toISOString().slice(0, 10)}`;

  /*
   * Ingest in small batches as leads qualify, rather than waiting for the whole
   * run to finish. A run that never reaches `target` — or is killed partway
   * through a long candidate list — must not lose the leads it already found.
   */
  const BATCH = 1;
  let pending: Qualified[] = [];
  let imported = 0, duplicates = 0, invalid = 0, signals = 0;

  async function flush() {
    if (dryRun || pending.length === 0) return;
    const batch = pending;
    pending = [];
    const results = await ingestLeads(batch, { userId: owner?.id ?? null, label });
    for (const r of results) {
      imported += r.imported; duplicates += r.duplicates; invalid += r.invalid; signals += r.signalsWritten;
    }
  }

  // `onResult` fires from 8 concurrent workers but is not awaited by the
  // caller, so without this chain two workers hitting BATCH at once would
  // both read the same `pending` array and ingest it twice. Chaining onto one
  // promise forces every handler — and therefore every flush — to run one at
  // a time, in the order results arrive.
  let chain = Promise.resolve();
  const { qualified, rejected, checked } = await qualifyPlaces(ordered, {
    concurrency,
    target,
    onResult: ({ qualified: q, rejection }) => {
      chain = chain.then(async () => {
        done++;
        if (rejection) {
          reasons.set(rejection.reason, (reasons.get(rejection.reason) ?? 0) + 1);
          const domain = normalizeDomain(rejection.place.website);
          if (domain && !transient.test(rejection.reason)) {
            rejectedDomains.add(domain);
            // Persisted as we go: these runs are routinely stopped part-way,
            // and a verdict only remembered at the end would be lost.
            if (++rejectsSinceSave >= 25) { saveRejects(); rejectsSinceSave = 0; }
          }
        }
        if (q) {
          pending.push(q);
          if (pending.length >= BATCH) await flush();
        }
        if (done % 25 === 0 || q) {
          const kept = done - [...reasons.values()].reduce((a, b) => a + b, 0);
          process.stdout.write(`\r  checked ${done}/${ordered.length} — qualified ${kept} — imported ${imported}   `);
        }
      });
    },
  });
  await chain;
  await flush();
  saveRejects();

  console.log(`\n  checked ${checked}, qualified ${qualified.length}, rejected ${rejected.length}`);
  console.log("  rejection reasons:");
  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12))
    console.log(`    ${String(n).padStart(4)}  ${reason}`);

  const withSocial = qualified.filter((q) => Object.keys(q.social).length).length;
  const withAds = qualified.filter((q) => q.report.adPlatforms.some((p) => !/Tag Manager/.test(p))).length;
  const withPhone = qualified.filter((q) => q.place.phone).length;
  console.log(`\n  of the ${qualified.length} qualified: ${withSocial} link a social profile, ${withAds} run ads, ${withPhone} have a phone number`);

  if (dryRun) {
    console.log("\n[3/3] INGEST — skipped (--dry-run)");
    for (const q of qualified.slice(0, 10))
      console.log(`  ${q.place.name} | ${q.email} | ${q.place.city} | ${q.evidence.slice(1).join(" | ").slice(0, 110)}`);
    return;
  }

  /* ---------------------------------------------------------------- phase 3 */
  console.log(`\n[3/3] INGEST — imported=${imported} duplicates=${duplicates} invalid=${invalid} signals=${signals}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
