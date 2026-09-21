import { requireApiUser } from "@/lib/auth/guard";
import { runBulkAction } from "@/lib/services/lead-writes";
import { bulkActionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = bulkActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid bulk action", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await runBulkAction(parsed.data, auth.user.userId);
  return Response.json(result);
}
