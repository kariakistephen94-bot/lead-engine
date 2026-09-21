import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { getAccountCapacity } from "@/lib/services/email-accounts";
import { sendQueued } from "@/lib/services/outreach";

const schema = z.object({ limit: z.coerce.number().int().min(1).max(300).default(150) });

export const maxDuration = 300;

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const capacity = await getAccountCapacity();
  return Response.json(
    capacity.map((c) => ({
      id: c.account.id, label: c.account.label, domain: c.account.domain,
      fromEmail: c.account.fromEmail, cap: c.effectiveCap, dailyCap: c.account.dailyCap,
      sentToday: c.sentToday, remaining: c.remaining, configured: c.configured,
      warmup: c.account.warmupEnabled && c.effectiveCap < c.account.dailyCap,
      blockedReason: c.blockedReason,
    })),
  );
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  return Response.json(await sendQueued(parsed.data.limit));
}
