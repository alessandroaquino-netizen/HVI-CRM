// DTC calendar: a 3-month outlook (month grids or a timeline) where product drops can be dragged to a new date.
import { ink } from '../theme.js';
import { SEASONAL_WINDOWS, KEY_DATES, MANUFACTURER_BLACKOUTS, blackoutsOn, blackoutWarnings, calcDropRisk, phaseDatesForProduct, PRODUCT_TYPES } from '../dtc_constants.js';
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

function seasonalTint(dateStr) {
  const s = SEASONAL_WINDOWS.find(w => dateStr >= w.start && dateStr <= w.end);
  if (!s) return null;
  const r = parseInt(s.color.slice(0, 2), 16), g = parseInt(s.color.slice(2, 4), 16), b = parseInt(s.color.slice(4, 6), 16);
  return { s, bg: `rgba(${r},${g},${b},${s.opacity})` };
}

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
  const keyByDay = {};
  KEY_DATES.forEach(k => {
    if (!k.month && k.date.slice(0, 7) === monthStr) (keyByDay[k.date] ||= []).push(k);
    else if (k.month && k.date.slice(5, 7) === String(month + 1).padStart(2, '0')) (keyByDay[isoDate(year, month, parseInt(k.date.slice(8, 10), 10) || 1)] ||= []).push(k);
  });
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const cellHtml = day => {
    if (day === null) return '<div class="dtc-cal-cell dtc-cal-cell-empty"></div>';
    const dateStr = isoDate(year, month, day); const tint = seasonalTint(dateStr); const blackouts = blackoutsOn(dateStr);
    const boBg = blackouts.some(b => b.kind === 'closure') ? 'rgba(224,85,85,.16)' : blackouts.some(b => b.kind === 'delay') ? 'rgba(232,135,74,.12)' : blackouts.length ? 'rgba(224,85,85,.10)' : '';
    return `<div class="dtc-cal-cell${dateStr === today ? ' dtc-cal-cell-today' : ''}" data-date="${dateStr}" style="${boBg ? `background:${boBg}` : tint ? `background:${tint.bg}` : ''}">
      <div class="dtc-cal-daynum">${day}</div>
      ${blackouts.filter(b => b.start === dateStr).map(b => `<div class="dtc-cal-keydate" style="color:var(--red)" title="${esc(b.note)}">⛔ ${esc(b.label)}</div>`).join('')}
      ${(keyByDay[dateStr] || []).map(k => `<div class="dtc-cal-keydate" style="color:${ink(k.color)}" title="${esc(k.label)}">${esc(k.label)}</div>`).join('')}
      ${(dropsByDay[dateStr] || []).map(p => {
        const risk = calcDropRisk(p); const color = risk === 'overdue' ? 'var(--red)' : risk === 'at-risk' ? 'var(--accent)' : 'var(--green)';
        return `<div class="dtc-cal-drop" draggable="true" data-drag-dtc="${p.id}" data-open-dtc="${p.id}" style="background:${color}" title="${esc(p.name)} (${esc(p.phase)}). Drag to another day to move the drop.">${esc(p.name)}</div>`;
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
  const key = KEY_DATES.filter(k => !k.month && k.date >= start && k.date <= end).map(k => `<i class="tl-key" style="left:${pct(k.date)}%" title="${esc(k.label)} (${formatDate(k.date)})"></i>`).join('');
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
          ${inRange ? `<span class="tl-drop" data-tl-drag="${p.id}" data-date="${p.drop_date}" data-base-left="${pct(p.drop_date)}" style="left:${pct(p.drop_date)}%;background:${dropColor}" title="${esc(p.name)} drops ${formatDate(p.drop_date)}. Drag to move."><b>${formatDate(p.drop_date).replace(/, \d{4}$/, '')}</b></span>` : ''}</div></div>`;
    }).join('') || '<div class="mo-meta" style="padding:1rem">No products with a drop date in this window.</div>'}
    <div class="tl-legend">${Object.entries(PHASE_COLORS).map(([k, c]) => `<span><i style="background:#${c}"></i>${k}</span>`).join('')}<span><i class="tl-diamond"></i>Drop (drag to move)</span><span><i style="background:rgba(224,85,85,.25)"></i>Manufacturer closed</span><span><i style="background:rgba(232,135,74,.25)"></i>Shipments delayed</span></div>
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
