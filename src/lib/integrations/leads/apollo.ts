import "server-only";

import { normalizePhone } from "@/lib/utils";
import {
  ProviderNotConfiguredError,
  type LeadProvider,
  type ProspectCompany,
  type ProspectSearch,
} from "../types";

const SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/search";

/**
 * Apollo adapter.
 *
 * The request/response mapping is written against Apollo's people-search API.
 * It stays inert until APOLLO_API_KEY is set — `isConfigured()` is false, so the
 * factory hands back the mock adapter and nothing here runs. That is the point
 * of the interface: the integration can be finished and switched on later
 * without touching the prospecting service or the UI.
 */
export class ApolloLeadProvider implements LeadProvider {
  readonly name = "apollo";
  readonly sourceSlug = "apollo";
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(criteria: ProspectSearch): Promise<ProspectCompany[]> {
    if (!this.apiKey) throw new ProviderNotConfiguredError("Apollo", "APOLLO_API_KEY");

    const perPage = Math.min(100, criteria.limit);
    const pages = Math.ceil(criteria.limit / perPage);
    const companies = new Map<string, ProspectCompany>();

    for (let page = 1; page <= pages; page++) {
      const response = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          accept: "application/json",
        },
        body: JSON.stringify({
          page,
          per_page: perPage,
          person_titles: criteria.jobTitles?.length ? criteria.jobTitles : undefined,
          person_locations: criteria.locations?.length ? criteria.locations : undefined,
          q_organization_keyword_tags: criteria.industries?.length ? criteria.industries : undefined,
          organization_num_employees_ranges: employeeRange(criteria),
          q_keywords: criteria.keywords?.join(" ") || undefined,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Apollo search failed (${response.status}): ${detail.slice(0, 300)}`);
      }

      const data = (await response.json()) as { people?: ApolloPerson[] };
      for (const person of data.people ?? []) {
        const org = person.organization;
        const key = org?.primary_domain ?? org?.name ?? person.id;
        if (!key) continue;

        const existing = companies.get(key);
        const contact = {
          firstName: person.first_name ?? null,
          lastName: person.last_name ?? null,
          jobTitle: person.title ?? null,
          email: person.email ?? null,
          phone: normalizePhone(person.phone_numbers?.[0]?.raw_number),
          linkedinUrl: person.linkedin_url ?? null,
        };

        if (existing) {
          existing.contacts.push(contact);
          continue;
        }

        companies.set(key, {
          name: org?.name ?? "Unknown company",
          website: org?.website_url ?? null,
          domain: org?.primary_domain ?? null,
          industry: org?.industry ?? null,
          location: [person.city, person.country].filter(Boolean).join(", ") || null,
          city: person.city ?? null,
          country: person.country ?? null,
          employeeCount: org?.estimated_num_employees ?? null,
          revenue: org?.annual_revenue ?? null,
          description: org?.short_description ?? null,
          linkedinUrl: org?.linkedin_url ?? null,
          phone: normalizePhone(org?.phone),
          sourceUrl: org?.website_url ?? null,
          contacts: [contact],
        });
      }

      if ((data.people?.length ?? 0) < perPage) break;
    }

    return [...companies.values()].slice(0, criteria.limit);
  }
}

function employeeRange(criteria: ProspectSearch): string[] | undefined {
  if (criteria.minEmployees == null && criteria.maxEmployees == null) return undefined;
  const min = criteria.minEmployees ?? 1;
  const max = criteria.maxEmployees ?? 10000;
  return [`${min},${max}`];
}

type ApolloPerson = {
  id?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  city?: string;
  country?: string;
  phone_numbers?: { raw_number?: string }[];
  organization?: {
    name?: string;
    website_url?: string;
    primary_domain?: string;
    industry?: string;
    estimated_num_employees?: number;
    annual_revenue?: number;
    short_description?: string;
    linkedin_url?: string;
    phone?: string;
  };
};
