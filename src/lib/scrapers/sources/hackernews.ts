import { fetchJson, findEmail, stripHtml } from "../http";
import { ALL_KEYWORDS, matchTerms, PAIN_PHRASES } from "../keywords";
import type { LeadScraper, ScrapedJob, ScrapeOptions } from "../types";

type Hit = {
  objectID: string; author: string; comment_text?: string; story_title?: string;
  story_id?: number; created_at: string; title?: string; url?: string;
};

const api = (path: string) => `https://hn.algolia.com/api/v1/${path}`;
const permalink = (id: string) => `https://news.ycombinator.com/item?id=${id}`;

/** Markers of a candidate advertising themselves rather than a buyer. */
const SEEKING_WORK =
  /willing to relocate\s*:|\br[eé]sum[eé]\s*:|\bcv\s*:|seeking\s*:\s*(full|part|contract|freelance)|available for (hire|work|contract)|open to (work|opportunities)/i;

/**
 * Hacker News, through the public Algolia search API.
 *
 * Two distinct veins here:
 *  - the monthly "Ask HN: Who is hiring?" and "Seeking freelancer?" threads,
 *    where every top-level comment is a company actively spending; and
 *  - free-text search across all comments, which is the closest legitimate
 *    equivalent to the social-listening bucket — real people describing a
 *    problem in public, on a platform whose API is open.
 */
export class HackerNewsHiringScraper implements LeadScraper {
  readonly name = "hackernews";
  readonly label = "Hacker News — Who is Hiring / Seeking Freelancer";
  readonly bucket = "active_buyer" as const;
  readonly origin = "https://hn.algolia.com/api (official public search API)";
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const terms = options.terms?.length ? options.terms : ALL_KEYWORDS;
    const out: ScrapedJob[] = [];
    const seen = new Set<string>();

    // Relevance-ranked search happily returns the 2011 thread, so the window is
    // pinned explicitly: a job posted years ago is not a lead.
    const since = options.since ?? new Date(Date.now() - 120 * 86_400_000);
    const cutoff = Math.floor(since.getTime() / 1000);

    const threads = await fetchJson<{ hits: Hit[] }>(
      api(
        `search_by_date?query=${encodeURIComponent("who is hiring")}&tags=(story,ask_hn)` +
          `&numericFilters=created_at_i>${cutoff}&hitsPerPage=30`,
      ),
    );
    const storyIds = threads.hits
      .filter((h) => /who is hiring|freelancer|who wants to be hired/i.test(h.title ?? ""))
      .map((h) => h.objectID)
      .slice(0, 4);

    for (const storyId of storyIds) {
      let page = 0;
      // Two pages of 100 per thread is plenty and keeps API load modest.
      while (page < 2) {
        const res = await fetchJson<{ hits: Hit[]; nbPages: number }>(
          api(`search?tags=comment,story_${storyId}&hitsPerPage=100&page=${page}`),
        );
        for (const hit of res.hits ?? []) {
          const text = stripHtml(hit.comment_text ?? "");
          if (text.length < 60 || seen.has(hit.objectID)) continue;
          const lower = text.toLowerCase();
          if (!terms.some((t) => lower.includes(t.toLowerCase()))) continue;
          seen.add(hit.objectID);

          const { company, role } = splitHiringComment(text);
          out.push({
            source: this.name, sourceId: hit.objectID, url: permalink(hit.objectID),
            title: role, companyName: company, location: null,
            remote: /\bremote\b/i.test(text), description: text.slice(0, 4000),
            contactEmail: findEmail(text), postedAt: new Date(hit.created_at),
            bucket: this.bucket, raw: hit,
          });
          if (options.limit && out.length >= options.limit) return out;
        }
        if (page + 1 >= (res.nbPages ?? 1)) break;
        page++;
      }
    }
    return out;
  }
}

/**
 * "Who is hiring" comments follow a loose convention:
 *   Company | Role | Location | REMOTE | url
 * Take the first segment as the company and the first segment that reads like a
 * role as the title, rather than dumping the whole comment into both fields.
 */
function splitHiringComment(text: string): { company: string | null; role: string } {
  const firstLine = text.split(/\n/)[0].trim();
  const parts = firstLine.split(/\s*(?:\||—|–|\u2022)\s*/).filter(Boolean);
  const candidate = (parts[0] ?? "").replace(/\s*\(.*?\)\s*/g, " ").trim();
  // A long first segment is prose, not a company name — better empty than wrong.
  const company = candidate.length > 0 && candidate.length <= 60 && candidate.split(/\s+/).length <= 7
    ? candidate
    : null;
  const ROLE = /(engineer|developer|designer|manager|marketer|editor|analyst|scientist|lead|director|founder|intern|architect|automation|video|content|specialist|consultant)/i;
  const role = parts.slice(1).find((p) => ROLE.test(p))?.trim()
    ?? parts[1]?.trim()
    ?? firstLine;
  return { company, role: role.slice(0, 200) || "Hacker News hiring post" };
}

/** Free-text comment search — the "search for pain, not for clients" bucket. */
export class HackerNewsListeningScraper implements LeadScraper {
  readonly name = "hackernews-listening";
  readonly label = "Hacker News — social listening";
  readonly bucket = "social_listening" as const;
  readonly origin = "https://hn.algolia.com/api (official public search API)";
  isConfigured() { return true; }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedJob[]> {
    const terms = options.terms?.length ? options.terms : ["n8n", "zapier", "make.com", "ai agent", "chatbot", "automation"];
    const out: ScrapedJob[] = [];
    const seen = new Set<string>();

    for (const term of terms) {
      const res = await fetchJson<{ hits: Hit[] }>(
        api(`search_by_date?query=${encodeURIComponent(term)}&tags=comment&hitsPerPage=40`),
      );
      for (const hit of res.hits ?? []) {
        const text = stripHtml(hit.comment_text ?? "");
        if (text.length < 80 || seen.has(hit.objectID)) continue;

        /*
         * The point of this bucket is pain, not vocabulary. Someone discussing
         * how GPT-2 works mentions "openai" but is not a buyer; someone saying
         * "our process is manual and this takes forever" is. Requiring a pain
         * phrase alongside the service keyword is what separates the two.
         */
        const pain = matchTerms(text, PAIN_PHRASES);
        if (!pain.length) continue;
        // "Who wants to be hired" posts follow a résumé format. They are other
        // freelancers advertising, not buyers — pitching them is a wasted send.
        if (SEEKING_WORK.test(text)) continue;
        seen.add(hit.objectID);
        out.push({
          source: this.name, sourceId: hit.objectID, url: permalink(hit.objectID),
          title: `“${pain[0]}” — ${text.slice(0, 140).trim()}`,
          // A discussion thread is not a company; keep it out of that field.
          companyName: null,
          location: null, remote: false,
          description: `[${hit.story_title ?? "HN"}] ${text}`.slice(0, 4000),
          contactEmail: findEmail(text), postedAt: new Date(hit.created_at),
          bucket: this.bucket, raw: hit,
        });
        if (options.limit && out.length >= options.limit) return out;
      }
    }
    return out;
  }
}
