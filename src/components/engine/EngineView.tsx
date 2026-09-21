"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle, Building2, Globe, MessageSquareText, Play, Radar, Rss, Search, Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDateUTC, formatNumber } from "@/lib/utils";

type Source = { name: string; label: string; bucket: string; origin: string; configured: boolean };
type Blocked = { name: string; bucket: string; reason: string; alternative: string };
type Stats = {
  buckets: Record<string, number>;
  statuses: Record<string, number>;
  sources: { source: string; count: number; best: number }[];
  signals: { scanned: number; reachable: number; spending: number; noChat: number; noBooking: number; noVideo: number };
  runs: { id: string; source: string; found: number; inserted: number; status: string; startedAt: string }[];
};

/** The five buckets, in the priority order of the plan. */
const BUCKETS = [
  { key: "active_buyer", n: 1, title: "Active buyers", icon: Rss,
    blurb: "Already hiring — fastest to convert because the decision to spend is made.", href: "/jobs?bucket=active_buyer" },
  { key: "needs_you", n: 2, title: "Businesses that need you", icon: Building2,
    blurb: "Not advertising, but the website shows obvious gaps: no chat, no booking, no video.", href: "/engine/opportunities?bucket=needs_you" },
  { key: "spending_money", n: 3, title: "Businesses spending money", icon: Wallet,
    blurb: "An ad pixel on their own site proves a budget. Same gaps, more valuable.", href: "/engine/opportunities?bucket=spending_money" },
  { key: "community", n: 4, title: "Communities", icon: MessageSquareText,
    blurb: "Forums and groups. Mostly hands-on — answer questions, build trust, don't broadcast.", href: "/jobs?bucket=community" },
  { key: "social_listening", n: 5, title: "Social listening", icon: Radar,
    blurb: "Search for pain, not for clients. People describing a manual, slow process in public.", href: "/jobs?bucket=social_listening" },
] as const;

export function EngineView({
  stats, sources, blocked, signalCounts,
}: {
  stats: Stats;
  sources: Source[];
  blocked: Blocked[];
  signalCounts: { needs_you: number; spending_money: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  async function run(source?: string) {
    setRunning(source ?? "all");
    try {
      const res = await fetch("/api/engine/scrape", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, limit: 600 }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Scrape failed", "error"); return; }
      const added = (data.results ?? []).reduce((s: number, r: { inserted: number }) => s + r.inserted, 0);
      toast(`${formatNumber(added)} new opportunities`);
      router.refresh();
    } catch { toast("Scrape failed", "error"); }
    finally { setRunning(null); }
  }

  async function scan() {
    setScanning(true);
    try {
      const res = await fetch("/api/engine/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Scan failed", "error"); return; }
      toast(`Scanned ${data.scanned} sites — ${data.spending} are running ads`);
      router.refresh();
    } catch { toast("Scan failed", "error"); }
    finally { setScanning(false); }
  }

  const bucketCount = (key: string) =>
    key === "needs_you" ? signalCounts.needs_you
    : key === "spending_money" ? signalCounts.spending_money
    : stats.buckets[key] ?? 0;

  return (
    <div className="space-y-4">
      {/* The five buckets */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BUCKETS.map((b) => {
          const Icon = b.icon;
          const n = bucketCount(b.key);
          return (
            <Card key={b.key} className="flex flex-col">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-ink-soft">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold text-ink-faint">{b.n}</span>
                    <h3 className="truncate text-sm font-semibold text-ink">{b.title}</h3>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{b.blurb}</p>
                </div>
                <span className={cn("tabular shrink-0 text-lg font-semibold", n ? "text-ink" : "text-ink-faint")}>
                  {formatNumber(n)}
                </span>
              </div>
              <div className="mt-3 flex justify-end">
                <Link href={b.href}>
                  <Button size="sm" disabled={!n}>Open</Button>
                </Link>
              </div>
            </Card>
          );
        })}

        <Card className="flex flex-col justify-between">
          <CardHeader title="Run the engine" description="Scrape every working source, then qualify company websites." />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => run()} disabled={running !== null}>
              {running === "all" ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Play className="h-3.5 w-3.5" />}
              {running === "all" ? "Scraping…" : "Scrape all sources"}
            </Button>
            <Button onClick={scan} disabled={scanning}>
              {scanning ? <Spinner className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
              {scanning ? "Scanning…" : "Scan websites"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Or run it on a schedule: <code className="font-mono">npm run scrape</code>
          </p>
        </Card>
      </div>

      {/* Website qualification results */}
      <Card>
        <CardHeader
          title="Website signals"
          description="What the scan found on companies' own sites. An ad pixel is first-party proof of budget."
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Sites scanned" value={stats.signals.scanned} />
          <Stat label="Readable" value={stats.signals.reachable} />
          <Stat label="Running ads" value={stats.signals.spending} tone="text-positive" />
          <Stat label="No live chat" value={stats.signals.noChat} tone="text-warning" />
          <Stat label="No booking" value={stats.signals.noBooking} tone="text-warning" />
        </div>
      </Card>

      {/* Sources */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4"><CardHeader title="Working sources" description="Official APIs and public feeds only — nothing that needs a bot workaround." /></div>
          <ul className="border-t border-line">
            {sources.map((s) => {
              const found = stats.sources.find((x) => x.source === s.name)?.count ?? 0;
              return (
                <li key={s.name} className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{s.label}</span>
                      <Badge tone="slate">{s.bucket.replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-ink-faint">{s.origin}</p>
                  </div>
                  <span className="tabular shrink-0 text-sm text-ink-soft">{formatNumber(found)}</span>
                  <Button size="sm" onClick={() => run(s.name)} disabled={running !== null}>
                    {running === s.name ? <Spinner className="h-3 w-3" /> : <Search className="h-3 w-3" />}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card padded={false}>
          <div className="p-4">
            <CardHeader
              title="Not scraped — and why"
              description="These are in the plan but cannot be automated safely or legally. The alternative for each is listed."
            />
          </div>
          <ul className="border-t border-line">
            {blocked.map((b) => (
              <li key={b.name} className="border-b border-line px-4 py-2.5 last:border-0">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{b.name}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{b.reason}</p>
                    <p className="mt-1 text-xs text-brand">→ {b.alternative}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {stats.runs.length > 0 && (
        <Card>
          <SectionTitle>Recent runs</SectionTitle>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <tbody>
                {stats.runs.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-4 font-medium text-ink">{r.source}</td>
                    <td className="tabular py-1.5 pr-4 text-ink-soft">found {r.found}</td>
                    <td className="tabular py-1.5 pr-4 text-positive">+{r.inserted}</td>
                    <td className="py-1.5 pr-4">
                      <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                    </td>
                    <td className="py-1.5 text-ink-faint">{formatDateUTC(r.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-md border border-line bg-canvas px-3 py-2">
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p className={cn("tabular mt-0.5 text-lg font-semibold", tone ?? "text-ink")}>{formatNumber(Number(value))}</p>
    </div>
  );
}
