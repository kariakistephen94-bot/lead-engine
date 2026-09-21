import { requireApiUser } from "@/lib/auth/guard";
import { createDeal, listDeals } from "@/lib/services/deals";
import { dealSchema } from "@/lib/validation";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json(await listDeals());
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = dealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid deal", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  return Response.json(await createDeal(parsed.data, auth.user.userId), { status: 201 });
}
