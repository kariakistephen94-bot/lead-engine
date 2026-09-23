import "server-only";

import { caseStudyPrompt } from "../case-study";
import { dmPrompt } from "../dm";
import { personalisationPrompt } from "../personalisation";
import { socialPrompt } from "../social";
import { classifyPrompt, normalizeClassifications, normalizeQueries, queriesPrompt, X_INTENTS } from "../x-leads";
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
  type XBusinessContext,
  type XNicheContext,
  type XPostClassification,
  type XPostToClassify,
  type XQueryDraft,
} from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  error?: { message?: string; status?: string };
  promptFeedback?: { blockReason?: string };
};

/**
 * Google Gemini adapter.
 *
 * Uses the REST `generateContent` endpoint with a JSON response schema, so the
 * model returns parseable structure rather than prose that has to be scraped —
 * the same contract the other providers honour.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
    this.model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async generate<T>(prompt: string, schema: Record<string, unknown>, temperature = 0.7): Promise<T> {
    if (!this.apiKey) throw new AIProviderError("GEMINI_API_KEY is not set", this.name);

    const response = await fetch(`${BASE}/${this.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      throw new AIProviderError(
        `Gemini ${response.status}: ${payload.error?.message ?? "request failed"}`,
        this.name,
      );
    }
    if (payload.promptFeedback?.blockReason) {
      throw new AIProviderError(`Gemini blocked the prompt: ${payload.promptFeedback.blockReason}`, this.name);
    }

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new AIProviderError("Gemini returned an empty response", this.name);

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AIProviderError("Gemini returned malformed JSON", this.name);
    }
  }

  async classifyXPosts(input: { business: XBusinessContext; posts: XPostToClassify[] }): Promise<XPostClassification[]> {
    const result = await this.generate<{ results?: unknown[] }>(
      classifyPrompt(input.business, input.posts),
      {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                relevance: { type: "integer" },
                intent: { type: "string", enum: X_INTENTS },
                reason: { type: "string" },
                niche: { type: "string", nullable: true },
              },
              required: ["id", "relevance", "intent", "reason"],
            },
          },
        },
        required: ["results"],
      },
      // Scoring should be repeatable, not creative.
      0.1,
    );
    return normalizeClassifications(result.results, input.posts, input.business);
  }

  async writeXSearchQueries(input: { business: XBusinessContext; niche: XNicheContext }): Promise<XQueryDraft[]> {
    const result = await this.generate<{ queries?: unknown[] }>(
      queriesPrompt(input.business, input.niche),
      {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, query: { type: "string" }, rationale: { type: "string" } },
              required: ["name", "query", "rationale"],
            },
          },
        },
        required: ["queries"],
      },
      0.4,
    );
    return normalizeQueries(result.queries, input.niche);
  }

  async personaliseEmail(subject: PersonalisationSubject): Promise<PersonalisedEmail> {
    const result = await this.generate<PersonalisedEmail>(personalisationPrompt(subject), {
      type: "object",
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
        basisUsed: { type: "array", items: { type: "string" } },
      },
      required: ["subject", "body", "basisUsed"],
    });

    return {
      subject: result.subject.trim().slice(0, 160),
      body: result.body.trim(),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  async writeDmSequence(subject: DmSubject): Promise<DmSequence> {
    const result = await this.generate<DmSequence>(dmPrompt(subject), {
      type: "object",
      properties: {
        connectionNote: { type: "string", nullable: true },
        firstMessage: { type: "string" },
        secondMessage: { type: "string" },
        basisUsed: { type: "array", items: { type: "string" } },
      },
      required: ["firstMessage", "secondMessage", "basisUsed"],
    });

    // LinkedIn rejects a note over 300 characters outright, so truncating at
    // the boundary is better than handing over something that cannot be sent.
    const note = result.connectionNote?.trim();

    return {
      connectionNote:
        subject.platform === "linkedin" && note ? note.slice(0, 300) : null,
      firstMessage: result.firstMessage.trim(),
      secondMessage: result.secondMessage.trim(),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  async writeSocialPosts(subject: SocialSubject): Promise<SocialPostSet> {
    const wanted = subject.format === "showcase" ? 1 : 3;

    const result = await this.generate<SocialPostSet>(socialPrompt(subject), {
      type: "object",
      properties: {
        angle: { type: "string" },
        premise: { type: "string" },
        variations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              hook: { type: "string" },
              body: { type: "string" },
              cta: { type: "string", nullable: true },
              hashtags: { type: "array", items: { type: "string" } },
            },
            required: ["label", "hook", "body", "hashtags"],
          },
        },
        basisUsed: { type: "array", items: { type: "string" } },
      },
      required: ["angle", "premise", "variations", "basisUsed"],
    });

    return {
      angle: result.angle.trim(),
      premise: result.premise.trim(),
      variations: (result.variations ?? []).slice(0, wanted).map((v) => ({
        label: v.label.trim(),
        hook: v.hook.trim(),
        body: v.body.trim(),
        cta: v.cta?.trim() || null,
        // Strip any leading # the model added so storage stays one shape.
        hashtags: (v.hashtags ?? []).map((h) => h.replace(/^#+/, "").trim()).filter(Boolean).slice(0, 6),
      })),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  async writeCaseStudy(subject: CaseStudySubject): Promise<CaseStudyDraft> {
    const result = await this.generate<CaseStudyDraft>(caseStudyPrompt(subject), {
      type: "object",
      properties: {
        headline: { type: "string" },
        intro: { type: "string" },
        problem: { type: "string" },
        approach: { type: "string" },
        howItWorks: { type: "array", items: { type: "string" } },
        demonstrates: { type: "array", items: { type: "string" } },
        basisUsed: { type: "array", items: { type: "string" } },
      },
      required: ["headline", "intro", "problem", "approach", "howItWorks", "demonstrates", "basisUsed"],
    });

    return {
      headline: result.headline.trim().slice(0, 90),
      intro: result.intro.trim(),
      problem: result.problem.trim(),
      approach: result.approach.trim(),
      howItWorks: (result.howItWorks ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 5),
      demonstrates: (result.demonstrates ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
      basisUsed: (result.basisUsed ?? []).slice(0, 12),
    };
  }

  async researchLead(subject: ResearchSubject): Promise<ResearchResult> {
    const prompt = [
      "Research this business for outbound sales and return JSON.",
      `Company: ${subject.companyName}`,
      subject.website ? `Website: ${subject.website}` : "",
      subject.industry ? `Industry: ${subject.industry}` : "",
      subject.location ? `Location: ${subject.location}` : "",
      "",
      "Use only what is given. Where you are unsure, say so and lower the confidence.",
    ].filter(Boolean).join("\n");

    return this.generate<ResearchResult>(prompt, {
      type: "object",
      properties: {
        summary: { type: "string" },
        painPoints: { type: "array", items: { type: "string" } },
        recommendedOffer: { type: "string" },
        personalization: { type: "array", items: { type: "string" } },
        score: { type: "integer" },
        scoreReason: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["summary", "painPoints", "recommendedOffer", "personalization", "score", "scoreReason", "confidence"],
    });
  }

  async parseProspectCriteria(prompt: string): Promise<ProspectCriteria> {
    return this.generate<ProspectCriteria>(
      `Turn this prospecting request into structured criteria: "${prompt}"`,
      {
        type: "object",
        properties: {
          description: { type: "string" },
          locations: { type: "array", items: { type: "string" } },
          industries: { type: "array", items: { type: "string" } },
          jobTitles: { type: "array", items: { type: "string" } },
          minEmployees: { type: "integer", nullable: true },
          maxEmployees: { type: "integer", nullable: true },
          limit: { type: "integer" },
        },
        required: ["description", "limit"],
      },
    );
  }
}
