import "server-only";

import { MockEmailProvider } from "./email/mock";
import { MockEnrichmentProvider } from "./enrichment/mock";
import { ApolloLeadProvider } from "./leads/apollo";
import { MockLeadProvider } from "./leads/mock";
import type { EmailProvider, EnrichmentProvider, LeadProvider } from "./types";

/**
 * Provider factories.
 *
 * Each falls back to its mock adapter when the requested vendor has no
 * credentials — the app stays fully usable offline, and `isLiveProvider()` lets
 * the UI state plainly which one is actually in use rather than implying real
 * data.
 */
export function getLeadProvider(): LeadProvider {
  const requested = (process.env.LEAD_PROVIDER ?? "mock").toLowerCase();

  if (requested === "apollo") {
    const provider = new ApolloLeadProvider();
    if (provider.isConfigured()) return provider;
    console.warn("[integrations] LEAD_PROVIDER=apollo but APOLLO_API_KEY is missing — using mock.");
  }

  return new MockLeadProvider();
}

export function getEnrichmentProvider(): EnrichmentProvider {
  return new MockEnrichmentProvider();
}

export function getEmailProvider(): EmailProvider {
  return new MockEmailProvider();
}

/** True when the active provider talks to a real external service. */
export function isLiveProvider(provider: { name: string }): boolean {
  return provider.name !== "mock";
}

/**
 * What the UI needs to state plainly which provider answered a search —
 * including the case where a real vendor was requested but fell back to mock
 * for want of a key.
 */
export function describeLeadProvider(): { name: string; live: boolean; requested: string } {
  const provider = getLeadProvider();
  return {
    name: provider.name,
    live: isLiveProvider(provider),
    requested: (process.env.LEAD_PROVIDER ?? "mock").toLowerCase(),
  };
}

export type { LeadProvider, EnrichmentProvider, EmailProvider } from "./types";
