import { verifyPublicApiKey } from "@/lib/auth/public-api";
import { listPublishedProjects } from "@/lib/services/public-site";

/**
 * Projects the Kiln website may display.
 *
 * Called server-to-server from the site's own render, never from a browser —
 * the key would be readable if it were.
 */
export async function GET(request: Request) {
  const auth = verifyPublicApiKey(request);
  if (!auth.ok) return auth.response;

  const projects = await listPublishedProjects();

  return Response.json(
    { projects },
    {
      // The site revalidates on its own schedule; this is a second line so a
      // burst of traffic there cannot become a burst of queries here.
      headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
    },
  );
}
