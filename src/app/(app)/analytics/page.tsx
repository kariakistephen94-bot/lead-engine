import Link from "next/link";

import { BarList } from "@/components/charts/BarList";
import { seriesColor } from "@/components/charts/palette";
import { StatCard } from "@/components/charts/StatCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { DEAL_STAGE_LABEL } from "@/lib/constants";
import {
  getDailyTrend,
  getDashboardMetrics,
  getDealMetrics,
  getNichePerformance,
  getSourcePerformance,
  type SegmentPerformance,
} from "@/lib/services/analytics";
import { formatCurrency, formatNumber, formatPercent, rate } from "@/lib/utils";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [metrics, niches, sources, deals, trend] = await Promise.all([
    getDashboardMetrics(),
    getNichePerformance(),
    getSourcePerformance(),
    getDealMetrics(),
    getDailyTrend(60),
  ]);

  const funnel = [
    { label: "Total leads", value: metrics.totalLeads },
    { label: "Contacted", value: metrics.contacted },
    { label: "Replied", value: metrics.replied },
    { label: "Positive reply", value: metrics.positive },
    { label: "Meeting booked", value: metrics.meetings },
    { label: "Proposal sent", value: metrics.proposals },
    { label: "Won", value: metrics.wonDeals },
  ];

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Which niches and which lead sources actually produce clients."
      />

      <PageBody className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total leads" value={formatNumber(metrics.totalLeads)} />
          <StatCard
            label="Contact rate"
            value={formatPercent(rate(metrics.contacted, metrics.totalLeads))}
            sub={`${formatNumber(metrics.contacted)} contacted`}
          />
          <StatCard
            label="Reply rate"
            value={formatPercent(rate(metrics.replied, metrics.contacted))}
            sub={`${formatNumber(metrics.replied)} replies`}
          />
          <StatCard
            label="Meeting rate"
            value={formatPercent(rate(metrics.meetings, metrics.contacted))}
            sub={`${formatNumber(metrics.meetings)} meetings`}
            tone="positive"
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Leads added vs contacted" description="Last 60 days" />
            <div className="mt-3">
              <TrendChart
                data={trend}
                height={220}
                series={[
                  { key: "added", label: "Added", color: "#2563eb" },
                  { key: "contacted", label: "Contacted", color: "#16a34a" },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Outbound funnel" description="Whole database, all time" />
            <div className="mt-3">
              <BarList
                items={funnel.map((step, i) => ({
                  label: step.label,
                  value: step.value,
                  color: seriesColor(i),
                }))}
                valueFormatter={formatNumber}
              />
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Deal pipeline by stage" />
            <div className="mt-3">
              <BarList
                items={deals.byStage.map((stage, i) => ({
                  label: DEAL_STAGE_LABEL[stage.stage],
                  value: stage.value,
                  color: seriesColor(i),
                }))}
                valueFormatter={(v) => formatCurrency(v)}
                emptyLabel="No deals yet"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <Metric label="Pipeline value" value={formatCurrency(deals.pipelineValue)} />
              <Metric label="Weighted" value={formatCurrency(deals.weightedValue)} />
              <Metric label="Average deal" value={formatCurrency(deals.averageDealSize)} />
              <Metric label="Win rate" value={formatPercent(deals.winRate)} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Won revenue by niche" />
            <div className="mt-3">
              <BarList
                items={niches
                  .filter((n) => n.revenue > 0)
                  .map((n, i) => ({
                    label: n.name,
                    value: n.revenue,
                    color: n.color ?? seriesColor(i),
                  }))}
                valueFormatter={(v) => formatCurrency(v)}
                emptyLabel="No won deals yet"
              />
            </div>
          </Card>
        </div>

        <SegmentTable
          title="Performance by niche"
          description="Compare your niches side by side."
          rows={niches}
          linkFor={(row) => (row.id ? `/leads?nicheIds=${row.id}` : "/leads?nicheIds=none")}
        />

        <SegmentTable
          title="Performance by lead source"
          description="Which sources deserve more of your time and budget."
          rows={sources}
          linkFor={(row) => (row.id ? `/leads?sourceIds=${row.id}` : "/leads")}
        />
      </PageBody>
    </>
  );
}

function SegmentTable({
  title,
  description,
  rows,
  linkFor,
}: {
  title: string;
  description: string;
  rows: SegmentPerformance[];
  linkFor: (row: SegmentPerformance) => string;
}) {
  return (
    <Card padded={false}>
      <div className="p-4">
        <CardHeader title={title} description={description} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-y border-line bg-canvas text-[11px] tracking-wide text-ink-faint uppercase">
              <th className="px-4 py-2 text-left font-semibold">Segment</th>
              <th className="px-3 py-2 text-right font-semibold">Leads</th>
              <th className="px-3 py-2 text-right font-semibold">Contacted</th>
              <th className="px-3 py-2 text-right font-semibold">Contact rate</th>
              <th className="px-3 py-2 text-right font-semibold">Replies</th>
              <th className="px-3 py-2 text-right font-semibold">Reply rate</th>
              <th className="px-3 py-2 text-right font-semibold">Positive</th>
              <th className="px-3 py-2 text-right font-semibold">Meetings</th>
              <th className="px-3 py-2 text-right font-semibold">Meeting rate</th>
              <th className="px-3 py-2 text-right font-semibold">Won</th>
              <th className="px-4 py-2 text-right font-semibold">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id ?? row.name} className="border-b border-line last:border-0 hover:bg-canvas">
                <td className="px-4 py-2">
                  <Link href={linkFor(row)} className="flex items-center gap-2 hover:text-brand">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: row.color ?? "var(--color-ink-faint)" }}
                    />
                    <span className="font-medium text-ink">{row.name}</span>
                  </Link>
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(row.leads)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">
                  {formatNumber(row.contacted)}
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">
                  {formatPercent(rate(row.contacted, row.leads))}
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(row.replied)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">
                  {formatPercent(rate(row.replied, row.contacted))}
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(row.positive)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(row.meetings)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">
                  {formatPercent(rate(row.meetings, row.contacted))}
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(row.won)}</td>
                <td className="tabular px-4 py-2 text-right font-medium text-ink">
                  {row.revenue > 0 ? formatCurrency(row.revenue) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-xs text-ink-faint">
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p className="tabular text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
