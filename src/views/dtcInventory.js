// Inventory management: ordered → shipped → received → QC → sellable → shelved / reserve, per product and size.
import { saveInventoryRow, addInventoryLabels, deleteInventoryRow, startCounting, fetchInventoryEvents } from '../controllers/inventory.js';
import { sizesFor } from '../dtc_constants.js';
import { rowGaps, productTotals, costPerUnit } from '../inventory/reconcile.js';
import { formatDate } from '../utils.js';
import { stack } from '../viz.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLS = [
  ['qty_ordered', 'Ordered', 'What we ordered from the manufacturer'],
  ['qty_shipped', 'Shipped', 'What the manufacturer says it shipped'],
  ['qty_received', 'Received', 'What physically arrived at the warehouse'],
  ['qty_rejected', 'QC rejected', 'Defective or damaged, cannot be sold'],
  ['qty_sellable', 'Sellable', 'Final count put into inventory'],
  ['qty_shelved', 'Shelved', 'Sellable units on the pick shelves'],
  ['qty_reserve', 'Reserve', 'Sellable units in reserve storage'],
];
const STAGES = ['production', 'shipping', 'warehouse'];
let ctx = null; let filter = { q: '', gaps: false, stage: 'active' }; let open = new Set();
export function initInventory(c) { ctx = c; }
const fmt = v => (v == null ? '—' : v.toLocaleString());

export function renderDtcInventory() {
  const el = document.getElementById('dtcInventoryView'); if (!el) return;
  const { products, inventory, variants, costs } = ctx.get();
  // Keep the cursor where it was: saving a count reloads the list, and the next box (Tab) must stay focused.
  const ae = document.activeElement;
  const focusKey = ae && el.contains(ae) ? { id: ae.id, row: ae.closest('[data-inv-row]')?.dataset.invRow, field: ae.dataset?.countInput || (ae.matches?.('[data-inv-note]') ? 'note' : null), pos: ae.selectionStart ?? null } : null;
  const byProduct = new Map(); inventory.forEach(r => { (byProduct.get(r.dtc_product_id) || byProduct.set(r.dtc_product_id, []).get(r.dtc_product_id)).push(r); });
  const relevant = products.filter(p => p.fulfillment !== 'dropship' && (byProduct.has(p.id) || STAGES.includes(p.phase)));
  const q = filter.q.toLowerCase();
  const rows = relevant.map(p => ({ p, rows: byProduct.get(p.id) || [] })).map(x => ({ ...x, t: productTotals(x.rows) }))
    .filter(x => (!q || x.p.name.toLowerCase().includes(q)) && (!filter.gaps || x.t.gaps.length) && (filter.stage === 'all' || x.rows.length || x.p.phase === 'warehouse' || x.p.phase === 'shipping' || x.p.phase === 'production')
      && (filter.stage !== 'warehouse' || x.p.phase === 'warehouse'))
    .sort((a, b) => b.t.gaps.length - a.t.gaps.length || a.p.name.localeCompare(b.p.name));

  const all = relevant.map(p => productTotals(byProduct.get(p.id) || []));
  const tot = k => all.some(t => t[k] != null) ? all.reduce((a, t) => a + (t[k] || 0), 0) : null;
  const gapProducts = all.filter(t => t.gaps.length).length;
  const kpi = (label, val, sub, color) => `<div class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-val" ${color ? `style="color:${color}"` : ''}>${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;

  el.innerHTML = `
    <div class="proj-summary" style="grid-template-columns:repeat(5,minmax(0,1fr))">
      ${kpi('Ordered', fmt(tot('qty_ordered')), `${relevant.length} products`)}
      ${kpi('Received', fmt(tot('qty_received')), 'at the warehouse')}
      ${kpi('Rejected in QC', fmt(tot('qty_rejected')), 'not sellable', tot('qty_rejected') ? 'var(--red)' : null)}
      ${kpi('Sellable', fmt(tot('qty_sellable')), 'counted into inventory', 'var(--green)')}
      ${kpi('Products with gaps', gapProducts, 'to follow up', gapProducts ? 'var(--accent)' : null)}
    </div>
    <div class="mo-filter"><input type="search" id="invQ" placeholder="Search product" value="${esc(filter.q)}">
      <label><input type="checkbox" id="invGaps" ${filter.gaps ? 'checked' : ''}> Only products with gaps</label>
      <select id="invStage"><option value="active"${filter.stage === 'active' ? ' selected' : ''}>In production, shipping or warehouse</option><option value="warehouse"${filter.stage === 'warehouse' ? ' selected' : ''}>Warehouse only</option><option value="all"${filter.stage === 'all' ? ' selected' : ''}>All with counts</option></select></div>
    <div class="mo-note">Leave a count empty until someone has actually counted it: an empty box means “not counted yet”, a 0 means “counted, none”. Gaps are only shown when both numbers were entered. The cost per unit uses sellable units once they are counted.</div>
    ${rows.length ? rows.map(x => productBlock(x, variants, costs)).join('') : '<div style="color:var(--text3)">No products to show.</div>'}`;

  if (focusKey) {
    const target = focusKey.id ? el.querySelector('#' + focusKey.id)
      : focusKey.row ? el.querySelector(`[data-inv-row="${focusKey.row}"] ${focusKey.field === 'note' ? '[data-inv-note]' : `[data-count-input="${focusKey.field}"]`}`) : null;
    if (target) { target.focus(); if (focusKey.pos != null && target.setSelectionRange && target.type !== 'number') try { target.setSelectionRange(focusKey.pos, focusKey.pos); } catch { /* number inputs */ } }
  }
  el.querySelector('#invQ').addEventListener('input', e => { filter.q = e.target.value; renderDtcInventory(); });
  el.querySelector('#invGaps').addEventListener('change', e => { filter.gaps = e.target.checked; renderDtcInventory(); });
  el.querySelector('#invStage').addEventListener('change', e => { filter.stage = e.target.value; renderDtcInventory(); });
  el.querySelectorAll('[data-toggle-inv]').forEach(h => h.addEventListener('click', () => { const id = h.dataset.toggleInv; open.has(id) ? open.delete(id) : open.add(id); renderDtcInventory(); }));
  el.querySelectorAll('[data-count-input]').forEach(inp => inp.addEventListener('change', () => save(inp.closest('[data-inv-row]').dataset.invRow, { [inp.dataset.countInput]: inp.value })));
  el.querySelectorAll('[data-inv-note]').forEach(inp => inp.addEventListener('change', () => save(inp.closest('[data-inv-row]').dataset.invRow, { notes: inp.value })));
  el.querySelectorAll('[data-start-count]').forEach(b => b.addEventListener('click', async () => {
    const p = products.find(x => x.id === b.dataset.startCount);
    await guard(() => startCounting(p, variants.filter(v => v.dtc_product_id === p.id), byProduct.get(p.id) || [])); open.add(p.id);
  }));
  el.querySelectorAll('[data-add-row]').forEach(b => b.addEventListener('click', async () => {
    const label = prompt('Sizes or variants to add, separated by commas (for example 4XL, 5XL or Black, Navy):'); if (label) await guard(() => addInventoryLabels(b.dataset.addRow, label, byProduct.get(b.dataset.addRow) || []));
  }));
  el.querySelectorAll('[data-del-row]').forEach(b => b.addEventListener('click', async () => { if (confirm('Delete this row and its counts?')) await guard(() => deleteInventoryRow(b.dataset.delRow)); }));
  el.querySelectorAll('[data-history]').forEach(b => b.addEventListener('click', () => showHistory(b.dataset.history, products.find(p => p.id === b.dataset.history)?.name)));
}

async function save(id, fields) { await guard(() => saveInventoryRow(id, fields)); }
async function guard(fn) { try { await fn(); await ctx.refresh(); } catch (e) { alert('Could not save: ' + (e.message || e)); await ctx.refresh(); } }

function productBlock({ p, rows, t }, variants, costs) {
  const isOpen = open.has(p.id) || rows.length === 1 && t.gaps.length > 0;
  const cost = costPerUnit(costs.get(p.id) || null, rows);
  const bars = t.qty_ordered ? stack([
    { label: 'Sellable', value: t.qty_sellable || 0, color: 'var(--green)' },
    { label: 'Rejected', value: t.qty_rejected || 0, color: 'var(--red)' },
    { label: 'Not yet counted', value: Math.max(0, (t.qty_ordered || 0) - (t.qty_sellable || 0) - (t.qty_rejected || 0)), color: 'var(--bg4)' },
  ], { total: Math.max(t.qty_ordered, (t.qty_sellable || 0) + (t.qty_rejected || 0)) }) : '';
  return `<div class="panel inv-block">
    <div class="inv-head" data-toggle-inv="${p.id}" role="button" tabindex="0">
      <div><div class="panel-title" style="margin:0">${esc(p.name)}<small>${esc(p.phase)}</small></div>
        <div class="mo-meta">${t.counted ? `<b>${fmt(t.qty_sellable)}</b> sellable` : 'not counted yet'} · ordered ${fmt(t.qty_ordered)} · received ${fmt(t.qty_received)}${t.qty_rejected ? ` · ${t.qty_rejected} rejected` : ''}${cost ? ` · cost/unit <b>$${cost.perUnit.toFixed(2)}</b> <span class="mo-meta">(${cost.units} ${cost.basis === 'sellable' ? 'sellable' : 'invoice'} units)</span>` : ''}</div></div>
      <div class="mo-badges">${t.gaps.length ? `<span class="mo-badge" style="background:var(--tint-red);color:var(--red)">${t.gaps.length} gap${t.gaps.length > 1 ? 's' : ''}</span>` : t.counted ? '<span class="mo-badge" style="background:var(--tint-green);color:var(--green)">Reconciled</span>' : ''}<span class="mo-chev">${isOpen ? '▾' : '▸'}</span></div></div>
    ${isOpen ? `<div class="inv-body">${bars}
      ${t.gaps.length ? `<div class="inv-gaps">${t.gaps.map(g => `<div>⚠ <b>${esc(g.option)}</b>: ${esc(g.label)} (${g.diff > 0 ? '−' : '+'}${Math.abs(g.diff)})</div>`).join('')}</div>` : ''}
      ${rows.length ? `<div class="table-scroll"><table class="list-table inv-table"><thead><tr><th>Size</th><th>SKU</th>${COLS.map(([, l, tip]) => `<th title="${esc(tip)}">${l}</th>`).join('')}<th>Notes</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr data-inv-row="${r.id}"><td data-label="Size"><b>${esc(r.option_label)}</b></td><td data-label="SKU">${esc(r.sku || '')}</td>
          ${COLS.map(([k, l]) => `<td data-label="${l}"><input type="number" min="0" inputmode="numeric" data-count-input="${k}" value="${r[k] ?? ''}" class="${rowGaps(r).some(g => (k === 'qty_shipped' && g.id === 'shipped') || (k === 'qty_received' && g.id === 'received') || (k === 'qty_sellable' && g.id === 'sellable') || (k === 'qty_shelved' && g.id === 'shelved')) ? 'inv-gap' : ''}"></td>`).join('')}
          <td data-label="Notes"><input type="text" data-inv-note value="${esc(r.notes || '')}" placeholder="e.g. 2 torn seams"></td>
          <td><button class="btn btn-sm btn-ghost" data-del-row="${r.id}" title="Delete row">✕</button></td></tr>`).join('')}
        <tr class="inv-total"><td data-label="Total" colspan="2"><b>Total</b></td>${COLS.map(([k]) => `<td><b>${fmt(t[k])}</b></td>`).join('')}<td colspan="2"></td></tr></tbody></table></div>`
      : `<div class="mo-note">No counts started for this product.</div>`}
      <div class="inv-actions"><button class="btn btn-sm" data-start-count="${p.id}">${rows.length ? (sizesFor(p.product_type).length ? 'Add missing standard sizes' : 'Add missing sizes from the SKU table') : (sizesFor(p.product_type).length ? `Start counting (${sizesFor(p.product_type).join(', ')})` : 'Start counting')}</button><button class="btn btn-sm btn-ghost" data-add-row="${p.id}">＋ Add sizes or variants</button><button class="btn btn-sm btn-ghost" data-history="${p.id}">Count history</button></div></div>` : ''}
  </div>`;
}

async function showHistory(productId, name) {
  const box = document.getElementById('modalBox'); const overlay = document.getElementById('modalOverlay');
  box.removeAttribute('data-drop-modal');
  box.innerHTML = `<div class="modal-header"><h3>Count history · ${esc(name || '')}</h3><button class="btn btn-sm btn-ghost" id="ihClose">✕</button></div><div class="modal-body" id="ihBody">Loading…</div>`;
  overlay.classList.remove('hidden');
  box.querySelector('#ihClose').addEventListener('click', () => overlay.classList.add('hidden'));
  try {
    const ev = await fetchInventoryEvents(productId); const label = Object.fromEntries(COLS.map(([k, l]) => [k, l]));
    box.querySelector('#ihBody').innerHTML = ev.length ? ev.map(e => `<div class="mo-event"><div><div><b>${esc(e.option_label)}</b> · ${esc(label[e.field] || e.field)}: ${e.old_value ?? '—'} → <b>${e.new_value ?? '—'}</b></div><div class="mo-meta">${new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${esc((e.changed_by || '').split('@')[0])}</div></div></div>`).join('') : '<div class="mo-meta">No changes recorded yet.</div>';
  } catch (e) { box.querySelector('#ihBody').textContent = 'Could not load: ' + e.message; }
}
