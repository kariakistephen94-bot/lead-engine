import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { FollowUpsView } from "@/components/followups/FollowUpsView";
import { listOpenFollowUps } from "@/lib/services/followups";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Follow-ups" };
export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const items = await listOpenFollowUps();
  const overdue = items.filter((i) => i.bucket === "overdue").length;
  const today = items.filter((i) => i.bucket === "today").length;

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description={
          items.length === 0
            ? "Nothing outstanding."
            : `${formatNumber(overdue)} overdue, ${formatNumber(today)} due today, ${formatNumber(items.length - overdue - today)} upcoming.`
        }
      />
      <PageBody>
        <FollowUpsView items={items} />
      </PageBody>
    </>
  );
}
