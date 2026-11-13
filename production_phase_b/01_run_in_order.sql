-- HVI CRM — PRODUCTION package, phase B, in order. Paste into the PRODUCTION Supabase SQL Editor and run ONCE, BEFORE merging the pull request.
-- Every part is idempotent. Run 00_precheck_READ_ONLY.sql first. The invoice data parts do nothing if production has no invoice history.
-- Contains NO test data. Parts: migration_dtc_v4.sql, migration_dtc_invoices.sql, migration_dtc_inventory.sql, migration_dtc_tracking.sql, migration_dropflow.sql, migration_round3.sql, migration_round4.sql, migration_invoice_costing.sql, data_invoice_costing_fix.sql, data_invoice_source_links.sql, migration_kpi.sql, data_kpi_q4_2026.sql


-- ════════════════════════════════════════════════════════════
-- PART: migration_dtc_v4.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — Migration: DTC v4 — priority field
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Requires migration_dtc.sql (dtc_products) to already be applied.
-- Safe to run multiple times (uses IF NOT EXISTS)

ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS priority text CHECK (priority IN ('low','medium','high'));

-- ─── Verify ────────────────────────────────────────────────────────────────
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'dtc_products' AND column_name = 'priority';


-- ════════════════════════════════════════════════════════════
-- PART: migration_dtc_invoices.sql
-- ════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════
-- PART: migration_dtc_inventory.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — Migration: DTC inventory management (ordered → shipped → received → QC → sellable → shelved/reserve)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project)
-- Requires migration_dtc.sql, migration_dtc_v3.sql (variants) and is_hvi_user(). Safe to run multiple times.
--
-- One row per product and size/option. A count that has not been entered yet is NULL (not zero), so the
-- app can tell "nobody counted yet" from "counted: 0". Every change to a count is logged with who made it.

CREATE TABLE IF NOT EXISTS dtc_inventory (
  id              uuid primary key default gen_random_uuid(),
  dtc_product_id  uuid not null references dtc_products(id) on delete cascade,
  option_label    text not null default 'Total',     -- size / option, or 'Total' for products without sizes
  sku             text,
  qty_ordered     integer,                            -- what we ordered from the manufacturer
  qty_shipped     integer,                            -- what the manufacturer says it shipped
  qty_received    integer,                            -- what physically arrived at the warehouse
  qty_rejected    integer,                            -- QC rejected / defective, cannot be sold
  qty_sellable    integer,                            -- final sellable count put into inventory
  qty_shelved     integer,                            -- sellable units on the pick shelves
  qty_reserve     integer,                            -- sellable units in reserve storage
  notes           text,
  updated_by      text,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (dtc_product_id, option_label)
);

CREATE TABLE IF NOT EXISTS dtc_inventory_events (
  id              uuid primary key default gen_random_uuid(),
  inventory_id    uuid references dtc_inventory(id) on delete cascade,
  dtc_product_id  uuid references dtc_products(id) on delete cascade,
  option_label    text,
  field           text not null,
  old_value       text,
  new_value       text,
  changed_by      text,
  created_at      timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS dtc_inventory_events_prod_idx ON dtc_inventory_events (dtc_product_id, created_at DESC);

-- Audit trail: every change to a count is logged with the signed-in user (AFTER trigger, so the row id exists on insert).
CREATE OR REPLACE FUNCTION dtc_inventory_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); NEW.updated_by := coalesce(auth.jwt() ->> 'email', 'system'); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION dtc_inventory_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text := coalesce(auth.jwt() ->> 'email', 'system'); f text; o text; n text;
BEGIN
  FOREACH f IN ARRAY ARRAY['qty_ordered','qty_shipped','qty_received','qty_rejected','qty_sellable','qty_shelved','qty_reserve'] LOOP
    o := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ->> f END;
    n := to_jsonb(NEW) ->> f;
    IF (TG_OP = 'INSERT' AND n IS NOT NULL) OR (TG_OP = 'UPDATE' AND o IS DISTINCT FROM n) THEN
      INSERT INTO dtc_inventory_events (inventory_id, dtc_product_id, option_label, field, old_value, new_value, changed_by)
      VALUES (NEW.id, NEW.dtc_product_id, NEW.option_label, f, o, n, who);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS dtc_inventory_stamp_trg ON dtc_inventory;
CREATE TRIGGER dtc_inventory_stamp_trg BEFORE INSERT OR UPDATE ON dtc_inventory FOR EACH ROW EXECUTE FUNCTION dtc_inventory_stamp();
DROP TRIGGER IF EXISTS dtc_inventory_log_trg ON dtc_inventory;
CREATE TRIGGER dtc_inventory_log_trg AFTER INSERT OR UPDATE ON dtc_inventory FOR EACH ROW EXECUTE FUNCTION dtc_inventory_log();

-- ─── Row level security (same pattern as the other DTC tables) ──────────────
ALTER TABLE dtc_inventory        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtc_inventory_events ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['dtc_inventory','dtc_inventory_events'] LOOP
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'dtc_inventory') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dtc_inventory;
  END IF;
END $$;

-- ─── Seed from what is already recorded (sizes/SKUs and ordered/received on the product) ─────────
INSERT INTO dtc_inventory (dtc_product_id, option_label, sku, qty_ordered, qty_received)
SELECT v.dtc_product_id, v.option_label, v.sku, v.units_ordered::int, v.units_received::int
FROM dtc_product_variants v
ON CONFLICT (dtc_product_id, option_label) DO NOTHING;

INSERT INTO dtc_inventory (dtc_product_id, option_label, qty_ordered, qty_received)
SELECT p.id, 'Total', p.units_ordered::int, p.units_received::int
FROM dtc_products p
WHERE (p.units_ordered IS NOT NULL OR p.units_received IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM dtc_product_variants v WHERE v.dtc_product_id = p.id)
ON CONFLICT (dtc_product_id, option_label) DO NOTHING;

SELECT count(*) AS inventory_rows FROM dtc_inventory;


-- ════════════════════════════════════════════════════════════
-- PART: migration_dtc_tracking.sql
-- ════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════
-- PART: migration_dropflow.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — Migration: Product drop & pre-marketing workflow (Marketing Ops)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project)
-- Requires migration_dtc.sql and is_hvi_user(). Safe to run multiple times: the task templates are seeded once and
-- never overwritten afterwards, so changes made in the app by Adriana (due dates, owners) are kept.
--
-- Model: a DROP belongs to one DTC product and has a public launch date (normally a Friday). TASKS are generated from
-- TEMPLATES with a due date relative to the launch (offset_days: -2 = Wednesday Vault, 0 = Friday). Each task has an owner
-- role (Tony, Adriana, Kuerstine, Ryanne, Aira, Paul, Warehouse), a status (not_started / in_progress / complete / na)
-- and optional dependencies. Dependencies are soft: they show "waiting on" but never block work.

-- ─── 1. Team roles (who is who; email is filled in the app once people are invited) ───────────────────────
CREATE TABLE IF NOT EXISTS team_roles (
  role          text primary key,
  display_name  text not null,
  email         text,
  is_external   boolean not null default false,
  sort          integer not null default 0
);
INSERT INTO team_roles (role, display_name, is_external, sort) VALUES
  ('tony',      'Tony',                  false, 1),
  ('adriana',   'Adriana',               false, 2),
  ('kuerstine', 'Kuerstine',             false, 3),
  ('ryanne',    'Ryanne',                false, 4),
  ('aira',      'Aira',                  false, 5),
  ('paul',      'Paul (photographer)',   true,  6),
  ('warehouse', 'Warehouse',             false, 7)
ON CONFLICT (role) DO NOTHING;

-- ─── 2. Task templates (editable in the app: owner, due-date offset, dependencies, N/A defaults) ───────────
CREATE TABLE IF NOT EXISTS drop_task_templates (
  key            text primary key,
  phase          text not null check (phase in ('brief','assets','listing','creative','email','vault','launch','post')),
  title          text not null,
  description    text,
  owner_role     text not null references team_roles(role),
  offset_days    integer not null default 0,                 -- days from the public launch date (negative = before)
  depends_on     text[] not null default '{}',
  na_for         text[] not null default '{}',               -- drop types where the task starts as N/A (new_product | colorway | restock)
  only_if        text check (only_if in ('preorder','instock')),
  blocker_group  text,                                       -- photography | copy | walkthrough | listing | inventory | creative | launch
  sop_url        text,
  active         boolean not null default true,
  sort           integer not null default 0,
  updated_by     text,
  updated_at     timestamptz not null default now()
);

INSERT INTO drop_task_templates (key, phase, title, owner_role, offset_days, depends_on, na_for, only_if, blocker_group, sort, description) VALUES
 ('walkthrough',       'brief',    'Record the internal product walkthrough (materials, fit, feel, sizing, special details, design rationale)', 'tony',      -28, '{}',                              '{restock}',            NULL, 'walkthrough', 10, 'Done during sampling. Tony and Paul each receive their own sample.'),
 ('walkthrough_link',  'brief',    'Link the walkthrough to the product record',                                  'tony',      -27, '{walkthrough}',                   '{restock}',            NULL, 'walkthrough', 20, NULL),
 ('tech_details',      'brief',    'Send technical details and features to Adriana',                              'tony',      -26, '{walkthrough}',                   '{restock}',            NULL, 'walkthrough', 30, NULL),
 ('copy_core',         'brief',    'Product name, hooks and description',                                         'adriana',   -21, '{walkthrough}',                   '{restock}',            NULL, 'copy',        40, 'Starts the work for email, social, site and listing. Restocks reuse the existing copy.'),
 ('pricing',           'brief',    'Approve the retail price',                                                    'adriana',   -21, '{}',                              '{}',                   NULL, 'copy',        50, NULL),
 ('info_sheet',        'brief',    'Add the product information to the product information sheet or linked record', 'adriana', -20, '{copy_core,pricing}',             '{}',                   NULL, 'copy',        60, NULL),
 ('sku_cost',          'brief',    'Confirm SKUs and unit cost from the product development records',             'kuerstine', -18, '{}',                              '{}',                   NULL, 'listing',     70, NULL),
 ('hands_video',       'brief',    'Record the hands-only customer-facing walkthrough video (reusable marketing asset)', 'tony', -10, '{}',                            '{}',                   NULL, 'walkthrough', 80, 'Tracked for every drop, including restocks, and reused where possible.'),

 ('shot_list',         'assets',   'Build the product shot list from the walkthrough and brief Paul',             'ryanne',    -18, '{walkthrough}',                   '{restock}',            NULL, 'photography', 100, NULL),
 ('model_photos',      'assets',   'Model photos, detail shots and fit/movement video',                           'paul',      -10, '{shot_list}',                     '{restock}',            NULL, 'photography', 110, 'Paul emails the support inbox; Kuerstine downloads and organizes the files.'),
 ('flat_lays',         'assets',   'Manufacturer flat lays received (WeTransfer link forwarded to support) and saved to Drive', 'kuerstine', -12, '{}',                '{}',                   NULL, 'photography', 120, NULL),
 ('photo_intake',      'assets',   'Download and organize the photos in Drive; link the folder to the product',   'kuerstine', -7,  '{model_photos}',                  '{restock}',            NULL, 'photography', 130, NULL),
 ('shot_check',        'assets',   'Compare delivered assets with the shot list and flag missing shots to Ryanne', 'kuerstine', -6, '{photo_intake}',                  '{restock}',            NULL, 'photography', 140, 'A completeness check, not a formal approval.'),
 ('missing_shots',     'assets',   'Follow up on any missing shots with Paul',                                    'ryanne',    -5,  '{shot_check}',                    '{restock}',            NULL, 'photography', 150, NULL),
 ('social_assets',     'assets',   'Asset list and weekly description ready for social captions',                  'kuerstine', -6,  '{copy_core}',                     '{}',                   NULL, 'copy',        160, NULL),

 ('shopify_official',  'listing',  'Create the official Shopify listing: name, SKUs, variants and sizes',         'kuerstine', -14, '{sku_cost}',                      '{restock}',            NULL, 'listing',     200, 'Keep access restricted until it is intentionally authorized.'),
 ('shopify_price',     'listing',  'Enter the approved retail price and unit cost (COGS)',                         'kuerstine', -12, '{pricing,sku_cost}',              '{}',                   NULL, 'listing',     210, NULL),
 ('shopify_placeholder','listing', 'Create the zero-inventory placeholder listing (Notify Me signups only)',       'kuerstine', -8,  '{shopify_official}',              '{restock}',            NULL, 'listing',     220, 'Retired on Friday; Notify Me signups move to the official listing.'),
 ('shopify_content',   'listing',  'Add description, product information and photography to the official listing', 'kuerstine', -5, '{copy_core,photo_intake}',        '{}',                   NULL, 'listing',     230, 'If photography is late, use approved temporary AI photos and keep the replacement task open.'),
 ('links_recorded',    'listing',  'Record missing fields and link both listings in the database',                 'kuerstine', -5,  '{shopify_official}',              '{}',                   NULL, 'listing',     240, NULL),
 ('inventory_counts',  'listing',  'Final sellable counts entered in Inventory',                                   'warehouse', -3,  '{}',                              '{dropship}',           'instock', 'inventory', 250, 'Never split sellable inventory across duplicate listings.'),
 ('preorder_setup',    'listing',  'Pre-order setup: update Shopify and the expected shipping timing',             'kuerstine', -2,  '{}',                              '{}',                   'preorder', 'listing', 260, NULL),

 ('email_plan','email', 'Plan the email sequence and brief the designer',                               'aira',      -9,  '{copy_core}',                     '{}',                   NULL, 'creative',    300, NULL),
 ('size_graphics',     'creative', 'Size/fit graphics and PDP enhancements',                                       'ryanne',    -6,  '{photo_intake}',                  '{restock}',            NULL, 'creative',    310, NULL),
 ('social_plan',       'creative', 'Organic social plan (larger buildup for new products, lighter for colorways and restocks)', 'kuerstine', -8, '{copy_core}',         '{}',                   NULL, 'creative',    320, NULL),
 ('social_weekend',    'creative', 'Teaser post the weekend before the drop',                                       'kuerstine', -6,  '{social_plan}',                   '{}',                   NULL, 'creative',    330, NULL),
 ('banners',           'creative', 'Homepage and collection banners prepared and uploaded (linked to the placeholder listing)', 'ryanne', -4, '{shopify_placeholder}',     '{}',                   NULL, 'creative',    340, 'Monday. Uses approved AI photos if the real ones are not in yet.'),
 ('email_teaser','email', 'Build and send the Monday teaser email',                                        'aira',      -4,  '{copy_core,shopify_placeholder}', '{}',                   NULL, 'creative',    350, 'Needs photos, description and the product link.'),
 ('ads_creative',      'creative', 'Start the drop ad creative (with Socialite)',                                   'ryanne',    -4,  '{copy_core}',                     '{}',                   NULL, 'creative',    360, 'Most drops get ads; mark N/A when this one does not.'),
 ('pdp_assets',        'creative', 'Upload PDP graphics to the listing',                                            'ryanne',    -3,  '{size_graphics,shopify_official}','{restock}',            NULL, 'creative',    370, 'Owner to confirm: Ryanne or Kuerstine.'),
 ('founder_draft','email', 'Write the optional From the Founder email copy',                                'adriana',   -5,  '{copy_core}',                     '{restock,colorway}',   NULL, 'copy',        380, NULL),
 ('founder_send','email', 'Build and send the From the Founder email (Tuesday)',                           'aira',      -3,  '{founder_draft}',                 '{restock,colorway}',   NULL, 'creative',    390, NULL),
 ('ads_approval',      'creative', 'Approve new ad creative',                                                       'adriana',   -3,  '{ads_creative}',                  '{restock,colorway}',   NULL, 'creative',    400, 'Routine restock edits can skip approval.'),
 ('social_sneak',      'creative', 'Tuesday sneak peek or extra details post',                                      'kuerstine', -3,  '{social_plan}',                   '{restock}',            NULL, 'creative',    410, NULL),
 ('social_reveal',     'creative', 'Wednesday full reveal post (when appropriate)',                                 'kuerstine', -2,  '{social_plan}',                   '{restock}',            NULL, 'creative',    420, NULL),
 ('preorder_email','email', 'Pre-order messaging in the remaining emails',                                   'aira',      -1,  '{}',                              '{}',                   'preorder', 'creative', 430, NULL),
 ('preorder_site',     'creative', 'Pre-order messaging on banners and paid ads',                                   'ryanne',    -1,  '{}',                              '{}',                   'preorder', 'creative', 440, NULL),
 ('preorder_social',   'creative', 'Pre-order messaging in organic social',                                         'kuerstine', -1,  '{}',                              '{}',                   'preorder', 'creative', 450, NULL),

 ('v_listing',         'vault',    'Official listing, variants, copy, sizing and photography are complete',        'kuerstine', -2,  '{shopify_content}',               '{}',                   NULL, 'launch',      500, 'Wednesday Vault is the first real customer purchase window.'),
 ('v_pdp',             'vault',    'PDP graphics and website banners are in place',                                'ryanne',    -2,  '{banners}',                       '{}',                   NULL, 'launch',      510, NULL),
 ('v_price_inv',       'vault',    'Retail price, COGS and final sellable inventory (or pre-order status) verified', 'kuerstine', -2, '{shopify_price}',              '{}',                   NULL, 'launch',      520, NULL),
 ('v_access',          'vault',    'VIP access and purchase links tested',                                         'kuerstine', -2,  '{}',                              '{}',                   NULL, 'launch',      530, NULL),
 ('v_email',           'vault',    'Confirm the 5 PM PT Vault email is ready',                                     'aira',      -2,  '{email_teaser}',                  '{}',                   NULL, 'launch',      540, NULL),
 ('v_confirm',         'vault',    'VIP launch confirmed',                                                         'kuerstine', -2,  '{v_listing,v_pdp,v_price_inv,v_access,v_email}', '{}',        NULL, 'launch',      550, NULL),
 ('email_thursday','email',    'Send the "dropping tomorrow" email',                                           'aira',      -1,  '{}',                              '{}',                   NULL, 'launch',      560, NULL),

 ('l_publish',         'launch',   'Publish the official listing for public purchase',                             'kuerstine', 0,   '{v_confirm}',                     '{}',                   NULL, 'launch',      600, NULL),
 ('l_notify',          'launch',   'Transfer Notify Me signups and trigger the notifications',                     'kuerstine', 0,   '{l_publish}',                     '{restock}',            NULL, 'launch',      610, NULL),
 ('l_placeholder',     'launch',   'Retire the placeholder; verify redirects and links',                           'kuerstine', 0,   '{l_notify}',                      '{restock}',            NULL, 'launch',      620, NULL),
 ('l_merch',           'launch',   'Update website merchandising and badges per the Shopify SOP',                  'kuerstine', 0,   '{l_publish}',                     '{}',                   NULL, 'launch',      630, NULL),
 ('l_email',           'launch',   'Confirm and send the "just dropped" email',                                    'aira',      0,   '{l_publish}',                     '{}',                   NULL, 'launch',      640, NULL),
 ('l_ads',             'launch',   'Confirm ads are running (when applicable)',                                    'ryanne',    0,   '{ads_creative}',                  '{}',                   NULL, 'launch',      650, NULL),
 ('l_social',          'launch',   'Publish the planned organic social and confirm the website launch',           'kuerstine', 0,   '{l_publish}',                     '{}',                   NULL, 'launch',      660, NULL),

 ('post_followup',     'post',     'Post-launch update: fulfillment footage, customer reactions and UGC; tease the next drop', 'kuerstine', 2, '{l_publish}',           '{}',                   NULL, 'launch',      700, NULL)
ON CONFLICT (key) DO NOTHING;

-- ─── 3. Drops (one per DTC product) ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drops (
  id                       uuid primary key default gen_random_uuid(),
  dtc_product_id           uuid not null unique references dtc_products(id) on delete cascade,
  drop_type                text not null default 'new_product' check (drop_type in ('new_product','colorway','restock','dropship')),
  launch_date              date not null,                         -- public launch (Friday)
  vault_date               date,                                  -- Wednesday Vault early access (defaults to launch - 2)
  inventory_eta            date,                                  -- when sellable stock is expected (pre-orders)
  stock_mode               text not null default 'in_stock' check (stock_mode in ('in_stock','preorder')),
  phase                    text not null default 'brief' check (phase in ('brief','assets','listing','creative','email','vault','launch','post')),
  ai_photo_in_use          boolean not null default false,
  link_product_info        text,
  link_walkthrough         text,
  link_shot_list           text,
  link_photos              text,
  link_shopify_official    text,
  link_shopify_placeholder text,
  link_sop                 text,
  link_campaign            text,
  notes                    text,
  created_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── 4. Tasks of a drop ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_tasks (
  id             uuid primary key default gen_random_uuid(),
  drop_id        uuid not null references drops(id) on delete cascade,
  template_key   text,
  phase          text not null check (phase in ('brief','assets','listing','creative','email','vault','launch','post')),
  title          text not null,
  owner_role     text not null references team_roles(role),
  due_date       date,
  due_locked     boolean not null default false,        -- set by hand: moving the launch date does not touch it
  prev_due_date  date,
  due_changed_at timestamptz,
  status         text not null default 'not_started' check (status in ('not_started','in_progress','complete','na')),
  depends_on     text[] not null default '{}',
  blocker_group  text,
  workaround     text,                                   -- set when the task moved on with a fallback (e.g. temporary AI photos)
  is_replacement boolean not null default false,
  note           text,
  link           text,
  sort           integer not null default 0,
  completed_at   timestamptz,
  completed_by   text,
  created_at     timestamptz not null default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drop_tasks_drop_template_uq ON drop_tasks (drop_id, template_key) WHERE template_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS drop_tasks_drop_idx ON drop_tasks (drop_id);

-- ─── 5. Activity (date changes, workarounds, pre-order conversions) shown to the affected owners ─────────
CREATE TABLE IF NOT EXISTS drop_events (
  id          uuid primary key default gen_random_uuid(),
  drop_id     uuid references drops(id) on delete cascade,
  task_id     uuid,
  kind        text not null,                -- created | date_changed | status | workaround | preorder | phase | note
  message     text not null,
  roles       text[] not null default '{}', -- owner roles affected (empty = everyone)
  created_by  text,
  created_at  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS drop_events_created_idx ON drop_events (created_at DESC);

-- ─── 6. Row level security + realtime ────────────────────────────────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['team_roles','drop_task_templates','drops','drop_tasks','drop_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s read" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s insert" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s update" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s delete" ON %1$I', t);
    EXECUTE format('CREATE POLICY "%1$s read"   ON %1$I FOR SELECT TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s insert" ON %1$I FOR INSERT TO authenticated WITH CHECK (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s update" ON %1$I FOR UPDATE TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s delete" ON %1$I FOR DELETE TO authenticated USING (is_hvi_user())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['drops','drop_tasks','drop_events'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

SELECT (SELECT count(*) FROM team_roles) AS roles, (SELECT count(*) FROM drop_task_templates) AS templates;


-- ════════════════════════════════════════════════════════════
-- PART: migration_round3.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — Migration: round 3 (calendar events, drop-shipping, production quotes, asset checklist, email-campaign phase)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project)
-- Requires migration_dropflow.sql, migration_dtc_v4.sql and the earlier DTC migrations. Safe to run multiple times.

-- ─── 1. Calendar events: promotions, key dates, seasons and closures that users can add, recolour and move ────
CREATE TABLE IF NOT EXISTS dtc_calendar_events (
  id          uuid primary key default gen_random_uuid(),
  seed_key    text unique,                                           -- set on the built-in events, so re-running never duplicates them
  label       text not null,
  start_date  date not null,
  end_date    date,                                                  -- null = single day
  color       text not null default 'FFB500',                        -- hex without #
  kind        text not null default 'promo' check (kind in ('promo','event','season','closure','note')),
  show_band   boolean not null default true,                         -- tint the background of the days
  created_by  text,
  created_at  timestamptz not null default now()
);
ALTER TABLE dtc_calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtc_calendar_events read"   ON dtc_calendar_events;
DROP POLICY IF EXISTS "dtc_calendar_events insert" ON dtc_calendar_events;
DROP POLICY IF EXISTS "dtc_calendar_events update" ON dtc_calendar_events;
DROP POLICY IF EXISTS "dtc_calendar_events delete" ON dtc_calendar_events;
CREATE POLICY "dtc_calendar_events read"   ON dtc_calendar_events FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_calendar_events insert" ON dtc_calendar_events FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "dtc_calendar_events update" ON dtc_calendar_events FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "dtc_calendar_events delete" ON dtc_calendar_events FOR DELETE TO authenticated USING (is_hvi_user());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'dtc_calendar_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dtc_calendar_events;
  END IF;
END $$;

-- The dates that used to be fixed in the code, now editable.
INSERT INTO dtc_calendar_events (seed_key, label, start_date, end_date, color, kind, show_band) VALUES
  ('season-winter',  'Winter Season',               '2026-01-01', '2026-02-28', '5B9CF6', 'season', true),
  ('season-golf',    'Golf Season',                 '2026-03-01', '2026-06-30', '4CAF7D', 'season', true),
  ('season-summer',  'Summer (Boardshorts)',        '2026-06-01', '2026-08-31', 'F0C040', 'season', true),
  ('season-fall',    'Fall (Flannels/Hoodies)',     '2026-09-01', '2026-11-30', 'E8874A', 'season', true),
  ('season-holiday', 'Holiday / BFCM',              '2026-11-01', '2026-12-31', '9B7FE8', 'season', true),
  ('key-lineman-day',      'Lineman Day',                        '2026-04-18', NULL, 'F0C040', 'event', false),
  ('key-black-friday',     'Black Friday',                       '2026-11-27', NULL, 'E05555', 'promo', false),
  ('key-cyber-monday',     'Cyber Monday',                       '2026-11-30', NULL, 'E05555', 'promo', false),
  ('key-grad-spring',      'Spring Graduation (line schools)',   '2026-03-15', NULL, '4CAF7D', 'event', false),
  ('key-grad-summer',      'Summer Graduation (line schools)',   '2026-06-15', NULL, '4CAF7D', 'event', false),
  ('key-grad-fall',        'Fall Graduation (line schools)',     '2026-11-15', NULL, '4CAF7D', 'event', false),
  ('key-suicide-2026',     'Suicide Prevention Month',           '2026-09-01', NULL, '5B9CF6', 'event', false),
  ('key-suicide-2027',     'Suicide Prevention Month',           '2027-09-01', NULL, '5B9CF6', 'event', false),
  ('key-breast-2026',      'Breast Cancer Awareness Month',      '2026-10-01', NULL, 'E05555', 'event', false),
  ('key-breast-2027',      'Breast Cancer Awareness Month',      '2027-10-01', NULL, 'E05555', 'event', false)
ON CONFLICT (seed_key) DO NOTHING;

-- ─── 2. DTC products: fulfillment type (drop-shipping) and production quote vs actual ───────────────────────
ALTER TABLE dtc_products
  ADD COLUMN IF NOT EXISTS fulfillment               text NOT NULL DEFAULT 'own' CHECK (fulfillment IN ('own','dropship')),
  ADD COLUMN IF NOT EXISTS quoted_production_weeks   numeric,       -- what the manufacturer quoted
  ADD COLUMN IF NOT EXISTS production_started_on     date,          -- actual production start
  ADD COLUMN IF NOT EXISTS production_finished_on    date;          -- actual production end (leaves production)

-- ─── 3. Marketing Ops: email-campaign phase, drop-ship type, asset checklist and one Drive folder ──────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
           WHERE contype = 'c' AND conrelid::regclass::text IN ('drops','drop_tasks','drop_task_templates')
             AND (conname LIKE '%\_phase\_check' OR conname = 'drops_drop_type_check') LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE drops               ADD CONSTRAINT drops_phase_check               CHECK (phase IN ('brief','assets','listing','creative','email','vault','launch','post'));
ALTER TABLE drop_tasks          ADD CONSTRAINT drop_tasks_phase_check          CHECK (phase IN ('brief','assets','listing','creative','email','vault','launch','post'));
ALTER TABLE drop_task_templates ADD CONSTRAINT drop_task_templates_phase_check CHECK (phase IN ('brief','assets','listing','creative','email','vault','launch','post'));
ALTER TABLE drops               ADD CONSTRAINT drops_drop_type_check           CHECK (drop_type IN ('new_product','colorway','restock','dropship'));

ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS drive_folder  text,                                -- the one shared Google Drive folder for the product
  ADD COLUMN IF NOT EXISTS asset_checks  jsonb NOT NULL DEFAULT '{}'::jsonb;  -- { key: { done, link, at, by } }

-- Email-campaign tasks get their own column, concurrent with creatives.
UPDATE drop_task_templates SET phase = 'email'
 WHERE key IN ('email_plan','email_teaser','founder_draft','founder_send','preorder_email','email_thursday') AND phase <> 'email';
UPDATE drop_tasks SET phase = 'email'
 WHERE template_key IN ('email_plan','email_teaser','founder_draft','founder_send','preorder_email','email_thursday') AND phase <> 'email';
-- Drop-shipped products carry no inventory of their own.
UPDATE drop_task_templates SET na_for = array_append(na_for, 'dropship') WHERE key = 'inventory_counts' AND NOT ('dropship' = ANY (na_for));

SELECT (SELECT count(*) FROM dtc_calendar_events) AS calendar_events,
       (SELECT count(*) FROM drop_task_templates WHERE phase = 'email') AS email_templates;


-- ════════════════════════════════════════════════════════════
-- PART: migration_round4.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — Migration: round 4 (Nov 2026 follow-up meeting). Run in the Supabase SQL Editor. Safe to run multiple times.
-- Requires migration_dtc_v4.sql. Adds the "Relevant links" list that every DTC product can carry (Drive folder, Figma, photos, SOP…).
ALTER TABLE dtc_products ADD COLUMN IF NOT EXISTS relevant_links jsonb NOT NULL DEFAULT '[]'::jsonb;   -- [{ "label": "...", "url": "https://..." }]
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════
-- PART: migration_invoice_costing.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — Migration: landed-cost method and source-invoice links (Nov 2026)
-- Run in: Supabase dashboard → SQL Editor → New query → Run. Requires migration_dtc_invoices.sql. Safe to run multiple times.
--
-- Method (documented in docs/landed-cost-method.md):
--   cost per unit = (goods + photography + share of freight) / units on the FINAL invoice
--   share of freight = product gross weight / total gross weight on the packing list (volume, then pro-forma charge, then goods value as fallbacks)
-- These columns store what the split was based on, so every number can be traced.
ALTER TABLE dtc_invoice_lines ADD COLUMN IF NOT EXISTS gross_weight_kg numeric;
ALTER TABLE dtc_invoice_lines ADD COLUMN IF NOT EXISTS cbm numeric;
ALTER TABLE dtc_invoice_lines ADD COLUMN IF NOT EXISTS alloc_basis text;      -- gross_weight | cbm | proforma | goods_value | manual
-- Link to the original supplier document (Google Drive), shown next to every cost in Financials.
ALTER TABLE dtc_invoices ADD COLUMN IF NOT EXISTS source_url text;
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════
-- PART: data_invoice_costing_fix.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — landed-cost method fix (Nov 2026). Generated by scripts/build-invoice-costing-fix.mjs. Idempotent.
-- Run AFTER migration_invoice_costing.sql. Re-splits the freight of final invoices that cover several products by GROSS WEIGHT
-- (packing list) instead of the pro-forma charge, stores the weights, and refreshes each product's cost and final balance.

-- HVI2614.19: freight 1904.6 split by gross weight (220 kg)
UPDATE dtc_invoice_lines l SET gross_weight_kg = 176, cbm = 0.89376 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Flannel';
UPDATE dtc_invoice_lines l SET gross_weight_kg = 44, cbm = 0.215824 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Solid Black';
UPDATE dtc_invoice_lines l SET amount = 1523.68, alloc_basis = 'gross_weight', note = '2-way split of 1904.6 by gross weight on the packing list (80%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Flannel - Black/Yellow OG';
UPDATE dtc_invoice_lines l SET amount = 380.92, alloc_basis = 'gross_weight', note = '2-way split of 1904.6 by gross weight on the packing list (20%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Foreman Black Long Sleeve';

-- HVI2616.17.18: freight 3753 split by gross weight (216 kg)
UPDATE dtc_invoice_lines l SET gross_weight_kg = 72, cbm = 0.404096 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Solid Navy';
UPDATE dtc_invoice_lines l SET gross_weight_kg = 72, cbm = 0.404096 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Solid Olive';
UPDATE dtc_invoice_lines l SET gross_weight_kg = 72, cbm = 0.404096 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Hawaii subtle';
UPDATE dtc_invoice_lines l SET amount = 1251, alloc_basis = 'gross_weight', note = '3-way split of 3753 by gross weight on the packing list (33.33%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Foreman - Navy Blue Button Up';
UPDATE dtc_invoice_lines l SET amount = 1251, alloc_basis = 'gross_weight', note = '3-way split of 3753 by gross weight on the packing list (33.33%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Foreman - Olive Button Up';
UPDATE dtc_invoice_lines l SET amount = 1251, alloc_basis = 'gross_weight', note = '3-way split of 3753 by gross weight on the packing list (33.33%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Subtle Hawaiian Button Up';

-- HVI2621.25.26.27: freight 5755.9 split by gross weight (616 kg)
UPDATE dtc_invoice_lines l SET gross_weight_kg = 176, cbm = 0.89376 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Olive Flannel';
UPDATE dtc_invoice_lines l SET gross_weight_kg = 176, cbm = 0.89376 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Red Flannel';
UPDATE dtc_invoice_lines l SET gross_weight_kg = 88, cbm = 0.404096 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'New Lightning';
UPDATE dtc_invoice_lines l SET gross_weight_kg = 88, cbm = 0.404096 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'Pink New Lightning';
UPDATE dtc_invoice_lines l SET gross_weight_kg = 88, cbm = 0.440832 FROM dtc_invoices i WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'product' AND l.description = 'White Bucket Truck';
UPDATE dtc_invoice_lines l SET amount = 1644.54, alloc_basis = 'gross_weight', note = '5-way split of 5755.9 by gross weight on the packing list (28.57%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Flannel - Olive';
UPDATE dtc_invoice_lines l SET amount = 1644.54, alloc_basis = 'gross_weight', note = '5-way split of 5755.9 by gross weight on the packing list (28.57%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Flannel - Red';
UPDATE dtc_invoice_lines l SET amount = 822.27, alloc_basis = 'gross_weight', note = '5-way split of 5755.9 by gross weight on the packing list (14.29%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Arc Button Up - Blue';
UPDATE dtc_invoice_lines l SET amount = 822.27, alloc_basis = 'gross_weight', note = '5-way split of 5755.9 by gross weight on the packing list (14.29%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'Arc Button Up - Pink';
UPDATE dtc_invoice_lines l SET amount = 822.28, alloc_basis = 'gross_weight', note = '5-way split of 5755.9 by gross weight on the packing list (14.29%).' FROM dtc_invoices i, dtc_products p WHERE l.invoice_id = i.id AND i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.line_type = 'shipping' AND l.dtc_product_id = p.id AND p.name = 'White Bucket Truck Polo (Reorder)';

-- Product cost = every line of the final invoice allocated to the product; final balance = cost − deposit
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Flannel - Black/Yellow OG' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Flannel - Black/Yellow OG' AND f.invoice_number = 'HVI2614.19' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Foreman Black Long Sleeve' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Foreman Black Long Sleeve' AND f.invoice_number = 'HVI2614.19' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2614.19' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Foreman - Navy Blue Button Up' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Foreman - Navy Blue Button Up' AND f.invoice_number = 'HVI2616.17.18' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Foreman - Olive Button Up' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Foreman - Olive Button Up' AND f.invoice_number = 'HVI2616.17.18' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Subtle Hawaiian Button Up' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Subtle Hawaiian Button Up' AND f.invoice_number = 'HVI2616.17.18' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2616.17.18' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Flannel - Olive' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Flannel - Olive' AND f.invoice_number = 'HVI2621.25.26.27' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Flannel - Red' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Flannel - Red' AND f.invoice_number = 'HVI2621.25.26.27' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Arc Button Up - Blue' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Arc Button Up - Blue' AND f.invoice_number = 'HVI2621.25.26.27' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'Arc Button Up - Pink' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'Arc Button Up - Pink' AND f.invoice_number = 'HVI2621.25.26.27' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_products p SET est_cost = (SELECT round(sum(l.amount), 2) FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc') WHERE p.name = 'White Bucket Truck Polo (Reorder)' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');
UPDATE dtc_financials f SET final_amount = round(p.est_cost - coalesce(f.deposit_amount, 0), 2) FROM dtc_products p WHERE f.dtc_product_id = p.id AND p.name = 'White Bucket Truck Polo (Reorder)' AND f.invoice_number = 'HVI2621.25.26.27' AND EXISTS (SELECT 1 FROM dtc_invoice_lines l JOIN dtc_invoices i ON i.id = l.invoice_id WHERE i.invoice_number = 'HVI2621.25.26.27' AND i.doc_type = 'final' AND l.dtc_product_id = p.id AND l.allocation = 'dtc');


-- ════════════════════════════════════════════════════════════
-- PART: data_invoice_source_links.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — links from each saved invoice to the original document in the shared Drive folder (matched by file name). Idempotent.
-- Run AFTER migration_invoice_costing.sql.
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1j3kxzpZmXdFnHi2QcmgJyznggEJuspnp/view' WHERE file_name = 'HVI2618 - Neutral Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1AXfpOxJ5NoWYUAK327HwcJMkmOgcQz1u/view' WHERE file_name = 'HVI2625 - White Bucket Truck Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1DEeljmA1htXVtuGP3qDb0yDjpSXUc4Kw/view' WHERE file_name = 'Final Invoice HVI2621.23.25.26.27 - Olive Flannel, Red Flannel, Blue Arc Button Up, Pink Arc Button Up, White Bucket Truck Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1i_I7QfcthxvsKYfJUpbrI3By6ty-8Lrj/view' WHERE file_name = 'Final Invoice HVI2614.19 - Black Groundbreaker Flannel, Longsleeve Black Foreman.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1f5T3eSxi8Gr4DPAtvzxThxA7liYIwlfR/view' WHERE file_name = 'HVI2614 - Black Groundbreaker Flannel.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1vd9sOmDSi_wVQqjp3qxOYXehsukOYzum/view' WHERE file_name = 'HVI2626 - Blue Arc Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1-wvS1pi6y-izvP9qKoDN7fZ6MdS-I3Na/view' WHERE file_name = 'HVI2621 - Olive Flannel, Red Flannel.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1BEqjWgbk9vqXL5bvGJz02bqO0XDE--A4/view' WHERE file_name = 'HVI2627-1 Pink Arc Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1udJ887VngK2xdJqq9gzC6byxasybGG8A/view' WHERE file_name = 'HVI2628 - Navy Grey Flannel.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1Z1s0Pw5nQWn5Kw0HtE_n4-WeQfvswDsM/view' WHERE file_name = 'HVI2629 - Blackout Islander Button Up, Neon Islander Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1CTuuetOQFD8Sujja3EIY-aF2sAvdj7wb/view' WHERE file_name = 'HVI2624 - Black Performance Hoodie 2.0.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1PhSTKYYF6r4yyD8ZVCgd3R_TkBSXl-6U/view' WHERE file_name = 'Final Invoice HVI2620 - Black Overtime Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1YefTLqyg6hRmasl39nkJ4iaDVSjHL0-A/view' WHERE file_name = 'HVI2620 - Black Overtime Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1wM-iFcqqkppZkNx7dUe0LmFbWCEHqP6H/view' WHERE file_name = 'Final Invoice HVI2616.17.18 - Olive Button Up, Navy Button Up, Neutral Button Up, Olive Long Sleeve Samples.xlsx' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1IFvJri0TpkPoqHa3NCilMte-uK777sDn/view' WHERE file_name = 'HVI2630 - Sample Fee for Camo Polos.xls' AND source_url IS NULL;


-- ════════════════════════════════════════════════════════════
-- PART: migration_kpi.sql
-- ════════════════════════════════════════════════════════════
-- HVI CRM — Migration: Team Scorecard (KPIs) and Rocks
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Requires migration_user_management.sql (is_hvi_user / is_hvi_admin). Safe to run multiple times.
-- Everyone at HVI can read; only administrators can write.

-- ─── 1. KPI definitions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpis (
  id            uuid primary key default gen_random_uuid(),
  seed_key      text unique,                                         -- set on imported KPIs so re-running never duplicates them
  quarter       text not null,                                       -- '2026-Q4'
  name          text not null,
  owner_name    text not null default 'Company',
  group_name    text,                                                -- sub-heading inside an owner (e.g. "Repeat purchase rate")
  unit          text not null default 'count' check (unit in ('usd','pct','ratio','count')),
  target_value  numeric,                                             -- null = tracked, no target
  target_scope  text not null default 'week' check (target_scope in ('week','quarter','point')),
                                                                     -- week: per-week goal · quarter: goal for the whole quarter (weekly pace = target / 13) · point: level to reach (e.g. members)
  direction     text not null default 'higher' check (direction in ('higher','lower')),
  aggregation   text not null default 'none' check (aggregation in ('sum','avg','latest','none')),
  source        text not null default 'manual',                      -- manual now; shopify / klaviyo / meta / google / ga4 when connectors exist
  note          text,
  sort_order    int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS kpis_quarter_idx ON kpis (quarter, sort_order);

-- ─── 2. Weekly values (period_start = Monday) ──────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_values (
  id            uuid primary key default gen_random_uuid(),
  kpi_id        uuid not null references kpis(id) on delete cascade,
  period_start  date not null,
  value         numeric,
  qtd_value     numeric,                                             -- quarter-to-date as reported by the source tool (optional)
  note          text,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  unique (kpi_id, period_start)
);

-- ─── 3. Rocks (quarterly priorities) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS rocks (
  id          uuid primary key default gen_random_uuid(),
  seed_key    text unique,
  quarter     text not null,
  owner_name  text not null,
  position    int  not null default 1,
  title       text not null,
  tactics     text,
  status      text not null default 'not_started' check (status in ('not_started','in_progress','at_risk','done')),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS rocks_quarter_idx ON rocks (quarter, owner_name, position);

CREATE TABLE IF NOT EXISTS rock_kpis (
  rock_id uuid not null references rocks(id) on delete cascade,
  kpi_id  uuid not null references kpis(id)  on delete cascade,
  primary key (rock_id, kpi_id)
);

-- ─── 4. Row Level Security: read = any HVI user, write = administrators only ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpis','kpi_values','rocks','rock_kpis'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s read" ON %1$I',   t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s write" ON %1$I',  t);
    EXECUTE format('CREATE POLICY "%1$s read"  ON %1$I FOR SELECT TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s write" ON %1$I FOR ALL    TO authenticated USING (is_hvi_admin()) WITH CHECK (is_hvi_admin())', t);
  END LOOP;
END $$;

-- ─── 4b. Owners are real users, and founder-level KPIs are visible to administrators only (Nov 11 meeting) ──
ALTER TABLE kpis  ADD COLUMN IF NOT EXISTS owner_email text;                    -- matches app_users.email; owner_name stays as the display name
ALTER TABLE rocks ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE kpis  ADD COLUMN IF NOT EXISTS visibility  text NOT NULL DEFAULT 'team' CHECK (visibility IN ('team','founders'));

DROP POLICY IF EXISTS "kpis read" ON kpis;
CREATE POLICY "kpis read" ON kpis FOR SELECT TO authenticated USING (is_hvi_user() AND (visibility = 'team' OR is_hvi_admin()));
DROP POLICY IF EXISTS "kpi_values read" ON kpi_values;
CREATE POLICY "kpi_values read" ON kpi_values FOR SELECT TO authenticated
  USING (is_hvi_user() AND (is_hvi_admin() OR EXISTS (SELECT 1 FROM kpis k WHERE k.id = kpi_values.kpi_id AND k.visibility = 'team')));

-- ─── 5. Realtime (so the scorecard updates when an admin saves) ────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpis','kpi_values','rocks','rock_kpis'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════
-- PART: data_kpi_q4_2026.sql
-- ════════════════════════════════════════════════════════════
-- Generated by scripts/build-kpi-seed.mjs from the Notion exports (Q4 2026 KPIs and Rocks). Idempotent: never overwrites edits.
-- Run AFTER migration_kpi.sql.

INSERT INTO kpis (seed_key, quarter, name, owner_name, group_name, unit, target_value, target_scope, direction, aggregation, source, note, sort_order) VALUES
  ('dtc_revenue-2026-Q4', '2026-Q4', 'Weekly DTC revenue', 'Company', NULL, 'usd', 20000, 'week', 'higher', 'sum', 'shopify', NULL, 10),
  ('ad_spend_pct-2026-Q4', '2026-Q4', 'Ad spend as % of DTC revenue', 'Company', NULL, 'pct', 25, 'week', 'lower', 'none', 'meta', NULL, 20),
  ('klaviyo_pct-2026-Q4', '2026-Q4', 'Klaviyo revenue as % of DTC revenue', 'Company', NULL, 'pct', 35, 'week', 'higher', 'none', 'klaviyo', NULL, 30),
  ('ltv_cac-2026-Q4', '2026-Q4', 'LTV:CAC', 'Company', NULL, 'ratio', 2, 'week', 'higher', 'none', 'manual', NULL, 40),
  ('ltv_90-2026-Q4', '2026-Q4', '90-day LTV', 'Aira Viray', NULL, 'usd', 62, 'week', 'higher', 'latest', 'shopify', NULL, 50),
  ('repeat_q2-2026-Q4', '2026-Q4', 'Repeat purchase: Q2 2026 customers, 1st→2nd', 'Aira Viray', 'Repeat purchase rate', 'pct', 42, 'week', 'higher', 'latest', 'shopify', NULL, 60),
  ('repeat_q3-2026-Q4', '2026-Q4', 'Repeat purchase: Q3 2026 customers, 1st→2nd', 'Aira Viray', 'Repeat purchase rate', 'pct', 40, 'week', 'higher', 'latest', 'shopify', NULL, 70),
  ('fanatic_pct-2026-Q4', '2026-Q4', 'Fanatic development: 12-month customers with 3+ purchases', 'Aira Viray', NULL, 'pct', 15, 'week', 'higher', 'latest', 'shopify', NULL, 80),
  ('loyalty_members-2026-Q4', '2026-Q4', 'Loyalty program: active members', 'Aira Viray', 'Loyalty program', 'count', 3500, 'point', 'higher', 'latest', 'klaviyo', NULL, 90),
  ('loyalty_active-2026-Q4', '2026-Q4', 'Loyalty program: % of members purchasing in last 90 days', 'Aira Viray', 'Loyalty program', 'pct', 32, 'week', 'higher', 'latest', 'klaviyo', NULL, 100),
  ('loyalty_buyers-2026-Q4', '2026-Q4', 'Loyalty members who purchased (90 days)', 'Aira Viray', 'Loyalty program', 'count', NULL::numeric, 'week', 'higher', 'latest', 'klaviyo', NULL, 110),
  ('conversion-2026-Q4', '2026-Q4', 'Sitewide conversion rate', 'Kuerstine Geguira', NULL, 'pct', 4.5, 'week', 'higher', 'none', 'shopify', NULL, 120),
  ('organic_sessions-2026-Q4', '2026-Q4', 'Organic social sessions', 'Kuerstine Geguira', NULL, 'count', 8000, 'quarter', 'higher', 'sum', 'ga4', NULL, 130),
  ('cs_closed-2026-Q4', '2026-Q4', 'Customer service: closed inquiries', 'Kuerstine Geguira', 'Customer service (goal: 100% answered same day)', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 140),
  ('cs_open-2026-Q4', '2026-Q4', 'Customer service: open inquiries', 'Kuerstine Geguira', 'Customer service (goal: 100% answered same day)', 'count', 0, 'point', 'lower', 'latest', 'manual', NULL, 150),
  ('cs_reachouts-2026-Q4', '2026-Q4', 'Customer service: reachouts', 'Kuerstine Geguira', 'Customer service (goal: 100% answered same day)', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 160),
  ('orders_open-2026-Q4', '2026-Q4', 'Open orders (all vendors)', 'Kuerstine Geguira', 'Orders', 'count', NULL::numeric, 'week', 'lower', 'latest', 'manual', NULL, 170),
  ('orders_closed-2026-Q4', '2026-Q4', 'Closed orders (all vendors)', 'Kuerstine Geguira', 'Orders', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 180),
  ('open_hvi_items-2026-Q4', '2026-Q4', 'Open orders: HVI items', 'Kuerstine Geguira', 'Open orders by vendor', 'count', NULL::numeric, 'week', 'lower', 'latest', 'manual', NULL, 190),
  ('open_sw-2026-Q4', '2026-Q4', 'Open orders: SW', 'Kuerstine Geguira', 'Open orders by vendor', 'count', NULL::numeric, 'week', 'lower', 'latest', 'manual', NULL, 200),
  ('open_benchmark-2026-Q4', '2026-Q4', 'Open orders: Benchmark', 'Kuerstine Geguira', 'Open orders by vendor', 'count', NULL::numeric, 'week', 'lower', 'latest', 'manual', NULL, 210),
  ('open_coewear-2026-Q4', '2026-Q4', 'Open orders: Coewear', 'Kuerstine Geguira', 'Open orders by vendor', 'count', NULL::numeric, 'week', 'lower', 'latest', 'manual', NULL, 220),
  ('open_camel_city-2026-Q4', '2026-Q4', 'Open orders: Camel City', 'Kuerstine Geguira', 'Open orders by vendor', 'count', NULL::numeric, 'week', 'lower', 'latest', 'manual', NULL, 230),
  ('closed_hvi_items-2026-Q4', '2026-Q4', 'Closed orders: HVI items', 'Kuerstine Geguira', 'Closed orders by vendor', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 240),
  ('closed_strictly_wild-2026-Q4', '2026-Q4', 'Closed orders: Strictly Wild', 'Kuerstine Geguira', 'Closed orders by vendor', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 250),
  ('closed_benchmark_fr-2026-Q4', '2026-Q4', 'Closed orders: Benchmark FR', 'Kuerstine Geguira', 'Closed orders by vendor', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 260),
  ('closed_coewear-2026-Q4', '2026-Q4', 'Closed orders: Coewear', 'Kuerstine Geguira', 'Closed orders by vendor', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 270),
  ('closed_camel_city_mill-2026-Q4', '2026-Q4', 'Closed orders: Camel City Mill', 'Kuerstine Geguira', 'Closed orders by vendor', 'count', NULL::numeric, 'week', 'higher', 'sum', 'manual', NULL, 280),
  ('blended_roas-2026-Q4', '2026-Q4', 'Blended ROAS', 'Ryanne Amamagid', 'ROAS', 'ratio', NULL::numeric, 'week', 'higher', 'avg', 'meta', NULL, 290),
  ('meta_roas_7-2026-Q4', '2026-Q4', 'Meta ROAS (last 7 days)', 'Ryanne Amamagid', 'ROAS', 'ratio', 2.5, 'week', 'higher', 'none', 'meta', NULL, 300),
  ('meta_roas_14-2026-Q4', '2026-Q4', 'Meta ROAS (last 14 days)', 'Ryanne Amamagid', 'ROAS', 'ratio', 2.5, 'week', 'higher', 'none', 'meta', NULL, 310),
  ('google_roas_7-2026-Q4', '2026-Q4', 'Google ROAS (last 7 days)', 'Ryanne Amamagid', 'ROAS', 'ratio', 8.5, 'week', 'higher', 'none', 'google', NULL, 320),
  ('google_roas_14-2026-Q4', '2026-Q4', 'Google ROAS (last 14 days)', 'Ryanne Amamagid', 'ROAS', 'ratio', 8.5, 'week', 'higher', 'none', 'google', NULL, 330),
  ('ai_sessions-2026-Q4', '2026-Q4', 'AI-attributed sessions', 'Ryanne Amamagid', 'AI search (AEO)', 'count', 200, 'quarter', 'higher', 'sum', 'shopify', NULL, 340),
  ('ai_revenue-2026-Q4', '2026-Q4', 'AI-attributed revenue', 'Ryanne Amamagid', 'AI search (AEO)', 'usd', 2000, 'quarter', 'higher', 'sum', 'shopify', 'Notion note: $428.47 so far this quarter. No weekly breakdown was provided.', 350),
  ('creatives-2026-Q4', '2026-Q4', 'Ad creatives produced', 'Ryanne Amamagid', 'Creative output & performance', 'count', 8, 'week', 'higher', 'sum', 'manual', NULL, 360),
  ('ctr-2026-Q4', '2026-Q4', 'Ad CTR', 'Ryanne Amamagid', 'Creative output & performance', 'pct', 1.5, 'week', 'higher', 'avg', 'meta', NULL, 370),
  ('click_to_purchase-2026-Q4', '2026-Q4', 'Click-to-purchase rate', 'Ryanne Amamagid', 'Creative output & performance', 'pct', 5.5, 'week', 'higher', 'avg', 'meta', NULL, 380)
ON CONFLICT (seed_key) DO NOTHING;

UPDATE kpis SET aggregation = v.agg FROM (VALUES
  ('ltv_90-2026-Q4', 'latest'),
  ('repeat_q2-2026-Q4', 'latest'),
  ('repeat_q3-2026-Q4', 'latest'),
  ('fanatic_pct-2026-Q4', 'latest'),
  ('loyalty_members-2026-Q4', 'latest'),
  ('loyalty_active-2026-Q4', 'latest'),
  ('loyalty_buyers-2026-Q4', 'latest'),
  ('cs_closed-2026-Q4', 'sum'),
  ('cs_open-2026-Q4', 'latest'),
  ('cs_reachouts-2026-Q4', 'sum'),
  ('orders_open-2026-Q4', 'latest'),
  ('orders_closed-2026-Q4', 'sum'),
  ('open_hvi_items-2026-Q4', 'latest'),
  ('open_sw-2026-Q4', 'latest'),
  ('open_benchmark-2026-Q4', 'latest'),
  ('open_coewear-2026-Q4', 'latest'),
  ('open_camel_city-2026-Q4', 'latest'),
  ('closed_hvi_items-2026-Q4', 'sum'),
  ('closed_strictly_wild-2026-Q4', 'sum'),
  ('closed_benchmark_fr-2026-Q4', 'sum'),
  ('closed_coewear-2026-Q4', 'sum'),
  ('closed_camel_city_mill-2026-Q4', 'sum'),
  ('blended_roas-2026-Q4', 'avg'),
  ('ai_sessions-2026-Q4', 'sum'),
  ('ai_revenue-2026-Q4', 'sum'),
  ('creatives-2026-Q4', 'sum'),
  ('ctr-2026-Q4', 'avg'),
  ('click_to_purchase-2026-Q4', 'avg')
) AS v(seed_key, agg) WHERE kpis.seed_key = v.seed_key AND kpis.aggregation = 'none';

INSERT INTO kpi_values (kpi_id, period_start, value, qtd_value, updated_by)
SELECT k.id, v.d::date, v.val, v.q, 'notion-import' FROM (VALUES
  ('dtc_revenue-2026-Q4', '2026-11-02', 22061.1, NULL::numeric),
  ('dtc_revenue-2026-Q4', '2026-11-09', 16770.51, 114692.22),
  ('dtc_revenue-2026-Q4', '2026-10-12', 17673.4, NULL::numeric),
  ('dtc_revenue-2026-Q4', '2026-10-26', 22212.1, 75860.61),
  ('dtc_revenue-2026-Q4', '2026-10-05', 11971.55, NULL::numeric),
  ('dtc_revenue-2026-Q4', '2026-10-19', 30359.97, 55454.81),
  ('ad_spend_pct-2026-Q4', '2026-11-02', 29.68, NULL::numeric),
  ('ad_spend_pct-2026-Q4', '2026-11-09', 40.93, 30.72),
  ('ad_spend_pct-2026-Q4', '2026-10-12', 38.47, NULL::numeric),
  ('ad_spend_pct-2026-Q4', '2026-10-26', 29.32, 29.73),
  ('ad_spend_pct-2026-Q4', '2026-10-05', 52.92, NULL::numeric),
  ('ad_spend_pct-2026-Q4', '2026-10-19', 19.94, 32.18),
  ('klaviyo_pct-2026-Q4', '2026-11-02', 47.05, NULL::numeric),
  ('klaviyo_pct-2026-Q4', '2026-11-09', 21.22, 35.3),
  ('klaviyo_pct-2026-Q4', '2026-10-12', 19.65, NULL::numeric),
  ('klaviyo_pct-2026-Q4', '2026-10-26', 30.36, 31.08),
  ('klaviyo_pct-2026-Q4', '2026-10-05', 25.37, NULL::numeric),
  ('klaviyo_pct-2026-Q4', '2026-10-19', 42.6, 35),
  ('ltv_cac-2026-Q4', '2026-11-02', 2.78, NULL::numeric),
  ('ltv_cac-2026-Q4', '2026-11-09', 2.13, 1.59),
  ('ltv_cac-2026-Q4', '2026-10-12', 1.9, NULL::numeric),
  ('ltv_cac-2026-Q4', '2026-10-26', 2.36, 2.49),
  ('ltv_cac-2026-Q4', '2026-10-05', 1.52, NULL::numeric),
  ('ltv_cac-2026-Q4', '2026-10-19', 2.43, 1.87),
  ('ltv_90-2026-Q4', '2026-11-02', 61.61, NULL::numeric),
  ('ltv_90-2026-Q4', '2026-11-09', 61.27, NULL::numeric),
  ('ltv_90-2026-Q4', '2026-10-12', 56.87, NULL::numeric),
  ('ltv_90-2026-Q4', '2026-10-26', 61.86, NULL::numeric),
  ('ltv_90-2026-Q4', '2026-10-05', 57.09, NULL::numeric),
  ('ltv_90-2026-Q4', '2026-10-19', 56.92, NULL::numeric),
  ('repeat_q2-2026-Q4', '2026-11-02', 40.14, NULL::numeric),
  ('repeat_q2-2026-Q4', '2026-11-09', 40.4, NULL::numeric),
  ('repeat_q2-2026-Q4', '2026-10-12', 39.66, NULL::numeric),
  ('repeat_q2-2026-Q4', '2026-10-26', 39.96, NULL::numeric),
  ('repeat_q2-2026-Q4', '2026-10-05', 39.48, NULL::numeric),
  ('repeat_q2-2026-Q4', '2026-10-19', 39.79, NULL::numeric),
  ('repeat_q3-2026-Q4', '2026-11-02', 37.27, NULL::numeric),
  ('repeat_q3-2026-Q4', '2026-11-09', 37.46, NULL::numeric),
  ('repeat_q3-2026-Q4', '2026-10-12', 35.97, NULL::numeric),
  ('repeat_q3-2026-Q4', '2026-10-26', 36.81, NULL::numeric),
  ('repeat_q3-2026-Q4', '2026-10-05', 35.69, NULL::numeric),
  ('repeat_q3-2026-Q4', '2026-10-19', 36.3, NULL::numeric),
  ('fanatic_pct-2026-Q4', '2026-11-02', 13.81, NULL::numeric),
  ('fanatic_pct-2026-Q4', '2026-11-09', 13.75, NULL::numeric),
  ('fanatic_pct-2026-Q4', '2026-10-12', 13.37, NULL::numeric),
  ('fanatic_pct-2026-Q4', '2026-10-26', 13.69, NULL::numeric),
  ('fanatic_pct-2026-Q4', '2026-10-05', 13.4, NULL::numeric),
  ('fanatic_pct-2026-Q4', '2026-10-19', 13.44, NULL::numeric),
  ('loyalty_members-2026-Q4', '2026-10-12', 2528, NULL::numeric),
  ('loyalty_members-2026-Q4', '2026-10-05', 2496, NULL::numeric),
  ('loyalty_members-2026-Q4', '2026-10-19', 2565, NULL::numeric),
  ('loyalty_active-2026-Q4', '2026-11-02', 25.42, NULL::numeric),
  ('loyalty_active-2026-Q4', '2026-10-12', 26.93, NULL::numeric),
  ('loyalty_active-2026-Q4', '2026-10-26', 25.64, NULL::numeric),
  ('loyalty_active-2026-Q4', '2026-10-05', 28.68, NULL::numeric),
  ('loyalty_active-2026-Q4', '2026-10-19', 26.12, NULL::numeric),
  ('loyalty_buyers-2026-Q4', '2026-11-02', 680, NULL::numeric),
  ('loyalty_buyers-2026-Q4', '2026-10-12', 681, NULL::numeric),
  ('loyalty_buyers-2026-Q4', '2026-10-19', 670, NULL::numeric),
  ('conversion-2026-Q4', '2026-11-02', 3.9, 3.47),
  ('conversion-2026-Q4', '2026-11-09', 3.36, 3.45),
  ('conversion-2026-Q4', '2026-10-12', 3.26, 3.18),
  ('conversion-2026-Q4', '2026-10-26', 3.1, 3.29),
  ('conversion-2026-Q4', '2026-10-05', 2.81, 4.02),
  ('conversion-2026-Q4', '2026-10-19', 3.83, 3.35),
  ('organic_sessions-2026-Q4', '2026-11-02', 715, 2603),
  ('organic_sessions-2026-Q4', '2026-11-09', 282, 2763),
  ('organic_sessions-2026-Q4', '2026-10-12', 475, 907),
  ('organic_sessions-2026-Q4', '2026-10-26', 376, 1799),
  ('organic_sessions-2026-Q4', '2026-10-05', 546, 473),
  ('organic_sessions-2026-Q4', '2026-10-19', 560, 1383),
  ('cs_closed-2026-Q4', '2026-11-02', 41, NULL::numeric),
  ('cs_closed-2026-Q4', '2026-10-12', 22, NULL::numeric),
  ('cs_closed-2026-Q4', '2026-10-26', 28, NULL::numeric),
  ('cs_closed-2026-Q4', '2026-10-05', 32, NULL::numeric),
  ('cs_closed-2026-Q4', '2026-10-19', 27, NULL::numeric),
  ('cs_open-2026-Q4', '2026-11-02', 0, NULL::numeric),
  ('cs_open-2026-Q4', '2026-10-12', 1, NULL::numeric),
  ('cs_open-2026-Q4', '2026-10-26', 1, NULL::numeric),
  ('cs_open-2026-Q4', '2026-10-05', 0, NULL::numeric),
  ('cs_open-2026-Q4', '2026-10-19', 0, NULL::numeric),
  ('cs_reachouts-2026-Q4', '2026-11-02', 6, NULL::numeric),
  ('cs_reachouts-2026-Q4', '2026-10-12', 4, NULL::numeric),
  ('cs_reachouts-2026-Q4', '2026-10-26', 4, NULL::numeric),
  ('cs_reachouts-2026-Q4', '2026-10-05', 13, NULL::numeric),
  ('cs_reachouts-2026-Q4', '2026-10-19', 3, NULL::numeric),
  ('orders_open-2026-Q4', '2026-11-02', 30, NULL::numeric),
  ('orders_open-2026-Q4', '2026-10-12', 21, NULL::numeric),
  ('orders_open-2026-Q4', '2026-10-26', 80, NULL::numeric),
  ('orders_open-2026-Q4', '2026-10-05', 3, NULL::numeric),
  ('orders_open-2026-Q4', '2026-10-19', 23, NULL::numeric),
  ('orders_closed-2026-Q4', '2026-11-02', 75, NULL::numeric),
  ('orders_closed-2026-Q4', '2026-10-12', 0, NULL::numeric),
  ('orders_closed-2026-Q4', '2026-10-26', 0, NULL::numeric),
  ('orders_closed-2026-Q4', '2026-10-05', 4, NULL::numeric),
  ('orders_closed-2026-Q4', '2026-10-19', 0, NULL::numeric),
  ('open_hvi_items-2026-Q4', '2026-11-09', 3, NULL::numeric),
  ('open_sw-2026-Q4', '2026-11-09', 91, NULL::numeric),
  ('open_benchmark-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('open_coewear-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('open_camel_city-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('closed_hvi_items-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('closed_strictly_wild-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('closed_benchmark_fr-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('closed_coewear-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('closed_camel_city_mill-2026-Q4', '2026-11-09', 0, NULL::numeric),
  ('blended_roas-2026-Q4', '2026-11-02', 2.87, NULL::numeric),
  ('blended_roas-2026-Q4', '2026-11-09', 1.9, NULL::numeric),
  ('blended_roas-2026-Q4', '2026-10-12', 1.66, NULL::numeric),
  ('blended_roas-2026-Q4', '2026-10-26', 2.18, NULL::numeric),
  ('blended_roas-2026-Q4', '2026-10-05', 3, NULL::numeric),
  ('blended_roas-2026-Q4', '2026-10-19', 4.13, NULL::numeric),
  ('meta_roas_7-2026-Q4', '2026-11-02', 2.42, 2.15),
  ('meta_roas_7-2026-Q4', '2026-11-09', 1.79, 2.08),
  ('meta_roas_7-2026-Q4', '2026-10-12', 1.59, 1.56),
  ('meta_roas_7-2026-Q4', '2026-10-26', 1.61, 2.06),
  ('meta_roas_7-2026-Q4', '2026-10-05', 1.26, 1.55),
  ('meta_roas_7-2026-Q4', '2026-10-19', 3.45, 2.23),
  ('meta_roas_14-2026-Q4', '2026-11-02', 2.01, NULL::numeric),
  ('meta_roas_14-2026-Q4', '2026-11-09', 2.1, NULL::numeric),
  ('meta_roas_14-2026-Q4', '2026-10-12', 1.41, NULL::numeric),
  ('meta_roas_14-2026-Q4', '2026-10-26', 2.51, NULL::numeric),
  ('meta_roas_14-2026-Q4', '2026-10-05', 1.41, NULL::numeric),
  ('meta_roas_14-2026-Q4', '2026-10-19', 2.49, NULL::numeric),
  ('google_roas_7-2026-Q4', '2026-11-02', 6.37, 6.44),
  ('google_roas_7-2026-Q4', '2026-11-09', 2.6, 5.75),
  ('google_roas_7-2026-Q4', '2026-10-12', 2.3, 3.23),
  ('google_roas_7-2026-Q4', '2026-10-26', 7.27, 6.37),
  ('google_roas_7-2026-Q4', '2026-10-05', 3.19, 3.79),
  ('google_roas_7-2026-Q4', '2026-10-19', 9.47, 5.7),
  ('google_roas_14-2026-Q4', '2026-11-02', 7.12, NULL::numeric),
  ('google_roas_14-2026-Q4', '2026-11-09', 4.61, NULL::numeric),
  ('google_roas_14-2026-Q4', '2026-10-12', 2.85, NULL::numeric),
  ('google_roas_14-2026-Q4', '2026-10-26', 8.97, NULL::numeric),
  ('google_roas_14-2026-Q4', '2026-10-05', 5.06, NULL::numeric),
  ('google_roas_14-2026-Q4', '2026-10-19', 6.19, NULL::numeric),
  ('ai_sessions-2026-Q4', '2026-11-02', 16, 55),
  ('ai_sessions-2026-Q4', '2026-11-09', 15, 70),
  ('ai_sessions-2026-Q4', '2026-10-12', 7, 16),
  ('ai_sessions-2026-Q4', '2026-10-26', 8, 39),
  ('ai_sessions-2026-Q4', '2026-10-05', 9, 9),
  ('ai_sessions-2026-Q4', '2026-10-19', 15, 31),
  ('creatives-2026-Q4', '2026-11-02', 14, NULL::numeric),
  ('creatives-2026-Q4', '2026-11-09', 12, NULL::numeric),
  ('creatives-2026-Q4', '2026-10-12', 8, NULL::numeric),
  ('creatives-2026-Q4', '2026-10-26', 4, NULL::numeric),
  ('creatives-2026-Q4', '2026-10-05', 21, NULL::numeric),
  ('creatives-2026-Q4', '2026-10-19', 10, NULL::numeric),
  ('ctr-2026-Q4', '2026-11-02', 1.31, NULL::numeric),
  ('ctr-2026-Q4', '2026-11-09', 1.73, NULL::numeric),
  ('ctr-2026-Q4', '2026-10-12', 1.1, NULL::numeric),
  ('ctr-2026-Q4', '2026-10-26', 1.22, NULL::numeric),
  ('ctr-2026-Q4', '2026-10-05', 1.3, NULL::numeric),
  ('ctr-2026-Q4', '2026-10-19', 1.09, NULL::numeric),
  ('click_to_purchase-2026-Q4', '2026-11-02', 3.66, NULL::numeric),
  ('click_to_purchase-2026-Q4', '2026-11-09', 3.54, NULL::numeric),
  ('click_to_purchase-2026-Q4', '2026-10-12', 3.78, NULL::numeric),
  ('click_to_purchase-2026-Q4', '2026-10-26', 3.51, NULL::numeric),
  ('click_to_purchase-2026-Q4', '2026-10-05', 6.69, NULL::numeric),
  ('click_to_purchase-2026-Q4', '2026-10-19', 3.83, NULL::numeric)
) AS v(seed_key, d, val, q) JOIN kpis k ON k.seed_key = v.seed_key
ON CONFLICT (kpi_id, period_start) DO NOTHING;

INSERT INTO rocks (seed_key, quarter, owner_name, position, title, tactics, status) VALUES
  ('rock-2026-Q4-1', '2026-Q4', 'Aira Viray', 1, 'BFCM strategy lead', 'Lead the company''s BFCM strategy across email/SMS, paid media, organic social, and site: coordinating the DTC team on a unified campaign calendar, offer structure, and creative plan for the holidays.', 'not_started'),
  ('rock-2026-Q4-2', '2026-Q4', 'Aira Viray', 2, 'Repeat purchase and LTV', 'Maintain repeat purchase rate and LTV progress through existing flows and segmentation work while BFCM absorbs primary bandwidth.', 'not_started'),
  ('rock-2026-Q4-3', '2026-Q4', 'Aira Viray', 3, 'Loyalty program growth', 'Maintain loyalty program growth and 90-day activation rate through the quarter, including any BFCM-specific loyalty offers or tier incentives.', 'not_started'),
  ('rock-2026-Q4-4', '2026-Q4', 'Kuerstine Geguira', 1, 'Organic social strategy', 'Build and execute an organic social strategy to grow brand visibility and drive sessions aligned to the weekly drop schedule, including BFCM content and promotion support: content calendar aligned to product drops and holiday offers, daily posting across feed and stories, reposting UGC, and monitoring comments and DMs for engagement and customer support issues.', 'not_started'),
  ('rock-2026-Q4-5', '2026-Q4', 'Kuerstine Geguira', 2, 'Customer service and feedback system', 'Build and operationalize a customer service and feedback system that drives continuous improvement across the customer experience: templated responses for recurring inquiry types, returns and exchange tracking, monitoring and responding to reviews, and flagging recurring product or fulfillment issues to leadership.', 'not_started'),
  ('rock-2026-Q4-6', '2026-Q4', 'Kuerstine Geguira', 3, 'Sitewide conversion to 4.5%', 'Maintain and improve sitewide conversion rate to 4.5% through ongoing CRO and storefront operations, including BFCM site readiness: biweekly Clarity and GA4 reviews, friction point identification, holiday landing pages and checkout stress-testing, layout and messaging optimizations, and site speed and integration health checks.', 'not_started'),
  ('rock-2026-Q4-7', '2026-Q4', 'Ryanne Amamagid', 1, 'Meta creative strategy', 'Develop and execute a data-driven Meta creative strategy to reduce ad spend as a percentage of DTC revenue: producing 8 new creatives per week with sufficient diversity to address frequency issues, identifying top and bottom performers weekly using Motion data, and coordinating with Social Lite on creative performance feedback and testing priorities.', 'not_started'),
  ('rock-2026-Q4-8', '2026-Q4', 'Ryanne Amamagid', 2, 'AI-search visibility', 'Develop and execute an AI-search visibility strategy to grow AI-attributed sessions and revenue: expand tracking beyond ChatGPT to Perplexity, Gemini, and Copilot in GA4, audit and fix product page structure so AI crawlers can parse pricing, availability, and specs cleanly, build out FAQ and product Q&A content targeting the questions people actually ask AI about high voltage gear, and implement structured data (schema markup) across product and collection pages.', 'not_started'),
  ('rock-2026-Q4-9', '2026-Q4', 'Ryanne Amamagid', 3, 'BFCM paid media support', 'Support the company-wide BFCM strategy for the holidays with paid media, creative, and technical execution: holiday campaign structure, offer-aligned creative, and budget pacing across Meta and Google.', 'not_started')
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO rock_kpis (rock_id, kpi_id)
SELECT r.id, k.id FROM (VALUES
  ('rock-2026-Q4-1', 'dtc_revenue-2026-Q4'),
  ('rock-2026-Q4-1', 'ad_spend_pct-2026-Q4'),
  ('rock-2026-Q4-1', 'klaviyo_pct-2026-Q4'),
  ('rock-2026-Q4-2', 'ltv_90-2026-Q4'),
  ('rock-2026-Q4-2', 'repeat_q2-2026-Q4'),
  ('rock-2026-Q4-2', 'repeat_q3-2026-Q4'),
  ('rock-2026-Q4-2', 'fanatic_pct-2026-Q4'),
  ('rock-2026-Q4-3', 'loyalty_members-2026-Q4'),
  ('rock-2026-Q4-3', 'loyalty_active-2026-Q4'),
  ('rock-2026-Q4-3', 'loyalty_buyers-2026-Q4'),
  ('rock-2026-Q4-4', 'organic_sessions-2026-Q4'),
  ('rock-2026-Q4-5', 'cs_closed-2026-Q4'),
  ('rock-2026-Q4-5', 'cs_open-2026-Q4'),
  ('rock-2026-Q4-5', 'cs_reachouts-2026-Q4'),
  ('rock-2026-Q4-6', 'conversion-2026-Q4'),
  ('rock-2026-Q4-7', 'creatives-2026-Q4'),
  ('rock-2026-Q4-7', 'ctr-2026-Q4'),
  ('rock-2026-Q4-7', 'click_to_purchase-2026-Q4'),
  ('rock-2026-Q4-7', 'ad_spend_pct-2026-Q4'),
  ('rock-2026-Q4-8', 'ai_sessions-2026-Q4'),
  ('rock-2026-Q4-8', 'ai_revenue-2026-Q4'),
  ('rock-2026-Q4-9', 'meta_roas_7-2026-Q4'),
  ('rock-2026-Q4-9', 'google_roas_7-2026-Q4'),
  ('rock-2026-Q4-9', 'blended_roas-2026-Q4')
) AS l(rock_key, kpi_key)
JOIN rocks r ON r.seed_key = l.rock_key JOIN kpis k ON k.seed_key = l.kpi_key
ON CONFLICT DO NOTHING;
