import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { setDmStatus } from "@/lib/services/dm";

const schema = z.object({
  status: z.enum(["draft", "connect_sent", "first_sent", "second_sent", "replied", "dismissed"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const ok = await setDmStatus(id, parsed.data.status);
  if (!ok) return Response.json({ error: "Script not found" }, { status: 404 });
  return Response.json({ ok: true });
}
