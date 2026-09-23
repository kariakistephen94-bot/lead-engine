import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { saveXConfig } from "@/lib/services/x-leads";

const schema = z.object({
  businessDescription: z.string().trim().min(20, "Describe the business in at least a sentence").max(4000).optional(),
  minRelevance: z.coerce.number().int().min(0).max(100).optional(),
});

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid settings", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  return Response.json(await saveXConfig(parsed.data));
}
