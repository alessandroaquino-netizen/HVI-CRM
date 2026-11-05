-- HVI CRM — Migration: automatic shipment tracking (carrier status, ETA, events)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project)
-- Requires migration_dtc_shipping.sql. Safe to run multiple times. Adds nullable columns only.
-- The status comes from the `track-shipment` Edge Function (EasyPost). See docs/shipment-tracking.md.

ALTER TABLE dtc_products
  ADD COLUMN IF NOT EXISTS tracking_status         text,          -- pre_transit | in_transit | out_for_delivery | delivered | available_for_pickup | return_to_sender | failure | unknown
  ADD COLUMN IF NOT EXISTS tracking_status_detail  text,
  ADD COLUMN IF NOT EXISTS tracking_eta            date,          -- carrier's estimate (estimated_delivery_date stays the manual one)
  ADD COLUMN IF NOT EXISTS tracking_location       text,
  ADD COLUMN IF NOT EXISTS tracking_events         jsonb not null default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tracking_delivered_at   timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_checked_at     timestamptz;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'dtc_products' AND column_name LIKE 'tracking\_%' ORDER BY column_name;
