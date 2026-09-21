import { destroySessionCookie } from "@/lib/auth/session";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (isSupabaseAuthEnabled()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  // Cleared unconditionally: a session left over from before the switch to
  // Supabase would otherwise keep the user signed in after they logged out.
  await destroySessionCookie();
  return Response.json({ ok: true });
}
