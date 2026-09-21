import {
  ArbeitnowScraper, HimalayasScraper, JobicyScraper,
  RemoteOkScraper, RemotiveScraper, WeWorkRemotelyScraper,
} from "./sources/boards";
import { HackerNewsHiringScraper, HackerNewsListeningScraper } from "./sources/hackernews";
import type { LeadScraper } from "./types";

export const SCRAPERS: LeadScraper[] = [
  new RemoteOkScraper(),
  new WeWorkRemotelyScraper(),
  new RemotiveScraper(),
  new ArbeitnowScraper(),
  new JobicyScraper(),
  new HimalayasScraper(),
  new HackerNewsHiringScraper(),
  new HackerNewsListeningScraper(),
];

export function getScraper(name: string): LeadScraper | undefined {
  return SCRAPERS.find((s) => s.name === name);
}

/**
 * Sources from the lead plan that this engine deliberately does NOT scrape,
 * with the reason and the legitimate route to the same outcome.
 *
 * Kept in code, and shown in the UI, so the gaps are explicit: a scraper that
 * silently returns nothing because a site blocked it is worse than no scraper,
 * and several of these would risk the account you would be selling from.
 */
export const BLOCKED_SOURCES: {
  name: string; bucket: string; reason: string; alternative: string;
}[] = [
  { name: "Upwork", bucket: "Active buyers", reason: "Returns HTTP 403 to non-browser clients; the public API needs an approved OAuth app.", alternative: "Apply for an Upwork API key, then add an adapter — the interface is ready for it." },
  { name: "Contra", bucket: "Active buyers", reason: "Redirects bots (302) and renders client-side.", alternative: "Watch briefs manually; no public API exists." },
  { name: "Fiverr Pro", bucket: "Active buyers", reason: "No public API, and it lists sellers rather than buyers.", alternative: "Not a lead source for this model — skip." },
  { name: "Wellfound", bucket: "Active buyers", reason: "Job data is rendered client-side behind bot protection.", alternative: "Use their email alerts; ATS adapters cover many of the same startups." },
  { name: "Y Combinator / Work at a Startup", bucket: "Active buyers", reason: "Returns HTTP 406 to non-browser clients and requires a login.", alternative: "Covered indirectly — the Hacker News 'Who is hiring' adapter is the same companies." },
  { name: "LinkedIn (Jobs, Ads, people search)", bucket: "Active buyers / Spending money", reason: "Scraping is prohibited by their terms and actively litigated; automation risks a permanent ban on the account you sell from.", alternative: "Use LinkedIn manually, or Sales Navigator exports. The engine stores anything you export via CSV import." },
  { name: "Meta Ads Library", bucket: "Spending money", reason: "Returns HTTP 403 to scripted requests; the official API needs an approved app and access token.", alternative: "The website signal scanner detects the Meta Pixel on a company's own site — direct evidence they are buying traffic." },
  { name: "Reddit", bucket: "Communities / Listening", reason: "The public .json endpoints now return 403; the API requires OAuth credentials.", alternative: "Register a Reddit app for a client id/secret and an adapter can be added. Hacker News listening covers the same need today." },
  { name: "Google search (site: queries)", bucket: "Spending money", reason: "No free official API; scraping results violates their terms and is blocked. DuckDuckGo's HTML endpoint now returns a challenge page.", alternative: "A Brave Search or Bing Search API key would make this adapter straightforward." },
  { name: "TikTok / Instagram / Facebook / X / Threads", bucket: "Listening / video clients", reason: "All require authentication, block automation, and their terms forbid it. Bulk-collecting individuals' posts is also personal data.", alternative: "The signal scanner extracts a company's own social handles from their website, so you can review the accounts manually." },
  { name: "Discord / Slack communities", bucket: "Communities", reason: "Private spaces requiring membership and a bot token; scraping members would breach both the platform terms and the community's trust.", alternative: "Join and participate manually — as your own plan says, answer questions rather than broadcast." },
];

export * from "./types";
export * from "./keywords";
