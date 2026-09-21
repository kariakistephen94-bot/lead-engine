import "server-only";

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 400_000;
const MAX_TEXT_CHARS = 6_000;

export type WebsiteFetchResult = {
  url: string;
  ok: boolean;
  text: string | null;
  error?: string;
};

/**
 * Fetch a prospect's homepage and reduce it to readable text.
 *
 * Deliberately conservative: a short timeout, a byte cap, no redirect loops and
 * no JS execution. A prospect's site failing to load is a normal outcome, not
 * an error — the caller lowers its confidence instead of failing the research.
 */
export async function fetchWebsiteText(website: string | null): Promise<WebsiteFetchResult | null> {
  if (!website) return null;

  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identify honestly; some sites block unknown agents outright.
        "user-agent": "AILeadEngine/1.0 (+internal prospect research)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return { url, ok: false, text: null, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return { url, ok: false, text: null, error: `Unsupported content type: ${contentType}` };
    }

    const html = await readCapped(response, MAX_BYTES);
    return { url, ok: true, text: htmlToText(html) };
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? `Timed out after ${TIMEOUT_MS / 1000}s`
        : (error as Error).message;
    return { url, ok: false, text: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/** Read at most `limit` bytes so a huge page can't exhaust memory. */
async function readCapped(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
    if (total >= limit) {
      await reader.cancel();
      break;
    }
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

export function htmlToText(html: string): string {
  const meta = [
    match(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i),
    match(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
  ].filter(Boolean);

  const body = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Keep block boundaries as newlines so headings don't merge into paragraphs.
    .replace(/<\/(p|div|section|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(`${meta.join(" — ")}\n${body}`)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim();

  return text.slice(0, MAX_TEXT_CHARS);
}

function match(html: string, regex: RegExp): string | null {
  return html.match(regex)?.[1]?.trim() ?? null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (full, name) => ENTITIES[name.toLowerCase()] ?? full);
}
