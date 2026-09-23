import "server-only";

import { inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { companies, companySignals, contacts, niches } from "@/db/schema";
import { analyzeHtml, scanPage, type SignalReport } from "@/lib/scrapers/signals";
import type { OsmPlace } from "@/lib/scrapers/sources/osm";
import { createImport, finishImport, processChunk, type MappedRow } from "@/lib/services/import";
import { getSourceIdBySlug } from "@/lib/services/lookups";
import { normalizeDomain, normalizeEmail } from "@/lib/utils";

/**
 * Turn mapped businesses into contactable leads.
 *
 * A directory entry is a *candidate*, not a lead. Every candidate is checked by
 * reading the business's own website, and only what that page actually proves
 * is kept:
 *
 *  - the site answers (the business still exists and is online),
 *  - there is a route to reach them (an address they publish themselves),
 *  - and there is evidence they are actively marketing — a linked Instagram,
 *    TikTok, YouTube or LinkedIn profile, or an advertising pixel.
 *
 * Anything failing those is rejected with the reason recorded, because a list
 * padded with dead domains costs more than a shorter list that is true. No
 * social platform is scraped: handles come from links the company puts on its
 * own homepage.
 */

export type Qualified = {
  place: OsmPlace;
  email: string;
  emailSource: "openstreetmap" | "website";
  report: SignalReport;
  social: Record<string, string>;
  /** Plain-language proof of an active presence, stored on the lead. */
  evidence: string[];
};

export type Rejection = { place: OsmPlace; reason: string };

/* -------------------------------------------------------------------------- */
/* Contact extraction                                                         */
/* -------------------------------------------------------------------------- */

/** Addresses that belong to a platform, a tracker or an image, never a business. */
const EMAIL_NOISE =
  /(example|sentry|wixpress|wix\.com|squarespace|godaddy|cloudflare|jquery|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp|\.js|\.css|@2x|domain\.com|yourdomain|email\.com|sentry\.io|localhost)/i;

/** Role addresses are published for exactly this purpose — prefer them. */
const ROLE_PREFIX =
  /^(info|hello|contact|enquir\w*|inquiries|office|reception|admin|hi|team|sales|mail|frontdesk|front\.desk|newpatients|appointments|bookings|support|help|studio|hey|general)[.@+-]/i;

/** Sentinel score meaning "never write to this address". */
const REJECT_EMAIL = -1000;

/** Mailbox names that reach a department which is not the buyer. */
const WRONG_DEPARTMENT =
  /^(webmaster|postmaster|abuse|noreply|no-reply|donotreply|privacy|dpo|unsubscribe|press|media|pr|careers?|jobs|recruit\w*|legal|billing|invoices?|accounts?payable|ap|security|dmca|investors?)$/i;

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
  "yahoo.com", "yahoo.co.uk", "aol.com", "icloud.com", "me.com", "msn.com", "comcast.net",
  "verizon.net", "sbcglobal.net", "att.net", "btinternet.com", "sky.com", "protonmail.com",
]);

/**
 * Score an address, or reject it outright.
 *
 * The hard rule is the domain: an address must be on the site's own domain or a
 * mainstream mailbox provider. Anything else found on a page belongs to someone
 * else — a supplier, a web designer's credit, a body the business is a member of
 * — and writing to it would contact a stranger under this lead's name.
 */
function rankEmail(email: string, siteDomain: string | null): number {
  const [local, domain] = email.split("@");
  const ownDomain = Boolean(siteDomain) && (domain === siteDomain || domain.endsWith(`.${siteDomain}`) || siteDomain!.endsWith(`.${domain}`));
  if (!ownDomain && !FREE_MAIL.has(domain)) return REJECT_EMAIL;
  if (WRONG_DEPARTMENT.test(local)) return REJECT_EMAIL;

  let score = ownDomain ? 100 : 0;
  if (ROLE_PREFIX.test(`${local}@`)) score += 50;
  // Free-mail is common and usable for small trades, just less good than a domain.
  if (FREE_MAIL.has(domain)) score -= 20;
  return score;
}

/**
 * Best publishable contact address on a page.
 *
 * `mailto:` links are trusted first: an address the site links for contact is
 * unambiguously meant to be written to, where a string in body text may be a
 * customer's address in a testimonial.
 */
export function extractEmail(html: string, siteDomain: string | null): string | null {
  const found = new Set<string>();

  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const email = normalizeEmail(decodeURIComponent(m[1]));
    if (email && !EMAIL_NOISE.test(email)) found.add(email);
  }
  if (!found.size) {
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
    for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
      const email = normalizeEmail(m[0]);
      if (email && !EMAIL_NOISE.test(email)) found.add(email);
    }
  }

  const ranked = [...found]
    .map((email) => ({ email, score: rankEmail(email, siteDomain) }))
    .filter((e) => e.score > REJECT_EMAIL)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.email ?? null;
}

/** The site's own contact page, so the fallback fetch is one the site expects. */
function findContactPath(html: string, baseUrl: string): string | null {
  const m = html.match(/href=["']([^"']*(?:contact|kontakt|get-in-touch|about-us)[^"']*)["']/i);
  const candidate = m?.[1] ?? "/contact";
  try {
    const url = new URL(candidate, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Social presence                                                            */
/* -------------------------------------------------------------------------- */

/** Path segments that look like a handle but are platform plumbing. */
const NOT_A_HANDLE = new Set([
  "tr", "sharer", "share", "plugins", "dialog", "intent", "login", "home", "help", "policy",
  "policies", "privacy", "terms", "legal", "about", "explore", "accounts", "hashtag", "embed",
  "watch", "reel", "reels", "pages", "groups", "events", "profile", "search", "results",
  "feed", "company", "showcase", "public", "static", "images", "img", "assets", "wix",
  "squarespace", "wordpress", "shopify", "your", "yourbusiness", "username", "handle",
  "bolt", "widget", "online", "place", "mapbox", "maps", "cdn", "api", "www",
]);

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok",
  linkedin: "LinkedIn", youtube: "YouTube", x: "X/Twitter",
};

export function cleanSocial(social: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [platform, handle] of Object.entries(social)) {
    const value = handle.replace(/\/+$/, "");
    if (!value || NOT_A_HANDLE.has(value.toLowerCase())) continue;
    if (/^(p|tv|status|video|posts?)$/i.test(value)) continue;
    // A numeric id is what a share widget emits, not a handle anyone can visit.
    if (/^\d{5,}$/.test(value)) continue;
    out[platform] = value;
  }
  return out;
}

export function socialUrl(platform: string, handle: string): string | null {
  switch (platform) {
    case "instagram": return `https://www.instagram.com/${handle}`;
    case "tiktok": return `https://www.tiktok.com/@${handle}`;
    case "linkedin": return `https://www.linkedin.com/company/${handle}`;
    // Channel ids come out of /channel/UC… links and are not @handles; sending
    // one to the @ form produces a URL that 404s.
    case "youtube": return /^UC[\w-]{20,}$/.test(handle)
      ? `https://www.youtube.com/channel/${handle}`
      : `https://www.youtube.com/@${handle}`;
    case "x": return `https://x.com/${handle}`;
    default: return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Qualification                                                              */
/* -------------------------------------------------------------------------- */

export type QualifyOptions = {
  concurrency?: number;
  /** Called after each candidate so a long run can report progress. */
  onResult?: (result: { qualified: Qualified | null; rejection: Rejection | null }) => void;
  /** Stop as soon as this many candidates have qualified. */
  target?: number;
};

async function qualifyOne(place: OsmPlace): Promise<{ qualified: Qualified | null; rejection: Rejection | null }> {
  const siteDomain = normalizeDomain(place.website);
  const { report, html } = await scanPage(place.website, 15_000);

  // A dead or unreachable site is the single strongest disqualifier: whatever
  // the map says, there is nothing live to sell to and no way to verify them.
  if (report.httpStatus === null) {
    // `TypeError` is what fetch throws for DNS, TLS and connection failures;
    // reported raw it tells the reader nothing about why the lead was dropped.
    const raw = report.error ?? "unreachable";
    const reason =
      raw === "TypeError" ? "site unreachable (DNS or TLS failure)"
      : raw === "AbortError" ? "site timed out"
      : raw;
    return { qualified: null, rejection: { place, reason } };
  }
  if (report.httpStatus >= 400) return { qualified: null, rejection: { place, reason: `HTTP ${report.httpStatus}` } };
  if (!html) return { qualified: null, rejection: { place, reason: report.error ?? "no readable page" } };

  /*
   * An address tagged in OSM is trusted ahead of anything scraped, and is not
   * put through the domain rule below: a mapper attached it to this specific
   * premises, so an alternate brand domain or a parent company's mailbox is
   * information, not the mismatch it would be on a scraped page.
   */
  let email = normalizeEmail(place.email) ?? extractEmail(html, siteDomain);
  let emailSource: Qualified["emailSource"] = normalizeEmail(place.email) ? "openstreetmap" : "website";
  let social = cleanSocial(report.social);
  let contactReport = report;

  // One follow-up fetch, and only when the homepage answered neither question.
  if (!email || !Object.keys(social).length) {
    const contactUrl = findContactPath(html, report.finalUrl ?? place.website);
    if (contactUrl) {
      const contact = await scanPage(contactUrl, 15_000);
      if (contact.html) {
        if (!email) {
          const found = extractEmail(contact.html, siteDomain);
          if (found) { email = found; emailSource = "website"; }
        }
        const extra = cleanSocial(
          analyzeHtml(contact.html, { url: contactUrl, finalUrl: contact.report.finalUrl, status: contact.report.httpStatus }).social,
        );
        social = { ...extra, ...social };
        // Keep whichever page produced the fuller signal picture.
        if (!contactReport.adPlatforms.length && contact.report.adPlatforms.length) contactReport = contact.report;
      }
    }
  }

  if (!email) return { qualified: null, rejection: { place, reason: "no contact address published" } };

  const evidence: string[] = [];
  for (const [platform, handle] of Object.entries(social)) {
    const url = socialUrl(platform, handle);
    if (url) evidence.push(`${PLATFORM_LABEL[platform] ?? platform}: ${url}`);
  }
  // An x.com link on its own is the least reliable of the six — the pattern
  // catches plenty of links that are not the business's account — so it counts
  // as detail on a lead, never as the thing that qualifies one.
  const realProfiles = Object.keys(social).filter((p) => p !== "x");
  const ads = contactReport.adPlatforms.filter((p) => !/Tag Manager/.test(p));
  if (ads.length) evidence.push(`Running ads (${ads.join(", ")})`);
  if (contactReport.hasBooking) evidence.push(`Online booking via ${contactReport.bookingVendor}`);
  if (contactReport.hasLiveChat) evidence.push(`Live chat via ${contactReport.chatVendor}`);

  // "Active presence" has to mean something checkable. A live site alone does
  // not: plenty of them were built once and abandoned. A linked social profile,
  // money spent on ads, or a live booking/chat tool is current activity.
  const active = realProfiles.length || ads.length || contactReport.hasBooking || contactReport.hasLiveChat;
  if (!active) return { qualified: null, rejection: { place, reason: "no social profile or marketing activity found" } };

  evidence.unshift(`Website live (HTTP ${report.httpStatus})`);
  return {
    qualified: { place, email, emailSource, report: { ...contactReport, social }, social, evidence },
    rejection: null,
  };
}

/**
 * Verify candidates with a pool of workers, stopping at `target`.
 *
 * A pool, not batches: with `Promise.all` over fixed batches every worker waits
 * for the slowest site in its group, so one server that takes the full timeout
 * idles eleven others. Pulling from a shared cursor instead keeps all of them
 * busy, which is the difference between an hour and several.
 */
export async function qualifyPlaces(
  places: OsmPlace[],
  options: QualifyOptions = {},
): Promise<{ qualified: Qualified[]; rejected: Rejection[]; checked: number }> {
  const { concurrency = 8, onResult, target } = options;
  const qualified: Qualified[] = [];
  const rejected: Rejection[] = [];
  let checked = 0;
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, places.length) }, async () => {
      for (;;) {
        if (target && qualified.length >= target) return;
        const index = cursor++;
        if (index >= places.length) return;
        const place = places[index];

        let result: { qualified: Qualified | null; rejection: Rejection | null };
        try {
          result = await qualifyOne(place);
        } catch (e) {
          result = { qualified: null, rejection: { place, reason: (e as Error).message.slice(0, 120) } };
        }

        checked++;
        if (result.qualified) qualified.push(result.qualified);
        if (result.rejection) rejected.push(result.rejection);
        onResult?.(result);
      }
    }),
  );

  return { qualified, rejected, checked };
}

/* -------------------------------------------------------------------------- */
/* Ingestion                                                                  */
/* -------------------------------------------------------------------------- */

export type IngestResult = {
  importId: string;
  imported: number;
  duplicates: number;
  invalid: number;
  merged: number;
  signalsWritten: number;
};

function toRow(lead: Qualified, rowNumber: number): MappedRow {
  const { place } = lead;
  const address = [place.street, place.city, place.region, place.postcode].filter(Boolean).join(", ");
  const linkedin = lead.social.linkedin ? socialUrl("linkedin", lead.social.linkedin) : null;

  return {
    rowNumber,
    data: {
      companyName: place.name,
      website: place.website,
      industry: place.industry,
      location: `${place.city}, ${place.region}`,
      city: place.city,
      country: place.country,
      companyPhone: place.phone ?? "",
      companyLinkedin: linkedin ?? "",
      // The address is what OSM verified about the premises; the evidence line
      // is what this run verified about them being online and reachable.
      companyDescription: [address, lead.evidence.join(" | ")].filter(Boolean).join(" — ").slice(0, 1000),
      email: lead.email,
      phone: place.phone ?? "",
      sourceUrl: place.sourceUrl,
    },
  };
}

/**
 * Write qualified leads through the CSV import pipeline.
 *
 * Reused deliberately rather than inserting directly: it is the one code path
 * with duplicate detection, blank-filling merge and an audit row per record, so
 * a harvest can never quietly create a second copy of a lead you already have.
 * One import per niche, because the niche is a property of the batch.
 */
export async function ingestLeads(
  leads: Qualified[],
  options: { userId: string | null; label: string },
): Promise<IngestResult[]> {
  const sourceId = await getSourceIdBySlug("openstreetmap");
  const nicheRows = await db.select({ id: niches.id, slug: niches.slug }).from(niches);
  const nicheBySlug = new Map(nicheRows.map((n) => [n.slug, n.id]));

  const byNiche = new Map<string, Qualified[]>();
  for (const lead of leads) {
    const list = byNiche.get(lead.place.niche) ?? [];
    list.push(lead);
    byNiche.set(lead.place.niche, list);
  }

  const results: IngestResult[] = [];

  for (const [niche, group] of byNiche) {
    const nicheId = nicheBySlug.get(niche) ?? null;
    const rows = group.map(toRow);

    const importId = await createImport({
      filename: `${options.label} — ${niche} (${rows.length})`.slice(0, 200),
      totalRows: rows.length,
      mapping: { source: "openstreetmap-harvest", niche, verified: "website-scan" },
      nicheId,
      sourceId,
      userId: options.userId,
    });

    let totals = { imported: 0, duplicates: 0, invalid: 0, merged: 0 };
    // Chunked for the same reason the UI chunks: one unbounded transaction over
    // thousands of rows is what turns a slow import into a failed one.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = await processChunk(importId, rows.slice(i, i + 200), { nicheId, sourceId, userId: options.userId });
      totals = {
        imported: totals.imported + chunk.imported,
        duplicates: totals.duplicates + chunk.duplicates,
        invalid: totals.invalid + chunk.invalid,
        merged: totals.merged + chunk.merged,
      };
    }
    await finishImport(importId);

    const signalsWritten = await writeSignals(group);
    results.push({ importId, ...totals, signalsWritten });
  }

  return results;
}

/**
 * Persist what the qualification scan already learned.
 *
 * The scan happened during verification, so storing it here means the engine's
 * opportunity view is populated without re-fetching every site a second time.
 */
async function writeSignals(leads: Qualified[]): Promise<number> {
  const byDomain = new Map<string, Qualified>();
  for (const lead of leads) {
    const domain = normalizeDomain(lead.place.website);
    if (domain) byDomain.set(domain, lead);
  }
  if (!byDomain.size) return 0;

  const domains = [...byDomain.keys()];
  const rows: { id: string; domain: string | null }[] = [];
  for (let i = 0; i < domains.length; i += 500) {
    rows.push(
      ...(await db
        .select({ id: companies.id, domain: companies.domain })
        .from(companies)
        .where(inArray(companies.domain, domains.slice(i, i + 500)))),
    );
  }

  let written = 0;
  for (const row of rows) {
    const lead = row.domain ? byDomain.get(row.domain) : undefined;
    if (!lead) continue;
    const r = lead.report;
    const values = {
      httpStatus: r.httpStatus, finalUrl: r.finalUrl, error: r.error,
      hasLiveChat: r.hasLiveChat, chatVendor: r.chatVendor,
      hasBooking: r.hasBooking, bookingVendor: r.bookingVendor,
      hasLeadForm: r.hasLeadForm, hasVideo: r.hasVideo,
      adPlatforms: r.adPlatforms, hasAnalytics: r.hasAnalytics,
      cms: r.cms, stack: r.stack, https: r.https,
      mobileFriendly: r.mobileFriendly, social: lead.social,
      opportunityScore: r.opportunityScore, opportunities: r.opportunities,
      suggestedBucket: r.suggestedBucket, checkedAt: new Date(),
    };
    await db
      .insert(companySignals)
      .values({ companyId: row.id, ...values })
      .onConflictDoUpdate({ target: companySignals.companyId, set: values });
    written++;
  }
  return written;
}

/** Domains already in the database — skipped before a single site is fetched. */
export async function existingDomains(): Promise<Set<string>> {
  const rows = await db.select({ domain: companies.domain }).from(companies);
  return new Set(rows.map((r) => r.domain).filter((d): d is string => Boolean(d)));
}

/** Contact addresses already in the database, for the same reason. */
export async function existingEmails(): Promise<Set<string>> {
  const rows = await db.select({ email: contacts.email }).from(contacts).where(isNotNull(contacts.email));
  return new Set(rows.map((r) => r.email!.toLowerCase()));
}
