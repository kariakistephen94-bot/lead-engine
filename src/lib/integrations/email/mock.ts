import type { EmailProvider, OutboundEmail } from "../types";

/**
 * Development email adapter. It logs and reports the send as *not* accepted, so
 * the UI can never show "email sent" when nothing left the building.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";

  isConfigured(): boolean {
    return true;
  }

  async send(email: OutboundEmail): Promise<{ id: string; accepted: boolean }> {
    console.info(`[email:mock] would send to ${email.to} — "${email.subject}"`);
    return { id: `mock-${Date.now()}`, accepted: false };
  }
}
