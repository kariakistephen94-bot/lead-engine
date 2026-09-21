import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";

const schema = z.object({
  dailyTarget: z.coerce.number().int().min(1).max(2000).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid settings", issues: parsed.error.flatten() }, { status: 400 });
  }
  if (!Object.keys(parsed.data).length) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(parsed.data)
    .where(eq(users.id, auth.user.userId))
    .returning({ id: users.id, name: users.name, dailyTarget: users.dailyTarget });

  return Response.json(updated);
}
