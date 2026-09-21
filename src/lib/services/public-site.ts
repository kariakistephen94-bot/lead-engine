import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { buildLogs, buildProjects, leadSources, notes, type CaseStudy } from "@/db/schema";
import { createLead } from "@/lib/services/lead-writes";

/* -------------------------------------------------------------------------- */
/* Projects the website may show                                              */
/* -------------------------------------------------------------------------- */

export type PublicProject = {
  slug: string;
  number: number;
  title: string;
  summary: string | null;
  features: string[];
  stack: string[];
  status: string;
  /** Days actually logged — the only progress claim that is checkable. */
  daysLogged: number;
  completedAt: string | null;
  repoUrl: string | null;
  demoUrl: string | null;
  youtubeUrl: string | null;
  /** A few real log lines, so a visitor sees the work rather than a claim. */
  highlights: string[];
  /** The written page. Null means the index card is all there is. */
  caseStudy: CaseStudy | null;
};

/**
 * What the Kiln site is allowed to publish.
 *
 * Only rows explicitly flagged `published`. Nothing here is derived from
 * `completed`, because finishing something and being willing to show it to a
 * paying client are separate decisions.
 *
 * Note what is *not* returned: notes, blockers, hours. Blockers are excellent
 * social-media material and poor sales material, and hours invite a rate
 * calculation nobody asked for.
 */
export async function listPublishedProjects(): Promise<PublicProject[]> {
  const rows = await db
    .select()
    .from(buildProjects)
    .where(eq(buildProjects.published, true))
    .orderBy(desc(buildProjects.completedAt), buildProjects.number);

  return Promise.all(
    rows.map(async (project) => {
      const logs = await db
        .select({ built: buildLogs.built, learned: buildLogs.learned })
        .from(buildLogs)
        .where(eq(buildLogs.projectId, project.id))
        .orderBy(desc(buildLogs.loggedOn));

      return {
        slug: slugify(project.title),
        number: project.number,
        title: project.title,
        summary: project.summary,
        features: project.features,
        stack: project.stack,
        status: project.status,
        daysLogged: logs.length,
        completedAt: project.completedAt?.toISOString() ?? null,
        repoUrl: project.repoUrl,
        demoUrl: project.demoUrl,
        youtubeUrl: project.youtubeUrl,
        caseStudy: project.caseStudy,
        highlights: logs
          .map((log) => log.learned ?? log.built)
          .filter((line): line is string => Boolean(line))
          .slice(0, 3),
      };
    }),
  );
}

/**
 * One published project by slug.
 *
 * Reads the same list rather than querying by slug: the slug is derived from
 * the title, not stored, so it has nowhere to be indexed. At 27 projects the
 * cost of that is nothing, and it guarantees the detail page and the index can
 * never disagree about what a slug means.
 */
export async function getPublishedProject(slug: string): Promise<PublicProject | null> {
  const all = await listPublishedProjects();
  return all.find((project) => project.slug === slug) ?? null;
}

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* -------------------------------------------------------------------------- */
/* Enquiries from the website                                                 */
/* -------------------------------------------------------------------------- */

export type WebsiteEnquiry = {
  name: string;
  email: string;
  company: string | null;
  message: string;
  /** Which service they came in about, or "chatbot" for a captured chat. */
  interest: "workflows" | "subagents" | "cohort" | "general" | "chatbot";
  /** The page they submitted from, so ad spend can be traced to enquiries. */
  sourceUrl: string | null;
};

export type EnquiryResult = { status: "created" | "duplicate"; contactId: string };

/**
 * Turn a website enquiry into a real lead.
 *
 * Deliberately routed through `createLead` rather than a direct insert: it
 * already refuses a second contact for an address that exists, and someone who
 * fills in the form twice — or who is already in the pipeline from outbound —
 * must not become two people.
 *
 * The message is stored as a note rather than squeezed into a column. It is
 * the most valuable thing in the payload and it deserves to be readable.
 */
export async function captureEnquiry(enquiry: WebsiteEnquiry): Promise<EnquiryResult> {
  const [first, ...rest] = enquiry.name.trim().split(/\s+/);

  const [source] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(eq(leadSources.slug, "website-research"))
    .limit(1);

  const result = await createLead(
    {
      // Someone enquiring without naming a company is still a lead; their own
      // name is the honest placeholder, not a fabricated business.
      companyName: enquiry.company?.trim() || enquiry.name.trim(),
      firstName: first ?? undefined,
      lastName: rest.join(" ") || undefined,
      email: enquiry.email,
      sourceId: source?.id ?? undefined,
      sourceUrl: enquiry.sourceUrl ?? undefined,
      // Inbound, so they skip the cold part of the pipeline entirely.
      status: "positive_reply",
      leadScore: 80,
    },
    null,
  );

  await db.insert(notes).values({
    contactId: result.contactId,
    body: [
      `Website enquiry — ${enquiry.interest}`,
      enquiry.sourceUrl ? `From: ${enquiry.sourceUrl}` : null,
      "",
      enquiry.message.trim(),
    ]
      .filter((line) => line !== null)
      .join("\n"),
  });

  return { status: result.status, contactId: result.contactId };
}
