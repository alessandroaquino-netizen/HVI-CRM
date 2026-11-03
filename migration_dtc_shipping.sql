-- HVI CRM — Migration: DTC shipping (production → warehouse)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (PRODUCTION first, then TEST so both match)
-- Requires migration_dtc.sql. Safe to run multiple times. Adds columns only: no data is changed or removed.
--
-- The new "Shipping" phase sits between Production and Warehouse. The phase column is plain text with no
-- constraint, so it needs no change: existing products keep their phase.

ALTER TABLE dtc_products
  ADD COLUMN IF NOT EXISTS carrier                  text,   -- 'fedex' | 'ups' | 'dhl' | 'usps' | 'other'
  ADD COLUMN IF NOT EXISTS tracking_number          text,
  ADD COLUMN IF NOT EXISTS shipped_date             date,
  ADD COLUMN IF NOT EXISTS estimated_delivery_date  date;

-- Quick check: the four columns should be listed.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'dtc_products' AND column_name IN ('carrier','tracking_number','shipped_date','estimated_delivery_date')
ORDER BY column_name;
