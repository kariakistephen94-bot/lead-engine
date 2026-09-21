import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { getAccountCapacity, upsertAccount } from "@/lib/services/email-accounts";

const schema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(80),
  domain: z.string().trim().min(3).max(120),
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().min(1).max(80),
  replyTo: z.string().trim().email().nullable().optional(),
  apiKeyEnv: z.string().trim().regex(/^[A-Z0-9_]+$/, "Use the env var NAME, not the key itself"),
  dailyCap: z.coerce.number().int().min(1).max(2000).optional(),
  warmupEnabled: z.boolean().optional(),
  minSecondsBetweenSends: z.coerce.number().int().min(0).max(3600).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json(await getAccountCapacity());
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid account", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  return Response.json(await upsertAccount(parsed.data), { status: 201 });
}
