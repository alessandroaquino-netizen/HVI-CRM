-- HVI CRM — Migration: round 5 (Nov 2026 requests). Run in the Supabase SQL Editor. Safe to run multiple times.
-- 1. A generic company email on Potential Leads (info@…) for when no named contact is found.
ALTER TABLE neca_leads ADD COLUMN IF NOT EXISTS company_email text;
-- 2. Invoices read from PDF text are labelled "pdf" (the extraction-method check only allowed rules / ai / manual / history).
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'dtc_invoices'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%extraction_method%' LOOP
    EXECUTE format('ALTER TABLE dtc_invoices DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE dtc_invoices ADD CONSTRAINT dtc_invoices_extraction_method_check CHECK (extraction_method IN ('rules','ai','manual','history','pdf'));
END $$;
NOTIFY pgrst, 'reload schema';
