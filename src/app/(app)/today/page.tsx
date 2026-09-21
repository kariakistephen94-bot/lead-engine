import Link from "next/link";
import { eq } from "drizzle-orm";
import { CalendarClock, CheckCircle2, Handshake, Mail, MessageSquare, Sparkles, UserPlus } from "lucide-react";

import { StatCard } from "@/components/charts/StatCard";
import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { DailyTarget } from "@/components/today/DailyTarget";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { countQueuedResearch } from "@/lib/ai/research";
import { getTodayMetrics } from "@/lib/services/analytics";
import { listOpenFollowUps } from "@/lib/services/followups";
import { formatNumber, formatRelative } from "@/lib/utils";

export const metadata = { title: "Today's Prospecting" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const session = await requireUser();

  const [metrics, followUps, queued, [user]] = await Promise.all([
    getTodayMetrics(),
    listOpenFollowUps(50),
    countQueuedResearch(),
    db
      .select({ dailyTarget: users.dailyTarget })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1),
  ]);

  const dueNow = followUps.filter((f) => f.bucket !== "upcoming");

  return (
    <>
      <PageHeader
        title="Today's Prospecting"
        description={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      />

      <PageBody className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <DailyTarget added={metrics.added} target={user?.dailyTarget ?? 100} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <StatCard
              label="Added today"
              value={formatNumber(metrics.added)}
              tone="brand"
              href="/leads?sortBy=created_at&sortDir=desc"
              icon={<UserPlus className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Researched today"
              value={formatNumber(metrics.researched)}
              sub={queued > 0 ? `${formatNumber(queued)} still queued` : "Queue empty"}
              href="/prospect"
              icon={<Sparkles className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Contacted today"
              value={formatNumber(metrics.contacted)}
              href="/leads?lastContactedFrom=today"
              icon={<Mail className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Replies today"
              value={formatNumber(metrics.replies)}
              sub={`${formatNumber(metrics.positive)} positive`}
              tone={metrics.positive > 0 ? "positive" : "default"}
              href="/leads?statuses=replied,positive_reply"
              icon={<MessageSquare className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Meetings booked today"
              value={formatNumber(metrics.meetings)}
              href="/leads?statuses=meeting_booked"
              icon={<CalendarClock className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Deals won today"
              value={formatNumber(metrics.dealsWon)}
              tone={metrics.dealsWon > 0 ? "positive" : "default"}
              href="/deals"
              icon={<Handshake className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        <Card padded={false}>
          <div className="flex items-start justify-between gap-3 p-4">
            <CardHeader
              title="Work queue"
              description={
                dueNow.length === 0
                  ? "No follow-ups due — pick up new leads instead."
                  : `${formatNumber(metrics.followUpsOverdue)} overdue, ${formatNumber(metrics.followUpsDue)} due today.`
              }
            />
            <Link href="/follow-ups" className="text-xs font-medium text-brand hover:underline">
              All follow-ups
            </Link>
          </div>

          {dueNow.length === 0 ? (
            <div className="flex items-center gap-2 border-t border-line px-4 py-5 text-xs text-ink-soft">
              <CheckCircle2 className="h-4 w-4 text-positive" />
              Nothing is overdue or due today.
            </div>
          ) : (
            <ul className="border-t border-line">
              {dueNow.slice(0, 15).map((item) => (
                <li key={item.id} className="border-b border-line last:border-0">
                  <Link
                    href={`/leads/${item.contactId}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-canvas"
                  >
                    <span className="min-w-40 flex-1">
                      <span className="block text-sm font-medium text-ink">{item.companyName}</span>
                      <span className="block text-xs text-ink-soft">
                        {[item.fullName?.trim(), item.jobTitle].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {item.bucket === "overdue" ? (
                      <Badge tone="red">Overdue</Badge>
                    ) : (
                      <Badge tone="amber">Due today</Badge>
                    )}
                    <span className="tabular w-28 text-right text-xs text-ink-soft">
                      {formatRelative(item.dueAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
