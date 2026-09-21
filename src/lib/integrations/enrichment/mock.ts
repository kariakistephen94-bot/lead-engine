import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../types";

/**
 * Offline enrichment adapter. It only *derives* fields that are provably true
 * from the input (for example a domain from an email address) and never invents
 * headcounts or revenue, so nothing fabricated can reach the database.
 */
export class MockEnrichmentProvider implements EnrichmentProvider {
  readonly name = "mock";

  isConfigured(): boolean {
    return true;
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    const derivedDomain =
      input.domain ?? (input.email?.includes("@") ? (input.email.split("@").pop() ?? null) : null);

    if (!derivedDomain) return null;

    return {
      domain: derivedDomain,
      website: `https://${derivedDomain}`,
    };
  }
}
