import { fetchJson, findEmail, stripHtml } from "../http";
import type { ScrapedJob } from "../types";

/**
 * Applicant-tracking systems, through the same public endpoints companies use
 * to embed their own careers page.
 *
 * This is the answer to "what is this company hiring for right now": given a
 * company slug, it returns their live openings. Nothing here is a private or
 * scraped endpoint — these are the documented board APIs.
 */
export type AtsVendor = "greenhouse" | "ashby" | "lever" | "workable";

export const ATS_ENDPOINTS: Record<AtsVendor, (slug: string) => string> = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
  lever: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
  workable: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`,
};

/** Fetch one company's live openings from one ATS. Returns [] if not on it. */
export async function fetchAtsJobs(vendor: AtsVendor, slug: string): Promise<ScrapedJob[]> {
  const url = ATS_ENDPOINTS[vendor](slug);
  let data: unknown;
  try {
    data = await fetchJson<unknown>(url);
  } catch {
    return []; // Not hosted on this vendor — an expected outcome, not an error.
  }

  const rows: Record<string, unknown>[] =
    vendor === "greenhouse" ? ((data as { jobs?: [] }).jobs ?? [])
    : vendor === "ashby" ? ((data as { jobs?: [] }).jobs ?? [])
    : vendor === "lever" ? (Array.isArray(data) ? data : [])
    : ((data as { jobs?: [] }).jobs ?? []);

  return rows.map((j) => {
    const description = stripHtml(
      String(j.content ?? j.descriptionPlain ?? j.descriptionHtml ?? j.description ??
        (j as { descriptionPlain?: string }).descriptionPlain ?? ""),
    );
    const location =
      String((j.location as { name?: string })?.name ?? j.location ??
        (j.categories as { location?: string })?.location ?? "") || null;
    const url =
      String(j.absolute_url ?? j.jobUrl ?? j.applyUrl ?? j.hostedUrl ??
        (j.shortlink as string) ?? "");
    return {
      source: `ats:${vendor}`,
      sourceId: String(j.id ?? j.shortcode ?? ""),
      url,
      title: String(j.title ?? j.text ?? ""),
      companyName: slug,
      location,
      remote: /remote/i.test(`${location} ${String(j.workplaceType ?? j.isRemote ?? "")}`),
      description,
      contactEmail: findEmail(description),
      postedAt: (() => {
        const v = j.updated_at ?? j.publishedAt ?? j.createdAt ?? j.published;
        const d = v ? new Date(v as string) : null;
        return d && !Number.isNaN(d.getTime()) ? d : null;
      })(),
      bucket: "active_buyer" as const,
      raw: j,
    };
  }).filter((j) => j.url && j.title);
}

/**
 * Try every vendor for a slug. Companies are on exactly one ATS, so the first
 * one that answers is the right one.
 */
export async function findCompanyOpenings(slug: string): Promise<ScrapedJob[]> {
  for (const vendor of Object.keys(ATS_ENDPOINTS) as AtsVendor[]) {
    const jobs = await fetchAtsJobs(vendor, slug);
    if (jobs.length) return jobs;
  }
  return [];
}

/** Company name -> the slug these boards use. */
export function toAtsSlug(companyName: string): string {
  return companyName.toLowerCase().replace(/\b(ltd|limited|llc|inc|gmbh|plc|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, "").trim();
}
