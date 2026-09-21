import { requireApiUser } from "@/lib/auth/guard";
import { getLookups } from "@/lib/services/lookups";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  return Response.json(await getLookups());
}
