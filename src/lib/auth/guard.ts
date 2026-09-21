import "server-only";

import { redirect } from "next/navigation";

import { getSession, type SessionPayload } from "./session";

/** For pages/layouts: bounce to the login screen when signed out. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * For route handlers: never redirect an API call to an HTML page — return 401
 * so the client can surface a real error instead of parsing a login document.
 */
export async function requireApiUser(): Promise<
  { ok: true; user: SessionPayload } | { ok: false; response: Response }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { ok: true, user: session };
}
