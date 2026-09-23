import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { convertXAuthors, setXAuthorStatus } from "@/lib/services/x-leads";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["convert", "dismiss", "restore"]),
});

export const maxDuration = 120;

/** Bulk actions on X leads: add to the CRM, dismiss, or bring back. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { ids, action } = parsed.data;
  if (action === "convert") return Response.json(await convertXAuthors(ids, auth.user.userId));
  const affected = await setXAuthorStatus(ids, action === "dismiss" ? "dismissed" : "qualified");
  return Response.json({ affected });
}
