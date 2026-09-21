import { PageHeader } from "@/components/layout/PageHeader";
import { JobsView } from "@/components/engine/JobsView";
import { getEngineStats, listJobPostings } from "@/lib/services/lead-engine";
import type { LeadBucket } from "@/db/schema";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const page = Number(p.page ?? 1);
  const pageSize = Math.min(Number(p.pageSize ?? 50), 200);

  const [{ rows, total }, stats] = await Promise.all([
    listJobPostings({
      bucket: p.bucket as LeadBucket | undefined,
      status: p.status, source: p.source, q: p.q,
      minScore: p.minScore ? Number(p.minScore) : undefined,
      page, pageSize,
    }),
    getEngineStats(),
  ]);

  return (
    <>
      <PageHeader
        title="Opportunities"
        description={`${formatNumber(total)} scraped postings and signals. Move one to "applied" and the date is stamped for you.`}
      />
      <JobsView
        rows={JSON.parse(JSON.stringify(rows))}
        total={total}
        page={page}
        pageSize={pageSize}
        sources={stats.sources.map((s) => s.source)}
        counts={stats.statuses}
      />
    </>
  );
}
