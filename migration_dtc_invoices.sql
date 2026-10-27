-- HVI CRM — Migration: DTC invoices (upload, extraction, cost per unit)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Requires migration_dtc.sql … migration_dtc_v4.sql and migration_user_management.sql (is_hvi_user()).
-- Safe to run multiple times.

-- ─── 1. Supplier order reference on products ───────────────────────────────
-- e.g. "HVI2626" (one product can carry several: "HVI2621 HVI2623"). Used to match later documents to the product.
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS order_ref text;

-- ─── 2. Invoices (one row per document: pro-forma or final) ────────────────
CREATE TABLE IF NOT EXISTS dtc_invoices (
  id                 uuid primary key default gen_random_uuid(),
  manufacturer       text,
  invoice_number     text not null,
  doc_type           text not null default 'final' check (doc_type in ('proforma','final','other')),
  invoice_date       date,
  currency           text not null default 'USD',
  total_amount       numeric,
  deposit_paid       numeric,                 -- deposits listed on a final invoice
  overpaid_amount    numeric,
  balance_due        numeric,
  deposits           jsonb not null default '[]'::jsonb,      -- [{ ref, amount }]
  refs               text[] not null default '{}',            -- order refs on the document, e.g. {HVI2621,HVI2625}
  file_name          text,
  file_path          text,                    -- path in the private "dtc-invoices" storage bucket
  file_hash          text,                    -- SHA-256 of the uploaded file: blocks importing the same file twice
  extraction_method  text not null default 'rules' check (extraction_method in ('rules','ai','manual','history')),
  warnings           jsonb not null default '[]'::jsonb,
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  unique (manufacturer, invoice_number, doc_type)
);
CREATE UNIQUE INDEX IF NOT EXISTS dtc_invoices_file_hash_idx ON dtc_invoices (file_hash) WHERE file_hash IS NOT NULL;

-- ─── 3. Invoice lines (shared charges are stored already split per product) ─
CREATE TABLE IF NOT EXISTS dtc_invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references dtc_invoices(id) on delete cascade,
  position         integer not null default 0,
  description      text not null,
  line_type        text not null check (line_type in ('product','photography','shipping','sample_fee','fee','other')),
  quantity         numeric,
  unit_price       numeric,
  amount           numeric not null,
  packed_quantity  numeric,                   -- pieces on the packing list (what was actually shipped)
  dtc_product_id   uuid references dtc_products(id) on delete set null,
  allocation       text not null default 'dtc' check (allocation in ('dtc','b2b','ignore')),
  split_of         integer,                   -- position of the original line when a shared charge was split
  note             text
);
CREATE INDEX IF NOT EXISTS dtc_invoice_lines_invoice_idx ON dtc_invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS dtc_invoice_lines_product_idx ON dtc_invoice_lines (dtc_product_id);

-- ─── 4. Names the team has confirmed ("New Lightning" = Arc Button Up - Blue) ─
CREATE TABLE IF NOT EXISTS dtc_product_aliases (
  id              uuid primary key default gen_random_uuid(),
  alias_norm      text not null,
  alias_text      text,
  dtc_product_id  uuid not null references dtc_products(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (alias_norm, dtc_product_id)
);

-- ─── 5. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE dtc_invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtc_invoice_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtc_product_aliases ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dtc_invoices','dtc_invoice_lines','dtc_product_aliases'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s read" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s insert" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s update" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s delete" ON %1$I', t);
    EXECUTE format('CREATE POLICY "%1$s read"   ON %1$I FOR SELECT TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s insert" ON %1$I FOR INSERT TO authenticated WITH CHECK (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s update" ON %1$I FOR UPDATE TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s delete" ON %1$I FOR DELETE TO authenticated USING (is_hvi_user())', t);
  END LOOP;
END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE dtc_invoices;      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE dtc_invoice_lines; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. Private storage bucket for the original files ──────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('dtc-invoices', 'dtc-invoices', false) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "dtc-invoices read"   ON storage.objects;
DROP POLICY IF EXISTS "dtc-invoices insert" ON storage.objects;
DROP POLICY IF EXISTS "dtc-invoices update" ON storage.objects;
DROP POLICY IF EXISTS "dtc-invoices delete" ON storage.objects;
CREATE POLICY "dtc-invoices read"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'dtc-invoices' AND is_hvi_user());
CREATE POLICY "dtc-invoices insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'dtc-invoices' AND is_hvi_user());
CREATE POLICY "dtc-invoices update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'dtc-invoices' AND is_hvi_user());
CREATE POLICY "dtc-invoices delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'dtc-invoices' AND is_hvi_user());

SELECT 'dtc_invoices' AS table_name, count(*) FROM dtc_invoices
UNION ALL SELECT 'dtc_invoice_lines', count(*) FROM dtc_invoice_lines
UNION ALL SELECT 'dtc_product_aliases', count(*) FROM dtc_product_aliases;
