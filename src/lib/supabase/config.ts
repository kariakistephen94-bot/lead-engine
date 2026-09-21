/**
 * Supabase connection details, read once and validated in one place.
 *
 * Both key names are accepted: Supabase renamed the browser key from "anon" to
 * "publishable", and projects created either side of that change hand you a
 * different variable name in the dashboard. Accepting both means a copy-paste
 * from any project settings page works without an explanation.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

/**
 * Whether Supabase Auth is wired up.
 *
 * Until a project exists this is false and the app keeps using its own session
 * cookie, so the sign-in page never stops working mid-migration. The moment the
 * two public variables are set, every guard switches to Supabase.
 */
export function isSupabaseAuthEnabled(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Service-role key — server-only, never exposed to the browser. */
export function serviceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    ""
  );
}
