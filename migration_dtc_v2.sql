-- HVI CRM — Migration: DTC v2 — Phase restructure + new fields
-- Run AFTER migration_dtc.sql (which created the base tables)
-- Safe to run multiple times

-- ─── 1. New fields on dtc_products ───────────────────────────────────────

-- Sampling phase fields
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS manufacturer_order_date date;
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS photographer_samples_sent boolean default false;
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS photographer_photos_approved boolean default false;

-- Warehouse receiving fields
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS units_ordered numeric;
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS units_received numeric;

-- Pre-marketing trigger (independent of phase)
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS premarketing_started_at date;

-- ─── 2. New fields on dtc_financials ─────────────────────────────────────

-- Payment model flexibility
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS paid_in_full boolean default false;
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS full_payment_date date;
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS expected_next_payment_date date;
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS photographer_fee numeric;
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS photographer_paid_date date;
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS additional_payment_amount numeric;
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS additional_payment_note text;
ALTER TABLE dtc_financials ADD COLUMN IF NOT EXISTS additional_payment_date date;

-- ─── 3. New DTC Marketing page table ─────────────────────────────────────
-- Phase 2 shell — structure ready, phases TBD with Adriana
CREATE TABLE IF NOT EXISTS dtc_marketing (
  id                uuid primary key default gen_random_uuid(),
  dtc_product_id    uuid references dtc_products(id) on delete set null,
  product_name      text,
  premarketing_start date,
  drop_date         date,
  notes             text,
  phase             text default 'pre-marketing', -- phases to be defined in Phase 2
  created_at        timestamptz not null default now()
);

ALTER TABLE dtc_marketing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dtc_marketing read"   ON dtc_marketing;
DROP POLICY IF EXISTS "dtc_marketing insert" ON dtc_marketing;
DROP POLICY IF EXISTS "dtc_marketing update" ON dtc_marketing;
DROP POLICY IF EXISTS "dtc_marketing delete" ON dtc_marketing;

CREATE POLICY "dtc_marketing read"   ON dtc_marketing FOR SELECT    TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_marketing insert" ON dtc_marketing FOR INSERT    TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "dtc_marketing update" ON dtc_marketing FOR UPDATE    TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_marketing delete" ON dtc_marketing FOR DELETE    TO authenticated USING (is_hvi_user());

ALTER PUBLICATION supabase_realtime ADD TABLE dtc_marketing;

-- ─── 4. Verify ────────────────────────────────────────────────────────────
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'dtc_products'
  AND column_name IN ('manufacturer_order_date','photographer_samples_sent','units_ordered','units_received','premarketing_started_at')
UNION ALL
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'dtc_financials'
  AND column_name IN ('paid_in_full','photographer_fee','additional_payment_amount','expected_next_payment_date')
UNION ALL
SELECT table_name FROM information_schema.tables WHERE table_name = 'dtc_marketing';
