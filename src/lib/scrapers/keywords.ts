/**
 * The engine's search vocabulary.
 *
 * Terms are grouped by the service being sold, because a posting matching
 * "n8n" is a very different conversation from one matching "UGC creator".
 * Matching is done on whole words so "AI" does not fire on "chain" or "said".
 */
export const KEYWORD_GROUPS = {
  automation: [
    "ai automation", "automation", "zapier", "make.com", "n8n", "workflow automation",
    "ai agent", "agentic", "openai", "gpt", "llm", "chatbot", "chat bot",
    "conversational ai", "rpa", "integrations", "api integration", "no-code", "nocode",
  ],
  video: [
    "video editor", "video editing", "short-form video", "short form video",
    "ugc creator", "ugc", "reels", "tiktok editor", "youtube editor", "shorts",
    "motion graphics", "video producer", "content creator", "ai video",
  ],
  marketing: [
    "growth marketer", "performance marketing", "paid ads", "media buyer",
    "email marketing", "marketing automation", "crm", "hubspot", "klaviyo",
    "lead generation", "seo", "copywriter",
  ],
} as const;

export type KeywordGroup = keyof typeof KEYWORD_GROUPS;

export const ALL_KEYWORDS: string[] = Object.values(KEYWORD_GROUPS).flat();

/**
 * Phrases that signal someone describing a problem rather than posting a job —
 * the "search for pain, not for clients" bucket.
 */
export const PAIN_PHRASES = [
  "we need", "looking for", "can anyone recommend", "our process is manual",
  "this takes forever", "need help", "anyone know", "frustrated", "manually",
  "by hand", "spending hours", "too much time", "hiring", "seeking freelancer",
  "any recommendations", "struggling with",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word / phrase match, case-insensitive. */
export function matchTerms(haystack: string, terms: string[]): string[] {
  const text = haystack.toLowerCase();
  const hits = new Set<string>();
  for (const term of terms) {
    const t = term.toLowerCase();
    // Word boundaries stop "ai" matching inside "said" or "chain".
    const re = new RegExp(`(?:^|[^a-z0-9])${escape(t)}(?:[^a-z0-9]|$)`, "i");
    if (re.test(text)) hits.add(term);
  }
  return [...hits];
}

/**
 * Relevance 0-100.
 *
 * A hit in the title counts far more than one buried in the body, and a second
 * distinct term is worth more than the same term repeated — that is the
 * difference between "mentions automation" and "is actually about automation".
 */
export function scoreMatch(title: string, body: string, terms: string[]): { score: number; hits: string[] } {
  const titleHits = matchTerms(title, terms);
  const bodyHits = matchTerms(body, terms);
  const hits = [...new Set([...titleHits, ...bodyHits])];
  if (!hits.length) return { score: 0, hits };
  const score = Math.min(100, titleHits.length * 40 + (hits.length - titleHits.length) * 12 + 20);
  return { score, hits };
}
