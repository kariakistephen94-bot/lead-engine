import { ProviderNotConfiguredError } from "@/lib/integrations/types";
import { requireApiUser } from "@/lib/auth/guard";
import { searchProspects } from "@/lib/services/prospect";
import { prospectSearchSchema } from "@/lib/validation";

/** Search only — results are returned for review and nothing is written. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = prospectSearchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid search", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const { description, locations, industries, jobTitles, keywords, limit } = parsed.data;
    return Response.json(
      await searchProspects({
        description,
        locations,
        industries,
        jobTitles,
        keywords,
        minEmployees: parsed.data.minEmployees ?? null,
        maxEmployees: parsed.data.maxEmployees ?? null,
        limit,
      }),
    );
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    // A vendor outage is not a bug in this app — say so plainly.
    const message = error instanceof Error ? error.message : "Lead provider request failed";
    console.error("[prospect] search failed:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
