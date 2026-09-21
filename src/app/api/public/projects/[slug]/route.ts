import { verifyPublicApiKey } from "@/lib/auth/public-api";
import { getPublishedProject } from "@/lib/services/public-site";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = verifyPublicApiKey(request);
  if (!auth.ok) return auth.response;

  const { slug } = await params;
  const project = await getPublishedProject(slug);

  // An unpublished project is indistinguishable from one that does not exist.
  // Anything else would let the site enumerate work you have not cleared.
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(
    { project },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
