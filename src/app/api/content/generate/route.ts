import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { generateContent } from "@/lib/services/content";

const schema = z.object({
  projectId: z.string().uuid().nullable(),
  platforms: z
    .array(z.enum(["twitter", "linkedin", "contra", "tiktok", "youtube", "instagram"]))
    .min(1)
    .max(6),
  steer: z.string().trim().max(500).nullable().optional(),
});

// Six platforms written one after another, each a full model round trip.
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Duplicate platforms would write the same idea twice and burn free-tier quota.
  const platforms = [...new Set(parsed.data.platforms)];
  return Response.json(await generateContent({ ...parsed.data, platforms }));
}
