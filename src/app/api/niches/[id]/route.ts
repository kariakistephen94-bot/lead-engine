import { requireApiUser } from "@/lib/auth/guard";
import { deleteNiche, getNiche, updateNiche } from "@/lib/services/niches";
import { nicheSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = nicheSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid niche", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id } = await params;
  if (!(await getNiche(id))) return Response.json({ error: "Niche not found" }, { status: 404 });

  return Response.json(await updateNiche(id, parsed.data));
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await getNiche(id))) return Response.json({ error: "Niche not found" }, { status: 404 });

  // Companies keep their rows; the FK is ON DELETE SET NULL so they simply
  // become unassigned. Deleting a niche must never delete leads.
  await deleteNiche(id);
  return Response.json({ ok: true });
}
