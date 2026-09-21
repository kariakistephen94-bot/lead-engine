/**
 * Create a Supabase Auth user and attach it to an application account.
 * `npm run auth:provision`
 *
 *   npm run auth:provision                                  # uses SEED_USER_* from .env.local
 *   npm run auth:provision -- --email=me@co.com --password=…
 *
 * Run once against the Supabase project before switching `DATABASE_URL` over.
 * Without it the app has rows owned by a user that Supabase has never heard of,
 * and the first sign-in would create a second, empty account beside them.
 *
 * The email is marked confirmed on creation: this is the operator provisioning
 * their own account from a machine that already holds the service-role key, so
 * a round trip through an inbox proves nothing.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

config({ path: ".env.local" });

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const dbUrl = arg("database-url") ?? process.env.DATABASE_URL;

  const email = (arg("email") ?? process.env.SEED_USER_EMAIL ?? "").toLowerCase();
  const password = arg("password") ?? process.env.SEED_USER_PASSWORD ?? "";
  const name = arg("name") ?? process.env.SEED_USER_NAME ?? email.split("@")[0];

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — Supabase dashboard -> Project Settings -> API -> service_role",
    );
  }
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  if (!email || !password) {
    throw new Error("Need an email and password: set SEED_USER_EMAIL / SEED_USER_PASSWORD, or pass --email= --password=");
  }
  if (password.length < 8) {
    throw new Error("Supabase requires a password of at least 8 characters.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /* ------------------------------------------------ find or create the auth user */
  let authUserId: string | null = null;

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (created.data.user) {
    authUserId = created.data.user.id;
    console.log(`Created Supabase auth user ${email}`);
  } else {
    // Already registered is the normal case on a re-run. Look it up and reset
    // the password so the credentials in .env.local are always the live ones.
    const existing = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (existing.error) throw existing.error;

    const match = existing.data.users.find((u) => u.email?.toLowerCase() === email);
    if (!match) throw created.error ?? new Error(`Could not create or find ${email}`);

    authUserId = match.id;
    const updated = await supabase.auth.admin.updateUserById(match.id, {
      password,
      email_confirm: true,
    });
    if (updated.error) throw updated.error;
    console.log(`Supabase auth user ${email} already existed — password reset to match .env.local`);
  }

  /* ---------------------------------------------------- link the application row */
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    ssl:
      dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
  });

  const { rows: existingRows } = await pool.query<{ id: string; role: string }>(
    `select id, role from users where lower(email) = $1 limit 1`,
    [email],
  );

  if (existingRows.length > 0) {
    await pool.query(`update users set auth_user_id = $1, updated_at = now() where id = $2`, [
      authUserId,
      existingRows[0].id,
    ]);
    console.log(`Linked existing application user (${existingRows[0].role}) to the Supabase identity.`);
  } else {
    // First account in an empty database owns the workspace.
    const { rows: countRows } = await pool.query<{ n: string }>(`select count(*)::text as n from users`);
    const role = countRows[0].n === "0" ? "owner" : "member";
    const { rows: inserted } = await pool.query<{ id: string }>(
      `insert into users (email, name, role, auth_user_id) values ($1, $2, $3, $4) returning id`,
      [email, name, role, authUserId],
    );
    console.log(`Created application user ${inserted[0].id} (${role}) linked to the Supabase identity.`);
  }

  await pool.end();
  console.log("\nDone. Sign in at /login with this email and password.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
