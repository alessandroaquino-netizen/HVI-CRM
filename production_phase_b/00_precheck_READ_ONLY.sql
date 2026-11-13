-- HVI CRM — production pre-check (READ ONLY: it changes nothing). Run in the PRODUCTION Supabase SQL Editor and send the result.
-- It tells which migrations already ran, so the package in README.md can be run in the right order.
SELECT 'table: ' || t AS item, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) AS present
FROM unnest(ARRAY['app_users','dtc_products','dtc_invoices','dtc_invoice_lines','dtc_inventory','drops','drop_tasks','dtc_calendar_events','kpis','rocks']) AS t
UNION ALL
SELECT 'column: ' || c, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name || '.' || column_name = c)
FROM unnest(ARRAY['dtc_products.priority','dtc_products.carrier','dtc_products.tracking_status','dtc_products.fulfillment','dtc_products.relevant_links','dtc_invoice_lines.gross_weight_kg','dtc_invoices.source_url']) AS c
UNION ALL SELECT 'function: is_hvi_admin', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_hvi_admin')
ORDER BY 1;

-- Row counts that decide whether the invoice data fix applies (0 = the invoice history was never loaded in production)
SELECT (SELECT count(*) FROM dtc_invoices) AS invoices, (SELECT count(*) FROM dtc_invoice_lines) AS invoice_lines, (SELECT count(*) FROM dtc_products) AS products,
       (SELECT count(*) FROM app_users WHERE status = 'active') AS active_users;
