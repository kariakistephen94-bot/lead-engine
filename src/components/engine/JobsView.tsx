"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Mail, MapPin, Search } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { useQueryState } from "@/hooks/useQueryState";
import { cn, formatDateUTC, formatNumber } from "@/lib/utils";

export type JobRow = {
  id: string; source: string; url: string; title: string;
  companyName: string | null; companyId: string | null; location: string | null;
  remote: boolean; salary: string | null; contactEmail: string | null;
  keywords: string[]; bucket: string; score: number | null;
  postedAt: string | Date | null; status: string; notes: string | null;
};

/** The application pipeline, in the order work actually moves. */
const STATUSES = ["new", "shortlisted", "applied", "interviewing", "offer", "rejected", "archived"] as const;
const STATUS_TONE: Record<string, "slate" | "blue" | "amber" | "green" | "red"> = {
  new: "slate", shortlisted: "blue", applied: "amber",
  interviewing: "amber", offer: "green", rejected: "red", archived: "slate",
};

export function JobsView({
  rows, total, page, pageSize, sources, counts,
}: {
  rows: JobRow[]; total: number; page: number; pageSize: number;
  sources: string[]; counts: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const { setParam } = useQueryState();
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast("Could not update", "error"); return; }
      toast(status === "applied" ? "Marked as applied" : `Moved to ${status}`);
      router.refresh();
    } catch { toast("Could not update", "error"); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            defaultValue={params.get("q") ?? ""}
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value || null); }}
            placeholder="Search title, company, description…"
            className="h-8 w-full rounded-md border border-line bg-canvas pl-8 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
          />
        </div>
        <Select className="w-auto" value={params.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value || null)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s} {counts[s] ? `(${counts[s]})` : ""}</option>
          ))}
        </Select>
        <Select className="w-auto" value={params.get("source") ?? ""} onChange={(e) => setParam("source", e.target.value || null)}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select className="w-auto" value={params.get("minScore") ?? ""} onChange={(e) => setParam("minScore", e.target.value || null)}>
          <option value="">Any relevance</option>
          <option value="40">Strong match (40+)</option>
          <option value="60">Very strong (60+)</option>
        </Select>
        <span className="ml-auto text-xs text-ink-faint">{formatNumber(total)} opportunities</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing matches yet"
          description="Run the engine from the Lead Engine page, or widen the filters."
        />
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((job) => (
            <li key={job.id} className="border-b border-line px-4 py-3 hover:bg-canvas/60 sm:px-6">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                       className="text-sm font-medium text-ink hover:text-brand hover:underline">
                      {job.title}
                      <ExternalLink className="ml-1 inline h-3 w-3 text-ink-faint" />
                    </a>
                    {job.score != null && (
                      <span className={cn("tabular rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        job.score >= 60 ? "bg-positive/10 text-positive"
                        : job.score >= 40 ? "bg-warning/10 text-warning" : "bg-muted text-ink-faint")}>
                        {job.score}
                      </span>
                    )}
                    <Badge tone={STATUS_TONE[job.status] ?? "slate"}>{job.status}</Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                    {job.companyName && <span className="font-medium text-ink-soft">{job.companyName}</span>}
                    {job.location && <span><MapPin className="mr-0.5 inline h-3 w-3" />{job.location}</span>}
                    {job.remote && <Badge tone="blue">Remote</Badge>}
                    {job.salary && <span className="tabular">{job.salary}</span>}
                    <span className="text-ink-faint">{job.source}</span>
                    {job.postedAt && <span className="text-ink-faint">{formatDateUTC(job.postedAt)}</span>}
                    {job.contactEmail && (
                      <a href={`mailto:${job.contactEmail}`} className="text-brand hover:underline">
                        <Mail className="mr-0.5 inline h-3 w-3" />{job.contactEmail}
                      </a>
                    )}
                  </p>
                  {job.keywords.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {job.keywords.slice(0, 6).map((k) => (
                        <span key={k} className="rounded bg-brand/8 px-1.5 py-0.5 text-[11px] text-brand">{k}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Select
                    className="h-7 w-auto text-xs"
                    value={job.status}
                    disabled={busy === job.id}
                    onChange={(e) => setStatus(job.id, e.target.value)}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <a href={job.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="primary">Apply</Button>
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        label="opportunities"
        onPageChange={(next) => setParam("page", String(next), { resetPage: false })}
        onPageSizeChange={(size) => setParam("pageSize", String(size))}
      />
    </div>
  );
}
