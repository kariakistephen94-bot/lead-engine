import type { LeadBucket } from "@/db/schema";
import { USER_AGENT } from "./http";

/**
 * Qualify a business by reading its own public website.
 *
 * This is the engine's answer to the "Businesses that need you" and
 * "Businesses spending money" buckets, and it is the legitimate substitute for
 * scraping an ads library: an advertising pixel on the company's own homepage is
 * direct, first-party evidence that they are buying traffic. Everything checked
 * here is markup the site serves to any visitor.
 *
 * A signal is `null`, never `false`, when the page could not be read — "we do
 * not know" and "they do not have it" must not collapse into the same answer,
 * or the score becomes fiction.
 */

type Detector = { name: string; patterns: RegExp[] };

const CHAT: Detector[] = [
  { name: "Intercom", patterns: [/intercom(cdn|\.io|settings)/i, /widget\.intercom/i] },
  { name: "Drift", patterns: [/js\.driftt\.com/i, /drift\.com\/widget/i] },
  { name: "Tawk.to", patterns: [/embed\.tawk\.to/i] },
  { name: "Crisp", patterns: [/client\.crisp\.chat/i] },
  { name: "HubSpot Chat", patterns: [/js\.hs-scripts\.com/i, /hubspot.*conversations/i] },
  { name: "Zendesk", patterns: [/static\.zdassets\.com/i, /zopim/i] },
  { name: "LiveChat", patterns: [/cdn\.livechatinc\.com/i] },
  { name: "Tidio", patterns: [/code\.tidio\.co/i] },
  { name: "Freshchat", patterns: [/wchat\.freshchat\.com/i] },
  { name: "Smartsupp", patterns: [/smartsuppchat\.com/i] },
  { name: "WhatsApp", patterns: [/wa\.me\//i, /api\.whatsapp\.com\/send/i] },
  { name: "Facebook Messenger", patterns: [/fb-customerchat/i, /connect\.facebook\.net.*Messenger/i] },
];

const BOOKING: Detector[] = [
  { name: "Calendly", patterns: [/calendly\.com/i] },
  { name: "Acuity", patterns: [/acuityscheduling\.com/i] },
  { name: "Cal.com", patterns: [/cal\.com\//i] },
  { name: "HubSpot Meetings", patterns: [/meetings\.hubspot\.com/i] },
  { name: "SavvyCal", patterns: [/savvycal\.com/i] },
  { name: "Squarespace Scheduling", patterns: [/scheduling\.squarespace/i] },
  { name: "Dentally", patterns: [/dentally\.co/i] },
  { name: "Zocdoc", patterns: [/zocdoc\.com/i] },
  { name: "OpenTable", patterns: [/opentable\./i] },
  { name: "Setmore", patterns: [/setmore\.com/i] },
  { name: "Fresha", patterns: [/fresha\.com/i] },
  { name: "SimplyBook", patterns: [/simplybook\.(me|it)/i] },
  { name: "Bookings (generic)", patterns: [/\bbook(ing)?[-_ ]?(now|online|appointment)\b/i] },
];

/** Ad platforms — presence of the pixel means money is being spent. */
const ADS: Detector[] = [
  { name: "Meta Pixel", patterns: [/connect\.facebook\.net\/[^"']*fbevents\.js/i, /fbq\s*\(\s*['"]init/i] },
  { name: "Google Ads", patterns: [/googleadservices\.com/i, /gtag\/js\?id=AW-/i, /google_conversion_id/i] },
  { name: "Google Tag Manager", patterns: [/googletagmanager\.com\/gtm\.js/i] },
  { name: "TikTok Pixel", patterns: [/analytics\.tiktok\.com/i, /ttq\.load/i] },
  { name: "LinkedIn Insight", patterns: [/snap\.licdn\.com/i, /_linkedin_partner_id/i] },
  { name: "Microsoft/Bing UET", patterns: [/bat\.bing\.com/i] },
  { name: "Twitter/X Pixel", patterns: [/static\.ads-twitter\.com/i] },
  { name: "Pinterest Tag", patterns: [/s\.pinimg\.com\/ct/i] },
  { name: "Snap Pixel", patterns: [/sc-static\.net\/scevent/i] },
];

const ANALYTICS: Detector[] = [
  { name: "GA4", patterns: [/gtag\/js\?id=G-/i, /google-analytics\.com/i] },
  { name: "Plausible", patterns: [/plausible\.io\/js/i] },
  { name: "Fathom", patterns: [/cdn\.usefathom\.com/i] },
  { name: "Hotjar", patterns: [/static\.hotjar\.com/i] },
  { name: "Clarity", patterns: [/clarity\.ms/i] },
];

const CMS: Detector[] = [
  { name: "WordPress", patterns: [/wp-content|wp-includes|wp-json/i] },
  { name: "Wix", patterns: [/wix\.com|wixstatic/i] },
  { name: "Squarespace", patterns: [/squarespace\.com|static1\.squarespace/i] },
  { name: "Shopify", patterns: [/cdn\.shopify\.com|shopify\.js/i] },
  { name: "Webflow", patterns: [/webflow\.(com|io)|wf-/i] },
  { name: "GoDaddy", patterns: [/godaddy|secureserver\.net/i] },
  { name: "Duda", patterns: [/dudaone|multiscreensite/i] },
  { name: "Weebly", patterns: [/weebly\.com/i] },
  { name: "HubSpot CMS", patterns: [/hs-sites\.com|hubspotusercontent/i] },
  { name: "Next.js", patterns: [/\/_next\/static/i] },
];

const VIDEO: Detector[] = [
  { name: "YouTube", patterns: [/youtube\.com\/embed|youtu\.be\//i] },
  { name: "Vimeo", patterns: [/player\.vimeo\.com/i] },
  { name: "Wistia", patterns: [/wistia\.(com|net)/i] },
  { name: "Loom", patterns: [/loom\.com\/embed/i] },
  { name: "HTML5 video", patterns: [/<video[\s>]/i] },
];

const SOCIAL: { key: string; pattern: RegExp }[] = [
  { key: "instagram", pattern: /instagram\.com\/([A-Za-z0-9_.]{2,30})/i },
  { key: "tiktok", pattern: /tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i },
  { key: "youtube", pattern: /youtube\.com\/(?:@|c\/|channel\/|user\/)([A-Za-z0-9_.-]{2,40})/i },
  /*
   * The path segment is captured with the slug ("in/jane", "company/acme").
   * A company page cannot accept a connection request, so which of the two it
   * is decides whether the lead is reachable by DM at all.
   */
  { key: "linkedin", pattern: /linkedin\.com\/((?:company|in)\/[A-Za-z0-9_.-]{2,60})/i },
  /*
   * The host must start at a boundary. Without it, `x\.com` also matches the
   * tail of "wix.com", and every Wix-built site reports the platform's own
   * "wix.com/bolt" link as the business's Twitter account.
   */
  { key: "x", pattern: /(?:^|[^\w.])(?:twitter|x)\.com\/([A-Za-z0-9_]{2,15})/i },
];

const first = (list: Detector[], html: string): string | null =>
  list.find((d) => d.patterns.some((p) => p.test(html)))?.name ?? null;
const all = (list: Detector[], html: string): string[] =>
  list.filter((d) => d.patterns.some((p) => p.test(html))).map((d) => d.name);

export type SignalReport = {
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
  hasLiveChat: boolean | null;
  chatVendor: string | null;
  hasBooking: boolean | null;
  bookingVendor: string | null;
  hasLeadForm: boolean | null;
  hasVideo: boolean | null;
  adPlatforms: string[];
  hasAnalytics: boolean | null;
  cms: string | null;
  stack: string[];
  https: boolean | null;
  mobileFriendly: boolean | null;
  social: Record<string, string>;
  opportunityScore: number | null;
  opportunities: string[];
  suggestedBucket: LeadBucket | null;
};

const UNREACHABLE = (error: string): SignalReport => ({
  httpStatus: null, finalUrl: null, error,
  hasLiveChat: null, chatVendor: null, hasBooking: null, bookingVendor: null,
  hasLeadForm: null, hasVideo: null, adPlatforms: [], hasAnalytics: null,
  cms: null, stack: [], https: null, mobileFriendly: null, social: {},
  // No page read means no score. Guessing one would invent a lead.
  opportunityScore: null, opportunities: [], suggestedBucket: null,
});

/** What one page fetch produced — the report plus the HTML it was derived from. */
export type PageScan = { report: SignalReport; html: string | null };

/**
 * Fetch a page once and return both the analysis and the markup.
 *
 * Callers that need more out of the page than the signals — harvesting a
 * contact address, for instance — use this rather than fetching the site a
 * second time, which would double the load placed on someone else's server.
 */
export async function scanPage(rawUrl: string, timeoutMs = 20_000): Promise<PageScan> {
  let url: string;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).toString();
  } catch {
    return { report: UNREACHABLE("Invalid URL"), html: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html = "";
  let status: number | null = null;
  let finalUrl: string | null = null;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // A real browser UA: many small-business sites and WAFs refuse anything else,
        // and a false negative here would be recorded as "no chat widget".
        "user-agent": `Mozilla/5.0 (compatible; ${USER_AGENT})`,
        accept: "text/html,application/xhtml+xml",
      },
    });
    status = res.status;
    finalUrl = res.url;
    if (!res.ok) return { report: { ...UNREACHABLE(`HTTP ${res.status}`), httpStatus: status, finalUrl }, html: null };
    // Cap the read: a handful of sites stream megabytes and the signals are all in the head/body top.
    html = (await res.text()).slice(0, 600_000);
  } catch (e) {
    return { report: UNREACHABLE(e instanceof Error ? e.name : "fetch failed"), html: null };
  } finally {
    clearTimeout(timer);
  }

  return { report: analyzeHtml(html, { url, finalUrl, status }), html };
}

export async function scanWebsite(rawUrl: string, timeoutMs = 20_000): Promise<SignalReport> {
  return (await scanPage(rawUrl, timeoutMs)).report;
}

/** Everything the report says about a page, derived from its markup alone. */
export function analyzeHtml(
  html: string,
  page: { url: string; finalUrl: string | null; status: number | null },
): SignalReport {
  const { url, finalUrl, status } = page;

  /*
   * Client-rendered pages serve a near-empty shell: the chat widget, the booking
   * flow and the video are all mounted by JavaScript we do not execute. Marking
   * those as "missing" would manufacture opportunities that are not real, so a
   * shell is reported as unreadable rather than scored.
   */
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const scriptCount = (html.match(/<script[\s>]/gi) ?? []).length;
  if (visibleText.length < 600 && scriptCount >= 3) {
    return {
      ...UNREACHABLE("Client-rendered page — signals not readable from static HTML"),
      httpStatus: status,
      finalUrl,
    };
  }

  const chatVendor = first(CHAT, html);
  const bookingVendor = first(BOOKING, html);
  const adPlatforms = all(ADS, html);
  const videoPlatforms = all(VIDEO, html);
  const cms = first(CMS, html);

  const social: Record<string, string> = {};
  for (const { key, pattern } of SOCIAL) {
    const m = html.match(pattern);
    if (m?.[1] && !/sharer|share\.php|intent|plugins/i.test(m[0])) social[key] = m[1];
  }

  const hasLeadForm = /<form[\s>]/i.test(html) && /(email|e-mail|name|phone|message|enquir)/i.test(html);
  const mobileFriendly = /<meta[^>]+name=["']viewport["']/i.test(html);
  const https = (finalUrl ?? url).startsWith("https://");

  // Dated-stack markers. Individually weak, together a fair signal.
  const stack: string[] = [];
  if (/jquery[.-]?(1|2)\./i.test(html)) stack.push("jQuery 1/2");
  if (/<table[^>]*>[\s\S]{0,400}<tr/i.test(html) && !cms) stack.push("Table layout");
  if (/<font[\s>]|<center[\s>]|bgcolor=/i.test(html)) stack.push("Legacy HTML tags");
  if (/bootstrap\/3\./i.test(html)) stack.push("Bootstrap 3");
  if (!mobileFriendly) stack.push("No viewport meta");

  /*
   * Scoring mirrors the qualification questions in the lead plan: each missing
   * capability is a concrete thing to sell, and ad spend raises the value of
   * every one of them because the traffic is already being paid for.
   */
  const opportunities: string[] = [];
  let score = 0;
  const runsAds = adPlatforms.some((p) => !/Tag Manager/.test(p));

  if (!chatVendor) { opportunities.push("No live chat or chatbot"); score += 22; }
  if (!bookingVendor) { opportunities.push("No online booking — appointments likely by phone"); score += 20; }
  if (!videoPlatforms.length) { opportunities.push("No video on the site"); score += 14; }
  if (!hasLeadForm) { opportunities.push("No lead capture form"); score += 16; }
  if (!Object.keys(social).length) { opportunities.push("No social presence linked"); score += 6; }
  if (stack.length >= 2) { opportunities.push(`Dated website (${stack.slice(0, 2).join(", ")})`); score += 12; }
  if (!https) { opportunities.push("No HTTPS"); score += 8; }
  if (!mobileFriendly) { opportunities.push("Not mobile-friendly"); score += 10; }

  if (runsAds) {
    // Already buying traffic: the same gaps are worth more, and there is budget.
    score += 18;
    opportunities.unshift(`Running ads (${adPlatforms.join(", ")}) — budget confirmed`);
    if (!chatVendor) opportunities.push("Paying for traffic with no chat to capture it");
    if (!bookingVendor) opportunities.push("Paying for traffic with no automated booking");
  }
  if ((social.tiktok || social.instagram) && !videoPlatforms.length) {
    opportunities.push("Social accounts but no video on site — repurposing opportunity");
    score += 8;
  }

  const suggestedBucket: LeadBucket = runsAds ? "spending_money" : "needs_you";

  return {
    httpStatus: status, finalUrl, error: null,
    hasLiveChat: Boolean(chatVendor), chatVendor,
    hasBooking: Boolean(bookingVendor), bookingVendor,
    hasLeadForm, hasVideo: videoPlatforms.length > 0,
    adPlatforms, hasAnalytics: all(ANALYTICS, html).length > 0,
    cms, stack, https, mobileFriendly, social,
    opportunityScore: Math.min(100, score), opportunities, suggestedBucket,
  };
}
