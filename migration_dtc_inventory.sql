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
