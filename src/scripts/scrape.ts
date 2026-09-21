/**
 * Lead engine CLI — for scheduled/repeat scraping.
 *
 *   npm run scrape                       every source, then scan 100 websites
 *   npm run scrape -- --source=remoteok  one source
 *   npm run scrape -- --list             show sources and what is blocked
 *   npm run scrape -- --scan=250         only scan websites for signals
 *   npm run scrape -- --limit=500 --min-score=20
 *
 * Suitable for cron:
 *   0 7 * * *  cd /path/to/ai-lead-engine && npm run scrape >> scrape.log 2>&1
 */
import { createRequire } from "node:module";

import { config } from "dotenv";

config({ path: ".env.local" });

/*
 * `server-only` throws outside a React Server Component, which would stop this
 * CLI importing the service layer at all. Pre-seeding the module cache with an
 * empty stub lets the script reuse exactly the same code the app runs, rather
 * than keeping a second, drifting copy of the scrape logic.
 */
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: "server-only", filename: "server-only", loaded: true,
  exports: {},
} as unknown as NodeModule;

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

async function main() {
  // Imported lazily so dotenv has already populated DATABASE_URL.
  const { BLOCKED_SOURCES, SCRAPERS } = await import("../lib/scrapers");
  const { runAllScrapers, runScraper, scanCompanySignals, getEngineStats } =
    await import("../lib/services/lead-engine");

  if (flag("list")) {
    console.log("\nWORKING SOURCES");
    for (const s of SCRAPERS) console.log(`  ${s.name.padEnd(22)} ${s.bucket.padEnd(17)} ${s.origin}`);
    console.log("\nNOT SCRAPED (and why)");
    for (const b of BLOCKED_SOURCES) console.log(`  ${b.name.padEnd(34)} ${b.reason}\n${" ".repeat(36)}-> ${b.alternative}`);
    return;
  }

  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const minScore = arg("min-score") ? Number(arg("min-score")) : 1;
  const terms = arg("terms")?.split(",").map((t) => t.trim()).filter(Boolean);

  const scanOnly = arg("scan");
  if (!scanOnly) {
    const source = arg("source");
    const results = source
      ? [await runScraper(source, { limit, minScore, terms })]
      : await runAllScrapers({ limit, minScore, terms });
    console.log("\nSCRAPE RESULTS");
    for (const r of results)
      console.log(`  ${r.source.padEnd(22)} found=${String(r.found).padStart(4)} new=${String(r.inserted).padStart(4)} updated=${String(r.updated).padStart(4)} skipped=${String(r.skipped).padStart(4)}`);
  }

  const scanCount = scanOnly ? Number(scanOnly) : Number(arg("scan-limit") ?? 100);
  if (scanCount > 0) {
    console.log(`\nSCANNING ${scanCount} company websites for signals…`);
    const s = await scanCompanySignals({ limit: scanCount, concurrency: 6 });
    console.log(`  scanned=${s.scanned} reachable=${s.reachable} unreachable=${s.unreachable} running-ads=${s.spending}`);
  }

  const stats = await getEngineStats();
  console.log("\nENGINE TOTALS");
  console.log("  buckets:", stats.buckets);
  console.log("  statuses:", stats.statuses);
  console.log("  signals:", stats.signals);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
