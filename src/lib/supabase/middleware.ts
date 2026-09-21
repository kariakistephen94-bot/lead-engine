import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Refresh the Supabase session at the edge and report who is signed in.
 *
 * Access tokens are short-lived, so without a refresh on each request a tab
 * left open would be signed out roughly every hour. The rotated cookies have to
 * be written onto the response that is actually returned, which is why the
 * response object is rebuilt inside `setAll` rather than created once up front.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()`, not `getSession()`: it verifies the token against Supabase
  // rather than trusting whatever the cookie claims, which is the difference
  // between a check and a formality.
  const { data } = await supabase.auth.getUser();

  return { response, userId: data.user?.id ?? null };
}
