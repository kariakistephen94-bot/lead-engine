import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailMessages } from "@/db/schema";
import { suppress } from "@/lib/services/outreach";

export const metadata = { title: "Unsubscribed" };
export const dynamic = "force-dynamic";

/**
 * One click, no confirmation step, no login.
 *
 * Anything that makes opting out harder than opting in is both unlawful and
 * self-defeating: a recipient who cannot leave marks the message as spam, which
 * costs the sending domain far more than the lead was worth.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [message] = await db
    .select({ id: emailMessages.id, toEmail: emailMessages.toEmail })
    .from(emailMessages)
    .where(eq(emailMessages.unsubscribeToken, token))
    .limit(1);

  if (message) {
    await suppress(message.toEmail, "unsubscribed", "Unsubscribe link", message.id);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center shadow-xs">
        <h1 className="text-base font-semibold text-ink">
          {message ? "You've been unsubscribed" : "Link not recognised"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {message ? (
            <>
              <span className="font-medium text-ink">{message.toEmail}</span> won&apos;t receive any
              further emails from us. Nothing else is needed.
            </>
          ) : (
            "This unsubscribe link is invalid or has already been used. If you keep receiving emails, reply to any of them and we'll remove you."
          )}
        </p>
      </div>
    </main>
  );
}
