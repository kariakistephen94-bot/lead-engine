import "server-only";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  buildLogs,
  buildProjects,
  contentIdeas,
  socialPosts,
  type ContentFormat,
  type PostStatus,
  type SocialPlatform,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { cleanPostText } from "@/lib/ai/social";
import type { SocialSubject } from "@/lib/ai/types";

/**
 * Which shape each platform gets written in.
 *
 * X and LinkedIn are the post itself, so they get three angles to choose
 * between. The video platforms get a hook and a caption only — the script is
 * yours, and a model that has not seen the footage writes a bad one. Contra is
 * a hiring surface rather than a feed, so it gets one portfolio piece, not
 * three competing takes.
 */
export const PLATFORM_FORMAT: Record<SocialPlatform, ContentFormat> = {
  twitter: "text_post",
  linkedin: "text_post",
  contra: "showcase",
  tiktok: "video_hook",
  youtube: "video_hook",
  instagram: "video_hook",
};

/** What the platform actually rejects at, for the length warning in the UI. */
export const PLATFORM_LIMIT: Record<SocialPlatform, number> = {
  twitter: 280,
  linkedin: 3000,
  contra: 2000,
  tiktok: 2200,
  youtube: 5000,
  instagram: 2200,
};

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  twitter: "X",
  linkedin: "LinkedIn",
  contra: "Contra",
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

const AUTHOR_NAME = () => process.env.SENDER_NAME?.trim() || "the author";
const POSITIONING = () =>
  process.env.CONTENT_POSITIONING?.trim() ||
  "building AI automation and backend systems, and looking for clients who need them";

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export type GenerateInput = {
  projectId: string | null;
  platforms: SocialPlatform[];
  steer?: string | null;
};

export type GenerateResult = {
  created: number;
  ideas: number;
  failures: { platform: SocialPlatform; error: string }[];
  generatedBy: string;
};

/**
 * Write one idea per requested platform, each with its variations.
 *
 * Platforms run in sequence rather than in parallel on purpose: the free
 * Gemini tier is rate-limited per minute, and six concurrent calls is the
 * reliable way to get five of them rejected. A platform that fails is
 * reported and the rest still land.
 */
export async function generateContent(input: GenerateInput): Promise<GenerateResult> {
  const provider = getAIProvider();

  const subjectBase = await buildSubject(input.projectId);
  const failures: GenerateResult["failures"] = [];
  let created = 0;
  let ideas = 0;

  for (const platform of input.platforms) {
    const format = PLATFORM_FORMAT[platform];
    const subject: SocialSubject = {
      ...subjectBase,
      platform,
      format,
      steer: input.steer ?? null,
    };

    try {
      const set = await provider.writeSocialPosts(subject);
      if (!set.variations.length) {
        failures.push({ platform, error: "the writer returned no variations" });
        continue;
      }

      const [idea] = await db
        .insert(contentIdeas)
        .values({
          projectId: input.projectId,
          platform,
          format,
          angle: set.angle.slice(0, 200),
          premise: set.premise,
          basisUsed: set.basisUsed,
          generatedBy: `${provider.name}:${provider.model}`,
        })
        .returning({ id: contentIdeas.id });
      if (!idea) continue;
      ideas += 1;

      await db.insert(socialPosts).values(
        set.variations.map((v, i) => {
          // Sanitised once, here, so every provider gets the same guarantee and
          // charCount measures what will actually be pasted.
          const body = cleanPostText(v.body);
          return {
            ideaId: idea.id,
            variant: i + 1,
            label: v.label,
            hook: cleanPostText(v.hook),
            body,
            cta: v.cta ? cleanPostText(v.cta) : null,
            hashtags: v.hashtags,
            charCount: body.length,
          };
        }),
      );
      created += set.variations.length;
    } catch (error) {
      failures.push({
        platform,
        error: error instanceof Error ? error.message : "generation failed",
      });
    }
  }

  return { created, ideas, failures, generatedBy: `${provider.name}:${provider.model}` };
}

/**
 * Assemble the facts the writer is allowed to use.
 *
 * Only the ten most recent log entries go in. Everything the model receives it
 * will try to use, and a post built from a fact three weeks stale reads as
 * padding — the recent days are where the specifics are.
 */
async function buildSubject(
  projectId: string | null,
): Promise<Omit<SocialSubject, "platform" | "format" | "steer">> {
  const base = {
    authorName: AUTHOR_NAME(),
    positioning: POSITIONING(),
    project: null,
    logs: [],
  } satisfies Omit<SocialSubject, "platform" | "format" | "steer">;

  if (!projectId) return base;

  const [project] = await db
    .select()
    .from(buildProjects)
    .where(eq(buildProjects.id, projectId))
    .limit(1);
  if (!project) return base;

  const logs = await db
    .select({
      loggedOn: buildLogs.loggedOn,
      built: buildLogs.built,
      blockers: buildLogs.blockers,
      learned: buildLogs.learned,
    })
    .from(buildLogs)
    .where(eq(buildLogs.projectId, projectId))
    .orderBy(desc(buildLogs.loggedOn))
    .limit(10);

  return {
    ...base,
    project: {
      number: project.number,
      week: project.week,
      weekTheme: project.weekTheme,
      title: project.title,
      summary: project.summary,
      features: project.features,
      stack: project.stack,
      learningGoals: project.learningGoals,
      status: project.status,
    },
    logs,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export type PostRow = {
  id: string;
  ideaId: string;
  platform: SocialPlatform;
  format: ContentFormat;
  angle: string;
  premise: string | null;
  basisUsed: string[];
  generatedBy: string | null;
  projectId: string | null;
  projectTitle: string | null;
  projectNumber: number | null;
  variant: number;
  label: string | null;
  hook: string;
  body: string;
  cta: string | null;
  hashtags: string[];
  charCount: number;
  limit: number;
  status: PostStatus;
  scheduledFor: Date | null;
  postedAt: Date | null;
  postUrl: string | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  profileClicks: number | null;
  createdAt: Date;
};

export async function listPosts(
  filter: { platform?: SocialPlatform; status?: PostStatus; projectId?: string } = {},
  limit = 300,
): Promise<PostRow[]> {
  const conditions = [
    filter.platform ? eq(contentIdeas.platform, filter.platform) : undefined,
    filter.status ? eq(socialPosts.status, filter.status) : undefined,
    filter.projectId ? eq(contentIdeas.projectId, filter.projectId) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: socialPosts.id,
      ideaId: socialPosts.ideaId,
      platform: contentIdeas.platform,
      format: contentIdeas.format,
      angle: contentIdeas.angle,
      premise: contentIdeas.premise,
      basisUsed: contentIdeas.basisUsed,
      generatedBy: contentIdeas.generatedBy,
      projectId: contentIdeas.projectId,
      projectTitle: buildProjects.title,
      projectNumber: buildProjects.number,
      variant: socialPosts.variant,
      label: socialPosts.label,
      hook: socialPosts.hook,
      body: socialPosts.body,
      cta: socialPosts.cta,
      hashtags: socialPosts.hashtags,
      charCount: socialPosts.charCount,
      status: socialPosts.status,
      scheduledFor: socialPosts.scheduledFor,
      postedAt: socialPosts.postedAt,
      postUrl: socialPosts.postUrl,
      impressions: socialPosts.impressions,
      likes: socialPosts.likes,
      comments: socialPosts.comments,
      shares: socialPosts.shares,
      profileClicks: socialPosts.profileClicks,
      createdAt: socialPosts.createdAt,
    })
    .from(socialPosts)
    .innerJoin(contentIdeas, eq(contentIdeas.id, socialPosts.ideaId))
    .leftJoin(buildProjects, eq(buildProjects.id, contentIdeas.projectId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contentIdeas.createdAt), socialPosts.variant)
    .limit(limit);

  return rows.map((r) => ({ ...r, limit: PLATFORM_LIMIT[r.platform] }));
}

export type ContentStats = {
  drafts: number;
  approved: number;
  scheduled: number;
  posted: number;
  /** Posted counts per platform — what the September push actually shipped. */
  byPlatform: { platform: SocialPlatform; posted: number; drafts: number }[];
  /** Average impressions per posted variant, by angle label. Empty until metrics exist. */
  byAngle: { label: string; posted: number; avgImpressions: number | null }[];
};

export async function getContentStats(): Promise<ContentStats> {
  const [totals] = await db
    .select({
      drafts: sql<number>`count(*) filter (where ${socialPosts.status} = 'draft')::int`,
      approved: sql<number>`count(*) filter (where ${socialPosts.status} = 'approved')::int`,
      scheduled: sql<number>`count(*) filter (where ${socialPosts.status} = 'scheduled')::int`,
      posted: sql<number>`count(*) filter (where ${socialPosts.status} = 'posted')::int`,
    })
    .from(socialPosts);

  const byPlatform = await db
    .select({
      platform: contentIdeas.platform,
      posted: sql<number>`count(*) filter (where ${socialPosts.status} = 'posted')::int`,
      drafts: sql<number>`count(*) filter (where ${socialPosts.status} = 'draft')::int`,
    })
    .from(socialPosts)
    .innerJoin(contentIdeas, eq(contentIdeas.id, socialPosts.ideaId))
    .groupBy(contentIdeas.platform);

  const byAngle = await db
    .select({
      label: sql<string>`coalesce(${socialPosts.label}, 'unlabelled')`,
      posted: count(socialPosts.id),
      avgImpressions: sql<string | null>`avg(${socialPosts.impressions})`,
    })
    .from(socialPosts)
    .where(eq(socialPosts.status, "posted"))
    .groupBy(sql`coalesce(${socialPosts.label}, 'unlabelled')`)
    .orderBy(desc(count(socialPosts.id)));

  return {
    drafts: totals?.drafts ?? 0,
    approved: totals?.approved ?? 0,
    scheduled: totals?.scheduled ?? 0,
    posted: totals?.posted ?? 0,
    byPlatform,
    byAngle: byAngle.map((a) => ({
      label: a.label,
      posted: a.posted,
      avgImpressions: a.avgImpressions === null ? null : Math.round(Number(a.avgImpressions)),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Edit a post before it goes out.
 *
 * `charCount` is recomputed rather than trusted from the client — it is the
 * only thing standing between a hand-edited X post and a 300-character body
 * that cannot be posted.
 */
export async function updatePost(
  id: string,
  patch: { body?: string; hook?: string; cta?: string | null; hashtags?: string[] },
): Promise<boolean> {
  const [row] = await db
    .update(socialPosts)
    .set({
      ...patch,
      ...(patch.body === undefined ? {} : { charCount: patch.body.length }),
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, id))
    .returning({ id: socialPosts.id });
  return Boolean(row);
}

/**
 * Move a post through its lifecycle.
 *
 * Marking `posted` stamps the time if the caller did not supply one, because
 * posting is manual and the moment you click the button is the only timestamp
 * anyone has. Moving back to draft clears it — a post that is being rewritten
 * has not been posted.
 */
export async function setPostStatus(
  id: string,
  status: PostStatus,
  extra: { postUrl?: string | null; scheduledFor?: Date | null; postedAt?: Date | null } = {},
): Promise<boolean> {
  const [row] = await db
    .update(socialPosts)
    .set({
      status,
      postedAt:
        status === "posted"
          ? (extra.postedAt ?? new Date())
          : status === "draft"
            ? null
            : undefined,
      scheduledFor: status === "scheduled" ? (extra.scheduledFor ?? null) : undefined,
      ...(extra.postUrl === undefined ? {} : { postUrl: extra.postUrl }),
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, id))
    .returning({ id: socialPosts.id });
  return Boolean(row);
}

/** Record how a posted variant actually did. All fields optional — log what you have. */
export async function recordMetrics(
  id: string,
  metrics: {
    impressions?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    profileClicks?: number | null;
  },
): Promise<boolean> {
  const [row] = await db
    .update(socialPosts)
    .set({ ...metrics, metricsUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(socialPosts.id, id))
    .returning({ id: socialPosts.id });
  return Boolean(row);
}

/** Delete a whole idea and its variations — used when a set is simply bad. */
export async function deleteIdea(ideaId: string): Promise<boolean> {
  const [row] = await db
    .delete(contentIdeas)
    .where(eq(contentIdeas.id, ideaId))
    .returning({ id: contentIdeas.id });
  return Boolean(row);
}

/** Archive several posts at once, for clearing out a rejected batch. */
export async function archivePosts(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db
    .update(socialPosts)
    .set({ status: "archived", updatedAt: new Date() })
    .where(inArray(socialPosts.id, ids))
    .returning({ id: socialPosts.id });
  return rows.length;
}
