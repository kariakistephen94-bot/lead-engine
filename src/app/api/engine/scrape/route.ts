import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { runAllScrapers, runScraper } from "@/lib/services/lead-engine";
import { SCRAPERS } from "@/lib/scrapers";

const schema = z.object({
  /** Omit to run every configured source. */
  source: z.string().min(1).optional(),
  terms: z.array(z.string().trim().min(1)).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
});

/** Long enough for a full sweep of every source. */
export const maxDuration = 300;

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json(
    SCRAPERS.map((s) => ({
      name: s.name, label: s.label, bucket: s.bucket,
      origin: s.origin, configured: s.isConfigured(),
    })),
  );
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const { source, ...options } = parsed.data;
    const results = source ? [await runScraper(source, options)] : await runAllScrapers(options);
    return Response.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scrape failed";
    console.error("[engine] scrape failed:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
