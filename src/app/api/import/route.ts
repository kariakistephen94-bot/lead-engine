import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import {
  createImport,
  finishImport,
  listImports,
  processChunk,
} from "@/lib/services/import";

/** Rows arrive in chunks so a 50k-row file never lands in one request body. */
const startSchema = z.object({
  action: z.literal("start"),
  filename: z.string().min(1).max(255),
  totalRows: z.number().int().min(0),
  mapping: z.record(z.string(), z.string()),
  nicheId: z.string().uuid().nullable(),
  sourceId: z.string().uuid().nullable(),
});

const chunkSchema = z.object({
  action: z.literal("chunk"),
  importId: z.string().uuid(),
  nicheId: z.string().uuid().nullable(),
  sourceId: z.string().uuid().nullable(),
  rows: z
    .array(z.object({ rowNumber: z.number().int(), data: z.record(z.string(), z.string()) }))
    .max(500),
});

const finishSchema = z.object({ action: z.literal("finish"), importId: z.string().uuid() });

const schema = z.discriminatedUnion("action", [startSchema, chunkSchema, finishSchema]);

export const maxDuration = 300;

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json(await listImports());
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid import request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;

  if (body.action === "start") {
    const importId = await createImport({ ...body, userId: auth.user.userId });
    return Response.json({ importId }, { status: 201 });
  }

  if (body.action === "chunk") {
    const result = await processChunk(body.importId, body.rows, {
      nicheId: body.nicheId,
      sourceId: body.sourceId,
      userId: auth.user.userId,
    });
    return Response.json(result);
  }

  return Response.json(await finishImport(body.importId));
}
