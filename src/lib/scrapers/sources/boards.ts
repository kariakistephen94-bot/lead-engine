import { fetchJson, fetchText, findEmail, parseRssItems, stripHtml } from "../http";
import type { LeadScraper, ScrapedJob, ScrapeOptions } from "../types";

/**
 * Remote job boards that publish an official public feed.
 *
 * Every adapter here reads a documented JSON API or RSS feed — nothing parses a
 * rendered page or works around a bot check, so these keep working and stay
 * within each site's terms.
 */

const take = <T,>(rows: T[], limit?: number) => (limit ? rows.slice(0, limit) : rows);
/**
 * Parse the several shapes these feeds use for a timestamp.
 *
 * Arbeitnow and Himalayas send Unix *seconds* — sometimes as a number, sometimes
 * as a string. Handing seconds straight to `new Date()` yields January 1970,
 * which silently backdates every posting from those sources.
 */
const date = (v: unknown): Date | null => {
  if (v == null) return null;
  let value: string | number = v as string | number;

  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    // 10 digits = seconds, 13 = milliseconds.
    value = String(n).length <= 10 ? n * 1000 : n;
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // A date before the web existed, or far in the future, is a parse failure.
  const year = d.getUTCFullYear();
  if (year < 1995 || year > 2100) return null;
  return d;
};

/** RemoteOK. Note: their API terms ask for a followed link back to remoteok.com. */
export class RemoteOkScraper implements LeadScraper {
  readonly name = "remoteok";
  readonly label = "Remote OK";
  readonly bucket = "active_buyer" as const;
  readonly origin = "https://remoteok.com/api (public JSON API; terms ask for a dofollow backlink)";
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const rows = await fetchJson<Record<string, unknown>[]>("https://remoteok.com/api");
    // Element 0 is the licence/legal notice, not a job.
    const jobs = rows.filter((r) => r && typeof r === "object" && "position" in r);
    return take(jobs, options.limit).map((j) => {
      const description = stripHtml(String(j.description ?? ""));
      return {
        source: this.name,
        sourceId: String(j.id ?? ""),
        url: String(j.url ?? j.apply_url ?? ""),
        title: String(j.position ?? ""),
        companyName: stripHtml(String(j.company ?? "")) || null,
        location: String(j.location ?? "") || null,
        remote: true,
        salary: j.salary_min && j.salary_max ? `${j.salary_min}–${j.salary_max}` : null,
        description,
        contactEmail: findEmail(description),
        postedAt: date(j.date ?? j.epoch),
        bucket: this.bucket,
        raw: j,
      };
    }).filter((j) => j.url && j.title);
  }
}

/** We Work Remotely — per-category RSS. */
export class WeWorkRemotelyScraper implements LeadScraper {
  readonly name = "weworkremotely";
  readonly label = "We Work Remotely";
  readonly bucket = "active_buyer" as const;
  readonly origin = "https://weworkremotely.com/*.rss (public RSS feeds)";
  private readonly feeds = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "https://weworkremotely.com/categories/remote-marketing-jobs.rss",
    "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
    "https://weworkremotely.com/categories/all-other-remote-jobs.rss",
  ];
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const out: ScrapedJob[] = [];
    for (const feed of this.feeds) {
      let xml: string;
      try { xml = await fetchText(feed); } catch { continue; }
      for (const item of parseRssItems(xml)) {
        // Titles arrive HTML-escaped ("Content Creator &amp; Video Producer").
        const raw = stripHtml(item.title ?? "");
        // WWR titles are "Company: Role".
        const idx = raw.indexOf(":");
        const company = idx > 0 ? raw.slice(0, idx).trim() : null;
        const title = idx > 0 ? raw.slice(idx + 1).trim() : raw.trim();
        const description = stripHtml(item.description);
        if (!item.link || !title) continue;
        out.push({
          source: this.name, sourceId: item.guid ?? item.link, url: item.link,
          title, companyName: company, location: item.region ?? null, remote: true,
          description, contactEmail: findEmail(description),
          postedAt: date(item.pubdate ?? item.published), bucket: this.bucket, raw: item,
        });
      }
    }
    return take(out, options.limit);
  }
}

/** Remotive — public JSON API. */
export class RemotiveScraper implements LeadScraper {
  readonly name = "remotive";
  readonly label = "Remotive";
  readonly bucket = "active_buyer" as const;
  readonly origin = "https://remotive.com/api/remote-jobs (public JSON API)";
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const data = await fetchJson<{ jobs: Record<string, unknown>[] }>(
      "https://remotive.com/api/remote-jobs",
    );
    return take(data.jobs ?? [], options.limit).map((j) => {
      const description = stripHtml(String(j.description ?? ""));
      return {
        source: this.name, sourceId: String(j.id ?? ""), url: String(j.url ?? ""),
        title: String(j.title ?? ""), companyName: String(j.company_name ?? "") || null,
        location: String(j.candidate_required_location ?? "") || null, remote: true,
        salary: String(j.salary ?? "") || null, description,
        contactEmail: findEmail(description), postedAt: date(j.publication_date),
        bucket: this.bucket, raw: j,
      };
    }).filter((j) => j.url && j.title);
  }
}

/** Arbeitnow — public JSON API, strong EU coverage. */
export class ArbeitnowScraper implements LeadScraper {
  readonly name = "arbeitnow";
  readonly label = "Arbeitnow";
  readonly bucket = "active_buyer" as const;
  readonly origin = "https://www.arbeitnow.com/api/job-board-api (public JSON API)";
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const data = await fetchJson<{ data: Record<string, unknown>[] }>(
      "https://www.arbeitnow.com/api/job-board-api",
    );
    return take(data.data ?? [], options.limit).map((j) => {
      const description = stripHtml(String(j.description ?? ""));
      return {
        source: this.name, sourceId: String(j.slug ?? ""), url: String(j.url ?? ""),
        title: String(j.title ?? ""), companyName: String(j.company_name ?? "") || null,
        location: String(j.location ?? "") || null, remote: Boolean(j.remote),
        description, contactEmail: findEmail(description),
        postedAt: date(j.created_at), bucket: this.bucket, raw: j,
      };
    }).filter((j) => j.url && j.title);
  }
}

/** Jobicy — public JSON API. */
export class JobicyScraper implements LeadScraper {
  readonly name = "jobicy";
  readonly label = "Jobicy";
  readonly bucket = "active_buyer" as const;
  readonly origin = "https://jobicy.com/api/v2/remote-jobs (public JSON API)";
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const data = await fetchJson<{ jobs: Record<string, unknown>[] }>(
      `https://jobicy.com/api/v2/remote-jobs?count=${Math.min(options.limit ?? 100, 100)}`,
    );
    return (data.jobs ?? []).map((j) => {
      const description = stripHtml(String(j.jobDescription ?? j.jobExcerpt ?? ""));
      return {
        source: this.name, sourceId: String(j.id ?? ""), url: String(j.url ?? ""),
        title: String(j.jobTitle ?? ""), companyName: String(j.companyName ?? "") || null,
        location: String(j.jobGeo ?? "") || null, remote: true,
        salary: j.salaryMin && j.salaryMax ? `${j.salaryMin}–${j.salaryMax} ${j.salaryCurrency ?? ""}`.trim() : null,
        description, contactEmail: findEmail(description),
        postedAt: date(j.pubDate), bucket: this.bucket, raw: j,
      };
    }).filter((j) => j.url && j.title);
  }
}

/** Himalayas — public JSON API. */
export class HimalayasScraper implements LeadScraper {
  readonly name = "himalayas";
  readonly label = "Himalayas";
  readonly bucket = "active_buyer" as const;
  readonly origin = "https://himalayas.app/jobs/api (public JSON API)";
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const data = await fetchJson<{ jobs?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>(
      `https://himalayas.app/jobs/api?limit=${Math.min(options.limit ?? 100, 100)}`,
    );
    const rows = data.jobs ?? data.data ?? [];
    return rows.map((j) => {
      const description = stripHtml(String(j.description ?? j.excerpt ?? ""));
      const url = String(j.applicationLink ?? j.guid ?? "");
      return {
        source: this.name, sourceId: String(j.guid ?? ""), url,
        title: String(j.title ?? ""), companyName: String(j.companyName ?? "") || null,
        location: Array.isArray(j.locationRestrictions) ? (j.locationRestrictions as string[]).join(", ") : null,
        remote: true,
        salary: j.minSalary && j.maxSalary ? `${j.minSalary}–${j.maxSalary} ${j.currency ?? ""}`.trim() : null,
        description, contactEmail: findEmail(description),
        postedAt: date(j.pubDate), bucket: this.bucket, raw: j,
      };
    }).filter((j) => j.url && j.title);
  }
}
