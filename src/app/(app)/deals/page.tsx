import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { DealsView } from "@/components/deals/DealsView";
import { getDealMetrics } from "@/lib/services/analytics";
import { listDealTargets, listDeals } from "@/lib/services/deals";

export const metadata = { title: "Deals" };
export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const [deals, metrics, targets] = await Promise.all([
    listDeals(),
    getDealMetrics(),
    listDealTargets(),
  ]);

  return (
    <>
      <PageHeader
        title="Deals"
        description="Qualified opportunities and their value. Deal revenue is what powers the revenue column in niche and source analytics."
      />
      <PageBody>
        <DealsView deals={deals} metrics={metrics} targets={targets} />
      </PageBody>
    </>
  );
}
