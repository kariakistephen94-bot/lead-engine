import "server-only";

import { caseStudyPrompt } from "../case-study";
import { dmPrompt } from "../dm";
import { personalisationPrompt } from "../personalisation";
import { socialPrompt } from "../social";
import {
  AIProviderError,
  type AIProvider,
  type CaseStudyDraft,
  type CaseStudySubject,
  type DmSequence,
  type DmSubject,
  type PersonalisationSubject,
  type PersonalisedEmail,
  type ProspectCriteria,
  type ResearchResult,
  type ResearchSubject,
  type SocialPostSet,
  type SocialSubject,
} from "../types";

const DM_TOOL = {
  name: "write_dm_sequence",
  description: "Return a two-message cold DM sequence grounded strictly in the supplied facts.",
  input_schema: {
    type: "object" as const,
    properties: {
      connectionNote: {
        type: "string",
        description: "LinkedIn only: the ≤300-char connection request note. Null elsewhere.",
      },
      firstMessage: { type: "string", description: "The opener, 2–4 sentences, curiosity CTA" },
      secondMessage: { type: "string", description: "Follow-up for 3–5 days later, 1–3 sentences" },
      basisUsed: { type: "array", items: { type: "string" } },
    },
    required: ["firstMessage", "secondMessage", "basisUsed"],
  },
};

const CASE_STUDY_TOOL = {
  name: "write_case_study",
  description:
    "Return a client-facing project page grounded strictly in the supplied build record. No invented outcomes.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: { type: "string", description: "Under 70 characters, a capability not a slogan" },
      intro: { type: "string", description: "One or two sentences: what the thing is" },
      problem: { type: "string", description: "The business problem this kind of system solves" },
      approach: { type: "string", description: "How it was built, in plain language" },
      howItWorks: { type: "array", items: { type: "string" }, description: "3-5 mechanism steps" },
      demonstrates: { type: "array", items: { type: "string" }, description: "3-4 capability claims" },
      basisUsed: { type: "array", items: { type: "string" } },
    },
    required: ["headline", "intro", "problem", "approach", "howItWorks", "demonstrates", "basisUsed"],
  },
};

const SOCIAL_TOOL = {
  name: "write_social_posts",
  description:
    "Return one post idea and its variations for a single platform, grounded strictly in the supplied project facts.",
  input_schema: {
    type: "object" as const,
    properties: {
      angle: { type: "string", description: "The shared idea, under 12 words" },
      premise: { type: "string", description: "The shared idea in one sentence" },
      variations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "What makes this take different" },
            hook: { type: "string", description: "The first line, on its own" },
            body: { type: "string", description: "The complete post to paste, hook included" },
            cta: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
          required: ["label", "hook", "body", "hashtags"],
        },
      },
      basisUsed: { type: "array", items: { type: "string" } },
    },
    required: ["angle", "premise", "variations", "basisUsed"],
  },
};

const PERSONALISE_TOOL = {
  name: "write_email",
  description: "Return a cold outreach email grounded strictly in the supplied facts.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string", description: "6 words max, lowercase, specific" },
      body: { type: "string", description: "90 words max, no sign-off" },
      basisUsed: { type: "array", items: { type: "string" } },
    },
    required: ["subject", "body", "basisUsed"],
  },
};

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/**
 * Structured output is forced with a tool definition rather than "reply in
 * JSON" — the API then guarantees the shape, so there is no brittle parsing.
 */
const RESEARCH_TOOL = {
  name: "record_research",
  description: "Record the structured research findings for a sales prospect.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2–3 sentence company summary." },
      whatTheyDo: { type: "string", description: "One sentence on what the company sells." },
      painPoints: {
        type: "array",
        items: { type: "string" },
        description: "Likely operational problems, 2–5 items.",
      },
      automationOpportunities: {
        type: "array",
        items: { type: "string" },
        description: "Concrete AI/automation opportunities, 2–5 items.",
      },
      recommendedOffer: { type: "string", description: "The single most relevant offer to lead with." },
      personalization: {
        type: "array",
        items: { type: "string" },
        description: "Specific hooks for a first outreach message, 2–4 items.",
      },
      score: { type: "integer", description: "Fit score 0–100." },
      scoreReason: { type: "string", description: "Why that score, citing specifics." },
      confidence: {
        type: "number",
        description: "0–1 confidence given how much real information was available.",
      },
    },
    required: [
      "summary",
      "whatTheyDo",
      "painPoints",
      "automationOpportunities",
      "recommendedOffer",
      "personalization",
      "score",
      "scoreReason",
      "confidence",
    ],
  },
} as const;

const CRITERIA_TOOL = {
  name: "record_criteria",
  description: "Extract structured prospect search criteria from a natural language request.",
  input_schema: {
    type: "object",
    properties: {
      description: { type: "string" },
      niche: { type: "string" },
      locations: { type: "array", items: { type: "string" } },
      minEmployees: { type: "integer" },
      maxEmployees: { type: "integer" },
      jobTitles: { type: "array", items: { type: "string" } },
      industries: { type: "array", items: { type: "string" } },
      limit: { type: "integer", description: "How many companies to find. Default 25." },
    },
    required: ["description", "limit"],
  },
} as const;

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY?.trim() || undefined;
    this.model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async researchLead(subject: ResearchSubject): Promise<ResearchResult> {
    const result = await this.call<ResearchResult>({
      system:
        "You are a B2B sales researcher for an AI automation agency. You assess how well a " +
        "company fits the agency's offer and what automation would genuinely help them. " +
        "Be specific and grounded: use only the facts provided. When information is thin, say so " +
        "in scoreReason and lower the confidence rather than inventing details. Never fabricate " +
        "revenue figures, headcounts, tools or customer names.",
      prompt: buildResearchPrompt(subject),
      tool: RESEARCH_TOOL,
      maxTokens: 1600,
    });

    return {
      ...result,
      score: clamp(Math.round(result.score), 0, 100),
      confidence: clamp(Number(result.confidence), 0, 1),
      painPoints: asArray(result.painPoints),
      automationOpportunities: asArray(result.automationOpportunities),
      personalization: asArray(result.personalization),
    };
  }

  async parseProspectCriteria(prompt: string): Promise<ProspectCriteria> {
    const result = await this.call<ProspectCriteria>({
      system:
        "Extract structured B2B prospect search criteria from the user's request. " +
        "Only fill fields the user actually specified.",
      prompt,
      tool: CRITERIA_TOOL,
      maxTokens: 500,
    });
    return { ...result, limit: clamp(Math.round(result.limit ?? 25), 1, 500) };
  }

  async personaliseEmail(subject: PersonalisationSubject): Promise<PersonalisedEmail> {
    const result = await this.call<PersonalisedEmail>({
      system: "You write short, specific cold outreach. You never invent facts.",
      prompt: personalisationPrompt(subject),
      tool: PERSONALISE_TOOL,
      maxTokens: 1024,
    });
    return {
      subject: result.subject.trim().slice(0, 160),
      body: result.body.trim(),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  async writeDmSequence(subject: DmSubject): Promise<DmSequence> {
    const result = await this.call<DmSequence>({
      system: "You write short, specific cold DMs. You never invent facts.",
      prompt: dmPrompt(subject),
      tool: DM_TOOL,
      maxTokens: 1024,
    });
    const note = result.connectionNote?.trim();
    return {
      // Over 300 characters LinkedIn refuses the request outright.
      connectionNote: subject.platform === "linkedin" && note ? note.slice(0, 300) : null,
      firstMessage: result.firstMessage.trim(),
      secondMessage: result.secondMessage.trim(),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  async writeSocialPosts(subject: SocialSubject): Promise<SocialPostSet> {
    const wanted = subject.format === "showcase" ? 1 : 3;
    const result = await this.call<SocialPostSet>({
      system:
        "You write build-in-public social content. You never invent metrics, users, revenue or client outcomes.",
      prompt: socialPrompt(subject),
      tool: SOCIAL_TOOL,
      maxTokens: 2048,
    });
    return {
      angle: result.angle.trim(),
      premise: result.premise.trim(),
      variations: (result.variations ?? []).slice(0, wanted).map((v) => ({
        label: v.label.trim(),
        hook: v.hook.trim(),
        body: v.body.trim(),
        cta: v.cta?.trim() || null,
        hashtags: (v.hashtags ?? []).map((h) => h.replace(/^#+/, "").trim()).filter(Boolean).slice(0, 6),
      })),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  async writeCaseStudy(subject: CaseStudySubject): Promise<CaseStudyDraft> {
    const result = await this.call<CaseStudyDraft>({
      system:
        "You write project pages for prospective clients. You never invent metrics, users, revenue or outcomes.",
      prompt: caseStudyPrompt(subject),
      tool: CASE_STUDY_TOOL,
      maxTokens: 2048,
    });
    return {
      headline: result.headline.trim().slice(0, 90),
      intro: result.intro.trim(),
      problem: result.problem.trim(),
      approach: result.approach.trim(),
      howItWorks: (result.howItWorks ?? []).map((v) => v.trim()).filter(Boolean).slice(0, 5),
      demonstrates: (result.demonstrates ?? []).map((v) => v.trim()).filter(Boolean).slice(0, 4),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  private async call<T>({
    system,
    prompt,
    tool,
    maxTokens,
  }: {
    system: string;
    prompt: string;
    tool:
      | typeof RESEARCH_TOOL
      | typeof CRITERIA_TOOL
      | typeof PERSONALISE_TOOL
      | typeof DM_TOOL
      | typeof SOCIAL_TOOL
      | typeof CASE_STUDY_TOOL;
    maxTokens: number;
  }): Promise<T> {
    if (!this.apiKey) {
      throw new AIProviderError(
        "ANTHROPIC_API_KEY is not set. Set it, or switch AI_PROVIDER=mock for offline development.",
        this.name,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system,
          tools: [tool],
          tool_choice: { type: "tool", name: tool.name },
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new AIProviderError(
          `Anthropic API returned ${response.status}: ${detail.slice(0, 300)}`,
          this.name,
        );
      }

      const data = (await response.json()) as {
        content?: { type: string; name?: string; input?: unknown }[];
      };
      const block = data.content?.find((c) => c.type === "tool_use" && c.name === tool.name);
      if (!block?.input) {
        throw new AIProviderError("Anthropic response contained no tool result", this.name);
      }
      return block.input as T;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new AIProviderError("Anthropic request timed out after 60s", this.name, error);
      }
      throw new AIProviderError((error as Error).message, this.name, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildResearchPrompt(subject: ResearchSubject): string {
  const lines: string[] = ["## Prospect", `Company: ${subject.companyName}`];
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") lines.push(`${label}: ${value}`);
  };

  add("Website", subject.website);
  add("Industry", subject.industry);
  add("Location", subject.location);
  add("Employees", subject.employeeCount);
  add("Revenue", subject.revenue);
  add("LinkedIn", subject.linkedinUrl);
  add("Known description", subject.description);
  add("Contact", subject.contactName);
  add("Contact job title", subject.jobTitle);

  if (subject.niche) {
    lines.push("", "## Our target niche for this lead");
    add("Niche", subject.niche.name);
    add("Target market", subject.niche.targetMarket);
    add("Ideal company size", subject.niche.idealCompanySize);
    add("Target job titles", subject.niche.targetJobTitles?.join(", "));
    add("Known pain points in this niche", subject.niche.painPoints);
    add("Our offer for this niche", subject.niche.offer);
  }

  if (subject.websiteText) {
    lines.push("", "## Text extracted from their website", subject.websiteText);
  } else {
    lines.push(
      "",
      "## Website",
      "No website text could be retrieved. Score conservatively and lower confidence.",
    );
  }

  lines.push(
    "",
    "Assess this prospect's fit for an AI automation agency and record your findings.",
  );
  return lines.join("\n");
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
