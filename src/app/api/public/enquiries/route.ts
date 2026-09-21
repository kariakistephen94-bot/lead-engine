import { z } from "zod";

import { clientIp, rateLimit, verifyPublicApiKey } from "@/lib/auth/public-api";
import { captureEnquiry } from "@/lib/services/public-site";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(200).nullable().optional(),
  message: z.string().trim().min(1).max(4000),
  interest: z.enum(["workflows", "subagents", "cohort", "general", "chatbot"]),
  sourceUrl: z.string().trim().url().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = verifyPublicApiKey(request);
  if (!auth.ok) return auth.response;

  // Keyed on the visitor's address, which the site forwards — not on the
  // site's own, or one spammer would lock out every other visitor.
  const forwarded = request.headers.get("x-visitor-ip");
  if (!rateLimit(`enquiry:${forwarded ?? clientIp(request)}`, 5, 60_000)) {
    return Response.json({ error: "Too many enquiries — try again shortly" }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid enquiry", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await captureEnquiry({
    ...parsed.data,
    company: parsed.data.company ?? null,
    sourceUrl: parsed.data.sourceUrl ?? null,
  });

  // "Already in the pipeline" is not an error the visitor should ever see —
  // they filled in a form correctly. It is logged, and they get a thank you.
  return Response.json({ ok: true, deduplicated: result.status === "duplicate" });
}
