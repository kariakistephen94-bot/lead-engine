import { PageHeader } from "@/components/layout/PageHeader";
import { LeadsView } from "@/components/leads/LeadsView";
import { MAX_BULK_IDS } from "@/lib/constants";
import { listLeadIds, listLeads } from "@/lib/services/leads";
import { getLookups } from "@/lib/services/lookups";
import { formatNumber } from "@/lib/utils";
import { parseLeadQuery } from "@/lib/validation";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = parseLeadQuery(params);

  const [{ rows, total }, lookups, allMatchingIds] = await Promise.all([
    listLeads(query),
    getLookups(),
    // Backs "select all matching this filter" without shipping every row.
    listLeadIds(query, MAX_BULK_IDS),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description={`${formatNumber(total)} leads match the current view. This is the full prospecting database.`}
      />
      <LeadsView
        rows={rows}
        total={total}
        page={query.page}
        pageSize={query.pageSize}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        lookups={lookups}
        allMatchingIds={allMatchingIds}
      />
    </>
  );
}
