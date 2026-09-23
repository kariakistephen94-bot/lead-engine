import type {
  XBusinessContext,
  XIntent,
  XNicheContext,
  XPostClassification,
  XPostToClassify,
  XQueryDraft,
} from "./types";

/**
 * Everything shared between the X lead providers: the classification and
 * query-writing prompts, the query validator, and the deterministic rules the
 * mock uses and the worker runs before any model is paid for.
 */

export const X_INTENTS: XIntent[] = ["buyer", "pain", "hiring", "peer", "seller", "noise"];

/** X's recent-search limit on self-serve plans. Longer queries are a 400. */
export const X_QUERY_MAX = 512;

function businessBlock(business: XBusinessContext): string[] {
  return [
    "THE BUSINESS YOU ARE FINDING LEADS FOR",
    business.description.trim() || "(no description given)",
    "",
    "Who it sells to (niches):",
    ...(business.niches.length
      ? business.niches.map((n) =>
          `- ${n.name}${n.targetMarket ? ` — ${n.targetMarket}` : ""}` +
          `${n.painPoints ? `. Their pains: ${n.painPoints}` : ""}` +
          `${n.offer ? `. What we sell them: ${n.offer}` : ""}`)
      : ["- (no niches defined — judge fit against the description only)"]),
  ];
}

export function classifyPrompt(business: XBusinessContext, posts: XPostToClassify[]): string {
  return [
    ...businessBlock(business),
    "",
    "TASK",
    "Below are public X posts that matched a search. For EACH post decide whether its author is a",
    "realistic sales lead for the business above. Judge the AUTHOR as a potential customer, using",
    "the post and their bio together.",
    "",
    "INTENT — pick exactly one:",
    "- buyer:  asking for a recommendation, a vendor, a tool or someone to hire for something the business sells.",
    "- pain:   describing, in their own operation, a problem the business solves (manual work, missed leads,",
    "          slow follow-up, admin overload) — without explicitly asking to buy.",
    "- hiring: a job post for a role the business's service could fill or replace.",
    "- peer:   talking about the topic (news, opinions, tutorials, jokes) — not a customer.",
    "- seller: promoting their own services or product — agencies, freelancers, consultants, SaaS.",
    "          Someone selling the same service is a competitor, never a lead, however well they fit.",
    "- noise:  unrelated, spam, bots, engagement bait.",
    "",
    "RELEVANCE 0–100 — how good a lead the author is for THIS business:",
    "- 80–100: buyer or strong pain, and the author clearly runs or works at a business in a target niche.",
    "- 60–79:  buyer/pain/hiring with a plausible business fit, but niche or seniority unclear.",
    "- 30–59:  weak or indirect signal.",
    "- 0–29:   peer, seller, noise, individuals with no business, or students.",
    "Sellers and noise are always 0–10.",
    "",
    "RULES",
    "- Use only what is in the post and bio. Do not assume facts about the author.",
    "- `reason`: one short sentence a salesperson can read at a glance, citing the words that decided it.",
    "- `niche`: the exact niche name above that fits best, or null.",
    "- Return one result per post, with the same `id`.",
    "",
    "POSTS",
    ...posts.map((p) => [
      `--- id: ${p.id}`,
      `author: ${p.authorName ?? ""} (@${p.authorUsername})${p.authorFollowers != null ? `, ${p.authorFollowers} followers` : ""}`,
      `bio: ${p.authorBio?.replace(/\s+/g, " ").trim() || "(none)"}`,
      p.authorWebsite ? `website: ${p.authorWebsite}` : "",
      `post: ${p.text.replace(/\s+/g, " ").trim()}`,
    ].filter(Boolean).join("\n")),
  ].join("\n");
}

export function queriesPrompt(business: XBusinessContext, niche: XNicheContext): string {
  return [
    ...businessBlock(business),
    "",
    `TASK — write 3 X (Twitter) recent-search queries that find people in the "${niche.name}" niche`,
    "publicly describing a problem the business solves, or asking for help with it.",
    "",
    "X QUERY SYNTAX",
    '- Space means AND. Use OR in capitals. Group with parentheses. Exact phrases in "double quotes".',
    "- Prefix - to exclude. Useful operators: -is:retweet  lang:en  -has:links (drops most promo posts).",
    `- Each query MUST be at most ${X_QUERY_MAX} characters, including operators.`,
    "- Every query must end with: -is:retweet lang:en",
    "",
    "WHAT MAKES A GOOD QUERY",
    "- Combine a group of first-person niche words (e.g. \"my practice\" OR \"our agency\" OR \"my team\") with a",
    "  group of pain or help-seeking phrases specific to that niche (e.g. \"no-shows\" OR \"missed calls\").",
    "- Prefer phrases real owners type over industry jargon. Avoid words vendors use to advertise",
    "  (\"we help\", \"DM me\", \"book a call\") — exclude them with - where it helps.",
    "- The three queries should approach from different angles: direct help-seeking, pain described,",
    "  and tool/vendor recommendations.",
    "",
    "Return a short `name` for each, the `query`, and a one-sentence `rationale`.",
  ].join("\n");
}

/** Balanced parentheses and quotes, within the length limit, not only negations. */
export function validateXQuery(query: string): string | null {
  const q = query.trim();
  if (!q) return "Query is empty";
  if (q.length > X_QUERY_MAX) return `Query is ${q.length} characters; X allows ${X_QUERY_MAX}`;
  if ((q.match(/"/g) ?? []).length % 2) return "Query has an unmatched double quote";
  let depth = 0;
  for (const ch of q.replace(/"[^"]*"/g, "")) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) return "Query has an unmatched closing parenthesis";
  }
  if (depth !== 0) return "Query has an unmatched opening parenthesis";
  const positive = q.replace(/"[^"]*"/g, "T").split(/\s+/).filter((t) => t && !t.startsWith("-") && !/^\(*-/.test(t));
  if (!positive.length) return "Query needs at least one term that is not an exclusion";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Deterministic rules                                                        */
/* -------------------------------------------------------------------------- */

/** Vendors advertising. Checked on the post and the bio. */
const SELLER_POST = /\b(dm me|dm for|hire me|book a (free )?call|free (audit|consultation|strategy call)|link in (my )?bio|i build|we build|i help|we help|my agency|our agency helps|check out my|sign up (now|today)|use code|limited spots)\b/i;
const SELLER_BIO = /\b(i help|we help|i build|we build|automation (agency|expert|consultant)|ai (agency|consultant|expert)|freelancer?|consultant|dm (me|for)|book a call|founder of .* (agency|studio))\b/i;
const BUYER = /\b(looking for|can anyone recommend|any recommendations|recommend(ations)? for|anyone know|does anyone (know|use)|who (can|do you use)|need (a|an|someone|help)|searching for|in the market for|what (tool|software|app|system) do you use|hiring)\b/i;
const PAIN = /\b(manually|by hand|spending hours|takes forever|too much time|killing us|drowning in|missed calls?|no-?shows?|falling through the cracks|every week we|our process is|struggling with|frustrat\w+|nightmare|wasting)\b/i;
const OPERATOR = /\b(my|our) (business|practice|agency|firm|company|team|clinic|office|shop|store|brokerage|clients|patients|staff|agents|recruiters|techs?|crew)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Who a niche's customers are, as word stems, for rule-based fit.
 *
 * Only the name and target market are used — they describe the customer.
 * Pain points are left out on purpose: "missed calls" and "follow-up" are
 * shared by most niches, so matching on them sends a realtor to home services.
 * Stems (the word minus its last three letters, for long words) let
 * "brokerage" match "broker" and "enquiry" match "enquiries".
 */
function nicheTerms(niche: XNicheContext): string[] {
  const words = `${niche.name} ${niche.targetMarket ?? ""}`
    .toLowerCase()
    .match(/[a-z][a-z-]{3,}/g) ?? [];
  const STOP = new Set(["with", "that", "their", "from", "have", "high", "into", "more", "than", "active", "inbound", "working", "multiple", "consistent", "businesses", "business", "operators", "private", "paid", "live", "volume", "staff"]);
  const stem = (w: string) => {
    const singular = w.replace(/ies$/, "y").replace(/s$/, "");
    return singular.length > 6 ? singular.slice(0, singular.length - 3) : singular;
  };
  return [...new Set(words.filter((w) => !STOP.has(w)).map(stem))];
}

/**
 * Rules-only verdict. Two jobs: the worker's prefilter (it only trusts the
 * definite rejections — `seller` and `noise` — and sends everything else to the
 * model), and the whole classifier when no AI provider is configured.
 */
export function ruleClassify(post: XPostToClassify, business: XBusinessContext): XPostClassification {
  const text = post.text;
  const bio = post.authorBio ?? "";

  if (text.replace(/https?:\/\/\S+/g, "").trim().length < 25) {
    return { id: post.id, relevance: 0, intent: "noise", reason: "Too short to carry any intent", niche: null };
  }
  if (SELLER_POST.test(text) || (SELLER_BIO.test(bio) && !BUYER.test(text))) {
    const m = text.match(SELLER_POST)?.[0] ?? bio.match(SELLER_BIO)?.[0] ?? "promotional";
    return { id: post.id, relevance: 3, intent: "seller", reason: `Selling, not buying ("${m}")`, niche: null };
  }

  const buyer = text.match(BUYER)?.[0];
  const pain = text.match(PAIN)?.[0];
  const operator = OPERATOR.test(text) || OPERATOR.test(bio) || /\b(owner|founder|ceo|director|broker|partner|practice manager)\b/i.test(bio);

  let best: { name: string; hits: number } | null = null;
  for (const niche of business.niches) {
    const hay = `${text} ${bio}`.toLowerCase();
    const hits = nicheTerms(niche).filter((t) => new RegExp(`\\b${escape(t)}`, "i").test(hay)).length;
    if (hits && (!best || hits > best.hits)) best = { name: niche.name, hits };
  }

  const intent: XIntent = /\bhiring\b/i.test(text) && !buyer?.match(/looking for|recommend/i)
    ? "hiring"
    : buyer ? "buyer" : pain ? "pain" : "peer";

  let relevance =
    intent === "buyer" ? 55 : intent === "pain" ? 45 : intent === "hiring" ? 40 : 12;
  if (operator) relevance += 15;
  if (best) relevance += Math.min(20, best.hits * 8);
  if (buyer && pain) relevance += 8;
  relevance = Math.max(0, Math.min(95, relevance));

  const cue = [buyer && `"${buyer.toLowerCase()}"`, pain && `"${pain.toLowerCase()}"`].filter(Boolean).join(" + ");
  const reason = intent === "peer"
    ? "Discussing the topic; no request or first-hand problem"
    : `${cue || intent}${operator ? ", speaks as an operator" : ""}${best ? `, fits ${best.name}` : ""}`;

  // A niche only means something for someone who might buy.
  return { id: post.id, relevance, intent, reason, niche: intent === "peer" ? null : best?.name ?? null };
}

/**
 * Queries built without a model: first-person niche words × help-seeking and
 * pain phrases. Serviceable; the AI-written ones are sharper.
 */
export function fallbackQueries(niche: XNicheContext): XQueryDraft[] {
  const noun = niche.name.toLowerCase().replace(/ies$/, "y").replace(/s$/, "").split(/\s+/).pop() ?? "business";
  const who = `("my ${noun}" OR "our ${noun}" OR "my business" OR "my team" OR "our clients")`;
  const tail = "-is:retweet lang:en";
  const drafts: XQueryDraft[] = [
    {
      name: `${niche.name} — asking for help`,
      query: `${who} ("can anyone recommend" OR "looking for" OR "anyone know" OR "need help" OR "any recommendations") -"dm me" -"we help" ${tail}`,
      rationale: "Operators in the niche asking the public for a recommendation.",
    },
    {
      name: `${niche.name} — describing pain`,
      query: `${who} ("manually" OR "by hand" OR "spending hours" OR "takes forever" OR "falling through the cracks" OR "missed calls") -"dm me" ${tail}`,
      rationale: "Operators describing manual, slow work the offer removes.",
    },
    {
      name: `${niche.name} — tool recommendations`,
      query: `${who} ("what software" OR "what tool" OR "which CRM" OR "automate" OR "zapier" OR "chatbot") -"we help" -has:links ${tail}`,
      rationale: "Operators shopping for tools — close to a buying decision.",
    },
  ];
  return drafts.filter((d) => !validateXQuery(d.query));
}

/**
 * Coerce whatever a model returned into one clean result per input post.
 * A post the model skipped or mangled falls back to the rules rather than
 * being dropped — silently losing a lead is worse than a rougher score.
 */
export function normalizeClassifications(
  raw: unknown,
  posts: XPostToClassify[],
  business: XBusinessContext,
): XPostClassification[] {
  const list = Array.isArray(raw) ? raw : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    if (item && typeof item === "object" && "id" in item) byId.set(String((item as { id: unknown }).id), item as Record<string, unknown>);
  }
  const nicheNames = new Set(business.niches.map((n) => n.name));
  return posts.map((post) => {
    const r = byId.get(post.id);
    if (!r) return ruleClassify(post, business);
    const intent = X_INTENTS.includes(r.intent as XIntent) ? (r.intent as XIntent) : "noise";
    let relevance = Math.round(Number(r.relevance));
    if (!Number.isFinite(relevance)) relevance = 0;
    // The prompt caps sellers and noise at 10; enforce it rather than trust it.
    if (intent === "seller" || intent === "noise") relevance = Math.min(relevance, 10);
    const leadLike = intent === "buyer" || intent === "pain" || intent === "hiring";
    const niche = leadLike && typeof r.niche === "string" && nicheNames.has(r.niche) ? r.niche : null;
    return {
      id: post.id,
      relevance: Math.max(0, Math.min(100, relevance)),
      intent,
      reason: String(r.reason ?? "").trim().slice(0, 300) || "No reason given",
      niche,
    };
  });
}

/** Keep only queries X will accept; fall back to the rules when none survive. */
export function normalizeQueries(raw: unknown, niche: XNicheContext): XQueryDraft[] {
  const list = Array.isArray(raw) ? raw : [];
  const valid = list
    .map((q) => ({
      name: String((q as XQueryDraft)?.name ?? "").trim().slice(0, 120) || niche.name,
      query: String((q as XQueryDraft)?.query ?? "").replace(/\s+/g, " ").trim(),
      rationale: String((q as XQueryDraft)?.rationale ?? "").trim().slice(0, 300),
    }))
    .filter((q) => !validateXQuery(q.query))
    .slice(0, 5);
  return valid.length ? valid : fallbackQueries(niche);
}
