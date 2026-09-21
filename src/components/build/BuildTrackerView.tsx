"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BookOpen, CheckCircle2, CirclePause, CircleDot, Clock, ExternalLink,
  FileText, Globe, Hammer, Link2, MonitorPlay, NotebookPen, Sparkles,
} from "lucide-react";

/** lucide dropped the brand marks, so YouTube gets a stand-in. */
const Youtube = MonitorPlay;

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import type { CaseStudy } from "@/db/schema";
import { cn, formatDate } from "@/lib/utils";

type Project = {
  id: string; number: number; week: number; weekTheme: string;
  title: string; summary: string | null;
  features: string[]; stack: string[]; learningGoals: string[];
  status: "planned" | "active" | "completed" | "paused";
  startedAt: string | null; completedAt: string | null;
  repoUrl: string | null; demoUrl: string | null; youtubeUrl: string | null;
  notes: string | null;
  published: boolean;
  caseStudy: CaseStudy | null;
  caseStudyGeneratedBy: string | null;
  logCount: number; hours: number; lastLoggedOn: string | null; postCount: number;
};

type Log = {
  id: string; projectId: string; projectTitle: string; projectNumber: number;
  loggedOn: string; built: string; blockers: string | null;
  learned: string | null; hours: number | null;
};

type Stats = {
  total: number; planned: number; active: number; completed: number;
  paused: number; loggedDays: number; totalHours: number;
};

const STATUS_TONE = {
  planned: "slate", active: "blue", completed: "green", paused: "amber",
} as const;

const STATUS_ICON = {
  planned: CircleDot, active: Hammer, completed: CheckCircle2, paused: CirclePause,
};

/** The order the buttons appear in is the order the work actually moves. */
const STATUSES = ["planned", "active", "completed", "paused"] as const;

export function BuildTrackerView({
  projects, logs, stats,
}: {
  projects: Project[];
  logs: Log[];
  stats: Stats;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"plan" | "logs">("plan");
  const [busy, setBusy] = useState<string | null>(null);
  const [logging, setLogging] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);

  // Grouped by week so the plan reads the way it was written.
  const weeks = useMemo(() => {
    const map = new Map<number, { theme: string; learn: string[]; projects: Project[] }>();
    for (const p of projects) {
      const entry = map.get(p.week) ?? { theme: p.weekTheme, learn: p.learningGoals, projects: [] };
      entry.projects.push(p);
      map.set(p.week, entry);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [projects]);

  async function setStatus(project: Project, status: Project["status"]) {
    if (status === project.status) return;
    setBusy(project.id);
    try {
      const response = await fetch(`/api/build/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Update failed");
      toast(
        status === "active"
          ? `Project ${project.number} is now what the content engine writes about.`
          : `Project ${project.number} marked ${status}.`,
        "success",
      );
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function setPublished(project: Project, published: boolean) {
    setBusy(project.id);
    try {
      const response = await fetch(`/api/build/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Update failed");
      toast(
        published
          ? `${project.title} is now on the Kiln site.`
          : `${project.title} pulled from the Kiln site.`,
        "success",
      );
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const done = stats.completed;
  const pct = stats.total ? Math.round((done / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Projects" value={`${done}/${stats.total}`} hint={`${pct}% complete`} />
        <Stat label="Building now" value={stats.active} hint="drives the content engine" />
        <Stat label="Planned" value={stats.planned} />
        <Stat label="Days logged" value={stats.loggedDays} />
        <Stat label="Hours" value={stats.totalHours.toFixed(1)} />
      </div>

      <Tabs
        tabs={[
          { value: "plan" as const, label: "The plan", count: stats.total },
          { value: "logs" as const, label: "Build log", count: logs.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "plan" ? (
        <div className="space-y-5">
          {weeks.map(([week, group]) => (
            <div key={week}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="text-sm font-semibold text-ink">
                  Week {week} — {group.theme}
                </h2>
                <p className="text-xs text-ink-faint">{group.learn.join(" · ")}</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {group.projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    busy={busy === project.id}
                    onStatus={(s) => setStatus(project, s)}
                    onLog={() => setLogging(project)}
                    onPublish={(published) => setPublished(project, published)}
                    onPage={() => setEditing(project)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : logs.length ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">
                  <span className="text-ink-faint">#{log.projectNumber}</span> {log.projectTitle}
                </p>
                <p className="text-xs text-ink-faint">
                  {formatDate(log.loggedOn)}
                  {log.hours !== null && ` · ${log.hours}h`}
                </p>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-ink-soft">{log.built}</p>
              {log.blockers && (
                <p className="mt-1.5 whitespace-pre-wrap text-xs text-warning">
                  Stuck on: {log.blockers}
                </p>
              )}
              {log.learned && (
                <p className="mt-1.5 whitespace-pre-wrap text-xs text-ink-soft">
                  Learned: {log.learned}
                </p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<NotebookPen className="h-5 w-5" />}
          title="No build logs yet"
          description="Log a day's work on a project and the content engine gets something specific to write about. Without logs it can only describe the plan."
        />
      )}

      {logging && (
        <LogModal project={logging} onClose={() => setLogging(null)} onSaved={() => router.refresh()} />
      )}

      {editing && (
        <ProjectPageModal
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="py-3">
      <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold text-ink">{value}</p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </Card>
  );
}

function ProjectCard({
  project, busy, onStatus, onLog, onPublish, onPage,
}: {
  project: Project;
  busy: boolean;
  onStatus: (status: Project["status"]) => void;
  onLog: () => void;
  onPublish: (published: boolean) => void;
  onPage: () => void;
}) {
  const Icon = STATUS_ICON[project.status];

  return (
    <Card
      className={cn(
        "flex flex-col gap-2.5",
        project.status === "active" && "border-brand/40 ring-1 ring-brand/15",
      )}
    >
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <span className="text-ink-faint">#{project.number}</span>
            {project.title}
          </span>
        }
        action={
          <Badge tone={STATUS_TONE[project.status]} dot>
            <Icon className="h-3 w-3" />
            {project.status}
          </Badge>
        }
      />

      {project.summary && <p className="text-xs leading-relaxed text-ink-soft">{project.summary}</p>}

      <ul className="space-y-0.5 text-xs text-ink-soft">
        {project.features.slice(0, 4).map((f) => (
          <li key={f} className="flex gap-1.5">
            <span className="text-ink-faint">·</span>
            {f}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-1">
        {project.stack.map((s) => (
          <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-ink-soft">
            {s}
          </span>
        ))}
      </div>

      <div className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1">
          <NotebookPen className="h-3 w-3" />
          {project.logCount} {project.logCount === 1 ? "day" : "days"}
        </span>
        {project.hours > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {project.hours}h
          </span>
        )}
        {project.postCount > 0 && (
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {project.postCount} posts
          </span>
        )}
        {project.repoUrl && (
          <a href={project.repoUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-1 text-brand hover:underline">
            <ExternalLink className="h-3 w-3" />
            repo
          </a>
        )}
        {project.demoUrl && (
          <a href={project.demoUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-1 text-brand hover:underline">
            <Link2 className="h-3 w-3" />
            live
          </a>
        )}
        {project.youtubeUrl && (
          <a href={project.youtubeUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-1 text-brand hover:underline">
            <Youtube className="h-3 w-3" />
            video
          </a>
        )}
        {project.caseStudy && (
          <span className="flex items-center gap-1 text-positive">
            <FileText className="h-3 w-3" />
            page written
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-line pt-2.5">
        {STATUSES.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={status === project.status ? "primary" : "ghost"}
            disabled={busy}
            onClick={() => onStatus(status)}
          >
            {status}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={onPage} title="Links and the client-facing page">
          <FileText className="h-3.5 w-3.5" />
          Page
          {!project.caseStudy && <span className="text-ink-faint">·</span>}
        </Button>
        <Button
          size="sm"
          variant={project.published ? "primary" : "ghost"}
          disabled={busy || (!project.published && !project.caseStudy)}
          title={
            !project.published && !project.caseStudy
              ? "Write the project page first — publishing without one puts an empty entry on the site"
              : undefined
          }
          onClick={() => onPublish(!project.published)}
        >
          <Globe className="h-3.5 w-3.5" />
          {project.published ? "Live" : "Publish"}
        </Button>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={onLog}>
          <NotebookPen className="h-3.5 w-3.5" />
          Log
        </Button>
      </div>
    </Card>
  );
}

/**
 * One day's entry. The date defaults to today and logging twice on one date
 * overwrites rather than duplicating, so the day count stays a count of days.
 */
function LogModal({
  project, onClose, onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [loggedOn, setLoggedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [built, setBuilt] = useState("");
  const [blockers, setBlockers] = useState("");
  const [learned, setLearned] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (built.trim().length < 3) {
      toast("Say what you got working — that is the part worth keeping.", "error");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/build/logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          loggedOn,
          built: built.trim(),
          blockers: blockers.trim() || null,
          learned: learned.trim() || null,
          hours: hours ? Number(hours) : null,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Save failed");
      toast("Logged.", "success");
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
      title={`Log a day — ${project.title}`}
      description="The blockers and the lesson are what make a post worth reading. Write them as you would tell a friend."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save entry"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={loggedOn} onChange={(e) => setLoggedOn(e.target.value)} />
          </Field>
          <Field label="Hours" hint="optional">
            <Input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={hours}
              placeholder="2.5"
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
        </div>
        <Field label="What got working" required>
          <Textarea
            rows={3}
            value={built}
            placeholder="Pagination on /notes, cursor-based rather than offset."
            onChange={(e) => setBuilt(e.target.value)}
          />
        </Field>
        <Field label="What fought back" hint="optional — usually the most postable part">
          <Textarea
            rows={2}
            value={blockers}
            placeholder="Async generator kept closing the DB session before the last page."
            onChange={(e) => setBlockers(e.target.value)}
          />
        </Field>
        <Field label="What you learned" hint="optional">
          <Textarea
            rows={2}
            value={learned}
            placeholder="Depends() scopes to the request, not the generator."
            onChange={(e) => setLearned(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export const BuildIcon = BookOpen;


/**
 * Links and the client-facing page for one project.
 *
 * The generate button warns before overwriting, because regenerating replaces
 * hand edits wholesale. Merging a new draft into edited copy sounds helpful and
 * produces text nobody actually wrote.
 */
function ProjectPageModal({
  project, onClose, onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [repoUrl, setRepoUrl] = useState(project.repoUrl ?? "");
  const [demoUrl, setDemoUrl] = useState(project.demoUrl ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(project.youtubeUrl ?? "");
  const [study, setStudy] = useState<CaseStudy | null>(project.caseStudy);
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);

  const field = (value: string) => (value.trim() ? value.trim() : null);

  async function saveLinks(): Promise<boolean> {
    const response = await fetch(`/api/build/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repoUrl: field(repoUrl),
        demoUrl: field(demoUrl),
        youtubeUrl: field(youtubeUrl),
      }),
    });
    if (!response.ok) {
      toast((await response.json()).error ?? "Check the links are full URLs.", "error");
      return false;
    }
    return true;
  }

  async function write() {
    if (study && !confirm("This replaces the current page, including anything you edited by hand. Continue?")) {
      return;
    }
    setWriting(true);
    try {
      // Links go first: the writer mentions a repo, a demo or a video only when
      // it knows one exists, so saving after would produce a page that omits them.
      if (!(await saveLinks())) return;

      const response = await fetch(`/api/build/projects/${project.id}/case-study`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The writer failed");
      setStudy(data.caseStudy);
      toast("Page written. Read it before publishing.", "success");
      onSaved();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setWriting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (!(await saveLinks())) return;
      const response = await fetch(`/api/build/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseStudy: study }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Save failed");
      toast("Saved.", "success");
      onSaved();
      onClose();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof CaseStudy>(key: K, value: CaseStudy[K]) =>
    setStudy((current) => (current ? { ...current, [key]: value } : current));

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Project page — ${project.title}`}
      description="This is what a prospective client reads. The writer works from the build logs, so log a day or two first and the page describes a working system instead of a plan."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="GitHub repo" hint="optional">
            <Input value={repoUrl} placeholder="https://github.com/…"
                   onChange={(e) => setRepoUrl(e.target.value)} />
          </Field>
          <Field label="Live link" hint="optional">
            <Input value={demoUrl} placeholder="https://…"
                   onChange={(e) => setDemoUrl(e.target.value)} />
          </Field>
          <Field label="YouTube tutorial" hint="optional">
            <Input value={youtubeUrl} placeholder="https://youtube.com/watch?v=…"
                   onChange={(e) => setYoutubeUrl(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <p className="text-xs text-ink-soft">
            {project.logCount === 0
              ? "No build logs yet — the page can only describe the plan."
              : `Written from ${project.logCount} logged ${project.logCount === 1 ? "day" : "days"}.`}
          </p>
          <Button variant={study ? "secondary" : "primary"} disabled={writing} onClick={write}>
            {writing ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {writing ? "Writing…" : study ? "Rewrite the page" : "Write the page"}
          </Button>
        </div>

        {study ? (
          <div className="space-y-3 border-t border-line pt-4">
            <Field label="Headline" hint={`${study.headline.length}/70 — a capability, not a slogan`}>
              <Input value={study.headline} onChange={(e) => set("headline", e.target.value)} />
            </Field>
            <Field label="Intro">
              <Textarea rows={2} value={study.intro} onChange={(e) => set("intro", e.target.value)} />
            </Field>
            <Field label="The problem it solves">
              <Textarea rows={3} value={study.problem} onChange={(e) => set("problem", e.target.value)} />
            </Field>
            <Field label="How it was built">
              <Textarea rows={3} value={study.approach} onChange={(e) => set("approach", e.target.value)} />
            </Field>
            <Field label="How it works" hint="One step per line">
              <Textarea
                rows={5}
                value={study.howItWorks.join("\n")}
                onChange={(e) => set("howItWorks", e.target.value.split("\n").filter(Boolean))}
              />
            </Field>
            <Field label="What it demonstrates" hint="One per line">
              <Textarea
                rows={4}
                value={study.demonstrates.join("\n")}
                onChange={(e) => set("demonstrates", e.target.value.split("\n").filter(Boolean))}
              />
            </Field>
            {study.basisUsed.length > 0 && (
              <details className="text-xs text-ink-faint">
                <summary className="cursor-pointer select-none hover:text-ink-soft">
                  What it was written from
                  {project.caseStudyGeneratedBy && ` · ${project.caseStudyGeneratedBy}`}
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-4">
                  {study.basisUsed.map((basis) => (
                    <li key={basis} className="list-disc">{basis}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No page written yet"
            description="Add any links you have, then write the page. You can edit every line afterwards, and nothing reaches the site until you publish."
          />
        )}
      </div>
    </Modal>
  );
}
