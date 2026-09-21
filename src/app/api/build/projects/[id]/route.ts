import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { setProjectStatus, updateProject } from "@/lib/services/build";

const schema = z.object({
  status: z.enum(["planned", "active", "completed", "paused"]).optional(),
  repoUrl: z.string().url().max(500).nullable().optional(),
  demoUrl: z.string().url().max(500).nullable().optional(),
  youtubeUrl: z.string().url().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  published: z.boolean().optional(),
  caseStudy: z
    .object({
      headline: z.string().trim().min(1).max(120),
      intro: z.string().trim().min(1).max(1000),
      problem: z.string().trim().min(1).max(2000),
      approach: z.string().trim().min(1).max(2000),
      howItWorks: z.array(z.string().trim().min(1).max(400)).max(6),
      demonstrates: z.array(z.string().trim().min(1).max(300)).max(6),
      basisUsed: z.array(z.string().trim().max(300)).max(12),
    })
    .nullable()
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

  const { status, ...patch } = parsed.data;

  if (Object.keys(patch).length) {
    const ok = await updateProject(id, patch);
    if (!ok) return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (status) {
    const project = await setProjectStatus(id, status);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ ok: true, project });
  }

  return Response.json({ ok: true });
}
