import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { OutreachView } from "@/components/outreach/OutreachView";
import { getAIProvider } from "@/lib/ai";
import { getAccountCapacity } from "@/lib/services/email-accounts";
import { getOutreachStats, listMessages, listSendableContacts } from "@/lib/services/outreach";

export const metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const [capacity, candidates, messages, stats] = await Promise.all([
    getAccountCapacity(),
    listSendableContacts(150),
    listMessages({ limit: 60 }),
    getOutreachStats(),
  ]);

  const accounts = capacity.map((c) => ({
    id: c.account.id, label: c.account.label, domain: c.account.domain,
    fromEmail: c.account.fromEmail, cap: c.effectiveCap, dailyCap: c.account.dailyCap,
    sentToday: c.sentToday, remaining: c.remaining, configured: c.configured,
    warmup: c.account.warmupEnabled && c.effectiveCap < c.account.dailyCap,
    blockedReason: c.blockedReason,
  }));

  return (
    <>
      <PageHeader
        title="Outreach"
        description="Write from what the scan actually found, review it, then send at a pace your domains can carry."
      />
      <PageBody>
        <OutreachView
          accounts={accounts}
          candidates={JSON.parse(JSON.stringify(candidates))}
          messages={JSON.parse(JSON.stringify(messages))}
          stats={stats}
          providerName={getAIProvider().name}
          senderConfigured={Boolean(process.env.SENDER_NAME && process.env.SENDER_POSTAL_ADDRESS)}
        />
      </PageBody>
    </>
  );
}
