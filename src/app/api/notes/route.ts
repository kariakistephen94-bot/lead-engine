import { eq } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activities";
import { noteSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid note" }, { status: 400 });
  }

  const { contactId, companyId, body } = parsed.data;
  if (!contactId && !companyId) {
    return Response.json({ error: "A note must belong to a lead or a company" }, { status: 400 });
  }

  let resolvedCompanyId = companyId ?? null;
  if (contactId && !resolvedCompanyId) {
    const [row] = await db
      .select({ companyId: contacts.companyId })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!row) return Response.json({ error: "Lead not found" }, { status: 404 });
    resolvedCompanyId = row.companyId;
  }

  const [created] = await db
    .insert(notes)
    .values({ contactId: contactId ?? null, companyId: resolvedCompanyId, body, userId: auth.user.userId })
    .returning();

  await logActivity({
    contactId: contactId ?? null,
    companyId: resolvedCompanyId,
    type: "note_added",
    subject: "Note added",
    body: body.slice(0, 280),
    userId: auth.user.userId,
  });

  return Response.json(created, { status: 201 });
}
