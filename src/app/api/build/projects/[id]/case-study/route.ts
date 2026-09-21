import { z } from "zod";

import { requireApiUser } from "@/lib/auth/guard";
import { generateCaseStudy } from "@/lib/services/build";

// One model round trip over the whole build log.
export const maxDuration = 120;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const caseStudy = await generateCaseStudy(id);
    if (!caseStudy) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ ok: true, caseStudy });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The writer failed" },
      { status: 502 },
    );
  }
}
