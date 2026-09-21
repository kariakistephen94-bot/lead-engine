import { requireApiUser } from "@/lib/auth/guard";
import { researchLead } from "@/lib/ai/research";

export const maxDuration = 120;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    const outcome = await researchLead((await params).id, auth.user.userId);
    return Response.json(outcome);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
