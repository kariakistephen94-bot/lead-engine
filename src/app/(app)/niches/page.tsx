import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { NichesView } from "@/components/niches/NichesView";
import { listNichesWithStats } from "@/lib/services/niches";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Niches" };
export const dynamic = "force-dynamic";

export default async function NichesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const niches = await listNichesWithStats(archived === "true");
  const totalLeads = niches.reduce((sum, n) => sum + n.leadCount, 0);

  return (
    <>
      <PageHeader
        title="Niches"
        description={`${niches.length} niches covering ${formatNumber(totalLeads)} leads. Add as many as you need — the schema is fully dynamic.`}
      />
      <PageBody>
        <NichesView niches={niches} />
      </PageBody>
    </>
  );
}
