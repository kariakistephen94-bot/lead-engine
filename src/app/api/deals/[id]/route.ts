import { z } from "zod";

import { dealStage } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { deleteDeal, updateDealStage } from "@/lib/services/deals";

const schema = z.object({ stage: z.enum(dealStage.enumValues) });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid stage" }, { status: 400 });

  const updated = await updateDealStage((await params).id, parsed.data.stage, auth.user.userId);
  if (!updated) return Response.json({ error: "Deal not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const deleted = await deleteDeal((await params).id);
  if (!deleted) return Response.json({ error: "Deal not found" }, { status: 404 });
  return Response.json({ ok: true });
}
