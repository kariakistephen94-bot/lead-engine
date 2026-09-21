import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { recordMetrics, setPostStatus, updatePost } from "@/lib/services/content";

const schema = z.object({
  status: z.enum(["draft", "approved", "scheduled", "posted", "archived"]).optional(),
  postUrl: z.string().url().max(500).nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  hook: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().min(1).max(6000).optional(),
  cta: z.string().trim().max(500).nullable().optional(),
  hashtags: z.array(z.string().trim().max(60)).max(10).optional(),
  metrics: z
    .object({
      impressions: z.number().int().min(0).nullable().optional(),
      likes: z.number().int().min(0).nullable().optional(),
      comments: z.number().int().min(0).nullable().optional(),
      shares: z.number().int().min(0).nullable().optional(),
      profileClicks: z.number().int().min(0).nullable().optional(),
    })
    .optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { status, postUrl, scheduledFor, metrics, ...edits } = parsed.data;
  let found = true;

  if (Object.keys(edits).length) found = await updatePost(id, edits);
  if (found && metrics) found = await recordMetrics(id, metrics);
  if (found && status) {
    found = await setPostStatus(id, status, {
      postUrl,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    });
  }

  if (!found) return Response.json({ error: "Post not found" }, { status: 404 });
  return Response.json({ ok: true });
}
