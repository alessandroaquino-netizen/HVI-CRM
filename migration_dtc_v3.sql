-- HVI CRM — Migration: DTC v3 — size/SKU variants + editable phase timeline dates
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Requires migration_dtc.sql and migration_dtc_v2.sql to already be applied.
-- Safe to run multiple times (uses IF NOT EXISTS)

-- ─── 1. Product size/SKU variants ─────────────────────────────────────────
-- Mirrors the fields Shopify tracks per variant (SKU, price, compare-at, cost per
-- item) plus ordered-vs-received quantities for manufacturing discrepancy tracking.
CREATE TABLE IF NOT EXISTS dtc_product_variants (
  id                uuid primary key default gen_random_uuid(),
  dtc_product_id    uuid not null references dtc_products(id) on delete cascade,
  option_label      text not null,
  sku               text,
  price             numeric,
  compare_at_price  numeric,
  cost_per_item     numeric,
  units_ordered     numeric,
  units_received    numeric,
  created_at        timestamptz not null default now()
);

ALTER TABLE dtc_product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dtc_variants read"   ON dtc_product_variants;
DROP POLICY IF EXISTS "dtc_variants insert" ON dtc_product_variants;
DROP POLICY IF EXISTS "dtc_variants update" ON dtc_product_variants;
DROP POLICY IF EXISTS "dtc_variants delete" ON dtc_product_variants;

CREATE POLICY "dtc_variants read"   ON dtc_product_variants FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_variants insert" ON dtc_product_variants FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "dtc_variants update" ON dtc_product_variants FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_variants delete" ON dtc_product_variants FOR DELETE TO authenticated USING (is_hvi_user());

ALTER PUBLICATION supabase_realtime ADD TABLE dtc_product_variants;

-- ─── 2. Editable phase timeline dates ─────────────────────────────────────
-- One row per (product, phase) — overrides the computed estimate shown by default.
CREATE TABLE IF NOT EXISTS dtc_phase_dates (
  id                uuid primary key default gen_random_uuid(),
  dtc_product_id    uuid not null references dtc_products(id) on delete cascade,
  phase_key         text not null check (phase_key in ('design','sampling','production','shipping')),
  planned_start     date,
  planned_end       date,
  unique (dtc_product_id, phase_key)
);

ALTER TABLE dtc_phase_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dtc_phase_dates read"   ON dtc_phase_dates;
DROP POLICY IF EXISTS "dtc_phase_dates insert" ON dtc_phase_dates;
DROP POLICY IF EXISTS "dtc_phase_dates update" ON dtc_phase_dates;
DROP POLICY IF EXISTS "dtc_phase_dates delete" ON dtc_phase_dates;

CREATE POLICY "dtc_phase_dates read"   ON dtc_phase_dates FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_phase_dates insert" ON dtc_phase_dates FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "dtc_phase_dates update" ON dtc_phase_dates FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_phase_dates delete" ON dtc_phase_dates FOR DELETE TO authenticated USING (is_hvi_user());

ALTER PUBLICATION supabase_realtime ADD TABLE dtc_phase_dates;

-- ─── 3. Verify ────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('dtc_product_variants', 'dtc_phase_dates');
