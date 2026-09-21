import { PageHeader } from "@/components/layout/PageHeader";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { getLookups } from "@/lib/services/lookups";
import { getPipeline } from "@/lib/services/pipeline";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ nicheIds?: string }>;
}) {
  const { nicheIds } = await searchParams;
  const selected = (nicheIds ?? "").split(",").filter(Boolean);

  const [columns, lookups] = await Promise.all([getPipeline(selected), getLookups()]);
  const total = columns.reduce((sum, column) => sum + column.total, 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${formatNumber(total)} active leads. Drag a card to move it between stages — the change is saved immediately.`}
      />
      <PipelineBoard columns={columns} lookups={lookups} />
    </>
  );
}
