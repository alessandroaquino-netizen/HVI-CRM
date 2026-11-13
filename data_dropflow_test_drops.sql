-- HVI CRM — TEST data: create a marketing drop plan (with its tasks) for every DTC product that has a drop date in the next 120 days.
-- Run in the TEST Supabase SQL editor AFTER migration_dropflow.sql. Safe to run again: products that already have a drop are skipped,
-- and a task that already exists is never duplicated or reset.
-- Drop type is guessed from the product category (restock → restock, everything else → new product); change it in the app if needed.
-- Due dates are counted back from the product's drop date using the task templates (Friday = 0, Wednesday Vault = -2).

INSERT INTO drops (dtc_product_id, drop_type, launch_date, vault_date, stock_mode, phase, created_by)
SELECT p.id,
       CASE WHEN p.category = 'restock' THEN 'restock' ELSE 'new_product' END,
       p.drop_date, p.drop_date - 2, 'in_stock',
       CASE WHEN p.phase IN ('warehouse') THEN 'listing' WHEN p.phase IN ('production','shipping') THEN 'assets' ELSE 'brief' END,
       'seed'
FROM dtc_products p
WHERE p.drop_date BETWEEN current_date AND current_date + 120
  AND NOT EXISTS (SELECT 1 FROM drops d WHERE d.dtc_product_id = p.id);

INSERT INTO drop_tasks (drop_id, template_key, phase, title, owner_role, due_date, status, depends_on, blocker_group, note, link, sort)
SELECT d.id, t.key, t.phase, t.title, t.owner_role, d.launch_date + t.offset_days,
       CASE WHEN d.drop_type = ANY (t.na_for) THEN 'na' ELSE 'not_started' END,
       t.depends_on, t.blocker_group, t.description, t.sop_url, t.sort
FROM drops d
JOIN drop_task_templates t ON t.active
 AND (t.only_if IS NULL OR (t.only_if = 'preorder' AND d.stock_mode = 'preorder') OR (t.only_if = 'instock' AND d.stock_mode <> 'preorder'))
WHERE d.created_by = 'seed'
ON CONFLICT (drop_id, template_key) WHERE template_key IS NOT NULL DO NOTHING;

INSERT INTO drop_events (drop_id, kind, message, created_by)
SELECT d.id, 'created', 'Drop plan created from the product drop date (seed data).', 'seed'
FROM drops d WHERE d.created_by = 'seed'
  AND NOT EXISTS (SELECT 1 FROM drop_events e WHERE e.drop_id = d.id AND e.kind = 'created');

SELECT (SELECT count(*) FROM drops) AS drops, (SELECT count(*) FROM drop_tasks) AS tasks;
