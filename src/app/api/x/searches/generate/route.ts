import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { generateSearchesFromNiches } from "@/lib/services/x-leads";

const schema = z.object({
  nicheIds: z.array(z.string().uuid()).max(50).optional(),
  enabled: z.boolean().optional(),
});

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  return Response.json(await generateSearchesFromNiches(parsed.data));
}
