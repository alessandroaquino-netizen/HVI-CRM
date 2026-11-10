// DTC calendar: a 3-month outlook (month grids or a timeline) where product drops can be dragged to a new date.
import { ink } from '../theme.js';
import { SEASONAL_WINDOWS, KEY_DATES, MANUFACTURER_BLACKOUTS, blackoutsOn, blackoutWarnings, calcDropRisk, phaseDatesForProduct, PRODUCT_TYPES, PRODUCT_CATEGORIES, planBackward } from '../dtc_constants.js';
import { formatDate } from '../utils.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const isoDate = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PHASE_COLORS = { Design: '5B9CF6', Sampling: 'E8874A', Production: 'E05555', Shipping: '2FA4B8' };

let el = null; let st = { view: 'months', span: 3, year: null, month: null };
let props = null;            // { products, phaseDates, onMoveDrop, onPreview }

const hexRgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const tint = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };

// Events come from the database (editable). Until migration_round3.sql has run, the built-in dates are shown read-only.
function calEvents() {
  if (props.events?.length) return props.events;
  const key = KEY_DATES.map((k, i) => ({ id: null, label: k.label, start_date: k.date, end_date: null, color: k.color, kind: 'event', show_band: false, month: k.month, i }));
  const seasons = SEASONAL_WINDOWS.map(w => ({ id: null, label: w.label, start_date: w.start, end_date: w.end, color: w.color, kind: 'season', show_band: true, opacity: w.opacity }));
  return [...seasons, ...key.flatMap(k => k.month ? [k, { ...k, start_date: String(+k.start_date.slice(0, 4) + 1) + k.start_date.slice(4) }] : [k])];
}
const evEnd = e => e.end_date || e.start_date;
// Star: the drop date has passed but the goods are not in the warehouse yet (pre-order sold, still being made or shipped).
export const isDroppedNotArrived = (p, today = todayStr()) => !!p.drop_date && p.drop_date <= today && p.phase !== 'warehouse';

// Phase windows of a product: the estimate counted back from the drop date, replaced by dates saved by hand.
export function phaseWindows(product, overrides = []) {
  const est = phaseDatesForProduct(product) || [];
  return est.filter(w => w.label !== 'Drop').map(w => {
    const o = overrides.find(x => x.dtc_product_id === product.id && x.phase_key === w.label.toLowerCase());
    return { label: w.label, start: o?.planned_start || w.start, end: o?.planned_end || w.end, custom: !!o };
  });
}

// ─── Month grids ──────────────────────────────────────────────────────────
function monthGrid(year, month, products, today) {
  const days = daysInMonth(year, month); const firstWeekday = new Date(year, month, 1).getDay();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`; const isCurrent = today.startsWith(monthStr);
  const dropsByDay = {};
  products.forEach(p => { if (p.drop_date && p.drop_date.slice(0, 7) === monthStr) (dropsByDay[p.drop_date] ||= []).push(p); });
  const events = calEvents();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const cellHtml = day => {
    if (day === null) return '<div class="dtc-cal-cell dtc-cal-cell-empty"></div>';
    const dateStr = isoDate(year, month, day); const blackouts = blackoutsOn(dateStr);
    const covering = events.filter(e => dateStr >= e.start_date && dateStr <= evEnd(e));
    const band = covering.find(e => e.show_band && e.kind !== 'season') || covering.find(e => e.show_band);
    const boBg = blackouts.some(b => b.kind === 'closure') ? 'rgba(224,85,85,.16)' : blackouts.some(b => b.kind === 'delay') ? 'rgba(232,135,74,.12)' : blackouts.length ? 'rgba(224,85,85,.10)' : '';
    const bg = boBg || (band ? tint(band.color, band.opacity ?? (band.kind === 'season' ? 0.11 : 0.2)) : '');
    const labels = covering.filter(e => e.start_date === dateStr || (day === 1 && e.start_date < dateStr && e.kind !== 'season'));
    return `<div class="dtc-cal-cell${dateStr === today ? ' dtc-cal-cell-today' : ''}" data-date="${dateStr}" style="${bg ? `background:${bg}` : ''}">
      <div class="dtc-cal-daynum">${day}</div>
      ${blackouts.filter(b => b.start === dateStr).map(b => `<div class="dtc-cal-keydate" style="color:var(--red)" title="${esc(b.note)}">⛔ ${esc(b.label)}</div>`).join('')}
      ${labels.map(k => `<div class="dtc-cal-keydate${k.id ? ' editable' : ''}" ${k.id ? `data-edit-event="${k.id}"` : ''} style="color:${ink(k.color)}" title="${esc(k.label)}${k.end_date ? ` (${formatDate(k.start_date)} to ${formatDate(k.end_date)})` : ''}">${esc(k.label)}</div>`).join('')}
      ${(dropsByDay[dateStr] || []).map(p => {
        const risk = calcDropRisk(p); const color = risk === 'overdue' ? 'var(--red)' : risk === 'at-risk' ? 'var(--accent)' : 'var(--green)';
        const type = PRODUCT_TYPES.find(t => t.id === p.product_type)?.label || '';
        return `<div class="dtc-cal-drop" draggable="true" data-drag-dtc="${p.id}" data-open-dtc="${p.id}" style="background:${color}" title="${esc(p.name)} (${esc(p.phase)}). Drag to another day to move the drop.">
          <b>${isDroppedNotArrived(p, today) ? '<span class="cal-star" title="Dropped, still on its way to the warehouse">★</span> ' : ''}${esc(p.name)}</b><small>${esc(type)}${type ? ' · ' : ''}${esc(p.phase)}${p.fulfillment === 'dropship' ? ' · drop-ship' : ''}</small></div>`;
      }).join('')}
    </div>`;
  };
  return `<div class="dtc-cal-month${isCurrent ? ' dtc-cal-month-current' : ''}">
    <div class="dtc-cal-month-header"><span>${MONTH_NAMES[month]} ${year}</span>${isCurrent ? '<span class="dtc-cal-today-badge">TODAY</span>' : ''}</div>
    <div class="dtc-cal-weekdays">${WEEKDAY_NAMES.map(w => `<div>${w}</div>`).join('')}</div>
    <div class="dtc-cal-grid">${cells.map(cellHtml).join('')}</div></div>`;
}

// ─── Timeline (whiteboard-style) ──────────────────────────────────────────
function timeline(products, overrides, months, today) {
  const first = months[0]; const last = months[months.length - 1];
  const start = isoDate(first.year, first.month, 1); const end = isoDate(last.year, last.month, daysInMonth(last.year, last.month));
  const total = diffDays(end, start) + 1; const pct = d => (diffDays(d, start) / total) * 100;
  const rows = products.filter(p => p.drop_date).map(p => ({ p, w: phaseWindows(p, overrides) }))
    .filter(({ p, w }) => (p.drop_date >= start && p.drop_date <= end) || w.some(x => x.start <= end && x.end >= start))
    .sort((a, b) => a.p.drop_date.localeCompare(b.p.drop_date));
  const monthHead = months.map(m => `<div class="tl-month" style="left:${pct(isoDate(m.year, m.month, 1))}%;width:${(daysInMonth(m.year, m.month) / total) * 100}%">${MONTH_NAMES[m.month]} ${m.year}</div>`).join('');
  const weekLines = []; for (let d = start; d <= end; d = addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() === 1) weekLines.push(`<i class="tl-week" style="left:${pct(d)}%"></i>`);
  const bands = MANUFACTURER_BLACKOUTS.filter(b => b.kind !== 'cutoff' && b.start <= end && b.end >= start).map(b => {
    const s = b.start < start ? start : b.start; const e = b.end > end ? end : b.end;
    return `<i class="tl-band ${b.kind}" style="left:${pct(s)}%;width:${((diffDays(e, s) + 1) / total) * 100}%" title="${esc(b.label)}"></i>`;
  }).join('');
  const evs = calEvents();
  const key = evs.filter(k => !k.end_date && k.start_date >= start && k.start_date <= end).map(k => `<i class="tl-key" style="left:${pct(k.start_date)}%;background:#${k.color}" title="${esc(k.label)} (${formatDate(k.start_date)})"></i>`).join('')
    + evs.filter(k => k.end_date && k.show_band && k.kind !== 'season' && k.start_date <= end && k.end_date >= start).map(k => { const s0 = k.start_date < start ? start : k.start_date; const e0 = k.end_date > end ? end : k.end_date; return `<i class="tl-band" style="left:${pct(s0)}%;width:${((diffDays(e0, s0) + 1) / total) * 100}%;background:${tint(k.color, 0.22)}" title="${esc(k.label)} (${formatDate(k.start_date)} to ${formatDate(k.end_date)})"></i>`; }).join('');
  const todayLine = today >= start && today <= end ? `<i class="tl-today" style="left:${pct(today)}%"></i>` : '';
  const label = p => `${esc(p.name)}`;
  return `<div class="tl" data-start="${start}" data-total="${total}">
    <div class="tl-head"><div class="tl-name"></div><div class="tl-chart tl-months">${monthHead}</div></div>
    ${rows.map(({ p, w }) => {
      const risk = calcDropRisk(p); const dropColor = risk === 'overdue' ? 'var(--red)' : risk === 'at-risk' ? 'var(--accent)' : 'var(--green)';
      const bars = w.map(x => { const s = x.start < start ? start : x.start; const e = x.end > end ? end : x.end; if (s > e) return '';
        return `<i class="tl-bar" data-base-left="${pct(s)}" data-w="${((diffDays(e, s) + 1) / total) * 100}" style="left:${pct(s)}%;width:${((diffDays(e, s) + 1) / total) * 100}%;background:#${PHASE_COLORS[x.label]}" title="${x.label}: ${formatDate(x.start)} to ${formatDate(x.end)}${x.custom ? ' (set by hand)' : ''}"></i>`; }).join('');
      const inRange = p.drop_date >= start && p.drop_date <= end;
      return `<div class="tl-row" data-tl-row="${p.id}">
        <div class="tl-name" data-open-dtc="${p.id}" title="${esc(p.name)}">${label(p)}<small>${esc(p.phase)}${PRODUCT_TYPES.find(t => t.id === p.product_type) ? ' · ' + esc(PRODUCT_TYPES.find(t => t.id === p.product_type).label) : ''}</small></div>
        <div class="tl-chart">${bands}${weekLines.join('')}${key}${todayLine}${bars}
          ${inRange ? `<span class="tl-drop" data-tl-drag="${p.id}" data-date="${p.drop_date}" data-base-left="${pct(p.drop_date)}" style="left:${pct(p.drop_date)}%;background:${dropColor}" title="${esc(p.name)} drops ${formatDate(p.drop_date)}${isDroppedNotArrived(p, today) ? ' (already dropped, still on its way to the warehouse)' : ''}. Drag to move."><b>${isDroppedNotArrived(p, today) ? '★ ' : ''}${formatDate(p.drop_date).replace(/, \d{4}$/, '')}</b></span>` : ''}</div></div>`;
    }).join('') || '<div class="mo-meta" style="padding:1rem">No products with a drop date in this window.</div>'}
    <div class="tl-legend">${Object.entries(PHASE_COLORS).map(([k, c]) => `<span><i style="background:#${c}"></i>${k}</span>`).join('')}<span><i class="tl-diamond"></i>Drop (drag to move)</span><span>★ Dropped, not yet in the warehouse</span><span><i style="background:rgba(224,85,85,.25)"></i>Manufacturer closed</span><span><i style="background:rgba(232,135,74,.25)"></i>Shipments delayed</span></div>
  </div>`;
}

// ─── Render ───────────────────────────────────────────────────────────────
export function renderDtcCalendar(products, phaseDates, handlers) {
  el = document.getElementById('dtcCalendarView'); if (!el) return;
  props = { products, phaseDates: phaseDates || [], ...handlers };
  const now = new Date(); if (st.year === null) { st.year = now.getFullYear(); st.month = now.getMonth(); }
  const today = todayStr();
  const months = Array.from({ length: st.span }, (_, i) => { const t = st.year * 12 + st.month + i; return { year: Math.floor(t / 12), month: t % 12 }; });
  const withDrops = products.filter(p => p.drop_date);
  const seg = (name, val, items) => `<div class="mo-tabs">${items.map(([v, l]) => `<button class="mo-tab${val === v ? ' active' : ''}" data-cal-${name}="${v}">${l}</button>`).join('')}</div>`;
  el.innerHTML = `
    <div class="cal-bar">
      <div class="cal-bar-left">${seg('view', st.view, [['months', 'Calendar'], ['timeline', 'Timeline']])}${seg('span', String(st.span), [['3', '3 months'], ['12', '12 months']])}</div>
      <div class="period-nav"><button class="btn btn-sm btn-ghost" id="dtcCalPrev" aria-label="Previous">‹</button>
        <span class="period-label">${MONTH_NAMES[months[0].month]} ${months[0].year}${st.span > 1 ? ` – ${MONTH_NAMES[months.at(-1).month]} ${months.at(-1).year}` : ''}</span>
        <button class="btn btn-sm btn-ghost" id="dtcCalNext" aria-label="Next">›</button><button class="btn btn-sm btn-accent" id="dtcCalToday">Today</button></div>
      <div class="cal-bar-left"><button class="btn btn-sm" id="calAddEvent">＋ Add date</button><button class="btn btn-sm" id="calPlanner">T-minus planner</button></div>
    </div>
    <div class="mo-note" style="margin-top:0">Drag a drop to another ${st.view === 'months' ? 'day' : 'date along the timeline'} to reschedule it. You will see what changes before anything is saved, and you can undo right after.${st.view === 'months' ? ' On a phone, open the product and edit its drop date.' : ''}</div>
    <div id="calUndo"></div>
    ${st.view === 'months'
      ? `<div class="dtc-cal-months cal-grid-${st.span}">${months.map(({ year, month }) => monthGrid(year, month, withDrops, today)).join('')}</div>`
      : timeline(withDrops, props.phaseDates, months, today)}`;

  const shift = n => { const t = st.year * 12 + st.month + n; st.year = Math.floor(t / 12); st.month = ((t % 12) + 12) % 12; renderDtcCalendar(products, phaseDates, handlers); };
  el.querySelector('#dtcCalPrev').addEventListener('click', () => shift(-1));
  el.querySelector('#dtcCalNext').addEventListener('click', () => shift(1));
  el.querySelector('#dtcCalToday').addEventListener('click', () => { st.year = now.getFullYear(); st.month = now.getMonth(); renderDtcCalendar(products, phaseDates, handlers); });
  el.querySelectorAll('[data-cal-view]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.calView; renderDtcCalendar(products, phaseDates, handlers); }));
  el.querySelectorAll('[data-cal-span]').forEach(b => b.addEventListener('click', () => { st.span = parseInt(b.dataset.calSpan, 10); renderDtcCalendar(products, phaseDates, handlers); }));
  el.querySelector('#calAddEvent').addEventListener('click', () => openEventModal(null));
  el.querySelector('#calPlanner').addEventListener('click', () => openPlanner());
  el.querySelectorAll('[data-edit-event]').forEach(n => n.addEventListener('click', e => { e.stopPropagation(); openEventModal(props.events.find(x => x.id === n.dataset.editEvent)); }));
  if (st.view === 'months') wireMonthDrag(); else wireTimelineDrag();
  if (pendingUndo) showUndo(pendingUndo);
}

function wireMonthDrag() {
  let dragId = null;
  el.querySelectorAll('[data-drag-dtc]').forEach(c => {
    c.addEventListener('dragstart', e => { dragId = c.dataset.dragDtc; e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
    c.addEventListener('dragend', () => { c.classList.remove('dragging'); el.querySelectorAll('.drop-target').forEach(x => x.classList.remove('drop-target')); });
  });
  el.querySelectorAll('.dtc-cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); cell.classList.add('drop-target'); } });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
    cell.addEventListener('drop', e => { e.preventDefault(); cell.classList.remove('drop-target'); const id = e.dataTransfer.getData('text/plain') || dragId; dragId = null; if (id) askMove(id, cell.dataset.date); });
  });
}

function wireTimelineDrag() {
  const tl = el.querySelector('.tl'); if (!tl) return;
  const start = tl.dataset.start; const total = parseInt(tl.dataset.total, 10);
  tl.querySelectorAll('[data-tl-drag]').forEach(h => {
    h.addEventListener('pointerdown', e => {
      e.preventDefault(); try { h.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      const chart = h.parentElement; const width = chart.getBoundingClientRect().width; const x0 = e.clientX; const orig = h.dataset.date; const base = parseFloat(h.dataset.baseLeft);
      const row = h.closest('.tl-row'); let delta = 0; h.classList.add('dragging');
      const move = ev => {
        delta = Math.round(((ev.clientX - x0) / width) * total);
        const shiftPct = (delta / total) * 100;
        h.style.left = `${base + shiftPct}%`; h.querySelector('b').textContent = formatDate(addDays(orig, delta)).replace(/, \d{4}$/, '');
        row.querySelectorAll('.tl-bar').forEach(b => { b.style.left = `${parseFloat(b.dataset.baseLeft) + shiftPct}%`; });
      };
      const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); h.classList.remove('dragging');
        if (delta !== 0) askMove(h.dataset.tlDrag, addDays(orig, delta)); else renderDtcCalendar(props.products, props.phaseDates, props); };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
  });
}

// ─── Confirm the move (nothing is saved until the user agrees) ─────────────
function askMove(productId, newDate) {
  const p = props.products.find(x => x.id === productId); if (!p || p.drop_date === newDate) return renderDtcCalendar(props.products, props.phaseDates, props);
  const moved = { ...p, drop_date: newDate };
  const before = phaseWindows(p, props.phaseDates); const after = phaseWindows(moved, []);
  const hasCustom = props.phaseDates.some(x => x.dtc_product_id === p.id);
  const warnings = blackoutWarnings(moved); const warnedBefore = new Set(blackoutWarnings(p));
  const info = props.onPreview ? props.onPreview(p, newDate) : null;      // { tasks, name } when a marketing drop plan follows this date
  const delta = diffDays(newDate, p.drop_date);
  const box = document.getElementById('modalBox'); const overlay = document.getElementById('modalOverlay'); box.removeAttribute('data-drop-modal');
  box.innerHTML = `<div class="modal-header"><h3>Move ${esc(p.name)}</h3><button class="btn btn-sm btn-ghost" id="mvX">✕</button></div>
    <div class="modal-body">
      <div class="detail-grid"><div class="detail-field"><div class="lbl">Current drop date</div><div class="val">${formatDate(p.drop_date)}</div></div>
        <div class="detail-field"><div class="lbl">New drop date</div><div class="val" style="color:var(--accent)">${formatDate(newDate)} <small>(${delta > 0 ? '+' : ''}${delta} days)</small></div></div></div>
      ${after.length ? `<div class="section-divider" style="margin-top:1rem">Estimated phases after the move</div>
        ${after.map((w, i) => `<div class="mo-meta">• ${w.label}: ${formatDate(before[i]?.start || w.start)} → <b>${formatDate(w.start)}</b> to ${formatDate(w.end)}</div>`).join('')}` : '<div class="mo-meta" style="margin-top:8px">No phase estimate for this product type.</div>'}
      ${hasCustom ? `<label class="mo-check-line"><input type="checkbox" id="mvReset" checked> Reset the phase dates saved by hand to the new estimate (otherwise they keep their current dates)</label>` : ''}
      ${warnings.length ? `<div class="notes-display" style="border-left:3px solid var(--red);margin-top:12px;font-size:12px">${warnings.map(w => `⛔ ${esc(w)}${warnedBefore.has(w) ? '' : ' <b>(new)</b>'}`).join('<br>')}</div>` : ''}
      ${info ? `<div class="mo-note">The marketing plan for this drop follows the date: <b>${info.count}</b> open task${info.count === 1 ? '' : 's'} will be rescheduled and their owners notified.</div>` : ''}
    </div>
    <div class="modal-footer"><button class="btn" id="mvCancel">Cancel</button><button class="btn btn-accent" id="mvOk">Move drop</button></div>`;
  overlay.classList.remove('hidden');
  const close = () => { overlay.classList.add('hidden'); renderDtcCalendar(props.products, props.phaseDates, props); };
  box.querySelector('#mvX').addEventListener('click', close); box.querySelector('#mvCancel').addEventListener('click', close);
  box.querySelector('#mvOk').addEventListener('click', async () => {
    const reset = box.querySelector('#mvReset')?.checked || false; overlay.classList.add('hidden');
    try { await props.onMoveDrop(p.id, newDate, { resetPhaseDates: reset }); pendingUndo = { id: p.id, name: p.name, from: p.drop_date, to: newDate, hadCustom: hasCustom && reset }; }
    catch (e) { alert('Could not move the drop: ' + (e.message || e)); }
  });
}

let pendingUndo = null;
function showUndo(u) {
  const host = el.querySelector('#calUndo'); if (!host) return;
  host.innerHTML = `<div class="cal-undo"><span><b>${esc(u.name)}</b> moved to ${formatDate(u.to)}.${u.hadCustom ? ' Hand-set phase dates were reset and cannot be restored by undo.' : ''}</span><button class="btn btn-sm" id="calUndoBtn">Undo</button><button class="btn btn-sm btn-ghost" id="calUndoX">✕</button></div>`;
  const clear = () => { pendingUndo = null; host.innerHTML = ''; };
  host.querySelector('#calUndoX').addEventListener('click', clear);
  host.querySelector('#calUndoBtn').addEventListener('click', async () => { clear(); try { await props.onMoveDrop(u.id, u.from, { resetPhaseDates: false, undo: true }); } catch (e) { alert('Could not undo: ' + (e.message || e)); } });
  setTimeout(() => { if (pendingUndo === u) clear(); }, 20000);
}


// ─── Add / edit a promotion, key date or closure ───────────────────────────
const SWATCHES = ['FFB500', 'E05555', 'E8874A', '4CAF7D', '2FA4B8', '5B9CF6', '9B7FE8', 'D6336C', '8A8F98'];
const KIND_LABEL = { promo: 'Promotion', event: 'Event / key date', closure: 'Closure or cutoff', season: 'Season', note: 'Note' };
function openEventModal(ev) {
  if (!props.onSaveEvent) return;
  const box = document.getElementById('modalBox'); const overlay = document.getElementById('modalOverlay'); box.removeAttribute('data-drop-modal');
  const e0 = ev || { label: '', start_date: todayStr(), end_date: '', color: 'FFB500', kind: 'promo', show_band: true };
  box.innerHTML = `<div class="modal-header"><h3>${ev ? 'Edit calendar date' : 'Add a calendar date'}</h3><button class="btn btn-sm btn-ghost" id="evX">✕</button></div>
    <div class="modal-body">
      <div class="form-row"><label>Text shown on the calendar</label><input id="evLabel" value="${esc(e0.label)}" placeholder="e.g. BFCM early access"></div>
      <div class="form-grid"><div class="form-row"><label>Start date</label><input type="date" id="evStart" value="${e0.start_date}"></div>
        <div class="form-row"><label>End date (optional, for a period)</label><input type="date" id="evEnd" value="${e0.end_date || ''}"></div>
        <div class="form-row"><label>Type</label><select id="evKind">${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}"${k === e0.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-row"><label style="display:flex;gap:8px;align-items:center;margin-top:1.6rem;text-transform:none;letter-spacing:0"><input type="checkbox" id="evBand" ${e0.show_band ? 'checked' : ''}> Colour the background of these days</label></div></div>
      <div class="form-row"><label>Colour</label><div class="cal-swatches">${SWATCHES.map(c => `<button type="button" class="cal-swatch${c === e0.color ? ' on' : ''}" data-color="${c}" style="background:#${c}" aria-label="#${c}"></button>`).join('')}<input type="color" id="evColor" value="#${e0.color}" aria-label="Custom colour"></div></div>
    </div>
    <div class="modal-footer">${ev ? '<button class="btn btn-danger" id="evDel" style="margin-right:auto">Delete</button>' : ''}<button class="btn" id="evCancel">Cancel</button><button class="btn btn-accent" id="evSave">Save</button></div>`;
  overlay.classList.remove('hidden');
  const q = s => box.querySelector(s); const close = () => overlay.classList.add('hidden'); let color = e0.color;
  q('#evX').addEventListener('click', close); q('#evCancel').addEventListener('click', close);
  box.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { color = b.dataset.color; q('#evColor').value = '#' + color; box.querySelectorAll('.cal-swatch').forEach(x => x.classList.toggle('on', x === b)); }));
  q('#evColor').addEventListener('input', e => { color = e.target.value.slice(1).toUpperCase(); box.querySelectorAll('.cal-swatch').forEach(x => x.classList.remove('on')); });
  q('#evDel')?.addEventListener('click', async () => { if (confirm('Delete this date from the calendar?')) { try { await props.onDeleteEvent(ev.id); close(); } catch (e) { alert('Could not delete: ' + e.message); } } });
  q('#evSave').addEventListener('click', async () => {
    const label = q('#evLabel').value.trim(); const start = q('#evStart').value; const end = q('#evEnd').value;
    if (!label || !start) return alert('Add the text and the start date.'); if (end && end < start) return alert('The end date is before the start date.');
    try { await props.onSaveEvent({ label, start_date: start, end_date: end || null, color, kind: q('#evKind').value, show_band: q('#evBand').checked }, ev?.id || null); close(); } catch (e) { alert('Could not save: ' + (e.message || e)); }
  });
}

// ─── T-minus planner: from a target drop date back to when each stage has to start ─────────────────────
function openPlanner() {
  const box = document.getElementById('modalBox'); const overlay = document.getElementById('modalOverlay'); box.removeAttribute('data-drop-modal');
  box.innerHTML = `<div class="modal-header"><h3>T-minus planner</h3><button class="btn btn-sm btn-ghost" id="plX">✕</button></div>
    <div class="modal-body"><div class="mo-note" style="margin-top:0">Pick what you want to launch and when. The planner counts back from the drop date using HVI's lead-time table and shows when each stage has to start.</div>
      <div class="form-grid"><div class="form-row"><label>Product type</label><select id="plType">${PRODUCT_TYPES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select></div>
        <div class="form-row"><label>Category</label><select id="plCat">${PRODUCT_CATEGORIES.map(c => `<option value="${c.id}"${c.id === 'new-line' ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
        <div class="form-row"><label>Target drop date</label><input type="date" id="plDrop" value="${addDays(todayStr(), 120)}"></div></div>
      <div id="plOut"></div></div>
    <div class="modal-footer"><button class="btn" id="plClose">Close</button></div>`;
  overlay.classList.remove('hidden');
  const q = s => box.querySelector(s); const close = () => overlay.classList.add('hidden');
  q('#plX').addEventListener('click', close); q('#plClose').addEventListener('click', close);
  const calc = () => {
    const r = planBackward({ product_type: q('#plType').value, category: q('#plCat').value, drop_date: q('#plDrop').value }); const out = q('#plOut');
    if (!r) { out.innerHTML = '<div class="mo-meta">No lead time is set for this combination.</div>'; return; }
    const late = r.startBy < todayStr();
    out.innerHTML = `<div class="notes-display" style="border-left:3px solid ${late ? 'var(--red)' : 'var(--green)'}"><b>Start ${esc(r.firstStage.toLowerCase())} by ${formatDate(r.startBy)}</b> (${r.totalWeeks} weeks before the drop)${late ? '<br><span style="color:var(--red)">That date has already passed: the drop date or the scope needs to change.</span>' : ''}</div>
      ${r.phases ? r.phases.map(p => `<div class="mo-meta" style="margin-top:6px">• <b>${p.label}</b>: ${formatDate(p.start)} to ${formatDate(p.end)} <span class="mo-meta">(${p.weeks} wk)</span></div>`).join('') : '<div class="mo-meta" style="margin-top:6px">There is no stage breakdown for this product type, only the total lead time.</div>'}`;
  };
  ['#plType', '#plCat', '#plDrop'].forEach(id => q(id).addEventListener('input', calc)); calc();
}
