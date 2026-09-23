/**
 * X (Twitter) API v2 client — the official API, app-only bearer auth.
 *
 * Nothing here scrapes x.com. Scraping is against X's terms and would put the
 * account you sell from at risk; the API is the supported route and, being
 * paid per read, is also the one that scales without being blocked.
 *
 * Only two endpoints are used:
 *  - GET /2/tweets/search/recent — the last 7 days of public posts for a query
 *  - GET /2/usage/tweets         — how much of the project's monthly read cap
 *                                  is used; doubles as the "is it connected" check
 *
 * Billing (docs.x.com, September 2026): pay-per-use credits, $0.005 per post
 * read, capped at 3 million reads per monthly billing cycle; the same post read
 * twice within 24 hours is charged once. Recent search allows 450 requests per
 * 15 minutes with app auth and queries of up to 512 characters.
 */

const API = "https://api.x.com/2";
const TIMEOUT_MS = 30_000;

export type XUser = {
  id: string;
  username: string;
  name?: string;
  description?: string;
  location?: string;
  /** Profile website, already expanded out of the t.co wrapper when X provides it. */
  website?: string | null;
  followers?: number;
  following?: number;
  verified?: boolean;
  createdAt?: string;
};

export type XTweet = {
  id: string;
  text: string;
  authorId: string;
  createdAt?: string;
  lang?: string;
  conversationId?: string;
  isReply: boolean;
  metrics?: Record<string, number>;
  raw: unknown;
};

export type XSearchPage = {
  tweets: XTweet[];
  users: Map<string, XUser>;
  newestId: string | null;
  nextToken: string | null;
  /** From the x-rate-limit-* headers, when X sent them. */
  rateLimit: { remaining: number; resetAt: Date } | null;
};

export type XUsage = {
  projectCap: number | null;
  projectUsage: number | null;
  capResetDay: number | null;
};

export type XErrorKind =
  | "not_configured"
  | "auth"          // 401 — bad or revoked bearer token
  | "forbidden"     // 403 — the app's access level does not include this endpoint
  | "rate_limit"    // 429 — per-15-minute window exhausted
  | "usage_cap"     // 429 UsageCapExceeded — monthly read cap hit
  | "credits"       // 402 CreditsDepleted — the prepaid balance has run out
  | "invalid_query" // 400 — query syntax X rejected
  | "server"
  | "network";

export class XApiError extends Error {
  constructor(
    message: string,
    readonly kind: XErrorKind,
    readonly status: number | null = null,
    /** When a rate-limited caller may try again. */
    readonly resetAt: Date | null = null,
  ) {
    super(message);
    this.name = "XApiError";
  }
}

export interface XClient {
  readonly name: "x-api" | "mock";
  isConfigured(): boolean;
  searchRecent(params: {
    query: string;
    maxResults: number;
    sinceId?: string | null;
    startTime?: Date | null;
    nextToken?: string | null;
  }): Promise<XSearchPage>;
  getUsage(): Promise<XUsage>;
}

type RawUser = {
  id: string; username: string; name?: string; description?: string; location?: string;
  url?: string; verified?: boolean; created_at?: string;
  public_metrics?: { followers_count?: number; following_count?: number };
  entities?: { url?: { urls?: { url?: string; expanded_url?: string }[] } };
};

type RawTweet = {
  id: string; text: string; author_id: string; created_at?: string; lang?: string;
  conversation_id?: string; in_reply_to_user_id?: string;
  referenced_tweets?: { type: string; id: string }[];
  public_metrics?: Record<string, number>;
};

type RawSearch = {
  data?: RawTweet[];
  includes?: { users?: RawUser[] };
  meta?: { newest_id?: string; next_token?: string; result_count?: number };
  errors?: { title?: string; detail?: string; message?: string }[];
  title?: string;
  detail?: string;
};

export function toUser(u: RawUser): XUser {
  // The profile "url" is a t.co link; the entity carries the real destination.
  const website = u.entities?.url?.urls?.[0]?.expanded_url ?? u.url ?? null;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    description: u.description,
    location: u.location,
    website: website || null,
    followers: u.public_metrics?.followers_count,
    following: u.public_metrics?.following_count,
    verified: u.verified,
    createdAt: u.created_at,
  };
}

export function toTweet(t: RawTweet): XTweet {
  return {
    id: t.id,
    text: t.text,
    authorId: t.author_id,
    createdAt: t.created_at,
    lang: t.lang,
    conversationId: t.conversation_id,
    isReply: Boolean(t.in_reply_to_user_id) || Boolean(t.referenced_tweets?.some((r) => r.type === "replied_to")),
    metrics: t.public_metrics,
    raw: t,
  };
}

export class XApiClient implements XClient {
  readonly name = "x-api" as const;
  private readonly token: string | undefined;
  private postFieldsParam: "tweet.fields" | "post.fields" = "tweet.fields";

  constructor() {
    this.token = process.env.X_BEARER_TOKEN?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async searchRecent(params: {
    query: string;
    maxResults: number;
    sinceId?: string | null;
    startTime?: Date | null;
    nextToken?: string | null;
  }): Promise<XSearchPage> {
    const qs = new URLSearchParams({
      query: params.query,
      // X accepts 10–100 per page; anything outside is a 400.
      max_results: String(Math.min(100, Math.max(10, params.maxResults))),
      expansions: "author_id",
      [this.postFieldsParam]: "created_at,lang,public_metrics,conversation_id,in_reply_to_user_id,referenced_tweets",
      "user.fields": "name,username,description,location,url,entities,public_metrics,verified,created_at",
    });
    // since_id makes every run after the first incremental. start_time only
    // bounds the very first run, and X rejects the pair if they disagree.
    if (params.sinceId) qs.set("since_id", params.sinceId);
    else if (params.startTime) qs.set("start_time", params.startTime.toISOString());
    if (params.nextToken) qs.set("next_token", params.nextToken);

    let response;
    try {
      response = await this.request<RawSearch>(`/tweets/search/recent?${qs}`);
    } catch (error) {
      /*
       * X's quickstart names this parameter `tweet.fields`; its API reference
       * has started calling it `post.fields`. If X ever stops accepting the
       * old name, switch once and remember it rather than failing every run.
       */
      if (error instanceof XApiError && error.kind === "invalid_query" && /tweet\.fields/.test(error.message)
        && this.postFieldsParam === "tweet.fields") {
        this.postFieldsParam = "post.fields";
        return this.searchRecent(params);
      }
      throw error;
    }
    const { body, headers } = response;

    const users = new Map<string, XUser>();
    for (const u of body.includes?.users ?? []) users.set(u.id, toUser(u));

    const remaining = headers.get("x-rate-limit-remaining");
    const reset = headers.get("x-rate-limit-reset");

    return {
      tweets: (body.data ?? []).map(toTweet),
      users,
      newestId: body.meta?.newest_id ?? null,
      nextToken: body.meta?.next_token ?? null,
      rateLimit: remaining !== null && reset !== null
        ? { remaining: Number(remaining), resetAt: new Date(Number(reset) * 1000) }
        : null,
    };
  }

  async getUsage(): Promise<XUsage> {
    const { body } = await this.request<{
      data?: { project_cap?: string | number; project_usage?: string | number; cap_reset_day?: number };
    }>("/usage/tweets?usage.fields=project_cap,project_usage,cap_reset_day");
    const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
    return {
      projectCap: num(body.data?.project_cap),
      projectUsage: num(body.data?.project_usage),
      capResetDay: num(body.data?.cap_reset_day),
    };
  }

  private async request<T>(path: string): Promise<{ body: T; headers: Headers }> {
    if (!this.token) {
      throw new XApiError("X_BEARER_TOKEN is not set", "not_configured");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        headers: { authorization: `Bearer ${this.token}`, "user-agent": "ai-lead-engine/0.1" },
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = (error as Error).name === "AbortError";
      throw new XApiError(aborted ? "X API timed out" : `X API unreachable: ${(error as Error).message}`, "network");
    } finally {
      clearTimeout(timer);
    }

    const body = (await response.json().catch(() => ({}))) as T & RawSearch;
    if (response.ok) return { body, headers: response.headers };

    const detail =
      body.detail ?? body.errors?.[0]?.detail ?? body.errors?.[0]?.message ?? body.title ?? response.statusText;
    const reset = response.headers.get("x-rate-limit-reset");
    const resetAt = reset ? new Date(Number(reset) * 1000) : null;

    switch (response.status) {
      case 400:
        throw new XApiError(`X rejected the query: ${detail}`, "invalid_query", 400);
      case 401:
        throw new XApiError("X rejected the bearer token — check X_BEARER_TOKEN", "auth", 401);
      case 402:
        throw new XApiError(
          "X API credits are used up — top up the balance in the X developer console",
          "credits",
          402,
          // Nothing changes until someone pays; re-check hourly.
          new Date(Date.now() + 60 * 60_000),
        );
      case 403:
        throw new XApiError(
          `X refused access (${detail}). Your X developer plan may not include search — check the access level of the app's project.`,
          "forbidden",
          403,
        );
      case 429: {
        const capped = /usagecap|usage cap|monthly/i.test(`${body.title ?? ""} ${detail}`);
        throw new XApiError(
          capped ? `X monthly read cap reached: ${detail}` : "X rate limit reached",
          capped ? "usage_cap" : "rate_limit",
          429,
          // A monthly cap has no reset header; back off for an hour and re-check.
          resetAt ?? new Date(Date.now() + (capped ? 60 : 15) * 60_000),
        );
      }
      default:
        throw new XApiError(`X API ${response.status}: ${detail}`, "server", response.status);
    }
  }
}
