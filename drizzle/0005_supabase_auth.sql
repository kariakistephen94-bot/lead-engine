-- Supabase Auth takes over credentials.
--
-- `auth_user_id` links an application user to its `auth.users` row. It is a
-- plain uuid rather than a foreign key to `auth.users`: that table lives in a
-- schema owned by Supabase, and a cross-schema FK into it blocks `pg_dump`
-- restores and makes the database awkward to move again later.

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- One application user per auth identity. Partial, so the many rows that have
-- not been linked yet do not all collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key
  ON users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Supabase stores the password now, so the local hash is no longer required.
-- Existing hashes are left in place: they are what lets the app still sign
-- someone in if Supabase is not configured yet.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
