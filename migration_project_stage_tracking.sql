-- HVI CRM — Migration: Project stage dates + activity log
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE)
-- Requires migration_dashboard_projects.sql to already be applied (uses is_hvi_user()
-- and the projects table).

-- ─── 1. Per-stage planned/actual dates ────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_stage_dates (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  stage        integer not null check (stage between 1 and 14),
  target_date  date,
  is_actual    boolean default false,
  note         text,
  updated_at   timestamptz not null default now(),
  unique (project_id, stage)
);

-- ─── 2. Activity log (comments + auto-logged stage changes) ──────────────
CREATE TABLE IF NOT EXISTS project_activity (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  stage       integer,
  event_type  text not null default 'comment' check (event_type in ('comment','stage_change')),
  comment     text,
  date_value  date,
  created_at  timestamptz not null default now(),
  created_by  text
);

-- ─── 3. RLS (same pattern as projects) ────────────────────────────────────
ALTER TABLE project_stage_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psd authenticated read"   ON project_stage_dates;
DROP POLICY IF EXISTS "psd authenticated insert" ON project_stage_dates;
DROP POLICY IF EXISTS "psd authenticated update" ON project_stage_dates;
DROP POLICY IF EXISTS "psd authenticated delete" ON project_stage_dates;

CREATE POLICY "psd authenticated read"
  ON project_stage_dates FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "psd authenticated insert"
  ON project_stage_dates FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "psd authenticated update"
  ON project_stage_dates FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "psd authenticated delete"
  ON project_stage_dates FOR DELETE TO authenticated USING (is_hvi_user());

DROP POLICY IF EXISTS "pact authenticated read"   ON project_activity;
DROP POLICY IF EXISTS "pact authenticated insert" ON project_activity;
DROP POLICY IF EXISTS "pact authenticated update" ON project_activity;
DROP POLICY IF EXISTS "pact authenticated delete" ON project_activity;

CREATE POLICY "pact authenticated read"
  ON project_activity FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "pact authenticated insert"
  ON project_activity FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "pact authenticated update"
  ON project_activity FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "pact authenticated delete"
  ON project_activity FOR DELETE TO authenticated USING (is_hvi_user());

-- ─── 4. Realtime ───────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE project_stage_dates;
ALTER PUBLICATION supabase_realtime ADD TABLE project_activity;

-- ─── 5. Verify ────────────────────────────────────────────────────────────
SELECT table_name, 'exists' as status
FROM information_schema.tables
WHERE table_name IN ('project_stage_dates', 'project_activity');
