import "server-only";

import { ProviderNotConfiguredError, type EmailProvider, type OutboundEmail } from "../types";

const ENDPOINT = "https://api.resend.com/emails";

export type ResendSendInput = OutboundEmail & {
  from: string;          // "Name <sender@domain.com>"
  html?: string;
  headers?: Record<string, string>;
};

/**
 * Resend adapter, scoped to a single API key.
 *
 * One instance per sending identity rather than a global singleton: the whole
 * point of running two domains is that they have independent keys, reputations
 * and allowances, and a shared client would blur all three.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string | undefined;

  constructor(
    apiKeyEnv: string,
    private readonly defaults: { from: string; replyTo?: string | null },
  ) {
    this.apiKey = process.env[apiKeyEnv]?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async send(email: OutboundEmail): Promise<{ id: string; accepted: boolean }> {
    return this.sendRich({ ...email, from: this.defaults.from });
  }

  async sendRich(input: ResendSendInput): Promise<{ id: string; accepted: boolean }> {
    if (!this.apiKey) throw new ProviderNotConfiguredError("Resend", "RESEND_API_KEY");

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? this.defaults.from,
        to: [input.to],
        subject: input.subject,
        text: input.body,
        html: input.html,
        reply_to: input.replyTo ?? this.defaults.replyTo ?? undefined,
        headers: input.headers,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      // Surface Resend's own wording — "domain is not verified" is far more
      // useful to act on than a bare status code.
      throw new Error(
        `Resend ${response.status}: ${payload.message ?? payload.name ?? "send failed"}`,
      );
    }

    return { id: payload.id ?? "", accepted: true };
  }
}

/** Transient failures worth retrying; anything else is a real rejection. */
export function isRetryableSendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|502|503|504)\b|timeout|ECONNRESET|fetch failed/i.test(message);
}
