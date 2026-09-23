import { XApiClient, type XClient } from "./client";
import { MockXClient } from "./mock";

let cached: XClient | null = null;

/**
 * The X client for this process.
 *
 * Real API whenever X_BEARER_TOKEN is set. The mock only answers when asked for
 * by name (X_PROVIDER=mock) — an unconfigured X integration reports itself as
 * not connected rather than quietly filling the lead queue with invented posts.
 */
export function getXClient(): XClient {
  if (cached) return cached;
  const requested = (process.env.X_PROVIDER ?? "").trim().toLowerCase();
  cached = requested === "mock" ? new MockXClient() : new XApiClient();
  return cached;
}

/** Test seam. */
export function __setXClient(client: XClient | null) {
  cached = client;
}

export * from "./client";
