import { timingSafeEqual } from "node:crypto";

import { runXTick } from "@/lib/services/x-leads";

export const maxDuration = 300;

/**
 * Entry point for an external scheduler (Vercel Cron, a GitHub Action, a
 * crontab curl). It has no session, so it is listed as public in the
 * middleware and authenticates itself here with CRON_SECRET, sent as
 * `Authorization: Bearer <secret>` — the header Vercel Cron sends. An unset
 * secret closes the endpoint rather than opening it.
 */
function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (!authorised(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runXTick({ timeBudgetMs: 240_000 }));
}

export const GET = handle;
export const POST = handle;
