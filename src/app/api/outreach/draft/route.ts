import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { draftCampaign } from "@/lib/services/outreach";

const schema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(300),
  campaignName: z.string().trim().min(1).max(120),
  offer: z.string().trim().min(3).max(300),
  campaignId: z.string().uuid().optional(),
});

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  return Response.json(await draftCampaign(parsed.data));
}
