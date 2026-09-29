-- HVI CRM — Data import: DTC products (production)
-- Run in: Supabase dashboard (PRODUCTION project rdjujywxmabvjbfxgepg) → SQL Editor → New query → Run
-- Requires migration_dtc.sql, migration_dtc_v2.sql, migration_dtc_v3.sql and migration_dtc_v4.sql
-- to already be applied on this project.
-- Safe to run multiple times: skips any row whose `name` already exists in dtc_products.
--
-- Source: "Tech Pack Tracker.xlsx" (Tony/Adriana baseline) cross-referenced against
-- Gmail correspondence with the manufacturer (Bing Bing) and designer (Steve) as of
-- 2026-09-29. Only active/ongoing pipeline products are included — anything already
-- delivered to the warehouse (Subtle Hawaiian Button Up, Black Overtime Polo) or purely
-- speculative backlog names from the Lucid board (no tech pack / no order placed) was
-- deliberately left out per your instruction to skip historical and speculative data.
--
-- ASAP-target products were left with drop_date = NULL (per your instruction).
-- "30 Days"-target products got drop_date estimated as order/approval date + 30 days
-- (flagged per-row below — these are estimates, not confirmed dates).

WITH new_products (name, product_type, category, phase, manufacturer, priority, drop_date, notes) AS (
  VALUES
  -- Tech pack complete, sample not yet started
  ('Blue Collar Button Up',          'button-up',              'new-design', 'tech-pack',  'bing-bing', 'low',    NULL::date, 'Tech pack complete, sample not started. Source: Tech Pack Tracker.'),
  ('Decoy - Black/White',            'button-up',              'new-design', 'tech-pack',  'bing-bing', 'low',    NULL::date, 'Tech pack complete, sample not started. Source: Tech Pack Tracker.'),
  ('Decoy - Brown',                  'button-up',              'new-design', 'tech-pack',  'bing-bing', 'low',    NULL::date, 'Tech pack complete, sample not started. Source: Tech Pack Tracker.'),
  ('Decoy - Dark Blue',              'button-up',              'new-design', 'tech-pack',  'bing-bing', NULL,     NULL::date, 'Tech pack complete, sample not started. Source: Tech Pack Tracker.'),
  ('Decoy - Light Blue',             'button-up',              'new-design', 'tech-pack',  'bing-bing', NULL,     NULL::date, 'Tech pack complete, sample not started. Source: Tech Pack Tracker.'),

  -- Foreman Black Long Sleeve — sparsest row in the tracker (only "Order placed: Yes" filled in)
  ('Foreman Black Long Sleeve',      'long-sleeve-button-up',  'new-design', 'tech-pack',  'bing-bing', NULL,     NULL::date, 'Very limited data in Tech Pack Tracker (only "Order Placed: Yes" filled in) — phase is a best guess, please confirm.'),

  -- Approved + order placed, no contradicting/updating Gmail thread found — kept at Excel status
  ('Foreman - Olive Button Up',      'button-up',              'new-design', 'production', 'bing-bing', 'high',   NULL::date, 'Sample approved, order placed. Source: Tech Pack Tracker (no newer Gmail update found).'),
  ('Foreman - Navy Blue Button Up',  'button-up',              'new-design', 'production', 'bing-bing', 'high',   NULL::date, 'Sample approved, order placed. Source: Tech Pack Tracker (no newer Gmail update found).'),
  ('Flannel - Black/Yellow OG',      'flannel',                'new-design', 'production', 'bing-bing', 'high',   NULL::date, 'Sample approved, order placed. Source: Tech Pack Tracker (no newer Gmail update found).'),
  ('Essentials Boardshorts',         'board-short',             'new-design', 'production', 'bing-bing', 'high',   NULL::date, 'Target Drop Date = ASAP in tracker → left blank per instruction.'),
  ('Lightning Boardshorts',          'board-short',             'new-design', 'production', 'bing-bing', 'high',   NULL::date, 'Target Drop Date = ASAP in tracker → left blank per instruction.'),
  ('HVI Jersey',                     'jersey',                  'new-design', 'production', 'bing-bing', 'high',   NULL::date, 'Target Drop Date = ASAP in tracker → left blank per instruction.'),

  -- Approved, sample order not yet placed
  ('USA Boardshorts',                'board-short',             'new-design', 'sampling',   'bing-bing', 'low',    '2027-06-01', 'Explicit target date from Tech Pack Tracker. Order not yet placed.'),

  -- Gmail-confirmed further along than the Excel snapshot
  ('Flannel - Red',                  'flannel',                'new-design', 'production', 'bing-bing', 'medium', NULL::date, 'Excel: sample approved 2026-09-14. Gmail (Bing Bing thread): approved for production and bulk production started 2026-09-15.'),
  ('Flannel - Olive',                'flannel',                'new-design', 'production', 'bing-bing', 'medium', NULL::date, 'Excel: sample approved 2026-09-14. Gmail (Bing Bing thread): approved for production and bulk production started 2026-09-15.'),
  ('Flannel - Blue/Grey',            'flannel',                'new-design', 'production', 'bing-bing', NULL,     NULL::date, 'Excel: waiting on sample, order placed 2026-09-13. Gmail (Bing Bing thread, HVI2628): bulk production started 2026-09-23.'),
  ('Arc Button Up - Blue',           'button-up',              'new-design', 'production', 'bing-bing', NULL,     '2026-10-11', 'Excel: waiting on sample. Gmail: approved for production 2026-09-11, bulk production started 2026-09-12. Drop date estimated as approval + 30 days (Excel''s own "Est. Production Time" for this row) — not a confirmed date.'),
  ('Arc Button Up - Pink',           'button-up',              'new-design', 'production', 'bing-bing', NULL,     '2026-10-20', 'Excel: waiting on sample, sample approved 2026-09-20. Gmail: bulk production started 2026-09-19/21. Drop date estimated as approval + 30 days — not a confirmed date.'),
  ('White Bucket Truck Polo (Reorder)', 'polo',                'restock',    'production', 'bing-bing', NULL,     '2026-09-25', 'Excel: reorder, order placed 2026-08-26, "30 Days" production time. Gmail: bulk production started 2026-08-31. Estimated drop date is already in the past — likely close to shipping/warehouse now, please confirm status with Bing Bing.'),

  -- Found only in Gmail, not in the Excel tracker at all
  ('Black Performance Hoodie 2.0',   'hoodie',                  'new-design', 'sampling',   'bing-bing', NULL,     NULL::date, 'Not in Tech Pack Tracker. Gmail (HVI2624 thread): still iterating on fit/pocket/cuff as of 2026-09-24. No target date given.'),
  ('Camo Style Polo',                'polo',                    'new-design', 'design',     NULL,        NULL,     NULL::date, 'Not in Tech Pack Tracker or Lucid board. Gmail (design thread with Steve, 2026-09-17): early concept/design stage, manufacturer not yet selected.'),
  ('Trucker Jacket',                 'other',                   'new-design', 'design',     NULL,        NULL,     NULL::date, 'Not in Tech Pack Tracker; matches a "Jacket (Design TBD)" sticky on the Lucid board. Gmail (design thread with Steve, 2026-09-14): early concept stage. Mapped to product_type "other" — no jacket type exists yet in the app, flag if you want one added.')
)
INSERT INTO dtc_products (name, product_type, category, phase, manufacturer, priority, drop_date, notes, phase_changed_at, last_activity)
SELECT np.name, np.product_type, np.category, np.phase, np.manufacturer, np.priority, np.drop_date, np.notes, current_date, current_date
FROM new_products np
LEFT JOIN dtc_products existing ON existing.name = np.name
WHERE existing.id IS NULL;

-- ─── Verify ────────────────────────────────────────────────────────────────
SELECT name, product_type, category, phase, manufacturer, priority, drop_date FROM dtc_products ORDER BY created_at;
