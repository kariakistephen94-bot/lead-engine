import "server-only";

import { getLeadProvider } from "@/lib/integrations";
import type { ProspectCompany, ProspectSearch } from "@/lib/integrations/types";
import { createImport, finishImport, processChunk, type MappedRow } from "@/lib/services/import";
import { getSourceIdBySlug } from "@/lib/services/lookups";

export type ProspectSearchResult = {
  provider: string;
  live: boolean;
  companies: ProspectCompany[];
};

/**
 * Run a prospect search against the configured provider.
 *
 * Nothing is written here — searching is read-only, and the caller decides
 * which results become leads. That separation is what lets the UI show a
 * reviewable result list instead of dumping every hit into the database.
 */
export async function searchProspects(criteria: ProspectSearch): Promise<ProspectSearchResult> {
  const provider = getLeadProvider();
  const companies = await provider.search(criteria);
  return { provider: provider.name, live: provider.name !== "mock", companies };
}

export type SaveProspectsResult = {
  importId: string;
  imported: number;
  duplicates: number;
  invalid: number;
  merged: number;
  samples: { rowNumber: number; status: string; reason: string }[];
};

/**
 * Persist chosen search results as leads.
 *
 * Deliberately routed through the CSV import pipeline rather than inserting
 * directly: a sourced prospect and an imported row need exactly the same
 * duplicate detection, blank-filling merge and activity trail. Reusing it also
 * means a prospecting run shows up in import history with a real audit record
 * of what was written.
 */
export async function saveProspects(input: {
  description: string;
  companies: ProspectCompany[];
  nicheId: string | null;
  userId: string | null;
}): Promise<SaveProspectsResult> {
  const provider = getLeadProvider();
  const sourceId = await getSourceIdBySlug(provider.sourceSlug);

  const rows = toMappedRows(input.companies);

  const importId = await createImport({
    // Named, not a filename — import history shows where the batch came from.
    filename: `${provider.name} search: ${input.description}`.slice(0, 200),
    totalRows: rows.length,
    mapping: { source: "prospect-search", provider: provider.name },
    nicheId: input.nicheId,
    sourceId,
    userId: input.userId,
  });

  const result = await processChunk(importId, rows, {
    nicheId: input.nicheId,
    sourceId,
    userId: input.userId,
  });

  await finishImport(importId);

  return { importId, ...result };
}

/**
 * Flatten provider results into import rows.
 *
 * A company with several contacts becomes one row per contact — the import
 * pipeline is contact-shaped, and `upsertCompany` dedupes the shared company by
 * domain, so the company is written once regardless.
 */
function toMappedRows(companies: ProspectCompany[]): MappedRow[] {
  const rows: MappedRow[] = [];

  for (const company of companies) {
    // A company with no contacts is not yet a lead; skip rather than write a
    // half-record the pipeline would reject anyway.
    for (const contact of company.contacts.length ? company.contacts : []) {
      rows.push({
        rowNumber: rows.length + 1,
        data: clean({
          companyName: company.name,
          website: company.website,
          industry: company.industry,
          location: company.location,
          city: company.city,
          country: company.country,
          employeeCount: company.employeeCount,
          revenue: company.revenue,
          companyDescription: company.description,
          companyLinkedin: company.linkedinUrl,
          companyPhone: company.phone,
          sourceUrl: company.sourceUrl,
          firstName: contact.firstName,
          lastName: contact.lastName,
          jobTitle: contact.jobTitle,
          email: contact.email,
          phone: contact.phone,
          linkedinUrl: contact.linkedinUrl,
        }),
      });
    }
  }

  return rows;
}

/** The import pipeline reads `Record<string, string>`; drop empties. */
function clean(input: Record<string, string | number | null | undefined>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined || value === "") continue;
    output[key] = String(value);
  }
  return output;
}
