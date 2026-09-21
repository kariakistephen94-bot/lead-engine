import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { scanCompanySignals } from "@/lib/services/lead-engine";

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  rescanOlderThanDays: z.coerce.number().int().min(1).max(365).optional(),
  concurrency: z.coerce.number().int().min(1).max(12).optional(),
});

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  return Response.json(await scanCompanySignals(parsed.data));
}
