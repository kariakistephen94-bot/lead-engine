import { requireApiUser } from "@/lib/auth/guard";
import { createXSearch, listXSearches, XSearchValidationError } from "@/lib/services/x-leads";
import { xSearchSchema } from "@/lib/validation";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json(await listXSearches());
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = xSearchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return Response.json(await createXSearch(parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof XSearchValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
