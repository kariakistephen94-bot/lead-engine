import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { EngineView } from "@/components/engine/EngineView";
import { BLOCKED_SOURCES, SCRAPERS } from "@/lib/scrapers";
import { getEngineStats } from "@/lib/services/lead-engine";
import { db } from "@/db";
import { companySignals } from "@/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";

export const metadata = { title: "Lead Engine" };
export const dynamic = "force-dynamic";

export default async function EnginePage() {
  const [stats, needsYou, spending] = await Promise.all([
    getEngineStats(),
    db.select({ n: count() }).from(companySignals)
      .where(and(isNull(companySignals.error), eq(companySignals.suggestedBucket, "needs_you"))),
    db.select({ n: count() }).from(companySignals)
      .where(and(isNull(companySignals.error), eq(companySignals.suggestedBucket, "spending_money"))),
  ]);

  return (
    <>
      <PageHeader
        title="Lead Engine"
        description="Five buckets, sourced from official APIs and public feeds. Every source is named, and the ones that cannot be automated say why."
      />
      <PageBody>
        <EngineView
          stats={JSON.parse(JSON.stringify(stats))}
          sources={SCRAPERS.map((s) => ({
            name: s.name, label: s.label, bucket: s.bucket,
            origin: s.origin, configured: s.isConfigured(),
          }))}
          blocked={BLOCKED_SOURCES}
          signalCounts={{
            needs_you: Number(needsYou[0]?.n ?? 0),
            spending_money: Number(spending[0]?.n ?? 0),
          }}
        />
      </PageBody>
    </>
  );
}
