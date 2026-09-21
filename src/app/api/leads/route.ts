import { requireApiUser } from "@/lib/auth/guard";
import { createLead } from "@/lib/services/lead-writes";
import { listLeads } from "@/lib/services/leads";
import { createLeadSchema, parseLeadQuery } from "@/lib/validation";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const query = parseLeadQuery(new URL(request.url).searchParams);
  const { rows, total } = await listLeads(query);

  return Response.json({
    rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = createLeadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid lead", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createLead(parsed.data, auth.user.userId);

  if (result.status === "duplicate") {
    // 409 rather than 201: the caller needs to decide whether to open the
    // existing record instead of silently creating a second one.
    return Response.json(result, { status: 409 });
  }

  return Response.json(result, { status: 201 });
}
