# Production package, phase B (Nov 2026)

What goes to production: everything built in TEST since the shipping phase (calendar, inventory, tracking links, Marketing Ops, round 3 and 4,
landed-cost method, invoice verification, Scorecard & Rocks). What does **not** go: test data and dummy data (listed at the bottom).

**Shortcut:** `production_phase_b/01_run_in_order.sql` is steps 1 to 9 in one file (paste and run once, after the pre-check).

## Order (every file is idempotent: running it twice changes nothing)
Run in the **production** Supabase SQL Editor, one file at a time, **before** merging the pull request.

| # | File (repository root) | What it does | Needed by |
|---|---|---|---|
| 0 | `production_phase_b/00_precheck_READ_ONLY.sql` | Reads which migrations already ran. Changes nothing. | — |
| 1 | `migration_dtc_v4.sql` | Only if the pre-check says `dtc_products.priority` is missing | all DTC pages |
| 2 | `migration_dtc_inventory.sql` | Inventory tables and audit log | Inventory |
| 3 | `migration_dtc_tracking.sql` | Carrier status columns | Product shipping box |
| 4 | `migration_dropflow.sql` | Marketing Ops: roles, 53 task templates, drops, tasks | Marketing Ops, calendar |
| 5 | `migration_round3.sql` | Calendar events, drop-ship, production quotes, email phase | **Saving any DTC product** |
| 6 | `migration_round4.sql` | Relevant links on products | Product details |
| 7 | `migration_invoice_costing.sql` | Weight and source-link columns | Invoices, Financials |
| 8 | `data_invoice_costing_fix.sql` then `data_invoice_source_links.sql` | Re-splits freight by weight on the 3 multi-product final invoices; links the originals. **Only if the pre-check shows invoices > 0.** | Financials |
| 9 | `migration_kpi.sql` then `data_kpi_q4_2026.sql` | Scorecard & Rocks and the Q4 numbers | Scorecard |

Why the order matters: the app writes `dtc_products.fulfillment` every time a product is saved. If the code is merged before step 5, adding or editing a
DTC product fails until the SQL is run. Nothing else breaks without its SQL (the new pages show empty).

## After the merge (about 20 minutes)
1. Settings → User Management: give each person the pages they need (the new pages are off by default for members). First round: Products, Calendar, Marketing Ops; **not** Inventory.
2. Marketing Ops → Workflow settings → Team: choose each person's login (this is what fills "My tasks" and the Action Summary).
3. Scorecard & Rocks → Map owners: link Aira, Kuerstine and Ryanne to their logins once they are invited.
4. Founder-level KPIs: add them in Scorecard & Rocks with "Founders only" ticked (administrators only).
5. Smoke test with a real login: save a product, move a drop in the calendar, count an inventory row, open Invoices → Verification, save one Scorecard week.

## Not for production
`data_dropflow_test_drops.sql` (sample drops), `data_kpi_founder_dummy_TEST_ONLY.sql` (random founder numbers), the 2027 Q1 KPI copies created while testing, and the dev-only `?mock=1` mode.

## Rollback
All changes are additive (new tables and columns). Reverting the code (Netlify → previous deploy) restores the old screens; the new tables and columns are simply unused. The two data fixes only update
the freight split and the cost of 10 products; the previous values are in the git history of `data_dtc_invoice_history_test.sql` / `production_phase_a/09_dtc_invoice_history.sql`.
