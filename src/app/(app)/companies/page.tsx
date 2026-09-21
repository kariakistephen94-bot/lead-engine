import { PageHeader } from "@/components/layout/PageHeader";
import { CompaniesView } from "@/components/companies/CompaniesView";
import { listCompanies, parseCompanyQuery } from "@/lib/services/companies";
import { getLookups } from "@/lib/services/lookups";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseCompanyQuery(await searchParams);
  const [{ rows, total }, lookups] = await Promise.all([listCompanies(query), getLookups()]);

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${formatNumber(total)} companies. One company can hold many contacts — the domain is the deduplication key.`}
      />
      <CompaniesView
        rows={rows}
        total={total}
        page={query.page}
        pageSize={query.pageSize}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        lookups={lookups}
      />
    </>
  );
}
