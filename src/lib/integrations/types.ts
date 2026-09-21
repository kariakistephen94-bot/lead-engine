/**
 * External data provider contracts.
 *
 * Every integration the app will ever grow — Apollo, a maps/business-data
 * provider, an enrichment vendor, an email sender — implements one of these.
 * Application code depends on the interface only, so adding a vendor means
 * adding an adapter and an env var, never touching a page or a service.
 */

export type ProspectSearch = {
  /** Free-text description, kept for auditing what was asked for. */
  description: string;
  locations?: string[];
  industries?: string[];
  jobTitles?: string[];
  minEmployees?: number | null;
  maxEmployees?: number | null;
  keywords?: string[];
  limit: number;
};

export type ProspectCompany = {
  name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  employeeCount: number | null;
  revenue: number | null;
  description: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  contacts: ProspectContact[];
  /** Where this record came from, recorded on the lead for attribution. */
  sourceUrl: string | null;
};

export type ProspectContact = {
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
};

export interface LeadProvider {
  readonly name: string;
  /** Slug of the lead_sources row that results are attributed to. */
  readonly sourceSlug: string;
  isConfigured(): boolean;
  search(criteria: ProspectSearch): Promise<ProspectCompany[]>;
}

export type EnrichmentInput = {
  companyName: string;
  domain: string | null;
  email: string | null;
  linkedinUrl: string | null;
};

export type EnrichmentResult = Partial<ProspectCompany> & {
  contacts?: ProspectContact[];
};

export interface EnrichmentProvider {
  readonly name: string;
  isConfigured(): boolean;
  enrich(input: EnrichmentInput): Promise<EnrichmentResult | null>;
}

export type OutboundEmail = {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
};

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(email: OutboundEmail): Promise<{ id: string; accepted: boolean }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(
    readonly provider: string,
    readonly missing: string,
  ) {
    super(`${provider} is not configured — set ${missing}.`);
    this.name = "ProviderNotConfiguredError";
  }
}
