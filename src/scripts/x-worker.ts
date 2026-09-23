/**
 * X lead engine worker.
 *
 *   npm run x:worker                 loop forever, one tick every 60s
 *   npm run x:worker -- --interval=30
 *   npm run x:worker -- --once       one tick then exit (for cron)
 *   npm run x:worker -- --status     connection, budget and queue state
 *
 * Run as many copies as you like, on as many machines as you like: searches
 * and the scoring queue are claimed with leases and SKIP LOCKED, so workers
 * split the work instead of repeating it. That is how this scales — more
 * workers drain the classification queue faster, while the X rate limit and
 * monthly read budget stay shared across all of them.
 *
 * Suitable for cron:
 *   *\/10 * * * *  cd /path/to/lead-engine && npm run x:worker -- --once >> x-worker.log 2>&1
 */
import { createRequire } from "node:module";

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

// Same stub as scrape.ts: lets the CLI import the server-only service layer.
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: "server-only", filename: "server-only", loaded: true,
  exports: {},
} as unknown as NodeModule;

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

let stopping = false;
process.on("SIGINT", () => { stopping = true; console.log("\n[x-worker] stopping after this tick…"); });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  const { getXStats, getXStatus, runXTick, X_COST_PER_READ } = await import("../lib/services/x-leads");

  if (flag("status")) {
    const [status, stats] = await Promise.all([getXStatus(), getXStats()]);
    console.log(`X client:      ${status.client}${status.connected ? "" : " (NOT CONNECTED — set X_BEARER_TOKEN)"}`);
    console.log(`Classifier:    ${status.aiProvider}`);
    console.log(`Reads (month): ${status.readsThisMonth}${status.monthlyBudget ? ` / ${status.monthlyBudget}` : " (no cap)"}  ≈ $${(status.readsThisMonth * X_COST_PER_READ).toFixed(2)}`);
    if (status.backoffUntil) console.log(`Backing off until ${status.backoffUntil}`);
    console.log(`Posts:         ${stats.posts.total} total, ${stats.posts.pending} waiting to be scored`);
    console.log(`Authors:       ${JSON.stringify(stats.authors)}`);
    return;
  }

  const once = flag("once");
  const interval = Math.max(15, Number(arg("interval") ?? 60)) * 1000;

  do {
    const started = Date.now();
    try {
      const r = await runXTick({ timeBudgetMs: once ? 240_000 : Math.max(interval - 5_000, 30_000) });
      const read = r.searches.reduce((s, x) => s + x.read, 0);
      const fresh = r.searches.reduce((s, x) => s + x.newPosts, 0);
      console.log(
        `[x-worker] ${new Date().toISOString()} searches=${r.searches.length} read=${read} new=${fresh} ` +
        `scored=${r.classify.classified} (model=${r.classify.byModel} rules=${r.classify.byRules}) ` +
        `qualified=${r.classify.qualified} converted=${r.classify.converted} ${r.durationMs}ms`,
      );
      for (const s of r.searches.filter((x) => x.status !== "ok")) {
        console.warn(`[x-worker]   ${s.name}: ${s.status}${s.error ? ` — ${s.error}` : ""}`);
      }
      if (r.classify.error) console.warn(`[x-worker]   classifier: ${r.classify.error}`);
    } catch (error) {
      console.error("[x-worker] tick failed:", (error as Error).message);
      if (once) process.exitCode = 1;
    }
    if (once || stopping) break;
    const wait = Math.max(0, interval - (Date.now() - started));
    await new Promise((resolve) => setTimeout(resolve, wait));
  } while (!stopping);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error(e); process.exit(1); });
