import { AIProviderError } from "@/lib/ai/types";
import { getAIProvider } from "@/lib/ai";
import { requireApiUser } from "@/lib/auth/guard";
import { MAX_PROSPECT_RESULTS, prospectParseSchema } from "@/lib/validation";

/**
 * Turn a sentence into structured search criteria.
 *
 * Read-only and separate from the search itself, so the parsed fields land in
 * the form for the user to correct before anything is queried or written.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = prospectParseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid prompt", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const criteria = await getAIProvider().parseProspectCriteria(parsed.data.prompt);
    return Response.json({
      ...criteria,
      // The provider's limit is advisory; the search endpoint enforces its own.
      limit: Math.min(criteria.limit || 25, MAX_PROSPECT_RESULTS),
    });
  } catch (error) {
    const message = error instanceof AIProviderError ? error.message : "Could not parse the prompt";
    console.error("[prospect] parse failed:", error);
    return Response.json({ error: message }, { status: 502 });
  }
}
