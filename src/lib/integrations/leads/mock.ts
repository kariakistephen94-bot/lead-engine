import { fictionalPhone } from "@/lib/fixtures/phone";
import type { LeadProvider, ProspectCompany, ProspectSearch } from "../types";

/**
 * Offline lead provider for development.
 *
 * Results are generated deterministically from the search criteria and every
 * company is stamped with a `.example` domain and a "Sample prospect" marker,
 * so mock records can never be mistaken for — or silently mixed in with — real
 * sourced data. Swap LEAD_PROVIDER=apollo once a key is available.
 */
export class MockLeadProvider implements LeadProvider {
  readonly name = "mock";
  readonly sourceSlug = "manual-research";

  isConfigured(): boolean {
    return true;
  }

  async search(criteria: ProspectSearch): Promise<ProspectCompany[]> {
    const seed = hash(JSON.stringify(criteria));
    const random = makeRandom(seed);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];

    const industry = criteria.industries?.[0] ?? inferIndustry(criteria.description);
    const parts = NAME_PARTS[industry] ?? NAME_PARTS.default;
    const locations = criteria.locations?.length ? criteria.locations : ["United States"];
    const titles = criteria.jobTitles?.length ? criteria.jobTitles : ["Founder", "Head of Operations"];

    const minEmployees = criteria.minEmployees ?? 10;
    const maxEmployees = criteria.maxEmployees ?? 80;

    const companies: ProspectCompany[] = [];
    const used = new Set<string>();

    // Bounded attempts: the name space is finite, so stop rather than spin.
    for (let attempt = 0; companies.length < criteria.limit && attempt < criteria.limit * 12; attempt++) {
      const name = `${pick(parts.prefixes)} ${pick(parts.suffixes)}`;
      if (used.has(name)) continue;
      used.add(name);

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      // `.example` is reserved by RFC 2606 and can never be a real company.
      const domain = `${slug}.example`;
      const country = pick(locations);
      const city = pick(CITIES[country] ?? CITIES.default);
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);

      companies.push({
        name,
        website: `https://${domain}`,
        domain,
        industry,
        location: `${city}, ${country}`,
        city,
        country,
        employeeCount:
          minEmployees + Math.floor(random() * Math.max(1, maxEmployees - minEmployees + 1)),
        revenue: (500_000 + Math.floor(random() * 30) * 250_000),
        description: `Sample prospect generated offline by the mock lead provider for the search: "${criteria.description}". Not a real company.`,
        linkedinUrl: `https://www.linkedin.com/company/${slug}`,
        phone: fictionalPhone(country, random),
        sourceUrl: null,
        contacts: [
          {
            firstName,
            lastName,
            jobTitle: pick(titles),
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
            phone: fictionalPhone(country, random),
            linkedinUrl: `https://www.linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${1000 + Math.floor(random() * 8999)}`,
          },
        ],
      });
    }

    return companies;
  }
}

const NAME_PARTS: Record<string, { prefixes: string[]; suffixes: string[] }> = {
  "Marketing & Advertising": {
    prefixes: ["Northline", "Brightpath", "Kestrel", "Vantage", "Loopline", "Harborlight"],
    suffixes: ["Media", "Marketing", "Digital", "Collective", "Studio"],
  },
  "Real Estate": {
    prefixes: ["Cedarpoint", "Summitline", "Coastline", "Ironwood", "Meridian"],
    suffixes: ["Realty", "Properties", "Estates", "Property Group"],
  },
  "Healthcare / Dental": {
    prefixes: ["Riverside", "Elmwood", "Clearview", "Parkside", "Whitfield"],
    suffixes: ["Dental", "Dental Care", "Orthodontics", "Smile Clinic"],
  },
  "Staffing & Recruiting": {
    prefixes: ["Talentbridge", "Kingsford", "Apexline", "Redwood", "Sterling"],
    suffixes: ["Recruitment", "Search", "Talent", "Staffing"],
  },
  "Construction & Home Services": {
    prefixes: ["Allstate", "Primeline", "Trueline", "Homestead", "Copperfield"],
    suffixes: ["Plumbing", "HVAC", "Roofing", "Home Services"],
  },
  default: {
    prefixes: ["Northline", "Brightpath", "Vantage", "Meridian", "Sterling", "Copperfield"],
    suffixes: ["Group", "Partners", "Solutions", "Company", "Works"],
  },
};

const CITIES: Record<string, string[]> = {
  "United States": ["Austin", "Chicago", "Denver", "Atlanta", "Seattle"],
  "United Kingdom": ["London", "Manchester", "Bristol", "Leeds"],
  Canada: ["Toronto", "Vancouver", "Calgary"],
  Australia: ["Sydney", "Melbourne", "Brisbane"],
  Germany: ["Berlin", "Munich", "Hamburg"],
  Spain: ["Madrid", "Barcelona", "Valencia"],
  Ireland: ["Dublin", "Cork"],
  "United Arab Emirates": ["Dubai", "Abu Dhabi"],
  default: ["Springfield", "Riverton", "Fairview"],
};

const FIRST_NAMES = ["James", "Maria", "Daniel", "Aisha", "Tom", "Priya", "Lucas", "Sofia", "Noah", "Amara"];
const LAST_NAMES = ["Whitfield", "Okafor", "Reyes", "Nakamura", "Bergman", "Sharma", "Kowalski", "Dubois"];

function inferIndustry(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("marketing") || lower.includes("agenc")) return "Marketing & Advertising";
  if (lower.includes("real estate") || lower.includes("realtor")) return "Real Estate";
  if (lower.includes("dental") || lower.includes("dentist")) return "Healthcare / Dental";
  if (lower.includes("recruit") || lower.includes("staffing")) return "Staffing & Recruiting";
  if (lower.includes("plumb") || lower.includes("hvac") || lower.includes("roof") || lower.includes("home service"))
    return "Construction & Home Services";
  return "default";
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function makeRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
