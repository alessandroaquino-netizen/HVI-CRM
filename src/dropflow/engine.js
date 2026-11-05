// Pure logic for the product-drop workflow (no DOM, no network) so it can be tested with `node scripts/test-dropflow.mjs`.
// Dates are plain 'YYYY-MM-DD' strings. A task's due date is the drop's public launch date plus the template's offset_days.

export const DROP_PHASES = [
  { id: 'brief',    label: 'Brief & product info',        short: 'Brief',    color: '9B7FE8' },
  { id: 'assets',   label: 'Photography & assets',        short: 'Assets',   color: '5B9CF6' },
  { id: 'listing',  label: 'Shopify listing & inventory', short: 'Listing',  color: 'F0C040' },
  { id: 'creative', label: 'Creative & campaigns',        short: 'Creative', color: 'E8874A' },
  { id: 'vault',    label: 'Wednesday Vault',             short: 'Vault',    color: '2FA4B8' },
  { id: 'launch',   label: 'Friday launch',               short: 'Launch',   color: '4CAF7D' },
  { id: 'post',     label: 'Post-launch',                 short: 'Post',     color: '8A8F98' },
];

export const DROP_TYPES = [
  { id: 'new_product', label: 'New product' },
  { id: 'colorway',    label: 'New colorway' },
  { id: 'restock',     label: 'Restock' },
];

export const TASK_STATUSES = [
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'complete',    label: 'Complete' },
  { id: 'na',          label: 'Not applicable' },
];

export const BLOCKER_GROUPS = {
  photography: 'Photography and flat lays',
  copy:        'Copy, pricing and product info',
  walkthrough: 'Tony walkthroughs',
  listing:     'Shopify listing',
  inventory:   'Inventory counts',
  creative:    'Creative and campaigns',
  launch:      'Launch readiness',
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isDone = t => t.status === 'complete' || t.status === 'na';
export { isDone };

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diffDays(a, b) { return Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000); }
export function weekday(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }
export function isFriday(dateStr) { return !!dateStr && weekday(dateStr) === 5; }
export function defaultVaultDate(launch) { return launch ? addDays(launch, -2) : null; }
export const todayStr = () => new Date().toISOString().slice(0, 10);

// First Friday on or after `from`.
export function nextFriday(from = todayStr()) {
  const w = weekday(from);
  return addDays(from, (5 - w + 7) % 7);
}

function appliesNow(tpl, stockMode) {
  if (tpl.active === false) return false;
  if (tpl.only_if === 'preorder') return stockMode === 'preorder';
  if (tpl.only_if === 'instock') return stockMode !== 'preorder';
  return true;
}

// Task rows for a new drop. Restock / colorway tasks that reuse existing assets start as N/A (still visible, easy to switch on).
export function generateTasks(drop, templates) {
  return templates
    .filter(t => appliesNow(t, drop.stock_mode))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map(t => ({
      template_key: t.key, phase: t.phase, title: t.title, owner_role: t.owner_role,
      due_date: addDays(drop.launch_date, t.offset_days ?? 0),
      status: (t.na_for || []).includes(drop.drop_type) ? 'na' : 'not_started',
      depends_on: t.depends_on || [], blocker_group: t.blocker_group || null, sort: t.sort ?? 0,
      note: t.description || null, link: t.sop_url || null, due_locked: false, is_replacement: false,
    }));
}

// Tasks to add when a drop is converted to pre-order (the pre-order-only templates not created yet).
export function preorderTasks(drop, templates, existingKeys) {
  return generateTasks({ ...drop, stock_mode: 'preorder' }, templates.filter(t => t.only_if === 'preorder'))
    .filter(t => !existingKeys.has(t.template_key));
}

// New due dates after the launch date moves. Only unfinished, not hand-set tasks move; completed work never changes.
// A task built from a template follows that template's offset; a custom task keeps its distance from the launch.
export function recalcDueDates(tasks, oldLaunch, newLaunch, templatesByKey = {}) {
  const delta = diffDays(newLaunch, oldLaunch);
  const out = [];
  for (const t of tasks) {
    if (isDone(t) || t.due_locked) continue;
    const tpl = t.template_key ? templatesByKey[t.template_key] : null;
    const due = tpl ? addDays(newLaunch, tpl.offset_days ?? 0) : (t.due_date ? addDays(t.due_date, delta) : null);
    if (due && due !== t.due_date) out.push({ id: t.id, title: t.title, owner_role: t.owner_role, from: t.due_date, to: due });
  }
  return out;
}

export function taskInfo(task, byKey, today = todayStr()) {
  const waiting = (task.depends_on || []).map(k => byKey[k]).filter(d => d && !isDone(d));
  const open = !isDone(task);
  const late = open && task.due_date && task.due_date < today ? diffDays(today, task.due_date) : 0;
  const dueIn = open && task.due_date ? diffDays(task.due_date, today) : null;
  return { waiting, late, dueIn, ready: open && waiting.length === 0, open };
}

export const tasksByKey = tasks => Object.fromEntries(tasks.filter(t => t.template_key).map(t => [t.template_key, t]));

export function dropProgress(tasks, today = todayStr()) {
  const live = tasks.filter(t => t.status !== 'na');
  const done = live.filter(t => t.status === 'complete').length;
  const overdue = live.filter(t => t.status !== 'complete' && t.due_date && t.due_date < today).length;
  return { total: live.length, done, pct: live.length ? Math.round((100 * done) / live.length) : 0, overdue,
           inProgress: live.filter(t => t.status === 'in_progress').length, workarounds: live.filter(t => t.workaround).length };
}

export function phaseProgress(tasks) {
  return DROP_PHASES.map(p => {
    const ts = tasks.filter(t => t.phase === p.id && t.status !== 'na');
    return { ...p, total: ts.length, done: ts.filter(t => t.status === 'complete').length, pending: ts.filter(t => t.status !== 'complete') };
  });
}

// Open items per blocker group across upcoming drops, ordered by due date. Used for "pending photography" style follow-ups.
export function blockersByGroup(drops, tasks, nameOf, today = todayStr()) {
  const groups = {};
  const dropsById = Object.fromEntries(drops.map(d => [d.id, d]));
  for (const t of tasks) {
    const d = dropsById[t.drop_id];
    if (!d || isDone(t) || !t.blocker_group || !BLOCKER_GROUPS[t.blocker_group]) continue;
    if (d.launch_date < addDays(today, -7)) continue;                       // finished long ago
    (groups[t.blocker_group] ||= []).push({ drop: d, task: t, product: nameOf(d), late: t.due_date && t.due_date < today ? diffDays(today, t.due_date) : 0 });
  }
  return Object.entries(groups).map(([id, items]) => ({
    id, label: BLOCKER_GROUPS[id], items: items.sort((a, b) => (a.task.due_date || '').localeCompare(b.task.due_date || '')),
    late: items.filter(i => i.late).length,
  })).sort((a, b) => b.late - a.late || b.items.length - a.items.length);
}

// Plain text to paste in a chat or email when following up on a group of blockers.
export function blockerText(group, today = todayStr()) {
  const lines = group.items.map(i => `- ${i.product}: ${i.task.title} (due ${i.task.due_date || 'no date'}${i.late ? `, ${i.late}d late` : ''}${i.task.workaround ? `, workaround: ${i.task.workaround}` : ''})`);
  return `${group.label} - open items as of ${today}\n${lines.join('\n')}`;
}

// Days of the launch week (Mon-Fri) with the tasks due on each.
export function weekPlan(tasks, launch) {
  const days = [];
  for (let off = -4; off <= 0; off++) {
    const date = addDays(launch, off);
    days.push({ date, offset: off, label: WEEKDAYS[weekday(date)], tasks: tasks.filter(t => t.due_date === date && t.status !== 'na') });
  }
  const before = tasks.filter(t => t.due_date && t.due_date < days[0].date && t.status !== 'na');
  const after = tasks.filter(t => t.due_date && t.due_date > launch && t.status !== 'na');
  return { days, before, after };
}

export function launchWeekRange(launch) { return { start: addDays(launch, -4), end: launch }; }
