"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AtSign, BarChart3, Briefcase, Camera, Check, Copy, ExternalLink, Hash,
  MonitorPlay, Music, Send, Sparkles, Users,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type Platform = "twitter" | "linkedin" | "contra" | "tiktok" | "youtube" | "instagram";

type Post = {
  id: string; ideaId: string; platform: Platform; format: string;
  angle: string; premise: string | null; basisUsed: string[];
  generatedBy: string | null;
  projectId: string | null; projectTitle: string | null; projectNumber: number | null;
  variant: number; label: string | null; hook: string; body: string;
  cta: string | null; hashtags: string[]; charCount: number; limit: number;
  status: "draft" | "approved" | "scheduled" | "posted" | "archived";
  scheduledFor: string | null; postedAt: string | null; postUrl: string | null;
  impressions: number | null; likes: number | null; comments: number | null;
  shares: number | null; profileClicks: number | null;
  createdAt: string;
};

type Project = { id: string; number: number; title: string; status: string };

type Stats = {
  drafts: number; approved: number; scheduled: number; posted: number;
  byPlatform: { platform: Platform; posted: number; drafts: number }[];
  byAngle: { label: string; posted: number; avgImpressions: number | null }[];
};

/** lucide dropped the brand marks, so platforms get evocative stand-ins. */
const X = AtSign;
const LinkedIn = Users;
const Instagram = Camera;
const TikTok = Music;
const YouTube = MonitorPlay;
const Contra = Briefcase;

const PLATFORMS: { value: Platform; label: string; icon: React.ElementType; note: string }[] = [
  { value: "twitter", label: "X", icon: X, note: "3 takes · 280 chars" },
  { value: "linkedin", label: "LinkedIn", icon: LinkedIn, note: "3 takes · story" },
  { value: "instagram", label: "Instagram", icon: Instagram, note: "3 hooks + captions" },
  { value: "tiktok", label: "TikTok", icon: TikTok, note: "3 hooks + captions" },
  { value: "youtube", label: "YouTube", icon: YouTube, note: "3 titles + descriptions" },
  { value: "contra", label: "Contra", icon: Contra, note: "1 portfolio piece" },
];

const PLATFORM_META = Object.fromEntries(PLATFORMS.map((p) => [p.value, p])) as Record<
  Platform,
  (typeof PLATFORMS)[number]
>;

const STATUS_TONE = {
  draft: "slate", approved: "blue", scheduled: "amber", posted: "green", archived: "red",
} as const;

export function ContentEngineView({
  posts, projects, stats, providerName,
}: {
  posts: Post[];
  projects: Project[];
  stats: Stats;
  providerName: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const active = projects.filter((p) => p.status === "active");
  const [tab, setTab] = useState<"write" | "queue" | "performance">("write");
  const [projectId, setProjectId] = useState(active[0]?.id ?? projects[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<Platform>>(new Set(["twitter", "linkedin"]));
  const [steer, setSteer] = useState("");
  const [writing, setWriting] = useState(false);
  const [filter, setFilter] = useState<Platform | "all">("all");
  const [metricsFor, setMetricsFor] = useState<Post | null>(null);

  const queue = useMemo(
    () =>
      posts.filter(
        (p) => p.status !== "archived" && (filter === "all" || p.platform === filter),
      ),
    [posts, filter],
  );

  // Variations of one idea belong together — three separate cards would hide
  // that they are alternatives rather than three things to post.
  const grouped = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of queue) {
      const list = map.get(post.ideaId) ?? [];
      list.push(post);
      map.set(post.ideaId, list);
    }
    return [...map.values()].map((list) => list.sort((a, b) => a.variant - b.variant));
  }, [queue]);

  function togglePlatform(platform: Platform) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function write() {
    if (!selected.size) {
      toast("Pick at least one platform.", "error");
      return;
    }
    setWriting(true);
    try {
      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || null,
          platforms: [...selected],
          steer: steer.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Generation failed");

      if (result.created) {
        toast(`${result.created} posts across ${result.ideas} ideas.`, "success");
        setTab("queue");
      }
      // Free-tier rate limits mean a partial batch is normal, not exceptional.
      for (const failure of result.failures ?? []) {
        toast(`${PLATFORM_META[failure.platform as Platform].label}: ${failure.error}`, "error");
      }
      if (!result.created && !(result.failures ?? []).length) {
        toast("The writer returned nothing.", "error");
      }
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Drafts" value={stats.drafts} />
        <Stat label="Approved" value={stats.approved} />
        <Stat label="Scheduled" value={stats.scheduled} />
        <Stat label="Posted" value={stats.posted} />
      </div>

      <Tabs
        tabs={[
          { value: "write" as const, label: "Write" },
          { value: "queue" as const, label: "Queue", count: queue.length },
          { value: "performance" as const, label: "Performance", count: stats.posted },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "write" && (
        <Card className="space-y-4">
          <CardHeader
            title="Write from what you are building"
            description={`Grounded in the project record and its build logs. Nothing is invented — no users, no revenue, no results. Writer: ${providerName}.`}
          />

          {!projects.length ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No projects yet"
              description="Seed the curriculum with npm run build:seed, then mark one Active on the Build Tracker."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Project"
                  hint={active.length ? "Active projects first" : "Nothing is marked active yet"}
                >
                  <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    {[...active, ...projects.filter((p) => p.status !== "active")].map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.number} {p.title}
                        {p.status === "active" ? " — building now" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Steer the angle" hint="optional">
                  <Input
                    value={steer}
                    placeholder="make it about the async bug"
                    onChange={(e) => setSteer(e.target.value)}
                  />
                </Field>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-ink-soft">Platforms</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PLATFORMS.map((platform) => {
                    const Icon = platform.icon;
                    const on = selected.has(platform.value);
                    return (
                      <button
                        key={platform.value}
                        onClick={() => togglePlatform(platform.value)}
                        aria-pressed={on}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                          on
                            ? "border-brand bg-brand-soft text-brand-ink"
                            : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-muted",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{platform.label}</span>
                          <span className="block text-[11px] opacity-70">{platform.note}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-xs text-ink-faint">
                  {selected.size} platform{selected.size === 1 ? "" : "s"} — written one at a time
                  to stay inside the free-tier rate limit.
                </p>
                <Button variant="primary" disabled={writing || !selected.size} onClick={write}>
                  {writing ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {writing ? "Writing…" : "Write posts"}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {tab === "queue" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterChip>
            {PLATFORMS.map((p) => (
              <FilterChip
                key={p.value}
                active={filter === p.value}
                onClick={() => setFilter(p.value)}
              >
                {p.label}
              </FilterChip>
            ))}
          </div>

          {grouped.length ? (
            grouped.map((variations) => (
              <IdeaCard
                key={variations[0].ideaId}
                variations={variations}
                onChanged={() => router.refresh()}
                onMetrics={setMetricsFor}
              />
            ))
          ) : (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="Nothing in the queue"
              description="Write posts from a project on the Write tab. Log a build day first and the copy gets specifics instead of the plan."
            />
          )}
        </div>
      )}

      {tab === "performance" && <Performance stats={stats} posts={posts} />}

      {metricsFor && (
        <MetricsModal
          post={metricsFor}
          onClose={() => setMetricsFor(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="py-3">
      <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold text-ink">{formatNumber(value)}</p>
    </Card>
  );
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-brand text-white" : "bg-muted text-ink-soft hover:bg-line hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** One idea and the takes hanging off it, side by side so they can be compared. */
function IdeaCard({
  variations, onChanged, onMetrics,
}: {
  variations: Post[];
  onChanged: () => void;
  onMetrics: (post: Post) => void;
}) {
  const first = variations[0];
  const meta = PLATFORM_META[first.platform];
  const Icon = meta.icon;

  return (
    <Card className="space-y-3">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Icon className="h-4 w-4 text-ink-faint" />
            {first.angle}
          </span>
        }
        description={
          <>
            {meta.label}
            {first.projectTitle && ` · #${first.projectNumber} ${first.projectTitle}`}
            {first.generatedBy && ` · ${first.generatedBy}`}
          </>
        }
      />

      {first.premise && <p className="text-xs text-ink-soft">{first.premise}</p>}

      <div
        className={cn(
          "grid gap-3",
          variations.length > 1 && "lg:grid-cols-3",
        )}
      >
        {variations.map((post) => (
          <Variation key={post.id} post={post} onChanged={onChanged} onMetrics={onMetrics} />
        ))}
      </div>

      {first.basisUsed.length > 0 && (
        <details className="text-xs text-ink-faint">
          <summary className="cursor-pointer select-none hover:text-ink-soft">
            What it was written from
          </summary>
          <ul className="mt-1.5 space-y-0.5 pl-3">
            {first.basisUsed.map((basis) => (
              <li key={basis} className="list-disc">
                {basis}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Variation({
  post, onChanged, onMetrics,
}: {
  post: Post;
  onChanged: () => void;
  onMetrics: (post: Post) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);

  const full = post.hashtags.length
    ? `${post.body}\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}`
    : post.body;
  const over = post.charCount > post.limit;

  async function patch(payload: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/content/posts/${post.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Update failed");
      toast(message, "success");
      onChanged();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-muted/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[11px] font-medium text-ink-soft">{post.label ?? `Take ${post.variant}`}</span>
        <Badge tone={STATUS_TONE[post.status]}>{post.status}</Badge>
      </div>

      {editing ? (
        <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} className="text-xs" />
      ) : (
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink">{post.body}</p>
      )}

      {post.hashtags.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-[11px] text-brand">
          <Hash className="h-3 w-3" />
          {post.hashtags.join(" · ")}
        </p>
      )}

      <p className={cn("tabular text-[11px]", over ? "font-medium text-danger" : "text-ink-faint")}>
        {post.charCount}/{post.limit} characters{over && " — too long to post"}
      </p>

      {post.status === "posted" && (
        <p className="tabular text-[11px] text-ink-faint">
          {post.postedAt && formatDate(post.postedAt)}
          {post.impressions !== null && ` · ${formatNumber(post.impressions)} impressions`}
          {post.likes !== null && ` · ${formatNumber(post.likes)} likes`}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-1 border-t border-line pt-2">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={async () => {
                await patch({ body, hook: body.split("\n")[0].slice(0, 500) }, "Saved.");
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setBody(post.body); setEditing(false); }}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {post.status === "draft" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ status: "approved" }, "Approved.")}>
                Approve
              </Button>
            )}
            {post.status !== "posted" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => patch({ status: "posted" }, "Marked posted.")}
              >
                <Send className="h-3.5 w-3.5" />
                Posted
              </Button>
            )}
            {post.status === "posted" && (
              <Button size="sm" variant="ghost" onClick={() => onMetrics(post)}>
                <BarChart3 className="h-3.5 w-3.5" />
                Metrics
              </Button>
            )}
            {post.postUrl && (
              <a
                href={post.postUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-1.5 text-xs text-brand hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What the tracker is for: which angle actually earns attention.
 *
 * Averages are shown only where impressions have been entered, and the count
 * they are drawn from is shown beside them — an average over two posts is not
 * a finding, and hiding the denominator would let it look like one.
 */
function Performance({ stats, posts }: { stats: Stats; posts: Post[] }) {
  const posted = posts.filter((p) => p.status === "posted");

  if (!posted.length) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title="Nothing posted yet"
        description="Mark a post as posted and record its numbers. Once a few are in, this shows which angle earns attention."
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader title="By platform" description="Posted vs still in the queue" />
        <div className="mt-3 space-y-1.5">
          {stats.byPlatform.map((row) => (
            <div key={row.platform} className="flex items-center justify-between text-sm">
              <span className="text-ink-soft">{PLATFORM_META[row.platform]?.label ?? row.platform}</span>
              <span className="tabular text-ink">
                {row.posted} posted
                <span className="text-ink-faint"> · {row.drafts} draft</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="By angle"
          description="Average impressions per posted take, where recorded"
        />
        <div className="mt-3 space-y-1.5">
          {stats.byAngle.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="truncate text-ink-soft">{row.label}</span>
              <span className="tabular shrink-0 text-ink">
                {row.avgImpressions === null ? (
                  <span className="text-ink-faint">no numbers yet</span>
                ) : (
                  <>
                    {formatNumber(row.avgImpressions)}
                    <span className="text-ink-faint"> avg over {row.posted}</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MetricsModal({
  post, onClose, onSaved,
}: {
  post: Post;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState({
    impressions: post.impressions?.toString() ?? "",
    likes: post.likes?.toString() ?? "",
    comments: post.comments?.toString() ?? "",
    shares: post.shares?.toString() ?? "",
    profileClicks: post.profileClicks?.toString() ?? "",
  });
  const [url, setUrl] = useState(post.postUrl ?? "");
  const [saving, setSaving] = useState(false);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/content/posts/${post.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "posted",
          postUrl: url.trim() || null,
          metrics: {
            impressions: num(values.impressions),
            likes: num(values.likes),
            comments: num(values.comments),
            shares: num(values.shares),
            profileClicks: num(values.profileClicks),
          },
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Save failed");
      toast("Numbers recorded.", "success");
      onSaved();
      onClose();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record how it did"
      description="Leave anything you don't have blank. Partial numbers are still useful; invented ones are not."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Link to the post" hint="optional">
          <Input value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["impressions", "Impressions"],
              ["likes", "Likes"],
              ["comments", "Comments"],
              ["shares", "Shares / reposts"],
              ["profileClicks", "Profile clicks"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                type="number"
                min="0"
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </div>
    </Modal>
  );
}
