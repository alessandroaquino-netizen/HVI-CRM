-- HVI CRM — Migration: Potential Leads v3 — lead source on the pipeline
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Requires migration_neca_v2.sql. Safe to run multiple times.
--
-- The "NECA Potential Leads" table (neca_leads) becomes the general Potential Leads list. Its `source` column
-- (default 'NECA') already exists; manual leads from other sources (unions, referrals, events) use the same table,
-- scored with the same rubric. The pipeline (leads) gets its own source so every lead can be traced to where it came from.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS leads_source_idx ON leads (source);

-- leads already linked to a NECA company came from NECA
UPDATE leads SET source = 'NECA' WHERE neca_lead_id IS NOT NULL AND source IS NULL;

SELECT coalesce(source, '(none)') AS source, count(*) FROM leads GROUP BY 1 ORDER BY 2 DESC;
