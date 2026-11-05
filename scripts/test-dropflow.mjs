// node scripts/test-dropflow.mjs — checks the drop-workflow engine against the seeded templates.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../src/dropflow/engine.js';

// Read the seeded templates straight out of the migration so the test cannot drift from the SQL.
const sql = fs.readFileSync(new URL('../migration_dropflow.sql', import.meta.url), 'utf8');
const block = sql.slice(sql.indexOf('INSERT INTO drop_task_templates'), sql.indexOf('ON CONFLICT (key) DO NOTHING;', sql.indexOf('INSERT INTO drop_task_templates')));
const templates = [];
for (const line of block.split('\n')) {
  const m = line.match(/^\s*\('([a-z_]+)',\s*'(\w+)',\s*'((?:[^']|'')*)',\s*'(\w+)',\s*(-?\d+),\s*'\{([^}]*)\}',\s*'\{([^}]*)\}',\s*(NULL|'\w+'),\s*(NULL|'\w+'),\s*(\d+)/);
  if (!m) continue;
  templates.push({ key: m[1], phase: m[2], title: m[3].replace(/''/g, "'"), owner_role: m[4], offset_days: +m[5],
    depends_on: m[6] ? m[6].split(',') : [], na_for: m[7] ? m[7].split(',') : [], only_if: m[8] === 'NULL' ? null : m[8].replace(/'/g, ''), blocker_group: m[9] === 'NULL' ? null : m[9].replace(/'/g, ''), sort: +m[10] });
}
assert.ok(templates.length >= 50, `parsed ${templates.length} templates`);
const keys = new Set(templates.map(t => t.key));
for (const t of templates) for (const d of t.depends_on) assert.ok(keys.has(d), `${t.key} depends on unknown ${d}`);

// Dates
assert.equal(E.addDays('2026-11-27', -2), '2026-11-25');
assert.equal(E.weekday('2026-11-27'), 5);
assert.equal(E.nextFriday('2026-11-03'), '2026-11-06');
assert.equal(E.nextFriday('2026-11-06'), '2026-11-06');

// New product, in stock, launch Fri 2026-11-27
const drop = { launch_date: '2026-11-27', drop_type: 'new_product', stock_mode: 'in_stock' };
const tasks = E.generateTasks(drop, templates);
const by = Object.fromEntries(tasks.map(t => [t.template_key, t]));
assert.equal(by.email_teaser.due_date, '2026-11-23');       // Monday
assert.equal(by.v_email.due_date, '2026-11-25');            // Wednesday Vault
assert.equal(by.l_publish.due_date, '2026-11-27');          // Friday
assert.ok(!by.preorder_setup, 'pre-order task absent when in stock');
assert.ok(by.inventory_counts, 'inventory task present when in stock');
assert.equal(by.founder_draft.status, 'not_started');

// Restock: reuse tasks start as N/A, ads stay
const re = E.generateTasks({ ...drop, drop_type: 'restock' }, templates);
const rby = Object.fromEntries(re.map(t => [t.template_key, t]));
assert.equal(rby.walkthrough.status, 'na');
assert.equal(rby.founder_draft.status, 'na');
assert.equal(rby.ads_creative.status, 'not_started');
assert.equal(rby.hands_video.status, 'not_started', 'hands-only video is tracked on restocks too');

// Pre-order
const pre = E.generateTasks({ ...drop, stock_mode: 'preorder' }, templates);
assert.ok(pre.some(t => t.template_key === 'preorder_setup') && !pre.some(t => t.template_key === 'inventory_counts'));
const added = E.preorderTasks(drop, templates, new Set(tasks.map(t => t.template_key)));
assert.deepEqual(added.map(t => t.template_key).sort(), ['preorder_email', 'preorder_setup', 'preorder_site', 'preorder_social']);

// Moving the launch: completed / N/A / hand-set tasks never move
const rows = tasks.map((t, i) => ({ ...t, id: 't' + i }));
rows.find(t => t.template_key === 'copy_core').status = 'complete';
rows.find(t => t.template_key === 'banners').due_locked = true;
rows.find(t => t.template_key === 'founder_draft').status = 'na';
const tplByKey = Object.fromEntries(templates.map(t => [t.key, t]));
const moved = E.recalcDueDates(rows, '2026-11-27', '2026-12-04', tplByKey);
const mk = Object.fromEntries(moved.map(m => [rows.find(r => r.id === m.id).template_key, m]));
assert.ok(!mk.copy_core && !mk.banners && !mk.founder_draft);
assert.equal(mk.email_teaser.to, '2026-11-30');
assert.equal(mk.l_publish.to, '2026-12-04');
assert.equal(E.recalcDueDates(rows, '2026-11-27', '2026-11-27', tplByKey).length, 0);
// custom task keeps its distance from launch
const custom = [{ id: 'c1', template_key: null, status: 'not_started', due_date: '2026-11-20', due_locked: false, title: 'x', owner_role: 'ryanne' }];
assert.equal(E.recalcDueDates(custom, '2026-11-27', '2026-12-04', {})[0].to, '2026-11-27');

// Dependencies are soft: waiting is reported, never blocking
const byKey = E.tasksByKey(rows);
const info = E.taskInfo(byKey.email_teaser, byKey, '2026-11-20');
assert.deepEqual(info.waiting.map(t => t.template_key), ['shopify_placeholder']);   // copy_core is complete
assert.equal(info.ready, false);
byKey.shopify_placeholder.status = 'complete';
assert.equal(E.taskInfo(byKey.email_teaser, byKey, '2026-11-20').ready, true);
assert.equal(E.taskInfo(byKey.walkthrough, byKey, '2026-10-25').late, 0);
assert.ok(E.taskInfo(byKey.walkthrough, byKey, '2026-11-30').late > 0);

// Progress and blockers
const prog = E.dropProgress(rows, '2026-11-20');
assert.equal(prog.done, 2);
assert.ok(prog.total > 40 && prog.overdue > 0);
const dropRow = { id: 'd1', launch_date: '2026-11-27', dtc_product_id: 'p1' };
const withDrop = rows.map(r => ({ ...r, drop_id: 'd1' }));
const groups = E.blockersByGroup([dropRow], withDrop, () => 'Flannel - Red', '2026-11-20');
const photo = groups.find(g => g.id === 'photography');
assert.ok(photo && photo.items.every(i => i.product === 'Flannel - Red'));
assert.match(E.blockerText(photo, '2026-11-20'), /Photography and flat lays - open items/);
// a drop that launched long ago is not a blocker any more
assert.equal(E.blockersByGroup([{ ...dropRow, launch_date: '2026-01-02' }], withDrop, () => 'x', '2026-11-20').length, 0);

// Week plan
const wp = E.weekPlan(rows, '2026-11-27');
assert.deepEqual(wp.days.map(d => d.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
assert.ok(wp.days[2].tasks.some(t => t.template_key === 'v_email'));

console.log(`dropflow engine: ${templates.length} templates, all checks passed`);
