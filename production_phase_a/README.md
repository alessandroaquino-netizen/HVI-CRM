# Phase A — production SQL (run in order, PRODUCTION Supabase SQL editor)
00_migrations.sql  (NECA/Potential Leads v1–v3 + DTC invoices tables)
01–06 potential leads data (653 companies)
07 recompute scores + link to pipeline
08 researched qualification (top companies)
09 DTC invoice history (15 Bing Bing invoices; matches products by name, creates missing ones)
All files are idempotent. Merge the PR only after 00 has run.
