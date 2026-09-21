import { z } from "zod";

import { applicationStatus } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { updateJobPosting } from "@/lib/services/lead-engine";

const schema = z.object({
  status: z.enum(applicationStatus.enumValues).optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid update", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const row = await updateJobPosting(id, parsed.data);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(row);
}
