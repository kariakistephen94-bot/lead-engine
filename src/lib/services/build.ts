import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  buildLogs,
  buildProjects,
  contentIdeas,
  socialPosts,
  type BuildStatus,
  type CaseStudy,
  type NewBuildLog,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";

export type BuildProjectRow = {
  id: string;
  number: number;
  week: number;
  weekTheme: string;
  title: string;
  summary: string | null;
  features: string[];
  stack: string[];
  learningGoals: string[];
  status: BuildStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  repoUrl: string | null;
  demoUrl: string | null;
  youtubeUrl: string | null;
  notes: string | null;
  caseStudy: CaseStudy | null;
  caseStudyGeneratedBy: string | null;
  /** Whether this project appears on the public Kiln site. */
  published: boolean;
  /** How many days have been logged — the honest measure of progress. */
  logCount: number;
  /** Total hours across those logs. */
  hours: number;
  lastLoggedOn: string | null;
  /** Posts written about this project, so the tracker shows content coverage. */
  postCount: number;
};

/**
 * Every project, newest week last — the curriculum is meant to be read in order.
 *
 * Log counts and hours are aggregated here rather than in the page because
 * "how far in am I" is the question the tracker exists to answer, and it is a
 * per-project aggregate either way.
 */
export async function listBuildProjects(): Promise<BuildProjectRow[]> {
  const logStats = db
    .select({
      projectId: buildLogs.projectId,
      logCount: count(buildLogs.id).as("log_count"),
      hours: sql<string>`coalesce(sum(${buildLogs.hours}), 0)`.as("hours"),
      lastLoggedOn: sql<string | null>`max(${buildLogs.loggedOn})`.as("last_logged_on"),
    })
    .from(buildLogs)
    .groupBy(buildLogs.projectId)
    .as("log_stats");

  const postStats = db
    .select({
      projectId: contentIdeas.projectId,
      postCount: count(socialPosts.id).as("post_count"),
    })
    .from(contentIdeas)
    .leftJoin(socialPosts, eq(socialPosts.ideaId, contentIdeas.id))
    .groupBy(contentIdeas.projectId)
    .as("post_stats");

  const rows = await db
    .select({
      id: buildProjects.id,
      number: buildProjects.number,
      week: buildProjects.week,
      weekTheme: buildProjects.weekTheme,
      title: buildProjects.title,
      summary: buildProjects.summary,
      features: buildProjects.features,
      stack: buildProjects.stack,
      learningGoals: buildProjects.learningGoals,
      status: buildProjects.status,
      startedAt: buildProjects.startedAt,
      completedAt: buildProjects.completedAt,
      repoUrl: buildProjects.repoUrl,
      demoUrl: buildProjects.demoUrl,
      youtubeUrl: buildProjects.youtubeUrl,
      notes: buildProjects.notes,
      caseStudy: buildProjects.caseStudy,
      caseStudyGeneratedBy: buildProjects.caseStudyGeneratedBy,
      published: buildProjects.published,
      logCount: sql<number>`coalesce(${logStats.logCount}, 0)::int`,
      hours: sql<string>`coalesce(${logStats.hours}, 0)`,
      lastLoggedOn: logStats.lastLoggedOn,
      postCount: sql<number>`coalesce(${postStats.postCount}, 0)::int`,
    })
    .from(buildProjects)
    .leftJoin(logStats, eq(logStats.projectId, buildProjects.id))
    .leftJoin(postStats, eq(postStats.projectId, buildProjects.id))
    .orderBy(buildProjects.number);

  return rows.map((r) => ({ ...r, hours: Number(r.hours) || 0 }));
}

/** The projects being worked on right now — what the content engine writes about. */
export async function listActiveProjects(): Promise<BuildProjectRow[]> {
  const all = await listBuildProjects();
  return all.filter((p) => p.status === "active");
}

export type BuildLogRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  projectNumber: number;
  loggedOn: string;
  built: string;
  blockers: string | null;
  learned: string | null;
  hours: number | null;
};

export async function listBuildLogs(projectId?: string, limit = 100): Promise<BuildLogRow[]> {
  const rows = await db
    .select({
      id: buildLogs.id,
      projectId: buildLogs.projectId,
      projectTitle: buildProjects.title,
      projectNumber: buildProjects.number,
      loggedOn: buildLogs.loggedOn,
      built: buildLogs.built,
      blockers: buildLogs.blockers,
      learned: buildLogs.learned,
      hours: buildLogs.hours,
    })
    .from(buildLogs)
    .innerJoin(buildProjects, eq(buildProjects.id, buildLogs.projectId))
    .where(projectId ? eq(buildLogs.projectId, projectId) : undefined)
    .orderBy(desc(buildLogs.loggedOn), desc(buildLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, hours: r.hours === null ? null : Number(r.hours) }));
}

export type BuildStats = {
  total: number;
  planned: number;
  active: number;
  completed: number;
  paused: number;
  loggedDays: number;
  totalHours: number;
};

export async function getBuildStats(): Promise<BuildStats> {
  const [projects] = await db
    .select({
      total: count(buildProjects.id),
      planned: sql<number>`count(*) filter (where ${buildProjects.status} = 'planned')::int`,
      active: sql<number>`count(*) filter (where ${buildProjects.status} = 'active')::int`,
      completed: sql<number>`count(*) filter (where ${buildProjects.status} = 'completed')::int`,
      paused: sql<number>`count(*) filter (where ${buildProjects.status} = 'paused')::int`,
    })
    .from(buildProjects);

  const [logs] = await db
    .select({
      loggedDays: sql<number>`count(distinct ${buildLogs.loggedOn})::int`,
      totalHours: sql<string>`coalesce(sum(${buildLogs.hours}), 0)`,
    })
    .from(buildLogs);

  return {
    total: projects?.total ?? 0,
    planned: projects?.planned ?? 0,
    active: projects?.active ?? 0,
    completed: projects?.completed ?? 0,
    paused: projects?.paused ?? 0,
    loggedDays: logs?.loggedDays ?? 0,
    totalHours: Number(logs?.totalHours ?? 0),
  };
}

/**
 * Move a project through the tracker.
 *
 * The timestamps are set here rather than left to the caller so they cannot
 * drift: starting stamps `startedAt` once and never re-stamps it on a
 * pause/resume round trip, and completing stamps `completedAt`. Going back to
 * planned clears both, because that is the only honest reading of "I haven't
 * started this".
 */
export async function setProjectStatus(
  id: string,
  status: BuildStatus,
): Promise<BuildProjectRow | null> {
  const [existing] = await db
    .select({ startedAt: buildProjects.startedAt })
    .from(buildProjects)
    .where(eq(buildProjects.id, id))
    .limit(1);
  if (!existing) return null;

  const now = new Date();
  const [updated] = await db
    .update(buildProjects)
    .set({
      status,
      startedAt:
        status === "planned" ? null : (existing.startedAt ?? now),
      completedAt: status === "completed" ? now : null,
      updatedAt: now,
    })
    .where(eq(buildProjects.id, id))
    .returning({ id: buildProjects.id });

  if (!updated) return null;
  const all = await listBuildProjects();
  return all.find((p) => p.id === id) ?? null;
}

export async function updateProject(
  id: string,
  patch: {
    repoUrl?: string | null;
    demoUrl?: string | null;
    youtubeUrl?: string | null;
    notes?: string | null;
    published?: boolean;
    caseStudy?: CaseStudy | null;
  },
): Promise<boolean> {
  const [row] = await db
    .update(buildProjects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(buildProjects.id, id))
    .returning({ id: buildProjects.id });
  return Boolean(row);
}

/**
 * Record a day's work.
 *
 * One entry per project per day: logging twice on the same date updates the
 * existing row instead of creating a second one, so the day count stays a
 * count of days rather than of times you opened the form.
 */
export async function addBuildLog(entry: NewBuildLog): Promise<BuildLogRow | null> {
  const [existing] = await db
    .select({ id: buildLogs.id })
    .from(buildLogs)
    .where(and(eq(buildLogs.projectId, entry.projectId), eq(buildLogs.loggedOn, entry.loggedOn)))
    .limit(1);

  const [row] = existing
    ? await db
        .update(buildLogs)
        .set({
          built: entry.built,
          blockers: entry.blockers ?? null,
          learned: entry.learned ?? null,
          hours: entry.hours ?? null,
        })
        .where(eq(buildLogs.id, existing.id))
        .returning({ id: buildLogs.id })
    : await db.insert(buildLogs).values(entry).returning({ id: buildLogs.id });

  if (!row) return null;
  const logs = await listBuildLogs(entry.projectId, 200);
  return logs.find((l) => l.id === row.id) ?? null;
}

/**
 * Write the client-facing page for a project.
 *
 * Regenerating overwrites whatever was there, including hand edits — the UI
 * warns before calling this. That is the right trade: a "merge my edits with a
 * new draft" flow sounds helpful and produces text nobody wrote.
 *
 * The build logs go in whole. They are the only thing separating a page that
 * describes a working system from one that describes an intention.
 */
export async function generateCaseStudy(id: string): Promise<CaseStudy | null> {
  const [project] = await db
    .select()
    .from(buildProjects)
    .where(eq(buildProjects.id, id))
    .limit(1);
  if (!project) return null;

  const logs = await db
    .select({
      loggedOn: buildLogs.loggedOn,
      built: buildLogs.built,
      blockers: buildLogs.blockers,
      learned: buildLogs.learned,
    })
    .from(buildLogs)
    .where(eq(buildLogs.projectId, id))
    .orderBy(desc(buildLogs.loggedOn))
    .limit(20);

  const ai = getAIProvider();
  const draft = await ai.writeCaseStudy({
    authorName: process.env.SENDER_NAME?.trim() || "the builder",
    positioning:
      process.env.CONTENT_POSITIONING?.trim() ||
      "building AI automation and backend systems for businesses",
    project: {
      title: project.title,
      summary: project.summary,
      features: project.features,
      stack: project.stack,
      status: project.status,
      repoUrl: project.repoUrl,
      demoUrl: project.demoUrl,
      youtubeUrl: project.youtubeUrl,
    },
    logs,
  });

  await db
    .update(buildProjects)
    .set({
      caseStudy: draft,
      caseStudyGeneratedBy: `${ai.name}:${ai.model}`,
      updatedAt: new Date(),
    })
    .where(eq(buildProjects.id, id));

  return draft;
}
