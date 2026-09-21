/** Tiny classnames joiner — avoids pulling in clsx/tailwind-merge. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Reduce a URL or bare host to a comparable registrable domain.
 * This is the dedupe key for companies, so it must be stable:
 * "https://WWW.Acme.co.uk/pricing?a=1" -> "acme.co.uk"
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  // Bare emails occasionally land in a website column.
  if (value.includes("@") && !value.includes("/")) value = value.split("@").pop() ?? value;

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0];
  value = value.split("@").pop() ?? value;
  value = value.replace(/:\d+$/, "");
  value = value.replace(/^www\./, "");
  value = value.replace(/\.$/, "");

  if (!value || !value.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  return value;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const value = input?.trim().toLowerCase();
  if (!value) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export function normalizeUrl(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

/** LinkedIn URLs vary wildly; strip to the canonical path for dedupe. */
export function normalizeLinkedIn(input: string | null | undefined): string | null {
  const value = input?.trim().toLowerCase();
  if (!value) return null;
  const withoutScheme = value
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^([a-z]{2,3}\.)?linkedin\.com/, "linkedin.com")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
  if (!withoutScheme.startsWith("linkedin.com/")) return null;
  return `https://www.${withoutScheme}`;
}

/**
 * Clean up a phone number without ever changing what it dials.
 *
 * The rules here are deliberately conservative, because a phone number that is
 * subtly wrong is worse than one that is absent — it calls a stranger.
 *
 *  - Formatting (spaces, dots, dashes, brackets) is stripped; digits are never
 *    added, removed or reordered.
 *  - A leading "+" is preserved, and a leading "00" international prefix is
 *    converted to "+". No country code is ever *guessed*: a bare national
 *    number stays national, because assuming the wrong country is exactly how
 *    you end up dialling another continent.
 *  - Extensions are kept, since dropping one reaches the switchboard instead of
 *    the person.
 *  - Anything with too few digits to be a real subscriber number (or more than
 *    E.164 allows) is rejected as null rather than stored as a dialable-looking
 *    fragment.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  // Split off an extension before stripping punctuation, so its digits are not
  // mistaken for part of the subscriber number.
  const extMatch = raw.match(/(?:\b(?:ext|extension|x|#)\.?\s*)(\d{1,6})\s*$/i);
  const extension = extMatch?.[1] ?? null;
  const main = extMatch ? raw.slice(0, extMatch.index).trim() : raw;

  // Letters are either vanity numbers or free text ("call reception"); either
  // way this is not something to store as a number.
  if (/[a-z]/i.test(main.replace(/^(tel|phone)[:.]?\s*/i, ""))) return null;

  const international = /^\+/.test(main) || /^00\d/.test(main);
  const digits = main.replace(/\D/g, "").replace(/^00/, international && !main.startsWith("+") ? "" : "");

  // 7 digits is the shortest plausible local subscriber number; E.164 caps at 15.
  if (digits.length < 7 || digits.length > 15) return null;

  const normalized = international ? `+${digits}` : digits;
  return extension ? `${normalized} ext. ${extension}` : normalized;
}

/**
 * Group a stored (compact E.164) number for reading on screen.
 *
 * Only patterns whose grouping is unambiguous are touched — North American,
 * UK and Australian numbers. Anything else is returned exactly as stored,
 * because a confident-looking but wrong grouping invites a misdial.
 * The underlying digits are never changed; `tel:` links should use the raw
 * stored value.
 */
export function formatPhone(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value) return null;

  const [number, ...rest] = value.split(" ext. ");
  const ext = rest.length ? ` ext. ${rest.join(" ")}` : "";
  const m = (re: RegExp) => number.match(re);

  const nanp = m(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (nanp) return `+1 (${nanp[1]}) ${nanp[2]}-${nanp[3]}${ext}`;

  // Mobiles are checked first: 07… numbers are also ten digits, so the landline
  // pattern would otherwise claim them and group them wrongly.
  const ukMobile = m(/^\+44(7\d{3})(\d{6})$/);
  if (ukMobile) return `+44 ${ukMobile[1]} ${ukMobile[2]}${ext}`;

  const ukLandline = m(/^\+44([1-6,8-9]\d)(\d{4})(\d{4})$/);
  if (ukLandline) return `+44 ${ukLandline[1]} ${ukLandline[2]} ${ukLandline[3]}${ext}`;

  const au = m(/^\+61(\d)(\d{4})(\d{4})$/);
  if (au) return `+61 ${au[1]} ${au[2]} ${au[3]}${ext}`;

  return value;
}

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

const NUMBER = new Intl.NumberFormat("en-US");

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUMBER.format(value);
}

export function formatCurrency(value: number | string | null | undefined, currency = "USD"): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
}

export function formatCompact(value: number | string | null | undefined): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    numeric,
  );
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Same shape as `formatDate`, pinned to UTC.
 *
 * Scraped timestamps are rendered on both the server and the client, and the
 * server runs in UTC while the browser does not — a posting made near midnight
 * then renders a different day on each side and React reports a hydration
 * mismatch. Pinning the zone makes the two agree.
 */
export function formatDateUTC(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return "just now";
}

/** Start of the caller's day, used for "today" metrics. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

export function toTitleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
