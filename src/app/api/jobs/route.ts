import { requireApiUser } from "@/lib/auth/guard";
import { listJobPostings } from "@/lib/services/lead-engine";
import type { LeadBucket } from "@/db/schema";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const p = new URL(request.url).searchParams;
  return Response.json(
    await listJobPostings({
      bucket: (p.get("bucket") as LeadBucket) || undefined,
      status: p.get("status") || undefined,
      source: p.get("source") || undefined,
      q: p.get("q") || undefined,
      minScore: p.get("minScore") ? Number(p.get("minScore")) : undefined,
      page: p.get("page") ? Number(p.get("page")) : 1,
      pageSize: p.get("pageSize") ? Math.min(Number(p.get("pageSize")), 200) : 50,
    }),
  );
}
