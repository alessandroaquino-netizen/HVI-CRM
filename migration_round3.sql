-- HVI CRM — Migration: round 3 (calendar events, drop-shipping, production quotes, asset checklist, email-campaign phase)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project)
-- Requires migration_dropflow.sql, migration_dtc_v4.sql and the earlier DTC migrations. Safe to run multiple times.

-- ─── 1. Calendar events: promotions, key dates, seasons and closures that users can add, recolour and move ────
CREATE TABLE IF NOT EXISTS dtc_calendar_events (
  id          uuid primary key default gen_random_uuid(),
  seed_key    text unique,                                           -- set on the built-in events, so re-running never duplicates them
  label       text not null,
  start_date  date not null,
  end_date    date,                                                  -- null = single day
  color       text not null default 'FFB500',                        -- hex without #
  kind        text not null default 'promo' check (kind in ('promo','event','season','closure','note')),
  show_band   boolean not null default true,                         -- tint the background of the days
  created_by  text,
  created_at  timestamptz not null default now()
);
ALTER TABLE dtc_calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtc_calendar_events read"   ON dtc_calendar_events;
DROP POLICY IF EXISTS "dtc_calendar_events insert" ON dtc_calendar_events;
DROP POLICY IF EXISTS "dtc_calendar_events update" ON dtc_calendar_events;
DROP POLICY IF EXISTS "dtc_calendar_events delete" ON dtc_calendar_events;
CREATE POLICY "dtc_calendar_events read"   ON dtc_calendar_events FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_calendar_events insert" ON dtc_calendar_events FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "dtc_calendar_events update" ON dtc_calendar_events FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_calendar_events delete" ON dtc_calendar_events FOR DELETE TO authenticated USING (is_hvi_user());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'dtc_calendar_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dtc_calendar_events;
  END IF;
END $$;

-- The dates that used to be fixed in the code, now editable.
INSERT INTO dtc_calendar_events (seed_key, label, start_date, end_date, color, kind, show_band) VALUES
  ('season-winter',  'Winter Season',               '2026-01-01', '2026-02-28', '5B9CF6', 'season', true),
  ('season-golf',    'Golf Season',                 '2026-03-01', '2026-06-30', '4CAF7D', 'season', true),
  ('season-summer',  'Summer (Boardshorts)',        '2026-06-01', '2026-08-31', 'F0C040', 'season', true),
  ('season-fall',    'Fall (Flannels/Hoodies)',     '2026-09-01', '2026-11-30', 'E8874A', 'season', true),
  ('season-holiday', 'Holiday / BFCM',              '2026-11-01', '2026-12-31', '9B7FE8', 'season', true),
  ('key-lineman-day',      'Lineman Day',                        '2026-04-18', NULL, 'F0C040', 'event', false),
  ('key-black-friday',     'Black Friday',                       '2026-11-27', NULL, 'E05555', 'promo', false),
  ('key-cyber-monday',     'Cyber Monday',                       '2026-11-30', NULL, 'E05555', 'promo', false),
  ('key-grad-spring',      'Spring Graduation (line schools)',   '2026-03-15', NULL, '4CAF7D', 'event', false),
  ('key-grad-summer',      'Summer Graduation (line schools)',   '2026-06-15', NULL, '4CAF7D', 'event', false),
  ('key-grad-fall',        'Fall Graduation (line schools)',     '2026-11-15', NULL, '4CAF7D', 'event', false),
  ('key-suicide-2026',     'Suicide Prevention Month',           '2026-09-01', NULL, '5B9CF6', 'event', false),
  ('key-suicide-2027',     'Suicide Prevention Month',           '2027-09-01', NULL, '5B9CF6', 'event', false),
  ('key-breast-2026',      'Breast Cancer Awareness Month',      '2026-10-01', NULL, 'E05555', 'event', false),
  ('key-breast-2027',      'Breast Cancer Awareness Month',      '2027-10-01', NULL, 'E05555', 'event', false)
ON CONFLICT (seed_key) DO NOTHING;

-- ─── 2. DTC products: fulfillment type (drop-shipping) and production quote vs actual ───────────────────────
ALTER TABLE dtc_products
  ADD COLUMN IF NOT EXISTS fulfillment               text NOT NULL DEFAULT 'own' CHECK (fulfillment IN ('own','dropship')),
  ADD COLUMN IF NOT EXISTS quoted_production_weeks   numeric,       -- what the manufacturer quoted
  ADD COLUMN IF NOT EXISTS production_started_on     date,          -- actual production start
  ADD COLUMN IF NOT EXISTS production_finished_on    date;          -- actual production end (leaves production)

-- ─── 3. Marketing Ops: email-campaign phase, drop-ship type, asset checklist and one Drive folder ──────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
           WHERE contype = 'c' AND conrelid::regclass::text IN ('drops','drop_tasks','drop_task_templates')
             AND (conname LIKE '%\_phase\_check' OR conname = 'drops_drop_type_check') LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE drops               ADD CONSTRAINT drops_phase_check               CHECK (phase IN ('brief','assets','listing','creative','email','vault','launch','post'));
ALTER TABLE drop_tasks          ADD CONSTRAINT drop_tasks_phase_check          CHECK (phase IN ('brief','assets','listing','creative','email','vault','launch','post'));
ALTER TABLE drop_task_templates ADD CONSTRAINT drop_task_templates_phase_check CHECK (phase IN ('brief','assets','listing','creative','email','vault','launch','post'));
ALTER TABLE drops               ADD CONSTRAINT drops_drop_type_check           CHECK (drop_type IN ('new_product','colorway','restock','dropship'));

ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS drive_folder  text,                                -- the one shared Google Drive folder for the product
  ADD COLUMN IF NOT EXISTS asset_checks  jsonb NOT NULL DEFAULT '{}'::jsonb;  -- { key: { done, link, at, by } }

-- Email-campaign tasks get their own column, concurrent with creatives.
UPDATE drop_task_templates SET phase = 'email'
 WHERE key IN ('email_plan','email_teaser','founder_draft','founder_send','preorder_email','email_thursday') AND phase <> 'email';
UPDATE drop_tasks SET phase = 'email'
 WHERE template_key IN ('email_plan','email_teaser','founder_draft','founder_send','preorder_email','email_thursday') AND phase <> 'email';
-- Drop-shipped products carry no inventory of their own.
UPDATE drop_task_templates SET na_for = array_append(na_for, 'dropship') WHERE key = 'inventory_counts' AND NOT ('dropship' = ANY (na_for));

SELECT (SELECT count(*) FROM dtc_calendar_events) AS calendar_events,
       (SELECT count(*) FROM drop_task_templates WHERE phase = 'email') AS email_templates;
