-- HVI CRM — Migration: DTC v4 — priority field
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Requires migration_dtc.sql (dtc_products) to already be applied.
-- Safe to run multiple times (uses IF NOT EXISTS)

ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS priority text CHECK (priority IN ('low','medium','high'));

-- ─── Verify ────────────────────────────────────────────────────────────────
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'dtc_products' AND column_name = 'priority';
