import { requireApiUser } from "@/lib/auth/guard";
import { verifyXConnection } from "@/lib/services/x-leads";

/** Test the X credentials with a live, free call and report quota usage. */
export async function POST() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const result = await verifyXConnection();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
