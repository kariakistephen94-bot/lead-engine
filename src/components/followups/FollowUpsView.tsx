"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CalendarClock } from "lucide-react";

import { Badge, ScorePill } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/constants";
import type { FollowUpItem } from "@/lib/services/followups";
import type { LeadStatus } from "@/db/schema";
import { cn, formatDate, formatNumber, formatRelative, toTitleCase } from "@/lib/utils";

const SECTIONS = [
  { bucket: "overdue" as const, title: "Overdue", tone: "danger" as const },
  { bucket: "today" as const, title: "Due today", tone: "warning" as const },
  { bucket: "upcoming" as const, title: "Upcoming", tone: "default" as const },
];

export function FollowUpsView({ items }: { items: FollowUpItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  async function complete(item: FollowUpItem) {
    setCompleting((current) => new Set(current).add(item.id));
    try {
      const response = await fetch(`/api/follow-ups/${item.id}`, { method: "PATCH" });
      if (!response.ok) {
        toast("Could not complete the follow-up", "error");
        return;
      }
      toast(`Follow-up for ${item.companyName} completed`);
      router.refresh();
    } catch {
      toast("Network error", "error");
    } finally {
      setCompleting((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="Nothing to follow up"
          description="Schedule follow-ups from any lead's detail page. Overdue and due-today items appear here automatically."
          action={
            <Link
              href="/leads"
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-ink"
            >
              Go to leads
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => {
        const sectionItems = items.filter((item) => item.bucket === section.bucket);
        if (!sectionItems.length) return null;

        return (
          <Card key={section.bucket} padded={false}>
            <div className="p-4">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {section.title}
                    <span
                      className={cn(
                        "tabular rounded-full px-2 py-0.5 text-xs",
                        section.tone === "danger" && "bg-danger-soft text-danger",
                        section.tone === "warning" && "bg-warning-soft text-warning",
                        section.tone === "default" && "bg-muted text-ink-soft",
                      )}
                    >
                      {formatNumber(sectionItems.length)}
                    </span>
                  </span>
                }
              />
            </div>

            <ul className="border-t border-line">
              {sectionItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-canvas"
                >
                  <button
                    onClick={() => complete(item)}
                    disabled={completing.has(item.id)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong text-transparent transition-colors hover:border-positive hover:text-positive disabled:opacity-40"
                    aria-label={`Complete follow-up for ${item.companyName}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>

                  <div className="min-w-40 flex-1">
                    <Link href={`/leads/${item.contactId}`} className="block">
                      <span className="text-sm font-medium text-ink hover:text-brand">
                        {item.companyName}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {[item.fullName?.trim(), item.jobTitle].filter(Boolean).join(" · ") ||
                          item.email ||
                          "No contact"}
                      </span>
                    </Link>
                  </div>

                  {item.nicheName && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: item.nicheColor ?? "var(--color-ink-faint)" }}
                      />
                      {item.nicheName}
                    </span>
                  )}

                  <ScorePill score={item.leadScore} />

                  <Badge tone={STATUS_TONE[item.status as LeadStatus]} dot>
                    {STATUS_LABEL[item.status as LeadStatus]}
                  </Badge>

                  <span className="text-xs text-ink-soft">{toTitleCase(item.type)}</span>

                  {item.priority === "high" && <Badge tone="red">High</Badge>}

                  <span
                    className={cn(
                      "tabular w-32 text-right text-xs",
                      item.bucket === "overdue" ? "font-medium text-danger" : "text-ink-soft",
                    )}
                  >
                    {formatDate(item.dueAt)}
                    <span className="block text-[11px] text-ink-faint">
                      {formatRelative(item.dueAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
