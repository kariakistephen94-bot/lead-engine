import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { countQueuedResearch, queueResearch, runResearchQueue } from "@/lib/ai/research";

export const maxDuration = 300;

const schema = z.object({
  contactIds: z.array(z.string().uuid()).max(1000).optional(),
  run: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json({ queued: await countQueuedResearch() });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  if (parsed.data.contactIds?.length) {
    const queued = await queueResearch(parsed.data.contactIds, auth.user.userId);
    return Response.json({ queued, message: `Queued ${queued} leads for research` });
  }

  // Drain the queue in bounded batches: this endpoint is what a cron worker
  // would call, and it must not run unbounded inside a request.
  const batch = parsed.data.run ?? 5;
  const summary = await runResearchQueue(batch, auth.user.userId);
  return Response.json({
    ...summary,
    message: `Researched ${summary.processed} leads${summary.failed ? `, ${summary.failed} failed` : ""}. ${summary.remaining} still queued.`,
  });
}
