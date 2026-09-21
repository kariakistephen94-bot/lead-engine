import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LeadBucket } from "@/db/schema";
import { listOpportunities } from "@/lib/services/lead-engine";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Website opportunities" };
export const dynamic = "force-dynamic";

const TITLES: Record<string, { title: string; description: string }> = {
  needs_you: {
    title: "Businesses that need you",
    description: "No ad pixel found, but their own website shows concrete gaps. Ranked by how much is missing.",
  },
  spending_money: {
    title: "Businesses spending money",
    description: "An advertising pixel on their own site — first-party proof of a budget. The gaps below cost them paid traffic.",
  },
};

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const { bucket } = await searchParams;
  const meta = TITLES[bucket ?? ""] ?? {
    title: "Website opportunities",
    description: "Ranked by how many capabilities are missing from the company's own site.",
  };
  const rows = await listOpportunities(bucket as LeadBucket | undefined, 200);

  return (
    <>
      <PageHeader title={meta.title} description={meta.description} />
      <PageBody className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState
            title="No sites scanned yet"
            description="Run “Scan websites” on the Lead Engine page to qualify your companies."
          />
        ) : (
          rows.map((r) => (
            <Card key={r.companyId} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/companies/${r.companyId}`} className="text-sm font-medium text-ink hover:text-brand hover:underline">
                    {r.name}
                  </Link>
                  {r.industry && <Badge tone="slate">{r.industry}</Badge>}
                  {(r.adPlatforms ?? []).length > 0 && <Badge tone="green">Running ads</Badge>}
                  {r.cms && <span className="text-[11px] text-ink-faint">{r.cms}</span>}
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {[r.city, r.country].filter(Boolean).join(", ")}
                  {r.website && (
                    <>
                      {" · "}
                      <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </>
                  )}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {((r.opportunities ?? []) as string[]).map((o) => (
                    <li key={o} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-ink-soft">{o}</li>
                  ))}
                </ul>
                {socialHandles(r.social).length > 0 && (
                  <p className="mt-1.5 text-[11px] text-ink-faint">
                    Socials to review: {socialHandles(r.social).join(" · ")}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] tracking-wide text-ink-faint uppercase">Opportunity</p>
                <p className="tabular text-2xl font-semibold text-ink">{formatNumber(r.score ?? 0)}</p>
              </div>
            </Card>
          ))
        )}
      </PageBody>
    </>
  );
}

/** `social` is jsonb, so it arrives untyped — normalise before rendering. */
function socialHandles(social: unknown): string[] {
  if (!social || typeof social !== "object") return [];
  return Object.entries(social as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && v)
    .map(([k, v]) => `${k}/${String(v)}`);
}
