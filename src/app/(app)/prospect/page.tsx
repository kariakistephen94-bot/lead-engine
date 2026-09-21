import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { ProspectView } from "@/components/prospect/ProspectView";
import { describeLeadProvider } from "@/lib/integrations";
import { getLookups } from "@/lib/services/lookups";

export const metadata = { title: "Find Leads" };
export const dynamic = "force-dynamic";

export default async function ProspectPage() {
  const [lookups, provider] = await Promise.all([
    getLookups(),
    Promise.resolve(describeLeadProvider()),
  ]);

  return (
    <>
      <PageHeader
        title="Find leads"
        description="Search a lead provider for companies matching your niche, review what comes back, then save the ones you want. Duplicates are caught before anything is written."
      />
      <PageBody>
        <ProspectView lookups={lookups} provider={provider} />
      </PageBody>
    </>
  );
}
