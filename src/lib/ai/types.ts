/**
 * Provider-agnostic AI contract.
 *
 * Nothing outside `lib/ai/providers` knows which model is in use. Swapping
 * Anthropic for another vendor means adding one adapter and changing
 * AI_PROVIDER in the environment — no call sites change.
 */

export type ResearchSubject = {
  companyName: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  revenue: string | null;
  description: string | null;
  linkedinUrl: string | null;
  contactName: string | null;
  jobTitle: string | null;
  contactEmail: string | null;
  /** The niche definition, so scoring reflects *your* offer and ICP. */
  niche: {
    name: string;
    targetMarket: string | null;
    idealCompanySize: string | null;
    targetJobTitles: string[] | null;
    painPoints: string | null;
    offer: string | null;
  } | null;
  /** Text scraped from the company website, already truncated. */
  websiteText: string | null;
};

export type ResearchResult = {
  summary: string;
  whatTheyDo: string;
  painPoints: string[];
  automationOpportunities: string[];
  recommendedOffer: string;
  personalization: string[];
  score: number;
  scoreReason: string;
  /** 0–1. How much the model trusts its own answer given the input available. */
  confidence: number;
};

export type ProspectCriteria = {
  description: string;
  niche?: string | null;
  locations?: string[];
  minEmployees?: number | null;
  maxEmployees?: number | null;
  jobTitles?: string[];
  industries?: string[];
  limit: number;
};

/** Everything the model may use when writing an opener. Facts only. */
export type PersonalisationSubject = {
  companyName: string;
  industry?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  contactName?: string | null;
  jobTitle?: string | null;
  /** Observed on their own website — the evidence the opener must be built on. */
  signals?: {
    runsAds?: boolean;
    adPlatforms?: string[];
    hasLiveChat?: boolean | null;
    hasBooking?: boolean | null;
    hasVideo?: boolean | null;
    hasLeadForm?: boolean | null;
    cms?: string | null;
    socials?: string[];
    opportunities?: string[];
  } | null;
  /**
   * What they said in public, verbatim, where it was found — e.g. the X post
   * that surfaced them. The strongest opener material there is, because it is
   * their own words about their own problem.
   */
  publicPosts?: { platform: string; text: string }[];
  /** What we are selling to them. */
  offer: string;
  senderName: string;
};

export type PersonalisedEmail = {
  subject: string;
  /** Plain-text body, no signature or unsubscribe — those are added by the app. */
  body: string;
  /** Which supplied facts were actually used, so any claim can be traced. */
  basisUsed: string[];
};

/**
 * A social DM is written from the same evidence as an email opener, plus where
 * the conversation will happen — the platform changes tone and length rules.
 */
export type DmSubject = PersonalisationSubject & {
  platform: "instagram" | "twitter" | "linkedin";
  /** Their handle on that platform, without the @. */
  handle: string;
};

export type DmSequence = {
  /**
   * LinkedIn only: the ≤300-character note on the connection request. It is
   * sent *before* firstMessage and is the only thing they see before deciding
   * whether to accept, so it carries the whole first impression.
   */
  connectionNote?: string | null;
  /** The opener: 2–4 sentences, observation → problem → curiosity CTA. */
  firstMessage: string;
  /** Follow-up for 3–5 days later if the opener gets no reply. */
  secondMessage: string;
  /** Which supplied facts were actually used, so any claim can be traced. */
  basisUsed: string[];
};

/* -------------------------------------------------------------------------- */
/* Social content                                                             */
/* -------------------------------------------------------------------------- */

export type SocialPlatformName =
  | "twitter"
  | "linkedin"
  | "contra"
  | "tiktok"
  | "youtube"
  | "instagram";

export type SocialFormat = "text_post" | "video_hook" | "showcase";

/**
 * Everything the writer may draw on for one post. As with the outreach
 * prompts, this is the *entire* world the model is allowed to describe —
 * anything not here would be an invented claim about work that was never done.
 */
export type SocialSubject = {
  platform: SocialPlatformName;
  format: SocialFormat;
  /** Who is posting, and what they want the audience to eventually hire them for. */
  authorName: string;
  positioning: string;
  /** The project being built or shipped. */
  project: {
    number: number;
    week: number;
    weekTheme: string;
    title: string;
    summary: string | null;
    features: string[];
    stack: string[];
    learningGoals: string[];
    status: string;
  } | null;
  /** Recent build-log entries — the only source of concrete, dated specifics. */
  logs: {
    loggedOn: string;
    built: string;
    blockers: string | null;
    learned: string | null;
  }[];
  /** Optional steer: "focus on the auth bug", "make it about why FastAPI". */
  steer?: string | null;
};

export type SocialVariation = {
  /** What makes this take different from its siblings, e.g. "contrarian". */
  label: string;
  /** The opening line, isolated so it can be judged on its own. */
  hook: string;
  /** The full post or caption, hook included, exactly as it will be pasted. */
  body: string;
  cta: string | null;
  hashtags: string[];
};

/** Everything the case-study writer may draw on. Facts only, as always. */
export type CaseStudySubject = {
  authorName: string;
  positioning: string;
  project: {
    title: string;
    summary: string | null;
    features: string[];
    stack: string[];
    status: string;
    repoUrl: string | null;
    demoUrl: string | null;
    youtubeUrl: string | null;
  };
  logs: {
    loggedOn: string;
    built: string;
    blockers: string | null;
    learned: string | null;
  }[];
};

export type CaseStudyDraft = {
  headline: string;
  intro: string;
  problem: string;
  approach: string;
  howItWorks: string[];
  demonstrates: string[];
  basisUsed: string[];
};

export type SocialPostSet = {
  /** The shared idea the variations each attack from a different side. */
  angle: string;
  premise: string;
  variations: SocialVariation[];
  /** Which supplied project facts and log entries were actually used. */
  basisUsed: string[];
};

export interface AIProvider extends XLeadAI {
  readonly name: string;
  readonly model: string;
  /** True when the adapter has everything it needs (API key etc.). */
  isConfigured(): boolean;
  researchLead(subject: ResearchSubject): Promise<ResearchResult>;
  /** Turn a sentence like "100 marketing agencies in the US" into structured criteria. */
  parseProspectCriteria(prompt: string): Promise<ProspectCriteria>;
  /** Write a cold opener grounded strictly in the supplied facts. */
  personaliseEmail(subject: PersonalisationSubject): Promise<PersonalisedEmail>;
  /** Write a two-message cold DM sequence grounded strictly in the supplied facts. */
  writeDmSequence(subject: DmSubject): Promise<DmSequence>;
  /** Write one post idea and its variations for a single platform. */
  writeSocialPosts(subject: SocialSubject): Promise<SocialPostSet>;
  /** Turn a build record into a page aimed at someone deciding whether to hire. */
  writeCaseStudy(subject: CaseStudySubject): Promise<CaseStudyDraft>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

/* -------------------------------------------------------------------------- */
/* X lead sourcing                                                            */
/* -------------------------------------------------------------------------- */

export type XIntent = "buyer" | "pain" | "hiring" | "peer" | "seller" | "noise";

export type XNicheContext = {
  name: string;
  targetMarket: string | null;
  painPoints: string | null;
  offer: string | null;
};

/** What the business sells and to whom — the yardstick every post is judged against. */
export type XBusinessContext = {
  description: string;
  niches: XNicheContext[];
};

export type XPostToClassify = {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string | null;
  authorBio: string | null;
  authorFollowers: number | null;
  authorWebsite: string | null;
};

export type XPostClassification = {
  id: string;
  /** 0–100 fit of the author as a lead for this business. */
  relevance: number;
  intent: XIntent;
  /** One sentence a salesperson can read at a glance. */
  reason: string;
  /** Best-fitting niche name, or null. */
  niche: string | null;
};

export type XQueryDraft = { name: string; query: string; rationale: string };

export interface XLeadAI {
  /** Score a batch of posts for buyer intent and fit. One result per post. */
  classifyXPosts(input: { business: XBusinessContext; posts: XPostToClassify[] }): Promise<XPostClassification[]>;
  /** Write X search queries that find a niche's operators describing their pain. */
  writeXSearchQueries(input: { business: XBusinessContext; niche: XNicheContext }): Promise<XQueryDraft[]>;
}
