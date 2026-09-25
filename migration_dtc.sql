-- HVI CRM — Migration: DTC Operations Module
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE)

-- ─── 1. DTC Products table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dtc_products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  product_type      text,           -- 'button-up' | 'polo' | 'flannel' | 'hoodie' | 'tee' | 'hat' | 'accessory' | 'other'
  category          text,           -- 'restock' | 'new-design' | 'new-line'
  phase             text not null default 'idea',  -- 'idea' | 'design' | 'tech-pack' | 'production' | 'warehouse'
  manufacturer      text,           -- 'bing-bing' | 'us-screen-printer' | 'alibaba' | 'dropship-selby' | 'dropship-camel' | 'dropship-benchmark' | 'other'
  drop_date         date,
  figma_link        text,
  tech_pack_link    text,
  deposit_50_paid   boolean default false,
  final_50_paid     boolean default false,
  est_cost          numeric,
  units             numeric,
  notes             text,
  phase_changed_at  date default current_date,
  last_activity     date default current_date,
  created_at        timestamptz not null default now()
);

-- ─── 2. DTC Financials table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dtc_financials (
  id                uuid primary key default gen_random_uuid(),
  dtc_product_id    uuid references dtc_products(id) on delete set null,
  product_name      text,           -- denormalized for display when product deleted
  manufacturer      text,
  order_number      text,
  invoice_number    text,
  deposit_amount    numeric,
  deposit_paid_date date,
  final_amount      numeric,
  final_paid_date   date,
  notes             text,
  created_at        timestamptz not null default now()
);

-- ─── 3. RLS on dtc_products ───────────────────────────────────────────────
ALTER TABLE dtc_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dtc_products read"   ON dtc_products;
DROP POLICY IF EXISTS "dtc_products insert" ON dtc_products;
DROP POLICY IF EXISTS "dtc_products update" ON dtc_products;
DROP POLICY IF EXISTS "dtc_products delete" ON dtc_products;

CREATE POLICY "dtc_products read"   ON dtc_products FOR SELECT    TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_products insert" ON dtc_products FOR INSERT    TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "dtc_products update" ON dtc_products FOR UPDATE    TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_products delete" ON dtc_products FOR DELETE    TO authenticated USING (is_hvi_user());

-- ─── 4. RLS on dtc_financials ─────────────────────────────────────────────
ALTER TABLE dtc_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dtc_financials read"   ON dtc_financials;
DROP POLICY IF EXISTS "dtc_financials insert" ON dtc_financials;
DROP POLICY IF EXISTS "dtc_financials update" ON dtc_financials;
DROP POLICY IF EXISTS "dtc_financials delete" ON dtc_financials;

CREATE POLICY "dtc_financials read"   ON dtc_financials FOR SELECT    TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_financials insert" ON dtc_financials FOR INSERT    TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "dtc_financials update" ON dtc_financials FOR UPDATE    TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_financials delete" ON dtc_financials FOR DELETE    TO authenticated USING (is_hvi_user());

-- ─── 5. Realtime ──────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE dtc_products;
ALTER PUBLICATION supabase_realtime ADD TABLE dtc_financials;

-- ─── 6. Verify ────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('dtc_products', 'dtc_financials');
