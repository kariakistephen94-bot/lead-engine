import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { contactTags } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";

const schema = z.object({ tagId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid tag" }, { status: 400 });

  await db
    .insert(contactTags)
    .values({ contactId: (await params).id, tagId: parsed.data.tagId })
    .onConflictDoNothing();

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const tagId = new URL(request.url).searchParams.get("tagId");
  if (!tagId) return Response.json({ error: "tagId is required" }, { status: 400 });

  await db
    .delete(contactTags)
    .where(and(eq(contactTags.contactId, (await params).id), eq(contactTags.tagId, tagId)));

  return Response.json({ ok: true });
}
