-- HVI CRM — Migration: Team Scorecard (KPIs) and Rocks
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Requires migration_user_management.sql (is_hvi_user / is_hvi_admin). Safe to run multiple times.
-- Everyone at HVI can read; only administrators can write.

-- ─── 1. KPI definitions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpis (
  id            uuid primary key default gen_random_uuid(),
  seed_key      text unique,                                         -- set on imported KPIs so re-running never duplicates them
  quarter       text not null,                                       -- '2026-Q4'
  name          text not null,
  owner_name    text not null default 'Company',
  group_name    text,                                                -- sub-heading inside an owner (e.g. "Repeat purchase rate")
  unit          text not null default 'count' check (unit in ('usd','pct','ratio','count')),
  target_value  numeric,                                             -- null = tracked, no target
  target_scope  text not null default 'week' check (target_scope in ('week','quarter','point')),
                                                                     -- week: per-week goal · quarter: goal for the whole quarter (weekly pace = target / 13) · point: level to reach (e.g. members)
  direction     text not null default 'higher' check (direction in ('higher','lower')),
  aggregation   text not null default 'none' check (aggregation in ('sum','avg','latest','none')),
  source        text not null default 'manual',                      -- manual now; shopify / klaviyo / meta / google / ga4 when connectors exist
  note          text,
  sort_order    int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS kpis_quarter_idx ON kpis (quarter, sort_order);

-- ─── 2. Weekly values (period_start = Monday) ──────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_values (
  id            uuid primary key default gen_random_uuid(),
  kpi_id        uuid not null references kpis(id) on delete cascade,
  period_start  date not null,
  value         numeric,
  qtd_value     numeric,                                             -- quarter-to-date as reported by the source tool (optional)
  note          text,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  unique (kpi_id, period_start)
);

-- ─── 3. Rocks (quarterly priorities) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS rocks (
  id          uuid primary key default gen_random_uuid(),
  seed_key    text unique,
  quarter     text not null,
  owner_name  text not null,
  position    int  not null default 1,
  title       text not null,
  tactics     text,
  status      text not null default 'not_started' check (status in ('not_started','in_progress','at_risk','done')),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS rocks_quarter_idx ON rocks (quarter, owner_name, position);

CREATE TABLE IF NOT EXISTS rock_kpis (
  rock_id uuid not null references rocks(id) on delete cascade,
  kpi_id  uuid not null references kpis(id)  on delete cascade,
  primary key (rock_id, kpi_id)
);

-- ─── 4. Row Level Security: read = any HVI user, write = administrators only ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpis','kpi_values','rocks','rock_kpis'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s read" ON %1$I',   t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s write" ON %1$I',  t);
    EXECUTE format('CREATE POLICY "%1$s read"  ON %1$I FOR SELECT TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s write" ON %1$I FOR ALL    TO authenticated USING (is_hvi_admin()) WITH CHECK (is_hvi_admin())', t);
  END LOOP;
END $$;

-- ─── 4b. Owners are real users, and founder-level KPIs are visible to administrators only (Nov 11 meeting) ──
ALTER TABLE kpis  ADD COLUMN IF NOT EXISTS owner_email text;                    -- matches app_users.email; owner_name stays as the display name
ALTER TABLE rocks ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE kpis  ADD COLUMN IF NOT EXISTS visibility  text NOT NULL DEFAULT 'team' CHECK (visibility IN ('team','founders'));

DROP POLICY IF EXISTS "kpis read" ON kpis;
CREATE POLICY "kpis read" ON kpis FOR SELECT TO authenticated USING (is_hvi_user() AND (visibility = 'team' OR is_hvi_admin()));
DROP POLICY IF EXISTS "kpi_values read" ON kpi_values;
CREATE POLICY "kpi_values read" ON kpi_values FOR SELECT TO authenticated
  USING (is_hvi_user() AND (is_hvi_admin() OR EXISTS (SELECT 1 FROM kpis k WHERE k.id = kpi_values.kpi_id AND k.visibility = 'team')));

-- ─── 5. Realtime (so the scorecard updates when an admin saves) ────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpis','kpi_values','rocks','rock_kpis'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
