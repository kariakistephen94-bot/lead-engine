import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Handshake,
  MessageSquare,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { BarList } from "@/components/charts/BarList";
import { seriesColor } from "@/components/charts/palette";
import { StatCard } from "@/components/charts/StatCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/constants";
import { listRecentActivity } from "@/lib/services/activities";
import {
  getDailyTrend,
  getDashboardMetrics,
  getLeadsByStatus,
  getNichePerformance,
  getSourcePerformance,
} from "@/lib/services/analytics";
import { formatCompact, formatCurrency, formatNumber, formatPercent, formatRelative, rate, toTitleCase } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [metrics, byStatus, trend, niches, sources, recent] = await Promise.all([
    getDashboardMetrics(),
    getLeadsByStatus(),
    getDailyTrend(30),
    getNichePerformance(),
    getSourcePerformance(),
    listRecentActivity(10),
  ]);

  const statusItems = byStatus
    .sort((a, b) => b.count - a.count)
    .map((s, i) => ({ label: STATUS_LABEL[s.status], value: s.count, color: seriesColor(i) }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything moving through your outbound operation right now."
        actions={
          <Link
            href="/today"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            <Target className="h-3.5 w-3.5 text-ink-faint" />
            Today&apos;s prospecting
            <ArrowRight className="h-3 w-3 text-ink-faint" />
          </Link>
        }
      />

      <PageBody className="space-y-5">
        {metrics.totalLeads === 0 ? (
          <Card>
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="Your database is empty"
              description="Add a lead with Quick add, import a CSV, or generate prospects with the Find Leads engine. Metrics here stay at zero until real leads exist — nothing on this page is simulated."
              action={
                <div className="flex gap-2">
                  <Link
                    href="/import"
                    className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-muted"
                  >
                    Import CSV
                  </Link>
                  <Link
                    href="/prospect"
                    className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-ink"
                  >
                    Find leads
                  </Link>
                </div>
              }
            />
          </Card>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total leads"
            value={formatNumber(metrics.totalLeads)}
            sub={`${formatNumber(metrics.totalCompanies)} companies`}
            href="/leads"
            icon={<Users className="h-3.5 w-3.5" />}
          />
          <StatCard
            label="New today"
            value={formatNumber(metrics.newToday)}
            sub={`${formatNumber(metrics.contactedToday)} contacted today`}
            tone="brand"
            href="/today"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
          <StatCard
            label="Positive replies"
            value={formatNumber(metrics.positive)}
            sub={`${formatPercent(rate(metrics.positive, metrics.contacted))} of contacted`}
            tone="positive"
            href="/leads?statuses=positive_reply"
            icon={<MessageSquare className="h-3.5 w-3.5" />}
          />
          <StatCard
            label="Meetings booked"
            value={formatNumber(metrics.meetings)}
            sub={`${formatNumber(metrics.proposals)} proposals sent`}
            href="/leads?statuses=meeting_booked"
            icon={<CalendarClock className="h-3.5 w-3.5" />}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Open pipeline"
            value={formatCurrency(metrics.openPipelineValue)}
            sub={`${formatNumber(metrics.openDeals)} open deals`}
            href="/deals"
            icon={<Handshake className="h-3.5 w-3.5" />}
          />
          <StatCard
            label="Won revenue"
            value={formatCurrency(metrics.wonRevenue)}
            sub={`${formatNumber(metrics.wonDeals)} deals won`}
            tone="positive"
            href="/deals"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
          />
          <StatCard
            label="Follow-ups due"
            value={formatNumber(metrics.followUpsDue)}
            sub={
              metrics.followUpsOverdue > 0
                ? `${formatNumber(metrics.followUpsOverdue)} overdue`
                : "Nothing overdue"
            }
            tone={metrics.followUpsOverdue > 0 ? "danger" : "default"}
            href="/follow-ups"
            icon={<CalendarClock className="h-3.5 w-3.5" />}
          />
          <StatCard
            label="Contact rate"
            value={formatPercent(rate(metrics.contacted, metrics.totalLeads))}
            sub={`${formatNumber(metrics.contacted)} of ${formatNumber(metrics.totalLeads)} leads`}
            href="/analytics"
            icon={<Target className="h-3.5 w-3.5" />}
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Leads added vs contacted"
              description="Last 30 days"
              action={
                <Link href="/analytics" className="text-xs font-medium text-brand hover:underline">
                  Analytics
                </Link>
              }
            />
            <div className="mt-3">
              <TrendChart
                data={trend}
                series={[
                  { key: "added", label: "Added", color: "#2563eb" },
                  { key: "contacted", label: "Contacted", color: "#16a34a" },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Pipeline by status" description="Active leads only" />
            <div className="mt-3">
              <BarList items={statusItems} valueFormatter={formatNumber} />
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader
              title="Leads by niche"
              action={
                <Link href="/niches" className="text-xs font-medium text-brand hover:underline">
                  Manage
                </Link>
              }
            />
            <div className="mt-3">
              <BarList
                items={niches.slice(0, 8).map((n, i) => ({
                  label: n.name,
                  value: n.leads,
                  color: n.color ?? seriesColor(i),
                }))}
                valueFormatter={formatNumber}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Leads by source" description="Where your leads come from" />
            <div className="mt-3">
              <BarList
                items={sources.slice(0, 8).map((s, i) => ({
                  label: s.name,
                  value: s.leads,
                  color: seriesColor(i + 3),
                }))}
                valueFormatter={formatNumber}
              />
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-4">
              <CardHeader title="Recent activity" />
            </div>
            {recent.length === 0 ? (
              <p className="px-4 pb-5 text-xs text-ink-faint">No activity recorded yet.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {recent.map((item) => (
                  <li key={item.id} className="px-4 py-2">
                    <Link
                      href={item.contactId ? `/leads/${item.contactId}` : "/leads"}
                      className="block"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-ink">
                          {item.subject ?? toTitleCase(item.type)}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-faint">
                          {formatRelative(item.occurredAt)}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink-faint">{toTitleCase(item.type)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card padded={false}>
          <div className="p-4">
            <CardHeader
              title="Conversion by niche"
              description="Contact rate through to closed revenue"
              action={
                <Link href="/analytics" className="text-xs font-medium text-brand hover:underline">
                  Full analytics
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-y border-line bg-canvas text-[11px] tracking-wide text-ink-faint uppercase">
                  <th className="px-4 py-2 text-left font-semibold">Niche</th>
                  <th className="px-3 py-2 text-right font-semibold">Leads</th>
                  <th className="px-3 py-2 text-right font-semibold">Contacted</th>
                  <th className="px-3 py-2 text-right font-semibold">Reply rate</th>
                  <th className="px-3 py-2 text-right font-semibold">Positive</th>
                  <th className="px-3 py-2 text-right font-semibold">Meetings</th>
                  <th className="px-4 py-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {niches.map((n) => (
                  <tr key={n.id ?? "none"} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: n.color ?? "var(--color-ink-faint)" }}
                        />
                        <span className="font-medium text-ink">{n.name}</span>
                      </span>
                    </td>
                    <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(n.leads)}</td>
                    <td className="tabular px-3 py-2 text-right text-ink-soft">
                      {formatPercent(rate(n.contacted, n.leads))}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-ink-soft">
                      {formatPercent(rate(n.replied, n.contacted))}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(n.positive)}</td>
                    <td className="tabular px-3 py-2 text-right text-ink-soft">{formatNumber(n.meetings)}</td>
                    <td className="tabular px-4 py-2 text-right font-medium text-ink">
                      {n.revenue > 0 ? formatCurrency(n.revenue) : "—"}
                    </td>
                  </tr>
                ))}
                {niches.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-xs text-ink-faint">
                      No niches with leads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-[11px] text-ink-faint">
          Showing {formatCompact(metrics.totalLeads)} leads.{" "}
          {metrics.researchQueued > 0 && (
            <>
              <Badge tone={STATUS_TONE.new}>{metrics.researchQueued} queued for AI research</Badge>{" "}
            </>
          )}
          All figures are read live from the database.
        </p>
      </PageBody>
    </>
  );
}
