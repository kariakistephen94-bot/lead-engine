import "server-only";

import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { MockAIProvider } from "./providers/mock";
import type { AIProvider } from "./types";

let cached: AIProvider | null = null;

/**
 * Resolve the configured AI provider.
 *
 * Falls back to the mock adapter when the real provider is selected but not
 * configured, so a missing key degrades to something honest and testable rather
 * than a 500 in the middle of the research flow.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const requested = (process.env.AI_PROVIDER ?? "mock").toLowerCase();

  if (requested === "gemini" || requested === "google") {
    const provider = new GeminiProvider();
    if (provider.isConfigured()) {
      cached = provider;
      return cached;
    }
    console.warn("[ai] AI_PROVIDER=gemini but GEMINI_API_KEY is missing — using the mock provider.");
  }

  if (requested === "anthropic") {
    const provider = new AnthropicProvider();
    if (provider.isConfigured()) {
      cached = provider;
      return cached;
    }
    console.warn(
      "[ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing — using the mock provider.",
    );
  }

  cached = new MockAIProvider();
  return cached;
}

/** Test seam — lets a test swap the provider without touching the environment. */
export function __setAIProvider(provider: AIProvider | null) {
  cached = provider;
}

export type {
  AIProvider,
  DmSequence,
  DmSubject,
  PersonalisationSubject,
  PersonalisedEmail,
  ResearchResult,
  ResearchSubject,
  SocialPostSet,
  SocialSubject,
  SocialVariation,
} from "./types";
