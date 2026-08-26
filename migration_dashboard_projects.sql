-- HVI CRM — Migration: Dashboard + B2B Projects
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE)

-- ─── 1. New fields on leads ───────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS collected      numeric;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_changed_at date;

-- ─── 2. Projects table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid references leads(id) on delete set null,
  company          text not null,
  contact          text,
  stage            integer not null default 1 check (stage between 1 and 14),
  est_value        numeric,
  collected        numeric default 0,
  deposit_20_paid  boolean default false,
  payment_50_paid  boolean default false,
  final_paid       boolean default false,
  notes            text,
  stage_changed_at date default current_date,
  last_activity    date default current_date,
  created_at       timestamptz not null default now()
);

-- ─── 3. RLS on projects (same pattern as leads) ───────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj authenticated read"   ON projects;
DROP POLICY IF EXISTS "proj authenticated insert" ON projects;
DROP POLICY IF EXISTS "proj authenticated update" ON projects;
DROP POLICY IF EXISTS "proj authenticated delete" ON projects;

CREATE POLICY "proj authenticated read"
  ON projects FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "proj authenticated insert"
  ON projects FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "proj authenticated update"
  ON projects FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "proj authenticated delete"
  ON projects FOR DELETE TO authenticated USING (is_hvi_user());

-- ─── 4. Realtime for projects ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE projects;

-- ─── 5. Verify ────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name IN ('collected','stage_changed_at')
UNION ALL
SELECT 'projects table' as column_name, 'exists' as data_type
FROM information_schema.tables WHERE table_name = 'projects';
