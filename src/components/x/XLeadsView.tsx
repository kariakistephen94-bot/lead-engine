"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle, AtSign, Check, ExternalLink, Pencil, Play, Plug, Plus, RefreshCw,
  Search, Sparkles, Trash2, UserPlus, Users, X as XIcon,
} from "lucide-react";

import { Badge, ScorePill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useQueryState } from "@/hooks/useQueryState";
import { cn, formatDateTime, formatNumber, formatRelative } from "@/lib/utils";

type Status = {
  client: "x-api" | "mock";
  connected: boolean;
  backoffUntil: string | null;
  readsThisMonth: number;
  monthlyBudget: number | null;
  autorun: boolean;
  autorunIntervalSeconds: number;
  aiProvider: string;
  classifyError: { message: string; at: string } | null;
  costPerRead: number;
  config: { businessDescription: string; minRelevance: number };
};

type Stats = {
  authors: Partial<Record<string, number>>;
  posts: { total: number; pending: number; today: number; withIntent: number };
};

type SearchRow = {
  id: string; name: string; query: string; nicheId: string | null; nicheName: string | null;
  enabled: boolean; autoConvert: boolean; intervalMinutes: number; maxPostsPerRun: number;
  nextRunAt: string; lastRunAt: string | null; lastStatus: string | null; lastError: string | null;
  postsFound: number; leadsFound: number; running: boolean;
};

type AuthorRow = {
  id: string; username: string; name: string | null; bio: string | null; location: string | null;
  website: string | null; followers: number | null; verified: boolean | null;
  bestScore: number | null; bestIntent: string | null; matchedPosts: number; status: string;
  contactId: string | null; lastSeenAt: string; nicheName: string | null;
  postText: string | null; postUrl: string | null; postReason: string | null; postedAt: string | null;
};

type PostRow = {
  id: string; text: string; url: string; relevance: number | null; intent: string | null;
  reason: string | null; classifiedBy: string | null; postedAt: string | null; discoveredAt: string;
  username: string; searchName: string | null;
};

type Niche = { id: string; name: string };

const INTENT_TONE: Record<string, "green" | "blue" | "indigo" | "slate" | "red" | "amber"> = {
  buyer: "green", pain: "blue", hiring: "indigo", peer: "slate", seller: "red", noise: "slate",
};
const INTENT_LABEL: Record<string, string> = {
  buyer: "asking to buy", pain: "describing pain", hiring: "hiring", peer: "bystander", seller: "vendor", noise: "noise",
};
const STATUS_TONE: Record<string, "slate" | "blue" | "green" | "red"> = {
  new: "slate", qualified: "blue", converted: "green", dismissed: "red",
};
const RUN_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  ok: { label: "ok", tone: "green" },
  rate_limited: { label: "paused by X", tone: "amber" },
  budget: { label: "budget reached", tone: "amber" },
  not_configured: { label: "X not connected", tone: "red" },
  error: { label: "failed", tone: "red" },
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = data.issues ? Object.values(data.issues).flat().join("; ") : "";
    throw new Error([data.error ?? `Request failed (${res.status})`, issues].filter(Boolean).join(": "));
  }
  return data;
}

export function XLeadsView({
  status, stats, searches, authors, authorTotal, page, pageSize, posts, niches,
}: {
  status: Status;
  stats: Stats;
  searches: SearchRow[];
  authors: AuthorRow[];
  authorTotal: number;
  page: number;
  pageSize: number;
  posts: PostRow[];
  niches: Niche[];
}) {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const { setParam } = useQueryState();
  const tab = (params.get("tab") as "leads" | "searches" | "posts" | "settings" | null) ?? "leads";
  const [busy, setBusy] = useState<string | null>(null);

  async function act<T>(key: string, fn: () => Promise<T>, done?: (r: T) => string | null) {
    setBusy(key);
    try {
      const result = await fn();
      const message = done?.(result);
      if (message) toast(message);
      router.refresh();
      return result;
    } catch (error) {
      toast((error as Error).message, "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const runNow = () => act("run", () => send("/api/x/run", "POST"), (r: {
    searches: { newPosts: number; status: string; error?: string }[];
    classify: { classified: number; qualified: number; converted: number; error?: string };
  }) => {
    const fresh = r.searches.reduce((s, x) => s + x.newPosts, 0);
    const problem = r.searches.find((s) => s.status !== "ok")?.error ?? r.classify.error;
    if (!r.searches.length && !r.classify.classified) return problem ?? "Nothing due — every search ran recently";
    return `${r.searches.length} searches, ${formatNumber(fresh)} new posts, ${formatNumber(r.classify.qualified)} new qualified leads` +
      (problem ? ` — ${problem}` : "");
  });

  const qualified = stats.authors.qualified ?? 0;
  const spend = status.readsThisMonth * status.costPerRead;

  return (
    <div className="space-y-4">
      <ConnectionCard status={status} busy={busy} act={act} onRun={runNow} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="To review" value={formatNumber(qualified)} tone={qualified ? "text-brand" : undefined} big />
        <Stat label="Added to CRM" value={formatNumber(stats.authors.converted ?? 0)} tone="text-positive" />
        <Stat label="Posts, last 24h" value={formatNumber(stats.posts.today)} />
        <Stat label="Waiting to be scored" value={formatNumber(stats.posts.pending)} />
        <Stat
          label="X reads this month"
          value={`${formatNumber(status.readsThisMonth)}${status.monthlyBudget ? ` / ${formatNumber(status.monthlyBudget)}` : ""}`}
          hint={`≈ $${spend.toFixed(2)} at $${status.costPerRead}/post`}
        />
      </div>

      <Tabs
        value={tab}
        onChange={(value) => setParam("tab", value === "leads" ? null : value)}
        tabs={[
          { value: "leads", label: "Leads", count: authorTotal },
          { value: "searches", label: "Searches", count: searches.length },
          { value: "posts", label: "All posts", count: stats.posts.total },
          { value: "settings", label: "Scoring" },
        ]}
      />

      {tab === "leads" && (
        <LeadsTab
          authors={authors} total={authorTotal} page={page} pageSize={pageSize}
          niches={niches} minRelevance={status.config.minRelevance}
          busy={busy} act={act} hasSearches={searches.length > 0}
        />
      )}
      {tab === "searches" && <SearchesTab searches={searches} niches={niches} busy={busy} act={act} status={status} />}
      {tab === "posts" && <PostsTab posts={posts} />}
      {tab === "settings" && <SettingsTab status={status} busy={busy} act={act} />}
    </div>
  );
}

type Act = <T>(key: string, fn: () => Promise<T>, done?: (r: T) => string | null) => Promise<T | null>;

/* -------------------------------------------------------------------------- */
/* Connection                                                                 */
/* -------------------------------------------------------------------------- */

function ConnectionCard({ status, busy, act, onRun }: { status: Status; busy: string | null; act: Act; onRun: () => void }) {
  const [usage, setUsage] = useState<{ projectCap: number | null; projectUsage: number | null; capResetDay: number | null } | null>(null);

  const test = () => act("test", () => send("/api/x/connection", "POST"), (r: {
    ok: boolean; usage?: { projectCap: number | null; projectUsage: number | null; capResetDay: number | null };
  }) => {
    if (r.usage) setUsage(r.usage);
    return "Connected to the X API";
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-surface">
            <AtSign className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">X connection</h2>
              {status.client === "mock"
                ? <Badge tone="amber" dot>mock data (X_PROVIDER=mock)</Badge>
                : status.connected
                  ? <Badge tone="green" dot>API token set</Badge>
                  : <Badge tone="red" dot>not connected</Badge>}
              <Badge tone={status.autorun ? "blue" : "slate"}>
                {status.autorun ? `runs automatically every ${status.autorunIntervalSeconds}s` : "automatic runs off"}
              </Badge>
              <Badge tone={status.aiProvider === "mock" ? "amber" : "slate"}>
                scoring: {status.aiProvider === "mock" ? "rules only" : status.aiProvider}
              </Badge>
            </div>
            {!status.connected ? (
              <div className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-soft">
                <p>
                  Create an app at <a className="text-brand hover:underline" href="https://developer.x.com" target="_blank" rel="noreferrer">developer.x.com</a>,
                  buy API credits (X charges per post read), copy the app&apos;s <strong className="text-ink">Bearer Token</strong>, then add to <code className="font-mono">.env.local</code> and restart:
                </p>
                <pre className="rounded border border-line bg-canvas px-2.5 py-1.5 font-mono text-[11px] text-ink">X_BEARER_TOKEN=…{"\n"}X_AUTORUN=true</pre>
              </div>
            ) : (
              <p className="mt-1 text-xs text-ink-soft">
                Searches go through X&apos;s official API — nothing is scraped. {status.autorun
                  ? "The scheduler runs inside the app; add workers with npm run x:worker for more throughput."
                  : <>Set <code className="font-mono">X_AUTORUN=true</code> to run searches automatically, or run <code className="font-mono">npm run x:worker</code>.</>}
              </p>
            )}
            {usage && (
              <p className="mt-1 text-xs text-ink-soft">
                X project usage: <strong className="text-ink tabular">{formatNumber(usage.projectUsage ?? 0)}</strong>
                {usage.projectCap != null && <> of {formatNumber(usage.projectCap)}</>} posts this billing cycle
                {usage.capResetDay != null && <> · resets on day {usage.capResetDay}</>}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={test} disabled={busy !== null || !status.connected}>
            {busy === "test" ? <Spinner className="h-3 w-3" /> : <Plug className="h-3 w-3" />} Test connection
          </Button>
          <Button size="sm" variant="primary" onClick={onRun} disabled={busy !== null || !status.connected}>
            {busy === "run" ? <Spinner className="h-3 w-3 text-white" /> : <Play className="h-3 w-3" />}
            {busy === "run" ? "Running…" : "Run due searches now"}
          </Button>
        </div>
      </div>

      {status.backoffUntil && (
        <Notice tone="warning">
          X asked the engine to slow down, or the credit balance is empty. Searches resume automatically after{" "}
          <strong className="text-ink">{formatDateTime(status.backoffUntil)}</strong>.
        </Notice>
      )}
      {status.classifyError && (
        <Notice tone="danger">
          The AI classifier failed {formatRelative(status.classifyError.at)}: <span className="font-mono">{status.classifyError.message}</span>.
          Posts wait in the queue and are retried; after four failed attempts the built-in rules score them instead.
          Check the API key for <code className="font-mono">AI_PROVIDER={status.aiProvider}</code> in <code className="font-mono">.env.local</code>.
        </Notice>
      )}
      {status.monthlyBudget && status.readsThisMonth >= status.monthlyBudget && (
        <Notice tone="warning">
          This month&apos;s read budget ({formatNumber(status.monthlyBudget)} posts) is used up, so searches are paused until the 1st.
          Raise <code className="font-mono">X_MONTHLY_READ_BUDGET</code> in <code className="font-mono">.env.local</code> to continue.
        </Notice>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Leads                                                                      */
/* -------------------------------------------------------------------------- */

function LeadsTab({
  authors, total, page, pageSize, niches, minRelevance, busy, act, hasSearches,
}: {
  authors: AuthorRow[]; total: number; page: number; pageSize: number; niches: Niche[];
  minRelevance: number; busy: string | null; act: Act; hasSearches: boolean;
}) {
  const params = useSearchParams();
  const { setParam } = useQueryState();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const actionable = authors.filter((a) => a.status !== "converted");

  const bulk = (ids: string[], action: "convert" | "dismiss" | "restore") =>
    act(`${action}:${ids.length === 1 ? ids[0] : "bulk"}`, () => send("/api/x/authors", "POST", { ids, action }), (r: {
      converted?: number; skipped?: { reason: string }[]; affected?: number;
    }) => {
      setSelected(new Set());
      if (action === "convert") {
        const skipped = r.skipped?.length ? `, ${r.skipped.length} skipped (${r.skipped[0].reason.toLowerCase()})` : "";
        return `${formatNumber(r.converted ?? 0)} added to the CRM${skipped}`;
      }
      return action === "dismiss" ? `${r.affected} dismissed` : `${r.affected} restored to the review queue`;
    });

  const statusValue = params.get("status") ?? "qualified";

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            defaultValue={params.get("q") ?? ""}
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value || null); }}
            placeholder="Search name, @handle, bio…"
            className="h-8 w-full rounded-md border border-line bg-canvas pl-8 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
          />
        </div>
        <Select className="w-auto" value={statusValue} onChange={(e) => setParam("status", e.target.value === "qualified" ? null : e.target.value)}>
          <option value="qualified">To review (qualified)</option>
          <option value="new">Below threshold</option>
          <option value="converted">Added to CRM</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </Select>
        <Select className="w-auto" value={params.get("intent") ?? ""} onChange={(e) => setParam("intent", e.target.value || null)}>
          <option value="">Any intent</option>
          {Object.entries(INTENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select className="w-auto" value={params.get("niche") ?? ""} onChange={(e) => setParam("niche", e.target.value || null)}>
          <option value="">All niches</option>
          {niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </Select>
        <Select className="w-auto" value={params.get("minScore") ?? ""} onChange={(e) => setParam("minScore", e.target.value || null)}>
          <option value="">Any score</option>
          <option value="60">60+</option>
          <option value="75">75+</option>
          <option value="90">90+</option>
        </Select>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-ink-soft">{selected.size} selected</span>
            <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => bulk([...selected], "convert")}>
              <UserPlus className="h-3 w-3" /> Add to CRM
            </Button>
            <Button size="sm" disabled={busy !== null} onClick={() => bulk([...selected], "dismiss")}>
              <XIcon className="h-3 w-3" /> Dismiss
            </Button>
          </div>
        )}
      </div>

      {authors.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={statusValue === "qualified" ? "No leads waiting for review" : "Nothing matches"}
          description={hasSearches
            ? `Authors appear here once one of their posts scores ${minRelevance}+ against your business. Runs happen on each search's schedule, or use "Run due searches now".`
            : "Start on the Searches tab: generate searches from your niches, or write your own."}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-line bg-canvas/50 px-4 py-1.5 text-[11px] text-ink-faint">
            <input
              type="checkbox" aria-label="Select all on this page" className="h-3.5 w-3.5 accent-brand"
              checked={actionable.length > 0 && actionable.every((a) => selected.has(a.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(actionable.map((a) => a.id)) : new Set())}
            />
            Select page
          </div>
          <ul>
            {authors.map((a) => {
              const on = selected.has(a.id);
              return (
                <li key={a.id} className={cn("flex gap-3 border-b border-line px-4 py-3 last:border-0", on && "bg-brand/4")}>
                  <input
                    type="checkbox" checked={on} disabled={a.status === "converted"}
                    aria-label={`Select @${a.username}`} className="mt-1 h-3.5 w-3.5 shrink-0 accent-brand"
                    onChange={() => setSelected((s) => {
                      const next = new Set(s);
                      if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                      return next;
                    })}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`https://x.com/${a.username}`} target="_blank" rel="noreferrer"
                         className="text-sm font-medium text-ink hover:text-brand hover:underline">
                        {a.name || `@${a.username}`}
                      </a>
                      <span className="text-xs text-ink-faint">@{a.username}</span>
                      <ScorePill score={a.bestScore} />
                      {a.bestIntent && <Badge tone={INTENT_TONE[a.bestIntent] ?? "slate"}>{INTENT_LABEL[a.bestIntent] ?? a.bestIntent}</Badge>}
                      {a.nicheName && <Badge tone="slate">{a.nicheName}</Badge>}
                      <Badge tone={STATUS_TONE[a.status] ?? "slate"}>{a.status === "converted" ? "in CRM" : a.status}</Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                      {a.followers != null && <span className="tabular">{formatNumber(a.followers)} followers</span>}
                      {a.location && <span>{a.location}</span>}
                      {a.website && (
                        <a href={a.website} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                          {a.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      )}
                      {a.matchedPosts > 1 && <span>{a.matchedPosts} matching posts</span>}
                      <span>seen {formatRelative(a.lastSeenAt)}</span>
                    </p>
                    {a.bio && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{a.bio}</p>}
                    {a.postText && (
                      <blockquote className="mt-2 rounded border-l-2 border-brand/40 bg-canvas px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap text-ink">
                        {a.postText}
                        {a.postUrl && (
                          <a href={a.postUrl} target="_blank" rel="noreferrer"
                             className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-brand hover:underline">
                            view post <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </blockquote>
                    )}
                    {a.postReason && <p className="mt-1 text-[11px] text-ink-faint">Why: {a.postReason}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {a.status === "converted" && a.contactId ? (
                      <Link href={`/leads/${a.contactId}`}><Button size="sm">Open lead</Button></Link>
                    ) : (
                      <>
                        <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => bulk([a.id], "convert")}>
                          {busy === `convert:${a.id}` ? <Spinner className="h-3 w-3 text-white" /> : <UserPlus className="h-3 w-3" />} Add to CRM
                        </Button>
                        {a.status === "dismissed" ? (
                          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => bulk([a.id], "restore")}>Restore</Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => bulk([a.id], "dismiss")}>Dismiss</Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page} pageSize={pageSize} total={total} label="authors"
            onPageChange={(p) => setParam("page", p === 1 ? null : p, { resetPage: false })}
            onPageSizeChange={(s) => setParam("pageSize", s)}
          />
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Searches                                                                   */
/* -------------------------------------------------------------------------- */

type Draft = {
  id?: string; name: string; query: string; nicheId: string;
  intervalMinutes: number; maxPostsPerRun: number; autoConvert: boolean; enabled: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "", query: "", nicheId: "", intervalMinutes: 60, maxPostsPerRun: 100, autoConvert: false, enabled: true,
};

function SearchesTab({ searches, niches, busy, act, status }: {
  searches: SearchRow[]; niches: Niche[]; busy: string | null; act: Act; status: Status;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<SearchRow | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name, query: draft.query, nicheId: draft.nicheId || null,
      intervalMinutes: draft.intervalMinutes, maxPostsPerRun: draft.maxPostsPerRun,
      autoConvert: draft.autoConvert, enabled: draft.enabled,
    };
    const ok = await act("save", () => draft.id
      ? send(`/api/x/searches/${draft.id}`, "PATCH", body)
      : send("/api/x/searches", "POST", body), () => (draft.id ? "Search updated" : "Search created"));
    if (ok) setDraft(null);
  };

  const toggle = (s: SearchRow, patch: Partial<Pick<SearchRow, "enabled" | "autoConvert">>) =>
    act(`toggle:${s.id}`, () => send(`/api/x/searches/${s.id}`, "PATCH", patch), () => null);

  const runOne = (s: SearchRow) => act(`run:${s.id}`, () => send(`/api/x/searches/${s.id}`, "POST"),
    (r: { status: string; read: number; newPosts: number; error?: string }) =>
      r.status === "ok"
        ? `${s.name}: read ${r.read} posts, ${r.newPosts} new — scoring runs next`
        : `${s.name}: ${RUN_STATUS[r.status]?.label ?? r.status}${r.error ? ` — ${r.error}` : ""}`);

  // Rough worst case, so the cost of a schedule is visible before it runs.
  const monthlyCeiling = searches
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + (30 * 24 * 60 / s.intervalMinutes) * s.maxPostsPerRun, 0);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardHeader
            title="Saved searches"
            description="Each runs on its own schedule and only asks X for posts newer than the last run, so you never pay twice for the same post."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setGenerateOpen(true)} disabled={busy !== null || !niches.length}>
              <Sparkles className="h-3 w-3" /> Generate from my niches
            </Button>
            <Button size="sm" variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })} disabled={busy !== null}>
              <Plus className="h-3 w-3" /> New search
            </Button>
          </div>
        </div>
        {searches.some((s) => s.enabled) && (
          <p className="mt-2 text-[11px] text-ink-faint">
            Worst case if every enabled search filled its per-run cap every run:{" "}
            <span className="tabular">{formatNumber(Math.round(monthlyCeiling))}</span> reads/month
            (≈ ${(monthlyCeiling * status.costPerRead).toFixed(0)}). Real usage is far lower — only new matching posts are read —
            and the monthly budget{status.monthlyBudget ? ` of ${formatNumber(status.monthlyBudget)} reads` : ""} stops everything at the cap.
          </p>
        )}
      </Card>

      {searches.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No searches yet"
            description="Generate a starter set from your niches — three per niche, written for how owners in that niche actually describe the problem — then review and tune them here."
          />
        </Card>
      ) : (
        <Card padded={false}>
          <ul>
            {searches.map((s) => {
              const run = s.lastStatus ? RUN_STATUS[s.lastStatus] : null;
              return (
                <li key={s.id} className={cn("border-b border-line px-4 py-3 last:border-0", !s.enabled && "opacity-60")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{s.name}</span>
                        {s.nicheName && <Badge tone="slate">{s.nicheName}</Badge>}
                        {!s.enabled && <Badge tone="slate">paused</Badge>}
                        {s.autoConvert && <Badge tone="indigo">auto-adds to CRM</Badge>}
                        {s.running && <Badge tone="blue" dot>running</Badge>}
                        {run && <Badge tone={run.tone}>{run.label}</Badge>}
                      </div>
                      <code className="mt-1 block font-mono text-[11px] leading-relaxed break-words text-ink-soft">{s.query}</code>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                        <span>every {s.intervalMinutes >= 60 ? `${+(s.intervalMinutes / 60).toFixed(1)}h` : `${s.intervalMinutes}m`}</span>
                        <span>up to {s.maxPostsPerRun} posts/run</span>
                        <span className="tabular">{formatNumber(s.postsFound)} posts · {formatNumber(s.leadsFound)} leads</span>
                        <span>last run {s.lastRunAt ? formatRelative(s.lastRunAt) : "never"}</span>
                        {s.enabled && <span>next {formatRelative(s.nextRunAt)}</span>}
                      </p>
                      {s.lastError && <p className="mt-1 text-[11px] text-danger">{s.lastError}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                        <input type="checkbox" className="h-3.5 w-3.5 accent-brand" checked={s.enabled}
                               disabled={busy !== null} onChange={(e) => toggle(s, { enabled: e.target.checked })} />
                        On
                      </label>
                      <Button size="sm" disabled={busy !== null || s.running || !status.connected} onClick={() => runOne(s)}>
                        {busy === `run:${s.id}` ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />} Run
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} disabled={busy !== null}
                              onClick={() => setDraft({
                                id: s.id, name: s.name, query: s.query, nicheId: s.nicheId ?? "",
                                intervalMinutes: s.intervalMinutes, maxPostsPerRun: s.maxPostsPerRun,
                                autoConvert: s.autoConvert, enabled: s.enabled,
                              })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} disabled={busy !== null}
                              onClick={() => setDeleting(s)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit search" : "New search"}
        footer={
          <>
            <Button onClick={() => setDraft(null)} disabled={busy === "save"}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy === "save" || !draft?.name.trim() || !draft?.query.trim()}>
              {busy === "save" ? "Saving…" : draft?.id ? "Save" : "Create search"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-3">
            <Field label="Name" required>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Dentists asking about no-shows" />
            </Field>
            <Field label={`X search query — ${draft.query.length}/512`} required
                   hint='Space = AND, OR in capitals, "exact phrase", -exclude. End with -is:retweet lang:en.'>
              <Textarea rows={4} className="font-mono text-xs" value={draft.query}
                        onChange={(e) => setDraft({ ...draft, query: e.target.value })}
                        placeholder={'("my practice" OR "our clinic") ("no-shows" OR "missed calls") -is:retweet lang:en'} />
            </Field>
            {draft.id && <p className="text-[11px] text-ink-faint">Changing the query restarts it from the last 3 days.</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Niche">
                <Select value={draft.nicheId} onChange={(e) => setDraft({ ...draft, nicheId: e.target.value })}>
                  <option value="">None</option>
                  {niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </Select>
              </Field>
              <Field label="Run every">
                <Select value={draft.intervalMinutes} onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) })}>
                  {[15, 30, 60, 120, 240, 360, 720, 1440].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} minutes` : m === 60 ? "hour" : m === 1440 ? "day" : `${m / 60} hours`}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Max posts per run" hint={`≈ $${(draft.maxPostsPerRun * status.costPerRead).toFixed(2)} at most per run`}>
                <Input type="number" min={10} max={1000} step={10} value={draft.maxPostsPerRun}
                       onChange={(e) => setDraft({ ...draft, maxPostsPerRun: Number(e.target.value) })} />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-brand" checked={draft.autoConvert}
                     onChange={(e) => setDraft({ ...draft, autoConvert: e.target.checked })} />
              <span>
                <strong className="text-ink">Add qualified leads to the CRM automatically.</strong> Off means they wait on the
                Leads tab for you to approve — safer while a query is new.
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" className="h-3.5 w-3.5 accent-brand" checked={draft.enabled}
                     onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              Enabled
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete search?"
        message={`"${deleting?.name}" stops running. Posts and leads it already found are kept.`}
        confirmLabel="Delete"
        destructive
        busy={busy === "delete"}
        onConfirm={async () => {
          if (!deleting) return;
          await act("delete", () => send(`/api/x/searches/${deleting.id}`, "DELETE"), () => "Search deleted");
          setDeleting(null);
        }}
      />

      <ConfirmDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate searches from your niches?"
        message={`Writes three searches for each of your ${niches.length} active niches${status.aiProvider !== "mock" ? ` with ${status.aiProvider}` : " from templates"}. They are created paused, so you can review and switch on the ones you want before any X credits are spent.`}
        confirmLabel="Generate"
        busy={busy === "generate"}
        onConfirm={async () => {
          await act("generate", () => send("/api/x/searches/generate", "POST", { enabled: false }),
            (r: { created: number; writer: string; errors: string[] }) =>
              `${r.created} searches created (paused)${r.errors.length ? ` — AI unavailable, used templates: ${r.errors[0]}` : ""}`);
          setGenerateOpen(false);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                      */
/* -------------------------------------------------------------------------- */

function PostsTab({ posts }: { posts: PostRow[] }) {
  return (
    <Card padded={false}>
      <div className="p-4">
        <CardHeader
          title="Every post the searches returned"
          description="Newest first, including the rejected ones. If a search mostly returns vendors or bystanders, tighten its query."
        />
      </div>
      {posts.length === 0 ? (
        <EmptyState title="No posts yet" description="Posts appear here after the first search run." />
      ) : (
        <ul className="border-t border-line">
          {posts.map((p) => (
            <li key={p.id} className="border-b border-line px-4 py-2.5 last:border-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <ScorePill score={p.relevance} />
                {p.intent
                  ? <Badge tone={INTENT_TONE[p.intent] ?? "slate"}>{INTENT_LABEL[p.intent] ?? p.intent}</Badge>
                  : <Badge tone="slate">waiting to be scored</Badge>}
                <a href={`https://x.com/${p.username}`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">@{p.username}</a>
                {p.searchName && <span className="text-ink-faint">via {p.searchName}</span>}
                <span className="text-ink-faint">{formatRelative(p.postedAt ?? p.discoveredAt)}</span>
                {p.classifiedBy && <span className="text-ink-faint">· scored by {p.classifiedBy}</span>}
                <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-0.5 text-brand hover:underline">
                  view <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-ink">{p.text}</p>
              {p.reason && <p className="mt-0.5 text-[11px] text-ink-faint">{p.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Scoring settings                                                           */
/* -------------------------------------------------------------------------- */

function SettingsTab({ status, busy, act }: { status: Status; busy: string | null; act: Act }) {
  const [description, setDescription] = useState(status.config.businessDescription);
  const [minRelevance, setMinRelevance] = useState(status.config.minRelevance);
  const dirty = description !== status.config.businessDescription || minRelevance !== status.config.minRelevance;

  return (
    <Card>
      <CardHeader
        title="How posts are scored"
        description="Every post is judged against this description plus your niches (their target market, pain points and offer). Edit niches on the Niches page."
      />
      <div className="mt-3 space-y-3">
        <Field label="What your business sells, and to whom" hint="Specific beats broad: name the outcomes you deliver and who pays for them.">
          <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Qualify authors scoring at least" hint="60 is a sensible start. Raise it if the review queue fills with weak matches; lower it if good people are missed.">
          <Input type="number" min={0} max={100} className="w-28" value={minRelevance}
                 onChange={(e) => setMinRelevance(Number(e.target.value))} />
        </Field>
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={!dirty || busy !== null}
                  onClick={() => act("config", () => send("/api/x/config", "PUT", { businessDescription: description, minRelevance }),
                    () => "Scoring settings saved — they apply to posts scored from now on")}>
            {busy === "config" ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Check className="h-3.5 w-3.5" />} Save
          </Button>
          {status.aiProvider === "mock" && (
            <span className="text-[11px] text-ink-faint">
              No AI provider is configured, so the built-in rules score posts. They are cruder than a model.
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function Notice({ tone, children }: { tone: "warning" | "danger"; children: React.ReactNode }) {
  return (
    <div className={cn(
      "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs text-ink-soft",
      tone === "warning" ? "border-warning/30 bg-warning/5" : "border-danger/30 bg-danger/5",
    )}>
      <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone === "warning" ? "text-warning" : "text-danger")} />
      <p>{children}</p>
    </div>
  );
}

function Stat({ label, value, tone, big, hint }: { label: string; value: string; tone?: string; big?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5 shadow-xs">
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p className={cn("tabular mt-0.5 font-semibold", big ? "text-2xl" : "text-lg", tone ?? "text-ink")}>{value}</p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
