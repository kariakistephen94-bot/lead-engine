import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL, serviceRoleKey } from "./config";

/**
 * Supabase client bound to the request's cookies, so `auth.getUser()` sees the
 * signed-in user and a refreshed token is written back.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /*
           * Server Components cannot set cookies. That is not a failure here:
           * the middleware refreshes the session on every request, so the
           * rotated token is already being persisted there.
           */
        }
      },
    },
  });
}

/**
 * Admin client. Bypasses RLS and can create users, so it must never be
 * constructed anywhere the browser can reach.
 */
export function createSupabaseAdminClient() {
  const key = serviceRoleKey();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — required for admin operations " +
        "(Supabase dashboard -> Project Settings -> API -> service_role).",
    );
  }
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
