import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };

const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type SessionPayload = {
  /** The application's `users.id` — what every `owner_id` column points at. */
  userId: string;
  email: string;
  name: string;
  role: "owner" | "member";
};

/* -------------------------------------------------------------------------- */
/* Legacy cookie session                                                      */
/*                                                                            */
/* Still here, and still the path in use until a Supabase project is          */
/* configured. Deleting it before then would leave the app with no way to     */
/* sign in at all.                                                            */
/* -------------------------------------------------------------------------- */

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 24) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Generate one with `openssl rand -base64 48`.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") return null;
    return {
      userId: payload.userId,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      role: payload.role === "owner" ? "owner" : "member",
    };
  } catch {
    return null;
  }
}

export async function createSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/* -------------------------------------------------------------------------- */
/* Supabase session                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Turn a Supabase auth identity into this application's user row.
 *
 * Matching falls back from the auth id to the email address so that an account
 * that predates Supabase is adopted on its owner's first sign-in instead of
 * becoming a second, empty user beside all of their existing records. Once
 * matched, the link is written back and the email path is never needed again.
 */
async function resolveAppUser(authUserId: string, authEmail: string | null) {
  const [linked] = await db
    .select()
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  if (linked) return linked;

  if (!authEmail) return null;
  const email = authEmail.toLowerCase();

  const [byEmail] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  if (byEmail) {
    const [adopted] = await db
      .update(users)
      .set({ authUserId, updatedAt: new Date() })
      .where(eq(users.id, byEmail.id))
      .returning();
    return adopted ?? byEmail;
  }

  /*
   * First sign-in of an identity this database has never seen. The very first
   * account to arrive owns the workspace; anyone after that is a member, so a
   * stray signup cannot grant itself ownership.
   */
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  const [created] = await db
    .insert(users)
    .values({
      email: authEmail,
      authUserId,
      name: authEmail.split("@")[0] ?? authEmail,
      role: count === 0 ? "owner" : "member",
    })
    .returning();

  return created ?? null;
}

/**
 * The signed-in user, or null.
 *
 * Wrapped in `cache` because the guards call it from the layout, the page and
 * every route handler in one render; without it a single page view would repeat
 * the same auth check and user lookup a dozen times.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  if (isSupabaseAuthEnabled()) {
    const supabase = await createSupabaseServerClient();
    // Verified against Supabase rather than read from the cookie.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const row = await resolveAppUser(data.user.id, data.user.email ?? null);
    if (!row) return null;

    return { userId: row.id, email: row.email, name: row.name, role: row.role };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
});
