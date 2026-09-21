import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { addBuildLog } from "@/lib/services/build";

const schema = z.object({
  projectId: z.string().uuid(),
  /** ISO date, not a timestamp — a log belongs to a day, not a moment. */
  loggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  built: z.string().trim().min(3).max(4000),
  blockers: z.string().trim().max(4000).nullable().optional(),
  learned: z.string().trim().max(4000).nullable().optional(),
  hours: z.number().min(0).max(24).nullable().optional(),
});

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

  const { hours, ...rest } = parsed.data;
  const log = await addBuildLog({
    ...rest,
    // numeric() round-trips as a string in node-postgres.
    hours: hours === null || hours === undefined ? null : String(hours),
  });
  if (!log) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json({ ok: true, log });
}
