/**
 * Daily outreach batch.
 *
 *   npm run send                 send everything queued, up to today's capacity
 *   npm run send -- --status     show capacity and queue depth, send nothing
 *   npm run send -- --limit=40
 *
 * Cron it for a steady daily trickle rather than one burst:
 *   30 9 * * 1-5  cd /path/to/ai-lead-engine && npm run send >> send.log 2>&1
 */
import { createRequire } from "node:module";

import { config } from "dotenv";

config({ path: ".env.local" });

// `server-only` throws outside a React Server Component; stub it so this CLI
// can reuse the exact code the app runs rather than a second, drifting copy.
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: "server-only", filename: "server-only", loaded: true, exports: {},
} as unknown as NodeModule;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const { getAccountCapacity } = await import("../lib/services/email-accounts");
  const { sendQueued, getOutreachStats } = await import("../lib/services/outreach");

  const capacity = await getAccountCapacity();
  if (!capacity.length) {
    console.log("No sending accounts configured yet. Add them in Settings → Email accounts.");
    return;
  }

  console.log("\nSENDING ACCOUNTS");
  for (const c of capacity) {
    const warm = c.account.warmupEnabled && c.effectiveCap < c.account.dailyCap
      ? ` (warming up: ${c.effectiveCap}/${c.account.dailyCap})` : "";
    console.log(
      `  ${c.account.label.padEnd(18)} ${c.account.fromEmail.padEnd(34)} ` +
      `${String(c.sentToday).padStart(3)}/${String(c.effectiveCap).padEnd(4)} used` +
      `${warm}${c.blockedReason ? `  — ${c.blockedReason}` : ""}`,
    );
  }

  const stats = await getOutreachStats();
  console.log("\nQUEUE", stats.statuses, `| suppressed: ${stats.suppressed}`);

  if (flag("status")) return;

  const total = capacity.filter((c) => !c.blockedReason).reduce((s, c) => s + c.remaining, 0);
  if (total === 0) {
    console.log("\nNo capacity left today. Nothing sent.");
    return;
  }

  const limit = Math.min(Number(arg("limit") ?? total), total);
  console.log(`\nSending up to ${limit}…`);
  const result = await sendQueued(limit);
  console.log(`  sent=${result.sent} failed=${result.failed} skipped=${result.skipped}` +
    (result.capped ? " (stopped: daily cap reached)" : ""));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
