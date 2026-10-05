-- HVI CRM — Migration: User management (invite-only access + per-page permissions)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Safe to run multiple times.
--
-- What this does:
--   1. Creates app_users (allowlist + role + per-page permissions + invite token).
--   2. Seeds every account that has ALREADY signed in with an HVI email as an active user with
--      full access (so nobody is locked out), and promotes the admins (Alessandro, Tony, Adriana).
--   3. Redefines is_hvi_user() so ONLY active app_users can read/write data (all existing RLS
--      policies already call it, so no table policies need rewriting).
--   4. Adds RPCs used by the app: get_my_access(), accept_invite(token).
--
-- NOTE: page/module permissions are enforced in the app UI. Database-level enforcement is
-- "active user or not" (is_hvi_user). Per-module RLS is a possible follow-up.

-- ─── 1. app_users ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text,
  role          text not null default 'member' check (role in ('admin','member')),
  status        text not null default 'invited' check (status in ('invited','active','disabled')),
  pages         text[] not null default '{}',
  invite_token  text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by    text,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  user_id       uuid,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint app_users_email_domain check (email = lower(email) and email ~ '@highvoltageindustries\.com$')
);

-- ─── 2. Helper functions (SECURITY DEFINER so they bypass RLS on app_users) ─
CREATE OR REPLACE FUNCTION is_hvi_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_hvi_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND status = 'active' AND role = 'admin'
  );
$$;

-- ─── 3. Seed (BEFORE enabling enforcement, so nobody is locked out) ────────
-- Everyone who already signed in with an HVI account keeps full access.
INSERT INTO app_users (email, full_name, role, status, pages, accepted_at, user_id, invite_token)
SELECT lower(u.email),
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
       'member', 'active',
       ARRAY['pipeline','list','followups','leadDashboard','projects','projectsDashboard',
             'dtcProducts','dtcCalendar','dtcFinancials','dtcDashboard','dtcMarketing','disc'],
       now(), u.id, NULL
FROM auth.users u
WHERE lower(u.email) ~ '@highvoltageindustries\.com$'
ON CONFLICT (email) DO NOTHING;

-- Admins: Alessandro (exact email), the shared info@ and support@ mailboxes, plus Tony and
-- Adriana (matched by first name — verify in the final SELECT).
INSERT INTO app_users (email, full_name, role, status, accepted_at, invite_token)
VALUES
  ('alessandro.aquino@highvoltageindustries.com', 'Alessandro Aquino', 'admin', 'active', now(), NULL),
  ('info@highvoltageindustries.com',              'HVI Info',          'admin', 'active', now(), NULL),
  ('support@highvoltageindustries.com',           'HVI Support',       'admin', 'active', now(), NULL)
ON CONFLICT (email) DO UPDATE SET role = 'admin', status = 'active';

UPDATE app_users SET role = 'admin', status = 'active'
WHERE email LIKE 'tony%@highvoltageindustries.com'
   OR email LIKE 'adriana%@highvoltageindustries.com';

-- ─── 4. Guard: never remove/demote/disable the last active admin ───────────
CREATE OR REPLACE FUNCTION app_users_keep_an_admin() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'admin' AND OLD.status = 'active')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'admin' AND OLD.status = 'active'
         AND (NEW.role <> 'admin' OR NEW.status <> 'active')) THEN
    IF NOT EXISTS (SELECT 1 FROM app_users WHERE role = 'admin' AND status = 'active' AND id <> OLD.id) THEN
      RAISE EXCEPTION 'Cannot remove or demote the last active admin';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS app_users_keep_an_admin_trg ON app_users;
CREATE TRIGGER app_users_keep_an_admin_trg
  BEFORE UPDATE OR DELETE ON app_users
  FOR EACH ROW EXECUTE FUNCTION app_users_keep_an_admin();

-- ─── 5. RLS: only admins touch app_users directly ──────────────────────────
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users admin read"   ON app_users;
DROP POLICY IF EXISTS "app_users admin insert" ON app_users;
DROP POLICY IF EXISTS "app_users admin update" ON app_users;
DROP POLICY IF EXISTS "app_users admin delete" ON app_users;

CREATE POLICY "app_users admin read"   ON app_users FOR SELECT TO authenticated USING (is_hvi_admin());
CREATE POLICY "app_users admin insert" ON app_users FOR INSERT TO authenticated WITH CHECK (is_hvi_admin());
CREATE POLICY "app_users admin update" ON app_users FOR UPDATE TO authenticated USING (is_hvi_admin()) WITH CHECK (is_hvi_admin());
CREATE POLICY "app_users admin delete" ON app_users FOR DELETE TO authenticated USING (is_hvi_admin());

-- ─── 6. RPCs used by the signed-in user (no direct table access needed) ────
-- Returns the caller's own access record (and stamps last_login / links user_id).
CREATE OR REPLACE FUNCTION get_my_access() RETURNS TABLE (
  email text, full_name text, role text, status text, pages text[]
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  UPDATE app_users a SET last_login_at = now(), user_id = coalesce(a.user_id, auth.uid())
  WHERE a.email = me AND a.status = 'active';
  RETURN QUERY SELECT a.email, a.full_name, a.role, a.status, a.pages
               FROM app_users a WHERE a.email = me;
END $$;

-- Confirms an invitation: the signed-in Google account must match the invited email.
CREATE OR REPLACE FUNCTION accept_invite(p_token text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  inv app_users%ROWTYPE;
BEGIN
  IF me = '' THEN RETURN 'not_signed_in'; END IF;
  SELECT * INTO inv FROM app_users WHERE invite_token = p_token;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF inv.email <> me THEN RETURN 'wrong_account'; END IF;
  IF inv.status = 'disabled' THEN RETURN 'disabled'; END IF;
  IF inv.status = 'invited' THEN
    UPDATE app_users SET status = 'active', accepted_at = now(), user_id = auth.uid() WHERE id = inv.id;
  END IF;
  RETURN 'ok';
END $$;

GRANT EXECUTE ON FUNCTION get_my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invite(text) TO authenticated;

-- ─── 7. Verify — CHECK that Tony and Adriana show up as admin before closing the tab ──
SELECT email, role, status, array_length(pages, 1) AS page_count FROM app_users ORDER BY role, email;
