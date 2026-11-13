-- HVI CRM — Migration: round 4 (Nov 2026 follow-up meeting). Run in the Supabase SQL Editor. Safe to run multiple times.
-- Requires migration_dtc_v4.sql. Adds the "Relevant links" list that every DTC product can carry (Drive folder, Figma, photos, SOP…).
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS relevant_links jsonb NOT NULL DEFAULT '[]'::jsonb;   -- [{ "label": "...", "url": "https://..." }]
NOTIFY pgrst, 'reload schema';
