import { requireApiUser } from "@/lib/auth/guard";
import { createNiche, listNichesWithStats } from "@/lib/services/niches";
import { nicheSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  return Response.json(await listNichesWithStats(includeArchived));
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = nicheSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid niche", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  return Response.json(await createNiche(parsed.data), { status: 201 });
}
