// Marketing Ops: product drop & pre-marketing workflow (board, my tasks, blockers, launch week, settings, drop detail).
// The view talks to the controller directly and asks main.js to reload through ctx.refresh().
import {
  createDrop, updateDrop, deleteDrop, moveLaunchDate, convertToPreorder, setTaskStatus, updateTask, addCustomTask, deleteTask,
  useWorkaround, clearWorkaround, saveTemplate, saveRole, applyTemplateToOpenTasks, setAssetCheck,
} from '../controllers/dropflow.js';
import {
  DROP_PHASES, DROP_TYPES, TASK_STATUSES, BLOCKER_GROUPS, ASSET_CHECKS, missingAssetLinks, isDone, isFriday, todayStr, addDays, diffDays, defaultVaultDate,
  taskInfo, tasksByKey, dropProgress, phaseProgress, blockersByGroup, blockerText, weekPlan, recalcDueDates,
} from '../dropflow/engine.js';
import { formatDate } from '../utils.js';
import { ink, fill } from '../theme.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const phaseOf = id => DROP_PHASES.find(p => p.id === id);
const typeLabel = id => DROP_TYPES.find(t => t.id === id)?.label || id;
const LAST_SEEN_KEY = 'hvi-dropflow-seen';

let ctx = null;             // { get: () => state, refresh: async () => void, canEditSettings: () => bool, email: () => string }
let tab = 'board';
let viewAs = null;          // role key or 'all'
let openDropId = null;
let weekSel = null;

export function initDropflow(c) { ctx = c; }
const S = () => ctx.get();
const roleName = (roles, key) => roles.find(r => r.role === key)?.display_name || key;
const dropName = (st, d) => st.products.find(p => p.id === d.dtc_product_id)?.name || 'Product';
const tasksOf = (st, dropId) => st.tasks.filter(t => t.drop_id === dropId);
const toast = msg => alert(msg);
async function run(fn, after = true) {
  try { await fn(); if (after) await ctx.refresh(); }
  catch (e) { toast('Could not save: ' + (e.message || e)); }
}

// ─── Entry point ──────────────────────────────────────────────────────────
export function renderMarketingOps() {
  const el = document.getElementById('dtcMarketingView');
  if (!el) return;
  const st = S();
  if (!st.loaded) {
    el.innerHTML = `<div class="panel" style="max-width:640px"><div class="panel-title">Marketing Ops is not set up in this database yet</div>
      <p style="color:var(--text2);font-size:14px;line-height:1.6">${esc(st.error || 'The drop workflow tables were not found.')} Run <b>migration_dropflow.sql</b> in the Supabase SQL editor, then reload.</p></div>`;
    return;
  }
  if (!viewAs) viewAs = defaultViewAs(st);
  const tabs = [['board', 'Board'], ['tracks', 'Tracks'], ['tasks', 'My tasks'], ['blockers', 'Blockers'], ['week', 'Launch week']];
  if (ctx.canEditSettings()) tabs.push(['settings', 'Workflow settings']);
  const late = st.tasks.filter(t => !isDone(t) && t.due_date && t.due_date < todayStr() && st.drops.some(d => d.id === t.drop_id && d.launch_date >= todayStr())).length;
  el.innerHTML = `
    <div class="mo-bar">
      <div class="mo-tabs" role="tablist">${tabs.map(([id, label]) => `<button class="mo-tab${tab === id ? ' active' : ''}" data-mo-tab="${id}" role="tab">${label}${id === 'tasks' && late ? ` <span class="mo-count">${late}</span>` : ''}</button>`).join('')}</div>
      <button class="btn btn-accent btn-sm" id="moNewDrop">＋ New drop</button>
    </div>
    <div id="moBody">${tab === 'board' ? boardHtml(st) : tab === 'tracks' ? tracksHtml(st) : tab === 'tasks' ? tasksHtml(st) : tab === 'blockers' ? blockersHtml(st) : tab === 'week' ? weekHtml(st) : settingsHtml(st)}</div>`;
  el.querySelectorAll('[data-mo-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.moTab; renderMarketingOps(); }));
  el.querySelector('#moNewDrop').addEventListener('click', () => openCreateDrop());
  wireBody(el, st);
  if (openDropId && document.getElementById('modalOverlay').classList.contains('hidden') === false && document.getElementById('modalBox').dataset.dropModal) renderDropModal(openDropId);
}

function defaultViewAs(st) {
  const mine = st.roles.filter(r => r.email && r.email.toLowerCase() === ctx.email()).map(r => r.role);
  return mine.length ? mine[0] : 'all';
}

// Filter by person: every tab can be narrowed to one team member's work.
function personFilter(st, extra = '') {
  return `<div class="mo-filter"><label>Person <select id="moViewAs"><option value="all"${viewAs === 'all' ? ' selected' : ''}>Everyone</option>${st.roles.map(r => `<option value="${r.role}"${viewAs === r.role ? ' selected' : ''}>${esc(r.display_name)}${r.email || r.is_external ? '' : ' (no login linked)'}</option>`).join('')}</select></label>${extra}</div>`;
}
const mineOnly = (st, dropId) => viewAs === 'all' || tasksOf(st, dropId).some(t => t.owner_role === viewAs && !isDone(t));

// ─── Board ────────────────────────────────────────────────────────────────
function inventoryLine(st, d) {
  const rows = st.inventory.filter(i => i.dtc_product_id === d.dtc_product_id);
  if (!rows.length) return '';
  const ordered = rows.reduce((a, r) => a + (r.qty_ordered || 0), 0);
  const sell = rows.filter(r => r.qty_sellable != null).reduce((a, r) => a + r.qty_sellable, 0);
  const entered = rows.some(r => r.qty_sellable != null);
  return `<div class="mo-meta">📦 ${entered ? `${sell} sellable${ordered ? ` of ${ordered} ordered` : ''}` : `${ordered || '—'} ordered, not counted yet`}</div>`;
}

function dropCard(st, d) {
  const ts = tasksOf(st, d.id);
  const pr = dropProgress(ts);
  const open = ts.filter(t => !isDone(t));
  const nextDue = open.filter(t => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const days = diffDays(d.launch_date, todayStr());
  return `<div class="lead-card mo-card" data-open-drop="${d.id}">
    <div class="lead-name">${esc(dropName(st, d))}</div>
    <div class="mo-meta">${esc(typeLabel(d.drop_type))} · launch ${formatDate(d.launch_date)}${days >= 0 ? ` (${days === 0 ? 'today' : days + 'd'})` : ' (launched)'}</div>
    <div class="mo-progress" title="${pr.done} of ${pr.total} tasks complete"><i style="width:${pr.pct}%"></i></div>
    <div class="mo-meta"><b>${pr.done}/${pr.total}</b> done${pr.overdue ? ` · <span style="color:var(--red)">${pr.overdue} overdue</span>` : ''}</div>
    <div class="mo-badges">
      ${d.stock_mode === 'preorder' ? '<span class="mo-badge" style="background:var(--tint-amber);color:var(--accent)">Pre-order</span>' : ''}
      ${d.ai_photo_in_use ? '<span class="mo-badge" style="background:var(--tint-blue, var(--bg4));color:var(--blue)">AI photos</span>' : ''}
      ${pr.workarounds ? `<span class="mo-badge">${pr.workarounds} workaround${pr.workarounds > 1 ? 's' : ''}</span>` : ''}
    </div>
    ${inventoryLine(st, d)}
    ${nextDue ? `<div class="mo-meta">Next: ${esc(nextDue.title.length > 44 ? nextDue.title.slice(0, 43) + '…' : nextDue.title)} · ${esc(roleName(st.roles, nextDue.owner_role))} · ${formatDate(nextDue.due_date)}</div>` : ''}
  </div>`;
}

function boardHtml(st) {
  const today = todayStr();
  const active = st.drops.filter(d => d.launch_date >= addDays(today, -14) && mineOnly(st, d.id));
  const withDrop = new Set(st.drops.map(d => d.dtc_product_id));
  const candidates = st.products.filter(p => p.drop_date && p.drop_date >= today && !withDrop.has(p.id)).sort((a, b) => a.drop_date.localeCompare(b.drop_date));
  const feed = recentEvents(st, null);
  return `
    ${personFilter(st, `<span class="mo-meta">${active.length} drop${active.length === 1 ? '' : 's'}${viewAs === 'all' ? '' : ' with open tasks for this person'}</span>`)}
    ${candidates.length ? `<div class="panel mo-candidates"><div class="panel-title">Products with a drop date but no drop plan<small>${candidates.length}</small></div>
      <div class="mo-chips">${candidates.map(p => `<button class="btn btn-sm" data-create-drop="${p.id}">＋ ${esc(p.name)} · ${formatDate(p.drop_date)}</button>`).join('')}</div></div>` : ''}
    ${feed.length ? `<div class="panel mo-feed"><div class="panel-title">Recent changes<small>${feed.length}</small></div>${feed.slice(0, 4).map(eventRow).join('')}</div>` : ''}
    <div class="pipeline-grid mo-board">
      ${DROP_PHASES.map(ph => {
        const ds = active.filter(d => d.phase === ph.id);
        return `<div class="stage-col"><div class="stage-header" style="border-color:${fill(ph.color)}"><span style="color:${ink(ph.color)}">${ph.label}</span><span class="stage-count">${ds.length}</span></div>
          <div>${ds.length ? ds.map(d => dropCard(st, d)).join('') : '<div class="empty-col">—</div>'}</div></div>`;
      }).join('')}
    </div>
    ${active.length ? '' : '<div style="color:var(--text3);margin-top:1rem">No drops yet. Create one from a product above, or use “New drop”.</div>'}`;
}

function eventRow(e) {
  return `<div class="mo-event"><span class="mo-ev-dot ev-${esc(e.kind)}"></span><div><div>${esc(e.message)}</div><div class="mo-meta">${new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${e.created_by ? ' · ' + esc(e.created_by.split('@')[0]) : ''}</div></div></div>`;
}

function recentEvents(st, dropId) {
  const seen = (() => { try { return localStorage.getItem(LAST_SEEN_KEY) || ''; } catch { return ''; } })();
  const roles = viewAs && viewAs !== 'all' ? [viewAs] : null;
  return st.events.filter(e => (!dropId || e.drop_id === dropId) && (dropId || ['date_changed', 'preorder', 'workaround'].includes(e.kind)) && (dropId || !seen || e.created_at > seen)
    && (dropId || !roles || !e.roles.length || e.roles.some(r => roles.includes(r)))).slice(0, 30);
}

// ─── My tasks ─────────────────────────────────────────────────────────────
function taskRow(st, t, withProduct = true) {
  const d = st.drops.find(x => x.id === t.drop_id);
  const byKey = tasksByKey(tasksOf(st, t.drop_id));
  const info = taskInfo(t, byKey);
  const dueTag = !info.open ? '' : info.late ? `<span class="tag-overdue">${info.late}d late</span>` : info.dueIn === 0 ? '<span class="tag-today">today</span>' : '';
  return `<div class="mo-task${isDone(t) ? ' done' : ''}">
    <input type="checkbox" class="mo-check" data-task-check="${t.id}" ${t.status === 'complete' ? 'checked' : ''} ${t.status === 'na' ? 'disabled' : ''} aria-label="Complete">
    <div class="mo-task-main" data-open-drop="${d?.id}" data-focus-task="${t.id}">
      <div class="mo-task-title">${esc(t.title)}</div>
      <div class="mo-meta">${withProduct && d ? `<b>${esc(dropName(st, d))}</b> · ` : ''}${esc(roleName(st.roles, t.owner_role))}${t.due_date ? ' · due ' + formatDate(t.due_date) : ''}
        ${info.waiting.length ? ` · <span class="mo-wait">waiting on ${esc(info.waiting.map(w => w.title.split(/[:(,]/)[0]).slice(0, 2).join(', '))}</span>` : ''}
        ${t.workaround ? ` · <span class="mo-badge">workaround: ${esc(t.workaround)}</span>` : ''}
        ${t.prev_due_date && t.due_changed_at && t.due_changed_at > (lastSeen() || '') ? ` · <span class="mo-badge" style="background:var(--tint-amber);color:var(--accent)">date moved from ${formatDate(t.prev_due_date)}</span>` : ''}</div>
    </div>${dueTag}</div>`;
}
const lastSeen = () => { try { return localStorage.getItem(LAST_SEEN_KEY); } catch { return null; } };

function tasksHtml(st) {
  const today = todayStr();
  const upcomingIds = new Set(st.drops.filter(d => d.launch_date >= addDays(today, -7)).map(d => d.id));
  let rows = st.tasks.filter(t => upcomingIds.has(t.drop_id) && (viewAs === 'all' || t.owner_role === viewAs));
  const open = rows.filter(t => !isDone(t)).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const overdue = open.filter(t => t.due_date && t.due_date < today);
  const week = open.filter(t => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7));
  const later = open.filter(t => !t.due_date || t.due_date > addDays(today, 7));
  const ready = open.filter(t => taskInfo(t, tasksByKey(tasksOf(st, t.drop_id))).ready).length;
  const feed = recentEvents(st, null);
  const sec = (title, list, color) => list.length ? `<div class="panel"><div class="panel-title" ${color ? `style="color:${color}"` : ''}>${title}<small>${list.length}</small></div>${list.map(t => taskRow(st, t)).join('')}</div>` : '';
  return `
    ${personFilter(st, `<span class="mo-meta">${open.length} open · ${ready} ready to start now</span>`)}
    ${feed.length ? `<div class="panel mo-feed"><div class="panel-title">Changes since you last looked<small>${feed.length}</small><button class="btn btn-sm btn-ghost" id="moSeen" style="margin-left:auto">Mark as seen</button></div>${feed.slice(0, 6).map(eventRow).join('')}</div>` : ''}
    ${sec('Overdue', overdue, 'var(--red)')}${sec('Due in the next 7 days', week)}${sec('Later', later)}
    ${open.length ? '' : '<div style="color:var(--text3)">Nothing open for this person. 🎉</div>'}`;
}

// ─── Tracks: every phase side by side, so concurrent work (creatives, emails, listing) is visible at a glance ───
function tracksHtml(st) {
  const today = todayStr();
  const drops = st.drops.filter(d => d.launch_date >= addDays(today, -14) && mineOnly(st, d.id));
  if (!drops.length) return personFilter(st) + '<div style="color:var(--text3)">No drops to show.</div>';
  return `${personFilter(st, '<span class="mo-meta">Each box is one phase: tasks done / total. Phases run in parallel; the highlighted one is where the drop sits on the board.</span>')}
    <div class="table-scroll"><table class="list-table mo-tracks"><thead><tr><th>Drop</th>${DROP_PHASES.map(p => `<th style="color:${ink(p.color)}">${p.short}</th>`).join('')}</tr></thead><tbody>
    ${drops.map(d => { const ts = tasksOf(st, d.id).filter(t => viewAs === 'all' || t.owner_role === viewAs); const pp = phaseProgress(ts);
      return `<tr data-open-drop="${d.id}"><td data-label="Drop"><b>${esc(dropName(st, d))}</b><div class="mo-meta">${esc(typeLabel(d.drop_type))} · launch ${formatDate(d.launch_date)}</div></td>
        ${pp.map(x => { const pct = x.total ? Math.round(100 * x.done / x.total) : 0; const late = x.pending.filter(t => t.due_date && t.due_date < today).length;
          return `<td data-label="${x.short}" class="mo-track${x.id === d.phase ? ' here' : ''}">${x.total ? `<div class="mo-progress"><i style="width:${pct}%;background:${x.done === x.total ? 'var(--green)' : late ? 'var(--red)' : fill(x.color)}"></i></div><div class="mo-meta"><b>${x.done}/${x.total}</b>${late ? ` · <span style="color:var(--red)">${late} late</span>` : ''}</div>` : '<span class="mo-meta">—</span>'}</td>`; }).join('')}</tr>`; }).join('')}
    </tbody></table></div>`;
}

// ─── Blockers ─────────────────────────────────────────────────────────────
function blockersHtml(st) {
  const groups = blockersByGroup(st.drops, st.tasks.filter(t => viewAs === 'all' || t.owner_role === viewAs), d => dropName(st, d));
  if (!groups.length) return personFilter(st) + '<div style="color:var(--text3)">No open blockers for this selection.</div>';
  return `${personFilter(st)}<div class="mo-note">Open items grouped by what they are waiting for, so one message can chase everything (for example every product still waiting for photos).</div>
    <div class="mo-groups">${groups.map(g => `<div class="panel"><div class="panel-title">${esc(g.label)}<small>${g.items.length} open${g.late ? `, ${g.late} late` : ''}</small>
      <button class="btn btn-sm btn-ghost" data-copy-group="${g.id}" style="margin-left:auto">Copy list</button></div>
      ${g.items.map(i => `<div class="mo-task"><div class="mo-task-main" data-open-drop="${i.drop.id}" data-focus-task="${i.task.id}"><div class="mo-task-title">${esc(i.product)}</div>
        <div class="mo-meta">${esc(i.task.title)} · ${esc(roleName(st.roles, i.task.owner_role))}${i.task.due_date ? ' · due ' + formatDate(i.task.due_date) : ''}${i.task.workaround ? ` · <span class="mo-badge">workaround: ${esc(i.task.workaround)}</span>` : ''}</div></div>
        ${i.late ? `<span class="tag-overdue">${i.late}d late</span>` : ''}</div>`).join('')}</div>`).join('')}</div>`;
}

// ─── Launch week ──────────────────────────────────────────────────────────
function weekHtml(st) {
  const launches = [...new Set(st.drops.filter(d => d.launch_date >= addDays(todayStr(), -6)).map(d => d.launch_date))].sort();
  if (!launches.length) return '<div style="color:var(--text3)">No upcoming launches.</div>';
  if (!weekSel || !launches.includes(weekSel)) weekSel = launches[0];
  const drops = st.drops.filter(d => d.launch_date === weekSel);
  const cols = [-4, -3, -2, -1, 0].map(off => ({ off, date: addDays(weekSel, off), label: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][off + 4], items: [] }));
  for (const d of drops) for (const t of tasksOf(st, d.id)) {
    if (t.status === 'na' || !t.due_date) continue;
    const c = cols.find(x => x.date === t.due_date); if (c) c.items.push({ d, t });
  }
  const note = { '-2': 'Vault early access · email at 5 PM PT', 0: 'Public launch', '-4': 'Teaser email · ad creative starts' };
  return `<div class="mo-filter"><label>Launch week ending <select id="moWeek">${launches.map(l => `<option value="${l}"${l === weekSel ? ' selected' : ''}>${formatDate(l)}${isFriday(l) ? '' : ' (not a Friday)'}</option>`).join('')}</select></label>
    <span class="mo-meta">${drops.map(d => esc(dropName(st, d))).join(' · ')}</span></div>
    <div class="mo-week">${cols.map(c => `<div class="stage-col"><div class="stage-header"><span>${c.label}</span><span class="stage-count">${c.items.length}</span></div>
      <div class="mo-meta" style="margin:-4px 2px 8px">${formatDate(c.date)}${note[c.off] ? ' · ' + note[c.off] : ''}</div>
      ${c.items.length ? c.items.map(({ d, t }) => `<div class="lead-card mo-wtask${isDone(t) ? ' done' : ''}" data-open-drop="${d.id}" data-focus-task="${t.id}"><div class="lead-name" style="font-size:13px">${esc(t.title)}</div>
        <div class="mo-meta">${esc(dropName(st, d))} · ${esc(roleName(st.roles, t.owner_role))}${isDone(t) ? ' · ✓' : ''}</div></div>`).join('') : '<div class="empty-col">—</div>'}</div>`).join('')}</div>`;
}

// ─── Settings ─────────────────────────────────────────────────────────────
function userOptions(st, current) {
  const users = (st.users || []).filter(u => u.status !== 'disabled');
  const list = users.some(u => u.email === (current || '').toLowerCase()) || !current ? users : [...users, { email: current, full_name: current }];
  return list.map(u => `<option value="${esc(u.email)}"${u.email === (current || '').toLowerCase() ? ' selected' : ''}>${esc(u.full_name || u.email)} (${esc(u.email)})</option>`).join('');
}

function settingsHtml(st) {
  const phaseGroups = DROP_PHASES.map(ph => ({ ph, ts: st.templates.filter(t => t.phase === ph.id) })).filter(g => g.ts.length);
  return `<div class="mo-note"><b>Default timing.</b> Due dates are days from the public launch (Friday = 0, Wednesday Vault = −2, Monday = −4). Change a number, owner or the active switch and save: new drops use it from now on. Tick “apply to open tasks” to also update unfinished tasks of drops that have not launched.</div>
    <div class="panel"><div class="panel-title">Team<small>link each person to their login so “My tasks” opens on their own work</small></div>
      <div class="mo-roles">${st.roles.map(r => `<div class="mo-role"><b>${esc(r.display_name)}</b><select data-role-email="${r.role}"><option value="">${r.is_external ? 'External, no login needed' : '— Not linked —'}</option>${userOptions(st, r.email)}</select><button class="btn btn-sm" data-save-role="${r.role}">Save</button></div>`).join('')}</div></div>
    ${phaseGroups.map(({ ph, ts }) => `<div class="panel"><div class="panel-title" style="color:${ink(ph.color)}">${ph.label}<small>${ts.length} templates</small></div>
      <div class="mo-tpl-head"><span>Task</span><span>Owner</span><span>Days from launch</span><span>Active</span><span></span></div>
      ${ts.map(t => `<div class="mo-tpl" data-tpl="${t.key}"><span class="mo-tpl-title" title="${esc(t.description || '')}">${esc(t.title)}${t.na_for.length ? `<small> · starts N/A for ${t.na_for.map(typeLabel).join(', ').toLowerCase()}</small>` : ''}${t.only_if ? `<small> · ${t.only_if === 'preorder' ? 'pre-order only' : 'in-stock only'}</small>` : ''}</span>
        <select class="tpl-owner">${st.roles.map(r => `<option value="${r.role}"${r.role === t.owner_role ? ' selected' : ''}>${esc(r.display_name)}</option>`).join('')}</select>
        <input type="number" class="tpl-offset" value="${t.offset_days}" step="1">
        <input type="checkbox" class="tpl-active" ${t.active ? 'checked' : ''}>
        <span class="mo-tpl-actions"><label class="mo-meta"><input type="checkbox" class="tpl-apply" checked> apply to open tasks</label><button class="btn btn-sm" data-save-tpl="${t.key}">Save</button></span></div>`).join('')}</div>`).join('')}`;
}

// ─── Wiring for the tab bodies ────────────────────────────────────────────
function wireBody(el, st) {
  el.querySelectorAll('[data-open-drop]').forEach(c => c.addEventListener('click', e => {
    if (e.target.closest('.mo-check')) return;
    openDropId = c.dataset.openDrop; renderDropModal(openDropId, c.dataset.focusTask);
  }));
  el.querySelectorAll('[data-create-drop]').forEach(b => b.addEventListener('click', () => openCreateDrop(b.dataset.createDrop)));
  el.querySelectorAll('[data-task-check]').forEach(cb => cb.addEventListener('change', () => {
    const t = st.tasks.find(x => x.id === cb.dataset.taskCheck);
    run(() => setTaskStatus(t, cb.checked ? 'complete' : 'not_started'));
  }));
  el.querySelector('#moViewAs')?.addEventListener('change', e => { viewAs = e.target.value; renderMarketingOps(); });
  el.querySelector('#moWeek')?.addEventListener('change', e => { weekSel = e.target.value; renderMarketingOps(); });
  el.querySelector('#moSeen')?.addEventListener('click', () => { try { localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString()); } catch {} renderMarketingOps(); });
  el.querySelectorAll('[data-copy-group]').forEach(b => b.addEventListener('click', () => {
    const g = blockersByGroup(st.drops, st.tasks.filter(t => viewAs === 'all' || t.owner_role === viewAs), d => dropName(st, d)).find(x => x.id === b.dataset.copyGroup);
    navigator.clipboard?.writeText(blockerText(g)).then(() => { b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy list'; }, 1500); });
  }));
  el.querySelectorAll('[data-save-role]').forEach(b => b.addEventListener('click', () => {
    const r = b.dataset.saveRole; const email = el.querySelector(`[data-role-email="${r}"]`).value.trim().toLowerCase();
    run(() => saveRole(r, { email: email || null }));
  }));
  el.querySelectorAll('[data-save-tpl]').forEach(b => b.addEventListener('click', () => {
    const row = b.closest('[data-tpl]'); const key = b.dataset.saveTpl;
    const fields = { owner_role: row.querySelector('.tpl-owner').value, offset_days: parseInt(row.querySelector('.tpl-offset').value, 10) || 0, active: row.querySelector('.tpl-active').checked };
    run(async () => {
      await saveTemplate(key, fields);
      if (row.querySelector('.tpl-apply').checked) { const n = await applyTemplateToOpenTasks(key, fields.offset_days, fields.owner_role, st.drops, st.tasks); if (n) toast(`Saved. ${n} open task${n > 1 ? 's' : ''} updated.`); }
    });
  }));
}

// ─── Create drop ──────────────────────────────────────────────────────────
function openCreateDrop(productId = null) {
  const st = S(); const box = document.getElementById('modalBox'); const overlay = document.getElementById('modalOverlay');
  const withDrop = new Set(st.drops.map(d => d.dtc_product_id));
  const options = st.products.filter(p => !withDrop.has(p.id)).sort((a, b) => (a.drop_date || '9999').localeCompare(b.drop_date || '9999'));
  const p0 = options.find(p => p.id === productId) || options[0];
  box.removeAttribute('data-drop-modal');
  box.innerHTML = `<div class="modal-header"><h3>New drop</h3><button class="btn btn-sm btn-ghost" id="cdClose">✕</button></div>
    <div class="modal-body">
      ${options.length ? `<div class="form-row"><label>Product</label><select id="cdProduct">${options.map(p => `<option value="${p.id}" ${p.id === p0?.id ? 'selected' : ''}>${esc(p.name)}${p.drop_date ? ' · ' + formatDate(p.drop_date) : ' · no drop date'}</option>`).join('')}</select></div>
      <div class="form-grid">
        <div class="form-row"><label>Drop type</label><select id="cdType">${DROP_TYPES.map(t => `<option value="${t.id}" ${(p0?.fulfillment === 'dropship' ? 'dropship' : p0?.category === 'restock' ? 'restock' : p0?.category === 'new-line' ? 'new_product' : 'colorway') === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
        <div class="form-row"><label>Inventory</label><select id="cdStock"><option value="in_stock">In stock at launch</option><option value="preorder">Pre-order</option></select></div>
        <div class="form-row"><label>Public launch date (Friday)</label><input type="date" id="cdLaunch" value="${p0?.drop_date || ''}"></div>
        <div class="form-row"><label>Vault early access</label><input type="date" id="cdVault" value="${p0?.drop_date ? defaultVaultDate(p0.drop_date) : ''}" disabled></div>
      </div>
      <div class="mo-note" id="cdHint"></div>` : '<p style="color:var(--text2)">Every product already has a drop plan.</p>'}
    </div>
    <div class="modal-footer"><button class="btn" id="cdCancel">Cancel</button>${options.length ? '<button class="btn btn-accent" id="cdSave">Create drop and tasks</button>' : ''}</div>`;
  overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');
  box.querySelector('#cdClose').addEventListener('click', close); box.querySelector('#cdCancel').addEventListener('click', close);
  if (!options.length) return;
  const hint = () => {
    const l = box.querySelector('#cdLaunch').value; box.querySelector('#cdVault').value = l ? defaultVaultDate(l) : '';
    box.querySelector('#cdHint').textContent = !l ? 'Set the launch date: every task due date is counted back from it.' : isFriday(l) ? 'Wednesday Vault will be two days earlier. Task due dates are counted back from this Friday.' : 'This is not a Friday. The usual cadence is Vault on Wednesday and public launch on Friday; check the date.';
  };
  box.querySelector('#cdLaunch').addEventListener('input', hint);
  box.querySelector('#cdProduct').addEventListener('change', e => { const p = options.find(x => x.id === e.target.value); box.querySelector('#cdLaunch').value = p?.drop_date || ''; hint(); });
  hint();
  box.querySelector('#cdSave').addEventListener('click', () => {
    const p = options.find(x => x.id === box.querySelector('#cdProduct').value); const launch = box.querySelector('#cdLaunch').value;
    if (!launch) return toast('Choose the launch date.');
    run(async () => { const d = await createDrop(p, { drop_type: box.querySelector('#cdType').value, stock_mode: box.querySelector('#cdStock').value, launch_date: launch }, S().templates); openDropId = d.id; close(); tab = 'board'; });
  });
}

// ─── Drop detail ──────────────────────────────────────────────────────────
export function renderDropModal(dropId, focusTaskId = null) {
  const st = S(); const d = st.drops.find(x => x.id === dropId); const overlay = document.getElementById('modalOverlay'); const box = document.getElementById('modalBox');
  if (!d) { overlay.classList.add('hidden'); return; }
  const name = dropName(st, d); const ts = tasksOf(st, d.id); const byKey = tasksByKey(ts); const pr = dropProgress(ts);
  const phases = phaseProgress(ts); const cur = DROP_PHASES.findIndex(p => p.id === d.phase);
  const prod = st.products.find(p => p.id === d.dtc_product_id);
  const checks = d.asset_checks || {};
  const needLinks = missingAssetLinks(checks);
  const taskLine = t => {
    const info = taskInfo(t, byKey);
    return `<div class="mo-trow${isDone(t) ? ' done' : ''}${focusTaskId === t.id ? ' focus' : ''}" data-task="${t.id}">
      <div class="mo-trow-top"><input type="checkbox" class="mo-check" data-chk ${t.status === 'complete' ? 'checked' : ''} ${t.status === 'na' ? 'disabled' : ''} aria-label="Complete">
        <div class="mo-task-title">${esc(t.title)}${t.is_replacement ? ' <span class="mo-badge">replacement</span>' : ''}</div>
        ${info.late ? `<span class="tag-overdue">${info.late}d late</span>` : ''}</div>
      <div class="mo-trow-ctl">
        <select data-owner>${st.roles.map(r => `<option value="${r.role}"${r.role === t.owner_role ? ' selected' : ''}>${esc(r.display_name)}</option>`).join('')}</select>
        <select data-status>${TASK_STATUSES.map(s => `<option value="${s.id}"${s.id === t.status ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
        ${!isDone(t) && !t.workaround ? '<button class="btn btn-sm btn-ghost" data-workaround title="Keep going with a fallback, e.g. temporary AI photography">Use workaround</button>' : ''}
        ${t.workaround ? '<button class="btn btn-sm btn-ghost" data-clear-workaround>Real asset arrived</button>' : ''}
        ${t.template_key && !t.template_key.endsWith('_replace') ? '' : '<button class="btn btn-sm btn-ghost" data-del title="Delete task">✕</button>'}
      </div>
      <div class="mo-meta">${t.due_date ? `due ${formatDate(t.due_date)} · ` : ''}${info.waiting.length ? `<span class="mo-wait">waiting on ${esc(info.waiting.map(w => w.title.split(/[:(,]/)[0]).slice(0, 2).join(', '))}</span> · ` : ''}${t.workaround ? `<span class="mo-badge">workaround: ${esc(t.workaround)}</span> · ` : ''}${t.prev_due_date && t.due_changed_at ? `date moved from ${formatDate(t.prev_due_date)} · ` : ''}${esc(t.note || '')}</div>
    </div>`;
  };
  box.dataset.dropModal = '1';
  box.innerHTML = `
    <div class="modal-header"><div><h3>${esc(name)}</h3><div class="mo-meta">${esc(typeLabel(d.drop_type))} · launch ${formatDate(d.launch_date)}${isFriday(d.launch_date) ? '' : ' (not a Friday)'} · Vault ${formatDate(d.vault_date || defaultVaultDate(d.launch_date))}</div></div>
      <div class="mo-head-actions"><button class="btn btn-sm" id="dMove">Move launch date</button>${d.stock_mode === 'preorder' ? '' : '<button class="btn btn-sm" id="dPreorder">Convert to pre-order</button>'}<button class="btn btn-sm btn-ghost" id="dClose">✕</button></div></div>
    <div class="modal-body">
      <div class="mo-summary">
        <div><div class="mo-progress big"><i style="width:${pr.pct}%"></i></div><div class="mo-meta"><b>${pr.done}/${pr.total}</b> tasks complete${pr.overdue ? ` · <span style="color:var(--red)">${pr.overdue} overdue</span>` : ''}${pr.workarounds ? ` · ${pr.workarounds} workaround${pr.workarounds > 1 ? 's' : ''}` : ''}</div></div>
        <div class="mo-badges">${d.stock_mode === 'preorder' ? `<span class="mo-badge" style="background:var(--tint-amber);color:var(--accent)">Pre-order${d.inventory_eta ? ' · stock ' + formatDate(d.inventory_eta) : ''}</span>` : '<span class="mo-badge">In stock at launch</span>'}${d.ai_photo_in_use ? '<span class="mo-badge" style="color:var(--blue)">Using AI photos</span>' : ''}</div>
      </div>
      <div class="section-divider">Phase</div>
      <div class="mo-phases">${DROP_PHASES.map((p, i) => { const pp = phases[i]; return `<button class="stage-pill${p.id === d.phase ? ' active' : ''}" data-phase="${p.id}" title="${pp.done}/${pp.total} done">${p.short} <small>${pp.done}/${pp.total}</small></button>`; }).join('')}</div>
      <div class="mo-note">Moving ahead is never blocked. If tasks of earlier phases are still open you will see them listed before confirming, and they stay on the board.</div>
      <div class="section-divider">Drive folder and assets</div>
      <div class="form-row"><label>Product folder (Google Drive)</label><div class="mo-link"><input type="url" id="dFolder" value="${esc(d.drive_folder || '')}" placeholder="https://drive.google.com/drive/folders/…">${d.drive_folder ? `<a class="btn btn-sm" href="${esc(d.drive_folder)}" target="_blank" rel="noopener">Open</a>` : ''}</div></div>
      <div class="mo-meta" style="margin-bottom:6px">Tick what is done. Campaign assets live in their own folders, so a tick asks for the link.</div>
      <div class="mo-checks">${ASSET_CHECKS.map(a => { const c = checks[a.key] || {}; return `<div class="mo-checkrow${a.link && c.done && !(c.link || '').trim() ? ' need' : ''}" data-check="${a.key}">
        <label class="mo-check-line" style="margin:0"><input type="checkbox" data-check-box ${c.done ? 'checked' : ''}> ${esc(a.label)}</label>
        ${a.link && c.done ? `<div class="mo-link"><input type="url" data-check-link value="${esc(c.link || '')}" placeholder="Link to the ${esc(a.label.toLowerCase())} (required)">${c.link ? `<a class="btn btn-sm" href="${esc(c.link)}" target="_blank" rel="noopener">Open</a>` : ''}<button class="btn btn-sm" data-check-save>Save link</button></div>` : ''}</div>`; }).join('')}</div>
      ${needLinks.length ? `<div class="mo-meta" style="color:var(--accent)">Link needed for: ${needLinks.map(a => a.label).join(', ')}.</div>` : ''}
      <div class="form-grid" style="margin-top:10px">
        <div class="form-row"><label>Drop type</label><select id="dType">${DROP_TYPES.map(t => `<option value="${t.id}"${t.id === d.drop_type ? ' selected' : ''}>${t.label}</option>`).join('')}</select></div>
        <div class="form-row"><label>Inventory ETA</label><input type="date" id="dEta" value="${d.inventory_eta || ''}"></div>
        <div class="form-row" style="grid-column:1/-1"><label>Notes</label><textarea id="dNotes" rows="2">${esc(d.notes || '')}</textarea></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin:8px 0 14px"><button class="btn btn-sm btn-accent" id="dSave">Save details</button></div>
      ${prod ? `<div class="mo-meta" style="margin-bottom:10px">Product: <a href="#" id="dOpenProduct">${esc(prod.name)}</a>${prod.drop_date && prod.drop_date !== d.launch_date ? ` · the product's drop date is ${formatDate(prod.drop_date)}` : ''}</div>` : ''}
      ${DROP_PHASES.map((p, i) => { const list = ts.filter(t => t.phase === p.id); if (!list.length) return ''; const pp = phases[i];
        return `<div class="section-divider" style="color:${ink(p.color)}">${p.label} <span class="mo-meta">${pp.done}/${pp.total}</span></div>${list.map(taskLine).join('')}`; }).join('')}
      <div class="section-divider">Add a task</div>
      <div class="mo-add"><input id="nTitle" placeholder="Task title"><select id="nPhase">${DROP_PHASES.map(p => `<option value="${p.id}">${p.short}</option>`).join('')}</select>
        <select id="nOwner">${st.roles.map(r => `<option value="${r.role}">${esc(r.display_name)}</option>`).join('')}</select><input type="date" id="nDue" value="${addDays(d.launch_date, -3)}"><button class="btn btn-sm" id="nAdd">Add</button></div>
      <div class="section-divider">Activity</div>
      ${recentEvents(st, d.id).map(eventRow).join('') || '<div class="mo-meta">No activity yet.</div>'}
      <div style="margin-top:18px"><button class="btn btn-sm btn-danger" id="dDelete">Delete this drop plan</button></div>
    </div>`;
  overlay.classList.remove('hidden');
  const reopen = () => renderDropModal(dropId);
  const q = s => box.querySelector(s);
  q('#dClose').addEventListener('click', () => { overlay.classList.add('hidden'); openDropId = null; box.removeAttribute('data-drop-modal'); });
  q('#dMove').addEventListener('click', () => openMoveLaunch(d));
  q('#dPreorder')?.addEventListener('click', () => openPreorder(d));
  q('#dOpenProduct')?.addEventListener('click', e => { e.preventDefault(); ctx.openProduct(prod.id); });
  box.querySelectorAll('[data-phase]').forEach(b => b.addEventListener('click', () => {
    const target = b.dataset.phase; if (target === d.phase) return;
    const tIdx = DROP_PHASES.findIndex(p => p.id === target);
    const pending = tIdx > cur ? ts.filter(t => DROP_PHASES.findIndex(p => p.id === t.phase) < tIdx && !isDone(t)) : [];
    if (pending.length && !confirm(`${pending.length} earlier task${pending.length > 1 ? 's are' : ' is'} still open:\n\n${pending.slice(0, 8).map(t => '• ' + t.title).join('\n')}${pending.length > 8 ? '\n…' : ''}\n\nMove to "${phaseOf(target).label}" anyway? They stay on the board.`)) return;
    run(async () => { await updateDrop(d.id, { phase: target }); });
  }));
  q('#dSave').addEventListener('click', () => {
    const fields = { drop_type: q('#dType').value, inventory_eta: q('#dEta').value || null, notes: q('#dNotes').value.trim() || null, drive_folder: q('#dFolder').value.trim() || null };
    run(() => updateDrop(d.id, fields));
  });
  box.querySelectorAll('[data-check]').forEach(row => {
    const key = row.dataset.check; const meta = ASSET_CHECKS.find(a => a.key === key);
    row.querySelector('[data-check-box]').addEventListener('change', e => run(() => setAssetCheck(d, ts, key, e.target.checked, meta.link ? (checks[key]?.link || '') : '')));
    row.querySelector('[data-check-save]')?.addEventListener('click', () => { const link = row.querySelector('[data-check-link]').value.trim(); if (!link) return toast('Add the link for ' + meta.label.toLowerCase() + '.'); run(() => setAssetCheck(d, ts, key, true, link)); });
  });
  q('#dDelete').addEventListener('click', () => { if (confirm('Delete this drop plan and all of its tasks? The product is not affected.')) run(async () => { await deleteDrop(d.id); overlay.classList.add('hidden'); openDropId = null; box.removeAttribute('data-drop-modal'); }); });
  q('#nAdd').addEventListener('click', () => { const title = q('#nTitle').value.trim(); if (!title) return; run(() => addCustomTask(d.id, { title, phase: q('#nPhase').value, owner_role: q('#nOwner').value, due_date: q('#nDue').value })); });
  box.querySelectorAll('[data-task]').forEach(row => {
    const t = ts.find(x => x.id === row.dataset.task);
    row.querySelector('[data-chk]')?.addEventListener('change', e => run(() => setTaskStatus(t, e.target.checked ? 'complete' : 'not_started')));
    row.querySelector('[data-status]').addEventListener('change', e => run(() => setTaskStatus(t, e.target.value)));
    row.querySelector('[data-owner]').addEventListener('change', e => run(() => updateTask(t.id, { owner_role: e.target.value })));
    row.querySelector('[data-workaround]')?.addEventListener('click', () => {
      const text = prompt('Which fallback is being used?', /photo/i.test(`${t.title} ${t.blocker_group}`) ? 'Approved temporary AI photography' : 'Temporary placeholder'); if (!text) return;
      run(() => useWorkaround(t, d, ts, text.trim(), name));
    });
    row.querySelector('[data-clear-workaround]')?.addEventListener('click', () => run(() => clearWorkaround(t, d, ts)));
    row.querySelector('[data-del]')?.addEventListener('click', () => { if (confirm('Delete this task?')) run(() => deleteTask(t.id)); });
  });
  if (focusTaskId) box.querySelector(`[data-task="${focusTaskId}"]`)?.scrollIntoView({ block: 'center' });
}

function openMoveLaunch(d) {
  const st = S(); const box = document.getElementById('modalBox'); const ts = tasksOf(st, d.id); const name = dropName(st, d);
  const tplByKey = Object.fromEntries(st.templates.map(t => [t.key, t]));
  box.removeAttribute('data-drop-modal');
  box.innerHTML = `<div class="modal-header"><h3>Move launch date</h3><button class="btn btn-sm btn-ghost" id="mvBack">✕</button></div>
    <div class="modal-body"><div class="form-grid"><div class="form-row"><label>Current public launch</label><input value="${formatDate(d.launch_date)}" disabled></div>
      <div class="form-row"><label>New public launch (Friday)</label><input type="date" id="mvDate" value="${d.launch_date}"></div></div>
      <div class="mo-note">Open tasks get new due dates counted from the new launch. Completed and N/A tasks, and due dates set by hand, do not change. The owners affected see the change in My tasks.</div>
      <div id="mvPreview"></div></div>
    <div class="modal-footer"><button class="btn" id="mvCancel">Back</button><button class="btn btn-accent" id="mvApply" disabled>Move launch date</button></div>`;
  const q = s => box.querySelector(s); const back = () => renderDropModal(d.id);
  q('#mvBack').addEventListener('click', back); q('#mvCancel').addEventListener('click', back);
  const preview = () => {
    const nd = q('#mvDate').value; const apply = q('#mvApply');
    if (!nd || nd === d.launch_date) { q('#mvPreview').innerHTML = ''; apply.disabled = true; return; }
    const ch = recalcDueDates(ts, d.launch_date, nd, tplByKey); apply.disabled = false;
    const late = diffDays(todayStr(), d.launch_date) > -5 && nd > d.launch_date;
    q('#mvPreview').innerHTML = `${isFriday(nd) ? '' : '<div class="mo-note" style="border-color:var(--accent)">The new date is not a Friday.</div>'}
      ${late ? '<div class="mo-note" style="border-color:var(--accent)">The Monday teaser may already be out. The default after the teaser is to keep the Friday launch and convert to pre-order instead of moving it.</div>' : ''}
      <div class="mo-meta"><b>${ch.length}</b> open task${ch.length === 1 ? '' : 's'} will be rescheduled:</div>
      ${ch.slice(0, 12).map(c => `<div class="mo-meta">• ${esc(c.title)} (${esc(roleName(st.roles, c.owner_role))}): ${formatDate(c.from)} → ${formatDate(c.to)}</div>`).join('')}${ch.length > 12 ? `<div class="mo-meta">…and ${ch.length - 12} more</div>` : ''}`;
  };
  q('#mvDate').addEventListener('input', preview);
  q('#mvApply').addEventListener('click', () => run(async () => { await moveLaunchDate(d, ts, q('#mvDate').value, st.templates, name); if (ctx.syncProductDate) await ctx.syncProductDate(d.dtc_product_id, q('#mvDate').value); }).then(() => renderDropModal(d.id)));
}

function openPreorder(d) {
  const st = S(); const box = document.getElementById('modalBox'); const name = dropName(st, d);
  box.removeAttribute('data-drop-modal');
  box.innerHTML = `<div class="modal-header"><h3>Convert to pre-order</h3><button class="btn btn-sm btn-ghost" id="poBack">✕</button></div>
    <div class="modal-body"><div class="mo-note">The Friday launch stays. The inventory task becomes N/A and four pre-order tasks are added: Shopify and shipping expectation (Kuerstine), email (Aira), banners and paid (Ryanne) and social (Kuerstine). Launch date and inventory ETA are tracked separately.</div>
      <div class="form-row"><label>Expected stock arrival (inventory ETA)</label><input type="date" id="poEta" value="${d.inventory_eta || ''}"></div></div>
    <div class="modal-footer"><button class="btn" id="poCancel">Back</button><button class="btn btn-accent" id="poApply">Convert to pre-order</button></div>`;
  const back = () => renderDropModal(d.id); box.querySelector('#poBack').addEventListener('click', back); box.querySelector('#poCancel').addEventListener('click', back);
  box.querySelector('#poApply').addEventListener('click', () => run(() => convertToPreorder(d, tasksOf(st, d.id), st.templates, { inventory_eta: box.querySelector('#poEta').value || null }, name)).then(() => renderDropModal(d.id)));
}

export function dropForProduct(drops, productId) { return drops.find(d => d.dtc_product_id === productId) || null; }
export function openDropModal(id) { openDropId = id; tab = 'board'; renderDropModal(id); }
export function openCreateDropFor(productId) { openCreateDrop(productId); }
