import { requireApiUser } from "@/lib/auth/guard";
import { saveProspects } from "@/lib/services/prospect";
import { prospectSaveSchema } from "@/lib/validation";

/** Write the reviewed results as leads, via the shared import pipeline. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = prospectSaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid selection", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await saveProspects({
    description: parsed.data.description,
    companies: parsed.data.companies,
    nicheId: parsed.data.nicheId ?? null,
    userId: auth.user.userId,
  });

  return Response.json(result, { status: 201 });
}
