import "server-only";

import { and, count, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { emailAccounts, emailMessages, type EmailAccount } from "@/db/schema";
import { ResendEmailProvider } from "@/lib/integrations/email/resend";

export type AccountCapacity = {
  account: EmailAccount;
  /** Cap in force today — the warm-up figure while ramping, else dailyCap. */
  effectiveCap: number;
  sentToday: number;
  remaining: number;
  configured: boolean;
  /** Seconds until this account may send again, given its pacing setting. */
  cooldownSeconds: number;
  blockedReason: string | null;
};

/** Start of the current day, used for the per-day counter. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * How many this identity may send today.
 *
 * A domain with no sending history that suddenly emits 75 messages a day looks
 * exactly like a compromised account, so the allowance opens gradually and only
 * reaches the configured cap once there is a track record behind it.
 */
export function effectiveCap(account: EmailAccount, today = new Date()): number {
  if (!account.warmupEnabled || !account.warmupStartedOn) return account.dailyCap;

  const started = new Date(account.warmupStartedOn);
  const days = Math.max(0, Math.floor((today.getTime() - started.getTime()) / 86_400_000));
  const ramped = account.warmupStart + days * account.warmupIncrement;
  return Math.max(1, Math.min(account.dailyCap, ramped));
}

/** Live capacity for every account, newest-first by remaining headroom. */
export async function getAccountCapacity(): Promise<AccountCapacity[]> {
  const accounts = await db.select().from(emailAccounts).orderBy(emailAccounts.label);
  const since = startOfToday();
  const now = Date.now();

  const rows = await Promise.all(
    accounts.map(async (account) => {
      // Anything that actually left the building counts against the allowance.
      const [{ n }] = await db
        .select({ n: count() })
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.accountId, account.id),
            gte(emailMessages.sentAt, since),
            sql`${emailMessages.status} in ('sent','delivered','opened','replied','bounced','complained')`,
          ),
        );

      const sentToday = Number(n);
      const cap = effectiveCap(account);
      const provider = new ResendEmailProvider(account.apiKeyEnv, { from: account.fromEmail });
      const configured = provider.isConfigured();

      const elapsed = account.lastSentAt ? (now - account.lastSentAt.getTime()) / 1000 : Infinity;
      const cooldownSeconds = Math.max(0, Math.ceil(account.minSecondsBetweenSends - elapsed));

      const remaining = Math.max(0, cap - sentToday);
      const blockedReason =
        !account.active ? "Paused"
        : !configured ? `No API key in ${account.apiKeyEnv}`
        : remaining === 0 ? `Daily cap reached (${cap})`
        : null;

      return { account, effectiveCap: cap, sentToday, remaining, configured, cooldownSeconds, blockedReason };
    }),
  );

  return rows;
}

/**
 * Pick the account that should send the next message.
 *
 * Chooses the one with the most headroom left, which spreads volume evenly
 * across domains instead of exhausting the first and then hammering the second —
 * an even trickle from both reads far better to a receiving mail server.
 * Returns null when every account is capped, paused or unconfigured; the caller
 * must treat that as "stop", never as "send anyway".
 */
export async function pickAccount(): Promise<AccountCapacity | null> {
  const capacity = await getAccountCapacity();
  const usable = capacity
    .filter((c) => !c.blockedReason && c.cooldownSeconds === 0)
    .sort((a, b) => b.remaining - a.remaining);
  return usable[0] ?? null;
}

/** Total headroom across every active identity. */
export async function totalRemainingToday(): Promise<number> {
  const capacity = await getAccountCapacity();
  return capacity.filter((c) => !c.blockedReason).reduce((sum, c) => sum + c.remaining, 0);
}

export async function providerFor(account: EmailAccount): Promise<ResendEmailProvider> {
  return new ResendEmailProvider(account.apiKeyEnv, {
    from: `${account.fromName} <${account.fromEmail}>`,
    replyTo: account.replyTo,
  });
}

export async function listAccounts(): Promise<EmailAccount[]> {
  return db.select().from(emailAccounts).orderBy(emailAccounts.label);
}

export async function upsertAccount(input: {
  id?: string;
  label: string;
  domain: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  apiKeyEnv: string;
  dailyCap?: number;
  warmupEnabled?: boolean;
  minSecondsBetweenSends?: number;
  active?: boolean;
}): Promise<EmailAccount> {
  const values = {
    label: input.label,
    domain: input.domain,
    fromEmail: input.fromEmail.toLowerCase(),
    fromName: input.fromName,
    replyTo: input.replyTo ?? null,
    apiKeyEnv: input.apiKeyEnv,
    dailyCap: input.dailyCap ?? 75,
    warmupEnabled: input.warmupEnabled ?? true,
    minSecondsBetweenSends: input.minSecondsBetweenSends ?? 45,
    active: input.active ?? true,
    updatedAt: new Date(),
  };

  if (input.id) {
    const [row] = await db.update(emailAccounts).set(values).where(eq(emailAccounts.id, input.id)).returning();
    return row;
  }

  // The unique index is on lower(from_email), an expression Drizzle cannot name
  // as a conflict target — so match it explicitly first.
  const [existing] = await db
    .select({ id: emailAccounts.id })
    .from(emailAccounts)
    .where(eq(sql`lower(${emailAccounts.fromEmail})`, values.fromEmail))
    .limit(1);

  if (existing) {
    const [row] = await db.update(emailAccounts).set(values).where(eq(emailAccounts.id, existing.id)).returning();
    return row;
  }

  const [row] = await db
    .insert(emailAccounts)
    // The warm-up clock starts the day the identity is created.
    .values({ ...values, warmupStartedOn: new Date().toISOString().slice(0, 10) })
    .returning();
  return row;
}
