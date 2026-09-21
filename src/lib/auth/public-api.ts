import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret auth for the public API the Kiln website calls.
 *
 * This is deliberately not the session guard: the caller is a server, not a
 * person, and it has no cookie. A single key in both environments is the right
 * weight for two services owned by the same person — anything more (OAuth,
 * JWT issuance) would be ceremony around a secret that still has to be shared.
 *
 * The key never reaches a browser. The website calls these routes from its own
 * server components and route handlers, never from client code.
 */
export function verifyPublicApiKey(request: Request):
  | { ok: true }
  | { ok: false; response: Response } {
  const expected = process.env.PUBLIC_API_KEY?.trim();

  // An unset key means the endpoint is closed, not open. Failing open here
  // would publish the lead database the first time someone forgot a variable.
  if (!expected) {
    console.error("[public-api] PUBLIC_API_KEY is not set — refusing the request.");
    return {
      ok: false,
      response: Response.json({ error: "Public API is not configured" }, { status: 503 }),
    };
  }

  const supplied = request.headers.get("x-api-key")?.trim() ?? "";

  // Compare in constant time, and only when the lengths already match —
  // timingSafeEqual throws on a length mismatch, which would itself leak.
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b);

  if (!valid) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true };
}

/**
 * A small fixed-window limiter, in memory.
 *
 * Honest about what it is: per-process and reset by a deploy, so it stops a
 * script hammering the enquiry form, not a distributed flood. That is the
 * threat that actually exists for a site with one contact form.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

/** Best-effort client address, for the limiter key only. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
