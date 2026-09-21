import { ScrapeError } from "./types";

/**
 * Identify the client honestly. Several of these APIs reject anonymous or
 * spoofed browser agents, and a real contact address is the difference between
 * being rate-limited and being blocked.
 */
export const USER_AGENT =
  "ai-lead-engine/0.1 (lead sourcing; +mailto:lisbon.platform@gmail.com)";

const DEFAULT_TIMEOUT = 30_000;

export async function fetchText(
  url: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<string> {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "*/*", ...(rest.headers ?? {}) },
    });
    if (!response.ok) throw new ScrapeError(`HTTP ${response.status} from ${url}`, url);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit & { timeout?: number }): Promise<T> {
  const body = await fetchText(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ScrapeError(`Response from ${url} was not JSON`, url);
  }
}

/** Decode the entity forms that actually appear in these feeds. */
function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** Strip tags and decode entities so keyword matching sees real words. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** First email in a blob of text — many postings put the contact route inline. */
export function findEmail(text: string): string | null {
  const m = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const email = m?.[0]?.toLowerCase() ?? null;
  // Skip addresses that are always boilerplate rather than a real contact.
  if (!email || /(example|sentry|wixpress|cloudflare|\.png|\.jpg|\.gif)/.test(email)) return null;
  return email;
}

/**
 * Minimal RSS/Atom item extraction — avoids adding an XML dependency.
 *
 * The inner content is isolated before scanning for child tags: run the tag
 * pattern over the whole `<item>…</item>` block and it matches the wrapper
 * first, consuming everything and yielding no fields.
 */
export function parseRssItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const blockRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let block: RegExpExecArray | null;

  while ((block = blockRe.exec(xml))) {
    const inner = block[2];
    const item: Record<string, string> = {};
    const tagRe = /<([a-z0-9:]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(inner))) {
      const key = tag[1].toLowerCase().replace(/^.*:/, "");
      const value = tag[2].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
      if (!(key in item) && value) item[key] = value;
    }
    // Atom puts the URL in an attribute rather than the element body.
    const href = inner.match(/<link[^>]*\shref="([^"]+)"/i)?.[1];
    if (href && !item.link) item.link = href;
    if (Object.keys(item).length) items.push(item);
  }
  return items;
}
