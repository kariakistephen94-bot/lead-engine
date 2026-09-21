import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { approveDrafts } from "@/lib/services/outreach";

const schema = z.object({
  campaignId: z.string().uuid(),
  messageIds: z.array(z.string().uuid()).max(300).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  return Response.json({ queued: await approveDrafts(parsed.data.campaignId, parsed.data.messageIds) });
}
