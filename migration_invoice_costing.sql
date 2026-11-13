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
