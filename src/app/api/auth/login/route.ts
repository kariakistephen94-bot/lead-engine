import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email and password" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  if (isSupabaseAuthEnabled()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.password,
    });

    if (error) {
      /*
       * Supabase distinguishes "wrong password" from "email not confirmed".
       * The second is worth surfacing — it is an instruction, not a failure,
       * and a user staring at "incorrect password" will never think to check
       * their inbox. Everything else collapses to one message so the endpoint
       * cannot be used to enumerate registered addresses.
       */
      const message = /confirm/i.test(error.message)
        ? "Check your inbox and confirm your email address before signing in."
        : "Incorrect email or password";
      return Response.json({ error: message }, { status: 401 });
    }

    // The session cookie is set by the Supabase client; `getSession()` links
    // this identity to its application user row on the next request.
    return Response.json({ ok: true });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  // Same message and roughly the same work either way — don't leak which
  // emails exist.
  const valid =
    user?.passwordHash ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    return Response.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  await createSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return Response.json({ ok: true });
}
