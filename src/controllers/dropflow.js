import { supabase } from '../supabase.js';
import { getMyEmailAddr } from '../access.js';
import { generateTasks, preorderTasks, recalcDueDates, defaultVaultDate, isDone, todayStr, taskForCheck } from '../dropflow/engine.js';

const me = () => getMyEmailAddr() || 'unknown';

// ─── Loading ──────────────────────────────────────────────────────────────
export async function fetchDropflow() {
  const [drops, tasks, templates, roles, events] = await Promise.all([
    supabase.from('drops').select('*').order('launch_date', { ascending: true }),
    supabase.from('drop_tasks').select('*').order('sort', { ascending: true }),
    supabase.from('drop_task_templates').select('*').order('sort', { ascending: true }),
    supabase.from('team_roles').select('*').order('sort', { ascending: true }),
    supabase.from('drop_events').select('*').order('created_at', { ascending: false }).limit(150),
  ]);
  for (const r of [drops, tasks, templates, roles, events]) if (r.error) throw r.error;
  return { drops: drops.data || [], tasks: tasks.data || [], templates: templates.data || [], roles: roles.data || [], events: events.data || [] };
}

export function subscribeToDropflow(onChange) {
  return supabase.channel('dropflow-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drops' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drop_tasks' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drop_events' }, onChange)
    .subscribe();
}

async function logEvent(dropId, kind, message, roles = [], taskId = null) {
  const { error } = await supabase.from('drop_events').insert({ drop_id: dropId, task_id: taskId, kind, message, roles, created_by: me() });
  if (error) console.warn('drop event not saved', error.message);
}

// ─── Drops ────────────────────────────────────────────────────────────────
// Creates the drop and its task list from the templates. product = { id, name, drop_date }.
export async function createDrop(product, { drop_type = 'new_product', stock_mode = 'in_stock', launch_date } = {}, templates) {
  const launch = launch_date || product.drop_date;
  if (!launch) throw new Error('Set a launch date first.');
  const row = { dtc_product_id: product.id, drop_type, stock_mode, launch_date: launch, vault_date: defaultVaultDate(launch), created_by: me() };
  const { data, error } = await supabase.from('drops').insert(row).select('*').single();
  if (error) throw error;
  const tasks = generateTasks(data, templates).map(t => ({ ...t, drop_id: data.id }));
  const ins = await supabase.from('drop_tasks').insert(tasks);
  if (ins.error) throw ins.error;
  await logEvent(data.id, 'created', `Drop created for ${product.name}: launch ${launch}, ${tasks.length} tasks.`);
  return data;
}

export async function updateDrop(id, fields) {
  const { error } = await supabase.from('drops').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteDrop(id) {
  const { error } = await supabase.from('drops').delete().eq('id', id);
  if (error) throw error;
}

// Moves the public launch date; every unfinished, not hand-set task gets a new due date and the affected owners are told.
export async function moveLaunchDate(drop, tasks, newLaunch, templates, productName = 'this drop') {
  const tplByKey = Object.fromEntries(templates.map(t => [t.key, t]));
  const changes = recalcDueDates(tasks, drop.launch_date, newLaunch, tplByKey);
  const now = new Date().toISOString();
  await updateDrop(drop.id, { launch_date: newLaunch, vault_date: defaultVaultDate(newLaunch) });
  await Promise.all(changes.map(c => supabase.from('drop_tasks').update({ due_date: c.to, prev_due_date: c.from, due_changed_at: now }).eq('id', c.id).then(r => { if (r.error) throw r.error; })));
  const roles = [...new Set(changes.map(c => c.owner_role))];
  await logEvent(drop.id, 'date_changed', `${productName}: launch moved from ${drop.launch_date} to ${newLaunch}. ${changes.length} open task${changes.length === 1 ? '' : 's'} rescheduled.`, roles);
  return changes;
}

// Delay after the Monday teaser: keep the Friday launch, switch to pre-order and add the pre-order messaging tasks.
export async function convertToPreorder(drop, tasks, templates, { inventory_eta = null } = {}, productName = 'this drop') {
  await updateDrop(drop.id, { stock_mode: 'preorder', inventory_eta });
  const extra = preorderTasks(drop, templates, new Set(tasks.map(t => t.template_key))).map(t => ({ ...t, drop_id: drop.id }));
  if (extra.length) { const r = await supabase.from('drop_tasks').insert(extra); if (r.error) throw r.error; }
  // The in-stock inventory task no longer applies.
  const inv = tasks.find(t => t.template_key === 'inventory_counts' && !isDone(t));
  if (inv) await updateTask(inv.id, { status: 'na', note: 'Pre-order: stock expected later.' });
  await logEvent(drop.id, 'preorder', `${productName}: converted to pre-order${inventory_eta ? ` (stock expected ${inventory_eta})` : ''}. Update Shopify, email, banners, social and paid messaging.`, ['kuerstine', 'aira', 'ryanne', 'adriana']);
}

// Ticks (or unticks) an asset on the checklist. The matching workflow task follows the tick, so nobody records the same thing twice.
export async function setAssetCheck(drop, tasks, key, done, link = '') {
  const checks = { ...(drop.asset_checks || {}) };
  checks[key] = { done, link: link.trim(), at: new Date().toISOString(), by: me() };
  await updateDrop(drop.id, { asset_checks: checks });
  const t = taskForCheck(tasks, key);
  if (t && t.status !== 'na') {
    if (done && t.status !== 'complete') await setTaskStatus(t, 'complete');
    if (!done && t.status === 'complete') await setTaskStatus(t, 'not_started');
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────
export async function updateTask(id, fields) {
  const { error } = await supabase.from('drop_tasks').update(fields).eq('id', id);
  if (error) throw error;
}

export async function setTaskStatus(task, status) {
  const done = status === 'complete';
  await updateTask(task.id, { status, completed_at: done ? new Date().toISOString() : null, completed_by: done ? me() : null });
}

export async function addCustomTask(dropId, { title, phase, owner_role, due_date }) {
  const { error } = await supabase.from('drop_tasks').insert({ drop_id: dropId, title, phase, owner_role, due_date: due_date || null, due_locked: !!due_date, sort: 900 });
  if (error) throw error;
}

export async function deleteTask(id) {
  const { error } = await supabase.from('drop_tasks').delete().eq('id', id);
  if (error) throw error;
}

// A task keeps moving with a fallback (e.g. temporary AI photos) and a replacement task stays open until the real asset arrives.
export async function useWorkaround(task, drop, tasks, text, productName = 'this drop') {
  await updateTask(task.id, { workaround: text, status: task.status === 'not_started' ? 'in_progress' : task.status });
  const repKey = `${task.template_key || 'task'}_replace`;
  const exists = tasks.some(t => t.template_key === repKey);
  if (!exists) {
    const r = await supabase.from('drop_tasks').insert({ drop_id: drop.id, template_key: repKey, phase: task.phase, title: `Replace workaround: ${task.title}`, owner_role: task.owner_role,
      due_date: drop.launch_date, depends_on: [], blocker_group: task.blocker_group, is_replacement: true, note: `Workaround in use: ${text}`, sort: 950 });
    if (r.error) throw r.error;
  }
  if (/photo/i.test(`${task.title} ${task.blocker_group}`)) await updateDrop(drop.id, { ai_photo_in_use: true });
  await logEvent(drop.id, 'workaround', `${productName}: "${task.title}" continues with a workaround (${text}). A replacement task is open.`, [task.owner_role]);
}

export async function clearWorkaround(task, drop, tasks) {
  await updateTask(task.id, { workaround: null });
  const rep = tasks.find(t => t.template_key === `${task.template_key || 'task'}_replace`);
  if (rep && !isDone(rep)) await setTaskStatus(rep, 'complete');
  if (!tasks.some(t => t.id !== task.id && t.workaround && /photo/i.test(`${t.title} ${t.blocker_group}`))) await updateDrop(drop.id, { ai_photo_in_use: false });
}

// ─── Settings (templates and team roles) ──────────────────────────────────
export async function saveTemplate(key, fields) {
  const { error } = await supabase.from('drop_task_templates').update({ ...fields, updated_by: me(), updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw error;
}

export async function saveRole(role, fields) {
  const { error } = await supabase.from('team_roles').update(fields).eq('role', role);
  if (error) throw error;
}

// Applies a changed template offset to the unfinished, not hand-set tasks of drops that have not launched yet.
export async function applyTemplateToOpenTasks(key, offset_days, owner_role, drops, tasks) {
  const upcoming = new Map(drops.filter(d => d.launch_date >= todayStr()).map(d => [d.id, d]));
  const rows = tasks.filter(t => t.template_key === key && upcoming.has(t.drop_id) && !isDone(t) && !t.due_locked);
  await Promise.all(rows.map(t => updateTask(t.id, { owner_role, due_date: new Date(new Date(upcoming.get(t.drop_id).launch_date + 'T00:00:00Z').getTime() + offset_days * 86400000).toISOString().slice(0, 10) })));
  return rows.length;
}
