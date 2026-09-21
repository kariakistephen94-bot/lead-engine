-- Create the owner's Supabase Auth login, and link it to the application user.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql and all 02_data_* files.
--
-- Change the two values below before running if you want your own address and
-- password. The password must be at least 8 characters.
--
-- Safe to run twice: an existing account is updated rather than duplicated.

DO $$
DECLARE
  v_email    text := 'owner@leadengine.local';
  v_password text := 'z2ATeyhm0fVXCX6j1md7hPRj';
  v_name     text := 'Owner';
  v_user_id  uuid;
  v_role     text;
BEGIN
  -- `crypt()` and `gen_salt()` come from pgcrypto, which Supabase installs into
  -- the extensions schema rather than public.
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      lower(v_email), extensions.crypt(v_password, extensions.gen_salt('bf')),
      -- Confirmed on creation: this is the operator provisioning their own
      -- account from the SQL console, so a round trip through an inbox would
      -- prove nothing that running this statement has not already proved.
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_name),
      '', '', '', ''
    );

    -- Without a matching identity row the email/password provider has nothing
    -- to match against, and sign-in fails even though the user exists.
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(v_email)),
      'email', v_user_id::text, now(), now(), now()
    );

    RAISE NOTICE 'Created auth user % (%)', v_email, v_user_id;
  ELSE
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at         = now()
     WHERE id = v_user_id;
    RAISE NOTICE 'Auth user % already existed — password reset', v_email;
  END IF;

  /* ------------------------------------------------ link the application row */
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(v_email)) THEN
    UPDATE public.users
       SET auth_user_id = v_user_id, updated_at = now()
     WHERE lower(email) = lower(v_email);
    RAISE NOTICE 'Linked existing application user to the auth identity';
  ELSE
    -- First account in an empty database owns the workspace.
    SELECT CASE WHEN count(*) = 0 THEN 'owner' ELSE 'member' END
      INTO v_role FROM public.users;

    INSERT INTO public.users (email, name, role, auth_user_id)
    VALUES (lower(v_email), v_name, v_role::user_role, v_user_id);
    RAISE NOTICE 'Created application user (%)', v_role;
  END IF;
END $$;

-- Confirm the link.
SELECT u.email, u.role, u.auth_user_id IS NOT NULL AS linked_to_supabase_auth
  FROM public.users u;
