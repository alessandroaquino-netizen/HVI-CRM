-- HVI CRM — Migration: Lead activity log + follow-up cadence
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE)

-- ─── 1. Follow-up cadence target on leads ─────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_total integer;

-- ─── 2. Activity log (comments + auto-logged stage changes) ──────────────
CREATE TABLE IF NOT EXISTS lead_activity (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  event_type    text not null default 'comment' check (event_type in ('comment','stage_change')),
  comment       text,
  touch_number  integer,
  created_at    timestamptz not null default now(),
  created_by    text
);

-- ─── 3. RLS (same pattern as project_activity) ────────────────────────────
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lact authenticated read"   ON lead_activity;
DROP POLICY IF EXISTS "lact authenticated insert" ON lead_activity;
DROP POLICY IF EXISTS "lact authenticated update" ON lead_activity;
DROP POLICY IF EXISTS "lact authenticated delete" ON lead_activity;

CREATE POLICY "lact authenticated read"
  ON lead_activity FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "lact authenticated insert"
  ON lead_activity FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "lact authenticated update"
  ON lead_activity FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "lact authenticated delete"
  ON lead_activity FOR DELETE TO authenticated USING (is_hvi_user());

-- ─── 4. Realtime ───────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE lead_activity;

-- ─── 5. Verify ────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'cadence_total'
UNION ALL
SELECT 'lead_activity table' as column_name, 'exists' as data_type
FROM information_schema.tables WHERE table_name = 'lead_activity';
