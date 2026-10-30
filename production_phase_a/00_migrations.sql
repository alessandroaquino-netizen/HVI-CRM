-- HVI CRM — PHASE A: production migrations (run ONCE, in this order, in the PRODUCTION Supabase SQL editor)
-- Contains: NECA/Potential Leads (v1, v2, v3) + DTC invoices. Idempotent: safe to re-run.
-- Prerequisites already in production: migration_user_management.sql (is_hvi_user()) and migration_dtc.sql … migration_dtc_v4.sql.


-- ═══════════ migration_neca_leads.sql ═══════════
-- HVI CRM — Migration: NECA Potential Leads (separate from the main leads table)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Safe to run multiple times.
-- Requires migration_user_management.sql / is_hvi_user() to already be applied.

CREATE TABLE IF NOT EXISTS neca_leads (
  id                    uuid primary key default gen_random_uuid(),
  neca_key              text unique,                 -- normalised company key — used to de-duplicate imports
  neca_member_ids       text[] not null default '{}', -- every NECA directory id (nid) merged into this company
  memberships_count     integer not null default 1,  -- number of chapter/division listings in the directory
  locations             text,                        -- summary of listed locations, e.g. "San Jose, CA; Phoenix, AZ"
  company               text not null,
  address               text,
  city                  text,
  state                 text,
  zip                   text,
  website               text,
  chapter               text,                        -- primary chapter
  division              text,                        -- primary division
  chapters              text,                        -- all chapters listed (summary)

  -- Qualification (Tony's framework: A 75–100, B 50–74, C < 50)
  qualification_status  text not null default 'unqualified'
                        check (qualification_status in ('unqualified','preliminary','researched')),
  tier                  text check (tier in ('A','B','C')),
  score                 integer check (score between 0 and 100),
  score_rationale       text,                        -- plain-English "why pursue / why not"
  buying_signals        text,                        -- events, recruiting, anniversaries, apparel, etc.
  suggested_angle       text,                        -- recommended opening line
  instagram             text,
  employee_estimate     text,

  -- Up to 3 contacts: [{ "role": "buyer|champion|executive", "name", "title", "email", "phone", "linkedin", "reason" }]
  contacts              jsonb not null default '[]'::jsonb,

  -- Outreach tracking
  outreach_status       text not null default 'not_contacted'
                        check (outreach_status in ('not_contacted','contacted','replied','meeting','not_interested')),
  last_contacted_at     date,
  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS neca_leads_tier_idx   ON neca_leads (tier);
CREATE INDEX IF NOT EXISTS neca_leads_state_idx  ON neca_leads (state);

CREATE OR REPLACE FUNCTION neca_leads_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS neca_leads_touch ON neca_leads;
CREATE TRIGGER neca_leads_touch BEFORE UPDATE ON neca_leads
  FOR EACH ROW EXECUTE FUNCTION neca_leads_touch_updated_at();

ALTER TABLE neca_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neca_leads read"   ON neca_leads;
DROP POLICY IF EXISTS "neca_leads insert" ON neca_leads;
DROP POLICY IF EXISTS "neca_leads update" ON neca_leads;
DROP POLICY IF EXISTS "neca_leads delete" ON neca_leads;

CREATE POLICY "neca_leads read"   ON neca_leads FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "neca_leads insert" ON neca_leads FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "neca_leads update" ON neca_leads FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "neca_leads delete" ON neca_leads FOR DELETE TO authenticated USING (is_hvi_user());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE neca_leads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT count(*) AS neca_leads_rows FROM neca_leads;

-- ═══════════ migration_neca_v2.sql ═══════════
-- HVI CRM — Migration: NECA Potential Leads v2
--   • per-factor score breakdown (Tony's 10-factor rubric) with verified / estimated / unverified status
--   • top executive + size band + research sources
--   • `source` column (future associations: IBEW, etc.)
--   • two-way link between neca_leads and leads, plus automatic matching
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Requires migration_neca_leads.sql. Safe to run multiple times.

-- ─── 1. Columns ────────────────────────────────────────────────────────────
ALTER TABLE neca_leads
  ADD COLUMN IF NOT EXISTS source              text    NOT NULL DEFAULT 'NECA',
  ADD COLUMN IF NOT EXISTS score_breakdown     jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS factors_evaluated   integer,
  ADD COLUMN IF NOT EXISTS employee_band       text CHECK (employee_band IN ('1-50','51-100','101-500','501-1000','1000+')),
  ADD COLUMN IF NOT EXISTS top_executive_name  text,
  ADD COLUMN IF NOT EXISTS top_executive_title text,
  ADD COLUMN IF NOT EXISTS research_sources    text,
  ADD COLUMN IF NOT EXISTS linked_lead_id      uuid REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_lead_id   uuid REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_reason    text;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS neca_lead_id uuid REFERENCES neca_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS neca_leads_linked_idx ON neca_leads (linked_lead_id);
CREATE INDEX IF NOT EXISTS neca_leads_source_idx ON neca_leads (source);
CREATE INDEX IF NOT EXISTS leads_neca_idx        ON leads (neca_lead_id);

-- ─── 2. Preliminary breakdown from directory data only ─────────────────────
-- Tony's rubric (100 pts): fit 20, 100+ employees 15, multiple locations 10, culture 10,
-- events 10, branded apparel 15, recruiting 5, marketing dept 5, HVI connection 5, Quanta/ecosystem 5.
CREATE OR REPLACE FUNCTION neca_prelim_breakdown(p_company text, p_chapters text, p_memberships integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  line_ch boolean := coalesce(p_chapters, '') ~* 'line (constructors|builders)';
  strong  boolean := coalesce(p_company, '')  ~* '(high[- ]?voltage|transmission|substation|power[- ]?lines?|line (construction|contractors?|builders?|services?)|linemen|lineman|utility (construction|contractors?|services?)|utilities)';
  n int := coalesce(p_memberships, 1);
  fit_e int; fit_s text; fit_n text;
  emp_e int := 0; emp_s text := 'unverified'; emp_n text := 'Employee count not yet researched.';
  loc_e int; loc_n text;
  pending text := 'Not yet researched.';
BEGIN
  IF line_ch THEN
    fit_e := 20; fit_s := 'verified';  fit_n := 'Member of a NECA Line Constructors / Line Builders chapter (transmission & distribution work).';
  ELSIF strong THEN
    fit_e := 20; fit_s := 'estimated'; fit_n := 'Company name points to utility / high-voltage line work.';
  ELSE
    fit_e := 10; fit_s := 'estimated'; fit_n := 'NECA electrical contractor with no specific high-voltage signal in the directory (half credit).';
  END IF;

  IF n >= 10 THEN emp_e := 15; emp_s := 'estimated'; emp_n := n || ' NECA listings suggest a large, multi-region company (100+ employees likely).';
  ELSIF n >= 5 THEN emp_e := 10; emp_s := 'estimated'; emp_n := n || ' NECA listings suggest a sizable company (100+ employees possible).';
  ELSIF n >= 3 THEN emp_e := 5;  emp_s := 'estimated'; emp_n := n || ' NECA listings suggest a mid-size company.';
  END IF;

  loc_e := CASE WHEN n >= 5 THEN 10 WHEN n >= 3 THEN 7 WHEN n = 2 THEN 4 ELSE 0 END;
  loc_n := n || ' NECA chapter/division listing' || CASE WHEN n = 1 THEN '' ELSE 's' END || '.';

  RETURN jsonb_build_array(
    jsonb_build_object('key','fit',            'label','Strong electrical / high-voltage fit',  'max',20,'earned',fit_e,'status',fit_s,        'note',fit_n),
    jsonb_build_object('key','employees',      'label','100+ employees',                        'max',15,'earned',emp_e,'status',emp_s,        'note',emp_n),
    jsonb_build_object('key','locations',      'label','Multiple crews / locations',            'max',10,'earned',loc_e,'status','verified',   'note',loc_n),
    jsonb_build_object('key','culture',        'label','Visible company culture / employee pride','max',10,'earned',0,'status','unverified',    'note',pending),
    jsonb_build_object('key','events',         'label','Attends conferences / events',          'max',10,'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','apparel',        'label','Already uses branded apparel',          'max',15,'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','recruiting',     'label','Recruiting / employer-branding activity','max',5,'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','marketing',      'label','Has a marketing department',            'max',5, 'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','hvi_connection', 'label','Known HVI connection / mutual relationship','max',5,'earned',0, 'status','unverified', 'note','No HVI relationship recorded.'),
    jsonb_build_object('key','quanta',         'label','Quanta / strategic ecosystem connection','max',5,'earned',0,   'status','unverified', 'note',pending)
  );
END $$;

-- ─── 3. Recompute score / tier / rationale from the breakdown ──────────────
-- Tier uses only factors that have been evaluated (verified or estimated):
--   score = earned / max of evaluated factors × 100;  A ≥ 75, B 50–74, C < 50.
--   A additionally requires the "100+ employees" factor to be evaluated (size evidence).
-- The "HVI connection" factor is driven by the link to the pipeline.
CREATE OR REPLACE FUNCTION neca_recompute(p_id uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  r record; bd jsonb; newbd jsonb; earned numeric; maxp numeric; evald int; n int := 0;
  sc int; tr text; txt text;
BEGIN
  FOR r IN SELECT * FROM neca_leads WHERE (p_id IS NULL OR id = p_id) LOOP
    bd := CASE WHEN jsonb_array_length(r.score_breakdown) = 0
               THEN neca_prelim_breakdown(r.company, coalesce(r.chapters, '') || ' ' || coalesce(r.chapter, ''), r.memberships_count)
               ELSE r.score_breakdown END;

    SELECT coalesce(jsonb_agg(
             CASE WHEN e.elem ->> 'key' = 'hvi_connection' THEN
               CASE WHEN r.linked_lead_id IS NOT NULL
                    THEN e.elem || jsonb_build_object('earned', (e.elem ->> 'max')::int, 'status', 'verified', 'note', 'Already a lead in the HVI pipeline.')
                    ELSE e.elem || jsonb_build_object('earned', 0, 'status', 'unverified', 'note', 'No HVI relationship recorded.')
               END
             ELSE e.elem END
             ORDER BY e.ord), '[]'::jsonb)
      INTO newbd
      FROM jsonb_array_elements(bd) WITH ORDINALITY AS e(elem, ord);

    SELECT coalesce(sum((x ->> 'earned')::numeric), 0), coalesce(sum((x ->> 'max')::numeric), 0), count(*)
      INTO earned, maxp, evald
      FROM jsonb_array_elements(newbd) x WHERE x ->> 'status' <> 'unverified';

    IF maxp > 0 THEN
      sc := round(100 * earned / maxp);
      tr := CASE WHEN sc >= 75 THEN 'A' WHEN sc >= 50 THEN 'B' ELSE 'C' END;
      -- A-tier needs size evidence: without an evaluated "100+ employees" factor the best tier is B.
      IF tr = 'A' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(newbd) x WHERE x ->> 'key' = 'employees' AND x ->> 'status' <> 'unverified') THEN
        tr := 'B';
      END IF;
    ELSE sc := NULL; tr := NULL; END IF;

    IF r.qualification_status = 'preliminary' THEN
      SELECT 'Preliminary ' || coalesce(sc::text, '—') || '/100, based on ' || evald || ' of 10 rubric factors (directory data only). '
             || coalesce(string_agg((x ->> 'label') || ' ' || (x ->> 'earned') || '/' || (x ->> 'max'), '; '), '')
             || '. ' || (10 - evald) || ' factors still need research (employees, culture, events, apparel, recruiting, marketing, ecosystem).'
        INTO txt
        FROM jsonb_array_elements(newbd) x WHERE x ->> 'status' <> 'unverified';
    ELSE txt := r.score_rationale; END IF;

    UPDATE neca_leads
       SET score_breakdown = newbd, score = sc, tier = tr, factors_evaluated = evald, score_rationale = txt
     WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ─── 4. Name normalisation + automatic matching against the pipeline ──────
CREATE OR REPLACE FUNCTION neca_norm_name(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(split_part(regexp_replace(lower(coalesce(t, '')), '\(.*?\)', ' ', 'g'), ' - ', 1), '\mdba\M.*$', '', 'g'),
               '[^a-z0-9& ]+', ' ', 'g'),
             '\m(inc|llc|co|corp|corporation|company|ltd|lp|llp|the|incorporated|pllc|pc)\M', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

-- Links a NECA company to a pipeline lead ONLY on a unique, exact match (same normalised name,
-- ignoring spaces — "Arch Key" = "ArchKey" — or same website/email domain with the same first
-- letters). Anything fuzzier becomes a *suggestion* for a person to confirm. Nothing is copied.
CREATE OR REPLACE FUNCTION neca_crosslink() RETURNS TABLE (auto_linked integer, suggestions integer)
LANGUAGE plpgsql AS $$
DECLARE linked_n int := 0; sugg_n int := 0;
BEGIN
  DROP TABLE IF EXISTS _m, _u;
  UPDATE neca_leads SET suggested_lead_id = NULL, suggested_reason = NULL WHERE linked_lead_id IS NULL;

  CREATE TEMP TABLE _m ON COMMIT DROP AS
  WITH n AS (
    SELECT id, replace(neca_norm_name(company), ' ', '') AS k,
           split_part(regexp_replace(lower(coalesce(website, '')), '^(https?://)?(www\.)?', ''), '/', 1) AS dom
    FROM neca_leads WHERE linked_lead_id IS NULL
  ), l AS (
    SELECT id, replace(neca_norm_name(company), ' ', '') AS k, lower(split_part(coalesce(email, ''), '@', 2)) AS dom
    FROM leads WHERE neca_lead_id IS NULL
  )
  SELECT DISTINCT n.id AS nid, l.id AS lid
  FROM n JOIN l ON (n.k = l.k AND length(n.k) >= 3)
                OR (n.dom <> '' AND n.dom = l.dom AND left(n.k, 4) = left(l.k, 4));

  CREATE TEMP TABLE _u ON COMMIT DROP AS
  SELECT nid, lid FROM _m
  WHERE nid IN (SELECT nid FROM _m GROUP BY nid HAVING count(*) = 1)
    AND lid IN (SELECT lid FROM _m GROUP BY lid HAVING count(*) = 1);

  UPDATE neca_leads nl SET linked_lead_id = u.lid FROM _u u WHERE nl.id = u.nid;
  GET DIAGNOSTICS linked_n = ROW_COUNT;
  UPDATE leads ld SET neca_lead_id = u.nid FROM _u u WHERE ld.id = u.lid;

  WITH n AS (SELECT id, replace(neca_norm_name(company), ' ', '') AS k FROM neca_leads WHERE linked_lead_id IS NULL),
       l AS (SELECT id, company, replace(neca_norm_name(company), ' ', '') AS k FROM leads WHERE neca_lead_id IS NULL),
       c AS (
         SELECT DISTINCT ON (n.id) n.id AS nid, l.id AS lid, l.company AS lname
         FROM n JOIN l ON least(length(n.k), length(l.k)) >= 5 AND (n.k LIKE l.k || '%' OR l.k LIKE n.k || '%')
         ORDER BY n.id, abs(length(n.k) - length(l.k))
       )
  UPDATE neca_leads nl SET suggested_lead_id = c.lid, suggested_reason = 'Similar name to pipeline lead "' || c.lname || '"'
  FROM c WHERE nl.id = c.nid;
  GET DIAGNOSTICS sugg_n = ROW_COUNT;

  PERFORM neca_recompute(id) FROM neca_leads WHERE linked_lead_id IS NOT NULL;
  RETURN QUERY SELECT linked_n, sugg_n;
END $$;

GRANT EXECUTE ON FUNCTION neca_recompute(uuid), neca_crosslink(), neca_prelim_breakdown(text, text, integer), neca_norm_name(text) TO authenticated;

-- ─── 5. Apply to existing rows ─────────────────────────────────────────────
-- (Rows already researched keep their own text; their breakdown is set by the research script.)
SELECT neca_recompute(NULL) AS rows_rescored;
SELECT * FROM neca_crosslink();

SELECT tier, count(*) FROM neca_leads GROUP BY tier ORDER BY tier;
SELECT company, tier, score, factors_evaluated, linked_lead_id IS NOT NULL AS linked, suggested_reason
FROM neca_leads WHERE linked_lead_id IS NOT NULL OR suggested_lead_id IS NOT NULL ORDER BY company LIMIT 50;

-- ═══════════ migration_dtc_invoices.sql ═══════════
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

-- ═══════════ migration_potential_leads_v3.sql ═══════════
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
