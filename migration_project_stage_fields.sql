-- HVI CRM — Migration: real start/planned/actual dates + status + assignee on project stages
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Safe to run multiple times (uses IF EXISTS / IF NOT EXISTS)
-- Replaces the single target_date/is_actual fields from migration_project_stage_tracking.sql —
-- safe because no real stage-timeline data has been entered yet.

ALTER TABLE project_stage_dates DROP COLUMN IF EXISTS target_date;
ALTER TABLE project_stage_dates DROP COLUMN IF EXISTS is_actual;

ALTER TABLE project_stage_dates ADD COLUMN IF NOT EXISTS start_date       date;
ALTER TABLE project_stage_dates ADD COLUMN IF NOT EXISTS planned_end_date date;
ALTER TABLE project_stage_dates ADD COLUMN IF NOT EXISTS actual_end_date  date;
ALTER TABLE project_stage_dates ADD COLUMN IF NOT EXISTS status           text DEFAULT 'To be Started';
ALTER TABLE project_stage_dates ADD COLUMN IF NOT EXISTS assignee         text;

-- ─── Verify ─────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'project_stage_dates'
ORDER BY ordinal_position;
