import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/constants";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Edge-side gate.
 *
 * Under Supabase this does real work: it refreshes the access token so a long
 * open tab does not silently expire, and it rejects requests with no user.
 * Authorisation of individual records still happens server-side in
 * `requireUser`/`requireApiUser`, which is where data is actually read.
 */
/*
 * Reachable without a session.
 *
 * `/unsubscribe` and the Resend webhook must be here: the person clicking an
 * opt-out link is a recipient, not a user of this app, and bouncing them to a
 * login screen would make the unsubscribe legally useless as well as rude.
 *
 * `/auth` carries the Supabase email-confirmation and password-reset callbacks,
 * which by definition arrive without a session.
 *
 * `/api/public` is the Kiln website's link into this app. It is not open: the
 * routes there verify a shared API key themselves, in constant time, and
 * refuse outright when the key is unset. It is listed here because the caller
 * is a server with no cookie, so the session gate would reject it before its
 * own guard ever ran.
 */
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/health",
  "/unsubscribe",
  "/api/webhooks",
  "/api/public",
];

function deny(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isSupabaseAuthEnabled()) {
    /*
     * The refresh runs even on public paths, and its response is what gets
     * returned. Skipping it there would discard the rotated cookies that this
     * request just produced, signing the user out at the next hop.
     */
    const { response, userId } = await updateSupabaseSession(request);
    if (isPublic || userId) return response;
    return deny(request, pathname);
  }

  if (isPublic) return NextResponse.next();
  if (!request.cookies.get(SESSION_COOKIE)) return deny(request, pathname);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
  /*
   * Node, not edge. The Supabase client reaches `node:util/types` through its
   * realtime dependency, which the edge runtime cannot load — it fails at
   * module evaluation and takes every matched request down with it. Node also
   * lets the token refresh stay here, which is the whole reason this runs on
   * every request.
   */
  runtime: "nodejs",
};
