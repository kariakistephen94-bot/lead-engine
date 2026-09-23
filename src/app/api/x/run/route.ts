import { requireApiUser } from "@/lib/auth/guard";
import { runXTick } from "@/lib/services/x-leads";

export const maxDuration = 120;

/** "Run now" from the UI: every due search, then the scoring queue. */
export async function POST() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json(await runXTick({ timeBudgetMs: 100_000 }));
}
