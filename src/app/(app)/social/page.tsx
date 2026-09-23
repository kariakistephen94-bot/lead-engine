import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { SocialDmView } from "@/components/social/SocialDmView";
import { getAIProvider } from "@/lib/ai";
import { getDmStats, listDmDrafts, listDmProspects } from "@/lib/services/dm";

export const metadata = { title: "Social DMs" };
export const dynamic = "force-dynamic";

export default async function SocialDmPage() {
  const [prospects, drafts, stats] = await Promise.all([
    listDmProspects(200),
    listDmDrafts(undefined, 200),
    getDmStats(),
  ]);

  return (
    <>
      <PageHeader
        title="Social DMs"
        description="Leads whose own sites link an Instagram, LinkedIn or X account, plus leads found posting on X. The writer turns the evidence into a two-message opener you send by hand."
      />
      <PageBody>
        <SocialDmView
          prospects={JSON.parse(JSON.stringify(prospects))}
          drafts={JSON.parse(JSON.stringify(drafts))}
          stats={stats}
          providerName={getAIProvider().name}
        />
      </PageBody>
    </>
  );
}
