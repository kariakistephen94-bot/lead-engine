import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { deleteXSearch, runXSearchNow, updateXSearch, XSearchValidationError } from "@/lib/services/x-leads";
import { xSearchSchema } from "@/lib/validation";

const patchSchema = xSearchSchema.partial().extend({ runNow: z.boolean().optional() });

/** A run pages through X and stores results; give it room. */
export const maxDuration = 120;

async function idFrom(params: Promise<{ id: string }>) {
  const { id } = await params;
  return z.string().uuid().safeParse(id).success ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = await idFrom(params);
  if (!id) return Response.json({ error: "Invalid id" }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    const row = await updateXSearch(id, parsed.data);
    if (!row) return Response.json({ error: "Search not found" }, { status: 404 });
    return Response.json(row);
  } catch (error) {
    if (error instanceof XSearchValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = await idFrom(params);
  if (!id) return Response.json({ error: "Invalid id" }, { status: 400 });
  if (!(await deleteXSearch(id))) return Response.json({ error: "Search not found" }, { status: 404 });
  return Response.json({ ok: true });
}

/** Run this search right now, ignoring its schedule. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = await idFrom(params);
  if (!id) return Response.json({ error: "Invalid id" }, { status: 400 });
  const result = await runXSearchNow(id);
  if (!result) return Response.json({ error: "Search not found or already running" }, { status: 409 });
  return Response.json(result);
}
