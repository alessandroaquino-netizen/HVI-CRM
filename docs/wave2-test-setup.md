# Wave 2 on the TEST environment: what to run

Project: TEST Supabase `ymzeklhdzpmaakvlxrkx`. Nothing here touches production.

## 1. SQL (Supabase → SQL Editor, in this order; each file is safe to run again)

| File | What it adds |
|---|---|
| `migration_dtc_shipping.sql` | Shipping phase columns (skip if already run in TEST) |
| `migration_dtc_inventory.sql` | Inventory counts per product and size, audit log, seeded from the existing sizes |
| `migration_dtc_tracking.sql` | Carrier status columns for automatic tracking |
| `migration_dropflow.sql` | Marketing Ops: team roles, 53 task templates, drops, tasks, activity |
| `data_dropflow_test_drops.sql` | Optional: a drop plan with tasks for every product with a drop date in the next 120 days |

## 2. Access
Settings → User Management: give the team the new **Inventory** page (warehouse staff only need that one) and **Marketing Ops**.
Then, in Marketing Ops → Workflow settings → Team, type each person's login email so "My tasks" opens on their own work.

## 3. Optional services
- Tracking: `docs/shipment-tracking.md`
- Email thread dates with AI: `docs/email-dates.md`
