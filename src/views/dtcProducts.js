import { DTC_PHASES, PRODUCT_TYPES, PRODUCT_CATEGORIES, PRIORITIES, MANUFACTURERS, calcDropRisk, daysInPhase, weeksUntilDrop, getLeadWeeks, phaseDatesForProduct } from '../dtc_constants.js';
import { formatDate } from '../utils.js';
import { renderListDetail } from './modal.js';

function riskBorder(risk) {
  if (risk === 'overdue')  return 'border-color:rgba(224,85,85,.65)';
  if (risk === 'at-risk')  return 'border-color:rgba(240,192,64,.5)';
  return '';
}

function riskTag(risk) {
  if (risk === 'overdue') return `<span class="tag-overdue" style="font-size:9px">⚠ Overdue</span>`;
  if (risk === 'at-risk') return `<span class="tag-today" style="font-size:9px">⚡ At Risk</span>`;
  if (risk === 'unknown') return `<span style="font-size:9px;color:var(--text3);font-family:var(--mono)">No lead time</span>`;
  return '';
}

function categoryBadge(cat) {
  const c = PRODUCT_CATEGORIES.find(x => x.id === cat);
  if (!c) return '';
  const r = parseInt(c.color.slice(0,2),16), g = parseInt(c.color.slice(2,4),16), b = parseInt(c.color.slice(4,6),16);
  return `<span class="badge" style="background:rgba(${r},${g},${b},.15);color:#${c.color};font-size:9px">${c.label}</span>`;
}

function priorityBadge(priority) {
  const pr = PRIORITIES.find(x => x.id === priority);
  if (!pr) return '';
  return `<span class="badge" style="background:rgba(255,255,255,.06);color:#${pr.color};font-size:9px">${pr.label} priority</span>`;
}

function productCard(p) {
  const risk  = calcDropRisk(p);
  const weeks = weeksUntilDrop(p);
  const mfr   = MANUFACTURERS.find(m => m.id === p.manufacturer);
  const payBadge = (p.manufacturer === 'bing-bing' || p.manufacturer === 'screen-printer' || p.manufacturer === 'print-theory' || p.manufacturer === 'alibaba')
    ? `<span style="font-size:9px;font-family:var(--mono);padding:1px 5px;border-radius:3px;background:${p.deposit_50_paid?'rgba(76,175,125,.2)':'rgba(224,85,85,.15)'};color:${p.deposit_50_paid?'var(--green)':'var(--red)'}">50%D</span>
       <span style="font-size:9px;font-family:var(--mono);padding:1px 5px;border-radius:3px;background:${p.final_50_paid?'rgba(76,175,125,.2)':'rgba(224,85,85,.15)'};color:${p.final_50_paid?'var(--green)':'var(--red)'}">50%F</span>`
    : '';
  const preMktBadge = p.premarketing_started_at
    ? `<span style="font-size:9px;font-family:var(--mono);padding:1px 5px;border-radius:3px;background:rgba(155,127,232,.2);color:var(--purple)">Pre-mkt</span>`
    : '';
  return `<div class="lead-card" data-open-dtc="${p.id}" style="${riskBorder(risk)}">
    <div class="lead-name">${p.name}</div>
    <div class="lead-co" style="font-size:10px">${mfr ? mfr.label : (p.manufacturer || '—')}</div>
    <div class="lead-meta" style="margin-top:5px;flex-wrap:wrap;gap:4px">
      ${categoryBadge(p.category)}
      ${priorityBadge(p.priority)}
      ${riskTag(risk)}
      ${p.drop_date ? `<span style="font-size:9px;font-family:var(--mono);color:${weeks!==null&&weeks<4?'var(--red)':'var(--text3)'}">Drop: ${formatDate(p.drop_date)}${weeks!==null?` (${weeks}w)`:''}</span>` : ''}
    </div>
    ${payBadge||preMktBadge ? `<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">${payBadge}${preMktBadge}</div>` : ''}
  </div>`;
}

let activeFilters = { type: '', category: '', manufacturer: '' };

export function getDtcFiltered(products) {
  return products.filter(p => {
    if (activeFilters.type         && p.product_type !== activeFilters.type)         return false;
    if (activeFilters.category     && p.category      !== activeFilters.category)     return false;
    if (activeFilters.manufacturer && p.manufacturer  !== activeFilters.manufacturer) return false;
    return true;
  });
}

export function renderDtcProducts(products) {
  const el = document.getElementById('dtcProductsView');
  if (!el) return;

  const filtered  = getDtcFiltered(products);
  const atRisk    = products.filter(p => calcDropRisk(p) === 'at-risk').length;
  const overdue   = products.filter(p => calcDropRisk(p) === 'overdue').length;
  const ordered   = products.filter(p => ['sampling','production','warehouse'].includes(p.phase)).length;
  const nextDrops = products.filter(p => p.drop_date && p.drop_date >= new Date().toISOString().slice(0,10)).sort((a,b) => a.drop_date.localeCompare(b.drop_date)).slice(0,3);

  let html = `
    <div class="proj-summary" style="grid-template-columns:repeat(5,1fr);margin-bottom:1.5rem">
      <div class="kpi-card" data-kpi="total" style="padding:.9rem 1.1rem"><div class="kpi-label">Total products</div><div class="kpi-val" style="font-size:22px">${products.length}</div></div>
      <div class="kpi-card" data-kpi="ordered" style="padding:.9rem 1.1rem"><div class="kpi-label">Products ordered</div><div class="kpi-val" style="font-size:22px;color:var(--blue)">${ordered}</div><div class="kpi-sub">Sampling & beyond</div></div>
      <div class="kpi-card" data-kpi="overdue" style="padding:.9rem 1.1rem;${overdue?'border-color:rgba(224,85,85,.4)':''}"><div class="kpi-label">Overdue</div><div class="kpi-val" style="font-size:22px;color:${overdue?'var(--red)':'var(--text3)'}">${overdue}</div></div>
      <div class="kpi-card" data-kpi="atRisk" style="padding:.9rem 1.1rem;${atRisk?'border-color:rgba(240,192,64,.4)':''}"><div class="kpi-label">At risk</div><div class="kpi-val" style="font-size:22px;color:${atRisk?'var(--accent)':'var(--text3)'}">${atRisk}</div></div>
      <div class="kpi-card" data-kpi="nextDrops" style="padding:.9rem 1.1rem"><div class="kpi-label">Next drops</div>
        <div style="margin-top:4px;display:flex;flex-direction:column;gap:3px">
          ${nextDrops.length ? nextDrops.map(p=>`<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--text2)">${p.name}</span><span style="font-family:var(--mono);color:var(--accent)">${formatDate(p.drop_date)}</span></div>`).join('') : '<span style="font-size:11px;color:var(--text3)">None scheduled</span>'}
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:1.5rem;flex-wrap:wrap;align-items:center">
      <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Filter:</span>
      <select class="dtc-filter" data-filter="type" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:4px 8px">
        <option value="">All types</option>${PRODUCT_TYPES.map(t=>`<option value="${t.id}" ${activeFilters.type===t.id?'selected':''}>${t.label}</option>`).join('')}
      </select>
      <select class="dtc-filter" data-filter="category" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:4px 8px">
        <option value="">All categories</option>${PRODUCT_CATEGORIES.map(c=>`<option value="${c.id}" ${activeFilters.category===c.id?'selected':''}>${c.label}</option>`).join('')}
      </select>
      <select class="dtc-filter" data-filter="manufacturer" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:4px 8px">
        <option value="">All manufacturers</option>${MANUFACTURERS.map(m=>`<option value="${m.id}" ${activeFilters.manufacturer===m.id?'selected':''}>${m.label}</option>`).join('')}
      </select>
      ${Object.values(activeFilters).some(Boolean)?`<button id="clearDtcFilters" class="btn btn-ghost btn-sm">✕ Clear</button>`:''}
      <span style="margin-left:auto;font-size:11px;color:var(--text3)">${filtered.length} of ${products.length}</span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;align-items:start">
      ${DTC_PHASES.map(phase => {
        const pp = filtered.filter(p => p.phase === phase.id);
        return `<div class="stage-col">
          <div class="stage-header" style="border-color:#${phase.color}40"><span style="color:#${phase.color}">${phase.label}</span><span class="stage-count">${pp.length}</span></div>
          <div>${pp.length ? pp.map(productCard).join('') : '<div class="empty-col">—</div>'}</div>
        </div>`;
      }).join('')}
    </div>`;

  el.innerHTML = html;
  el.querySelectorAll('.dtc-filter').forEach(sel => {
    sel.addEventListener('change', e => { activeFilters[e.target.dataset.filter] = e.target.value; renderDtcProducts(products); });
  });
  const clr = el.querySelector('#clearDtcFilters');
  if (clr) clr.addEventListener('click', () => { activeFilters = { type:'', category:'', manufacturer:'' }; renderDtcProducts(products); });

  const dtcRow = p => ({ id: p.id, type: 'dtc', primary: p.name, secondary: [p.phase, p.manufacturer].filter(Boolean).join(' · '), value: p.drop_date ? formatDate(p.drop_date) : '' });
  const overdueList = products.filter(p => calcDropRisk(p) === 'overdue');
  const atRiskList  = products.filter(p => calcDropRisk(p) === 'at-risk');
  const orderedList = products.filter(p => ['sampling','production','warehouse'].includes(p.phase));
  const drilldowns = {
    total:     () => renderListDetail('All Products', `${products.length} total`, products.map(dtcRow)),
    ordered:   () => renderListDetail('Products Ordered', 'Sampling & beyond', orderedList.map(dtcRow)),
    overdue:   () => renderListDetail('Overdue Products', 'Past achievable lead time for the drop date', overdueList.map(dtcRow)),
    atRisk:    () => renderListDetail('At-Risk Products', 'Tight on lead time', atRiskList.map(dtcRow)),
    nextDrops: () => renderListDetail('Upcoming Drops', null, products.filter(p => p.drop_date && p.drop_date >= new Date().toISOString().slice(0,10)).sort((a,b) => a.drop_date.localeCompare(b.drop_date)).map(dtcRow)),
  };
  el.querySelectorAll('[data-kpi]').forEach(card => {
    const fn = drilldowns[card.dataset.kpi];
    if (!fn) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', fn);
  });
}

const EDITABLE_PHASE_KEYS = ['design', 'sampling', 'production', 'shipping'];

function variantRowHtml(v = {}) {
  return `<div class="dtc-variant-row" data-variant-row>
    <input type="text" class="dtc-variant-label" placeholder="Size / option" value="${v.option_label || ''}">
    <input type="text" class="dtc-variant-sku" placeholder="SKU" value="${v.sku || ''}">
    <input type="number" class="dtc-variant-price" placeholder="Price" value="${v.price ?? ''}">
    <input type="number" class="dtc-variant-compare" placeholder="Compare-at" value="${v.compare_at_price ?? ''}">
    <input type="number" class="dtc-variant-cost" placeholder="Cost/item" value="${v.cost_per_item ?? ''}">
    <input type="number" class="dtc-variant-ordered" placeholder="Ordered" value="${v.units_ordered ?? ''}">
    <input type="number" class="dtc-variant-received" placeholder="Received" value="${v.units_received ?? ''}">
    <button class="btn btn-sm btn-ghost" data-remove-variant-row title="Remove">✕</button>
  </div>`;
}

// ─── Detail modal ─────────────────────────────────────────────────────────
export function renderDtcProductDetail(p, phaseDates, variants, { onEdit, onDelete, onDuplicate, onPhaseChange, onStartPremarketing, onSaveTimeline, onSaveVariants }) {
  const risk   = calcDropRisk(p);
  const weeks  = weeksUntilDrop(p);
  const days   = daysInPhase(p);
  const type   = PRODUCT_TYPES.find(t => t.id === p.product_type);
  const mfr    = MANUFACTURERS.find(m => m.id === p.manufacturer);
  const cat    = PRODUCT_CATEGORIES.find(c => c.id === p.category);
  const riskColor = risk==='overdue'?'var(--red)':risk==='at-risk'?'var(--accent)':'var(--green)';
  const leadWeeks = getLeadWeeks(p);

  const phasePills = DTC_PHASES.map(ph =>
    `<button class="stage-pill${p.phase===ph.id?' active':''}" data-dtc-phase="${ph.id}" style="font-size:10px;padding:4px 9px">${ph.label}</button>`
  ).join('');

  const estimate = phaseDatesForProduct(p);
  const timelineSection = estimate ? `
    <div class="section-divider" style="margin-top:1rem">Phase Timeline <span style="font-weight:400;text-transform:none;letter-spacing:0">— editable, defaults to estimate</span></div>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
      ${estimate.map(t => {
        const key = EDITABLE_PHASE_KEYS.includes(t.label.toLowerCase()) ? t.label.toLowerCase() : null;
        if (!key) {
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:var(--radius)">
            <span style="font-size:12px;color:var(--text2)">${t.label}</span>
            <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">${formatDate(t.start)} → ${formatDate(t.end)}</span>
          </div>`;
        }
        const override = phaseDates.find(d => d.phase_key === key);
        return `<div class="dtc-timeline-row" data-phase-key="${key}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);gap:8px">
          <span style="font-size:12px;color:var(--text2);flex-shrink:0">${t.label}</span>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="date" class="dtc-timeline-start" value="${override?.planned_start || t.start}">
            <span style="color:var(--text3);font-size:11px">→</span>
            <input type="date" class="dtc-timeline-end" value="${override?.planned_end || t.end}">
          </div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-sm btn-accent" id="dtcSaveTimelineBtn">Save timeline</button>
    </div>` : (p.drop_date ? `
    <div class="section-divider" style="margin-top:1rem">Phase Timeline</div>
    <div style="margin-top:10px;font-size:12px;color:var(--text3)">No phase breakdown available for this product type yet.</div>` : '');

  const variantsSection = `
    <div class="section-divider" style="margin-top:1rem">Sizes &amp; SKUs</div>
    <div class="dtc-variant-header">
      <span>Size/Option</span><span>SKU</span><span>Price</span><span>Compare-at</span><span>Cost/item</span><span>Ordered</span><span>Received</span><span></span>
    </div>
    <div id="dtcVariantRows">${variants.map(v => variantRowHtml(v)).join('')}</div>
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <button class="btn btn-sm btn-ghost" id="dtcAddVariantBtn">+ Add row</button>
      <button class="btn btn-sm btn-accent" id="dtcSaveVariantsBtn">Save sizes &amp; SKUs</button>
    </div>`;

  const samplingSection = p.phase === 'sampling' || ['production','warehouse'].includes(p.phase) ? `
    <div class="section-divider" style="margin-top:1rem">Sampling Details</div>
    <div class="detail-grid" style="margin-top:10px">
      <div class="detail-field"><div class="lbl">Manufacturer order date</div><div class="val">${p.manufacturer_order_date?formatDate(p.manufacturer_order_date):'—'}</div></div>
      <div class="detail-field"><div class="lbl">Samples sent to photographer</div><div class="val" style="color:${p.photographer_samples_sent?'var(--green)':'var(--text3)'}">${p.photographer_samples_sent?'✓ Yes':'✗ Not yet'}</div></div>
      <div class="detail-field"><div class="lbl">Photos approved</div><div class="val" style="color:${p.photographer_photos_approved?'var(--green)':'var(--text3)'}">${p.photographer_photos_approved?'✓ Approved':'✗ Pending'}</div></div>
    </div>` : '';

  const warehouseSection = p.phase === 'warehouse' ? `
    <div class="section-divider" style="margin-top:1rem">Warehouse Receiving</div>
    <div class="detail-grid" style="margin-top:10px">
      <div class="detail-field"><div class="lbl">Units ordered</div><div class="val">${p.units_ordered||'—'}</div></div>
      <div class="detail-field"><div class="lbl">Units received</div><div class="val" style="color:${p.units_received&&p.units_ordered&&p.units_received<p.units_ordered?'var(--red)':'var(--text)'}">${p.units_received||'—'}${p.units_received&&p.units_ordered&&p.units_received<p.units_ordered?' ⚠ Discrepancy':''}</div></div>
    </div>` : '';

  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <div class="modal-header">
      <h3>${p.name}</h3>
      <div style="display:flex;gap:6px">
        ${!p.premarketing_started_at ? `<button class="btn btn-sm" id="dtcPreMktBtn" style="background:rgba(155,127,232,.2);color:var(--purple);border-color:rgba(155,127,232,.4)">▶ Start Pre-marketing</button>` : `<span style="font-size:11px;color:var(--purple);display:flex;align-items:center">Pre-mkt: ${formatDate(p.premarketing_started_at)}</span>`}
        <button class="btn btn-sm btn-ghost" id="dtcDuplicateBtn">Duplicate</button>
        <button class="btn btn-sm" id="dtcEditBtn">Edit</button>
        <button class="btn btn-sm btn-danger" id="dtcDeleteBtn">Delete</button>
        <button class="btn btn-sm btn-ghost" id="dtcCloseBtn">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.2rem">
        <div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-bottom:4px">${type?type.label:(p.product_type||'—')} · ${cat?cat.label:(p.category||'—')}</div>
          <div style="font-size:13px;color:var(--text2)">${mfr?mfr.label:(p.manufacturer||'—')}</div>
        </div>
        <div style="text-align:right">
          ${p.drop_date?`<div style="font-size:12px;font-family:var(--mono);color:var(--accent)">Drop: ${formatDate(p.drop_date)}</div>
          <div style="font-size:11px;color:${riskColor};margin-top:2px">${weeks!==null?weeks+' weeks away':''} · ${risk==='unknown'?'No lead time ('+( p.category||'?')+'  )':risk}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Lead time: ${leadWeeks?leadWeeks+' weeks total':'TBD'}</div>`
          :'<div style="font-size:12px;color:var(--text3)">No drop date</div>'}
        </div>
      </div>
      <div class="section-divider">Move to phase</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 1.5rem">${phasePills}</div>
      <div class="section-divider">Details</div>
      <div class="detail-grid" style="margin-top:10px">
        <div class="detail-field"><div class="lbl">Days in phase</div><div class="val">${days}</div></div>
        <div class="detail-field"><div class="lbl">Priority</div><div class="val">${p.priority ? PRIORITIES.find(x=>x.id===p.priority)?.label : '—'}</div></div>
        <div class="detail-field"><div class="lbl">Est. cost</div><div class="val">${p.est_cost?'$'+Number(p.est_cost).toLocaleString():'—'}</div></div>
        <div class="detail-field"><div class="lbl">Units</div><div class="val">${p.units||'—'}</div></div>
        <div class="detail-field"><div class="lbl">50% Deposit</div><div class="val" style="color:${p.deposit_50_paid?'var(--green)':'var(--red)'}">${p.deposit_50_paid?'✓ Paid':'✗ Pending'}</div></div>
        <div class="detail-field"><div class="lbl">Final 50%</div><div class="val" style="color:${p.final_50_paid?'var(--green)':'var(--red)'}">${p.final_50_paid?'✓ Paid':'✗ Pending'}</div></div>
        <div class="detail-field"><div class="lbl">Last activity</div><div class="val">${p.last_activity?formatDate(p.last_activity):'—'}</div></div>
        ${p.figma_link?`<div class="detail-field" style="grid-column:span 2"><div class="lbl">Figma</div><div class="val"><a href="${p.figma_link}" target="_blank" style="color:var(--blue)">${p.figma_link}</a></div></div>`:''}
        ${p.tech_pack_link?`<div class="detail-field" style="grid-column:span 2"><div class="lbl">Tech Pack</div><div class="val"><a href="${p.tech_pack_link}" target="_blank" style="color:var(--blue)">${p.tech_pack_link}</a></div></div>`:''}
      </div>
      ${timelineSection}
      ${samplingSection}
      ${warehouseSection}
      ${variantsSection}
      ${p.notes?`<div style="margin-top:1rem"><div class="section-divider">Notes</div><div class="notes-display" style="margin-top:8px">${p.notes}</div></div>`:''}
    </div>`;

  overlay.classList.remove('hidden');
  document.getElementById('dtcCloseBtn').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('dtcEditBtn').addEventListener('click', () => onEdit(p.id));
  document.getElementById('dtcDeleteBtn').addEventListener('click', () => onDelete(p.id));
  document.getElementById('dtcDuplicateBtn').addEventListener('click', () => onDuplicate(p.id));
  document.querySelectorAll('[data-dtc-phase]').forEach(btn => btn.addEventListener('click', () => onPhaseChange(p.id, btn.dataset.dtcPhase)));
  const pmBtn = document.getElementById('dtcPreMktBtn');
  if (pmBtn) pmBtn.addEventListener('click', () => onStartPremarketing(p.id));

  const saveTimelineBtn = document.getElementById('dtcSaveTimelineBtn');
  if (saveTimelineBtn) saveTimelineBtn.addEventListener('click', () => {
    const rows = Array.from(document.querySelectorAll('.dtc-timeline-row')).map(row => ({
      phase_key:     row.dataset.phaseKey,
      planned_start: row.querySelector('.dtc-timeline-start').value || null,
      planned_end:   row.querySelector('.dtc-timeline-end').value || null,
    }));
    onSaveTimeline(p.id, rows);
  });

  const variantRows = document.getElementById('dtcVariantRows');
  document.getElementById('dtcAddVariantBtn').addEventListener('click', () => {
    variantRows.insertAdjacentHTML('beforeend', variantRowHtml());
  });
  variantRows.addEventListener('click', e => {
    if (e.target.closest('[data-remove-variant-row]')) e.target.closest('[data-variant-row]').remove();
  });
  document.getElementById('dtcSaveVariantsBtn').addEventListener('click', () => {
    const rows = Array.from(variantRows.querySelectorAll('[data-variant-row]'))
      .map(row => ({
        option_label:     row.querySelector('.dtc-variant-label').value.trim(),
        sku:               row.querySelector('.dtc-variant-sku').value.trim(),
        price:             row.querySelector('.dtc-variant-price').value,
        compare_at_price:  row.querySelector('.dtc-variant-compare').value,
        cost_per_item:     row.querySelector('.dtc-variant-cost').value,
        units_ordered:     row.querySelector('.dtc-variant-ordered').value,
        units_received:    row.querySelector('.dtc-variant-received').value,
      }))
      .filter(r => r.option_label || r.sku || r.price || r.units_ordered || r.units_received);
    onSaveVariants(p.id, rows);
  });
}

// ─── Form modal ───────────────────────────────────────────────────────────
export function renderDtcProductForm(p = {}, editingId, { onSave }) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const opt = (val, cur, label) => `<option value="${val}" ${cur===val?'selected':''}>${label}</option>`;
  const isSampling = p.phase === 'sampling' || ['production','warehouse'].includes(p.phase||'');
  const isWarehouse = p.phase === 'warehouse';

  box.innerHTML = `
    <div class="modal-header">
      <h3>${editingId?'Edit product':'New DTC product'}</h3>
      <button class="btn btn-sm btn-ghost" id="dtcFmClose">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-row"><label>Product name</label><input id="df_name" value="${p.name||''}" placeholder="e.g. Black Flannel — Fall 2026"></div>
      <div class="form-grid">
        <div class="form-row"><label>Product type</label>
          <select id="df_type"><option value="">— Select —</option>${PRODUCT_TYPES.map(t=>opt(t.id,p.product_type,t.label)).join('')}</select>
        </div>
        <div class="form-row"><label>Category</label>
          <select id="df_category"><option value="">— Select —</option>${PRODUCT_CATEGORIES.map(c=>opt(c.id,p.category,c.label)).join('')}</select>
        </div>
        <div class="form-row"><label>Phase</label>
          <select id="df_phase">${DTC_PHASES.map(ph=>opt(ph.id,p.phase||'idea',ph.label)).join('')}</select>
        </div>
        <div class="form-row"><label>Manufacturer</label>
          <select id="df_manufacturer"><option value="">— Select —</option>${MANUFACTURERS.map(m=>opt(m.id,p.manufacturer,m.label)).join('')}</select>
        </div>
        <div class="form-row"><label>Priority</label>
          <select id="df_priority"><option value="">— Select —</option>${PRIORITIES.map(pr=>opt(pr.id,p.priority,pr.label)).join('')}</select>
        </div>
        <div class="form-row"><label>Drop date</label><input id="df_drop_date" type="date" value="${p.drop_date||''}"></div>
        <div class="form-row"><label>Phase start date</label><input id="df_phase_changed_at" type="date" value="${p.phase_changed_at||''}"></div>
        <div class="form-row"><label>Est. cost ($)</label><input id="df_est_cost" type="number" value="${p.est_cost||''}" placeholder="5000"></div>
        <div class="form-row"><label>Units</label><input id="df_units" type="number" value="${p.units||''}" placeholder="300"></div>
      </div>
      <div class="form-row"><label>Figma link</label><input id="df_figma" value="${p.figma_link||''}" placeholder="https://figma.com/..."></div>
      <div class="form-row"><label>Tech pack link</label><input id="df_techpack" value="${p.tech_pack_link||''}" placeholder="https://..."></div>
      <div style="margin:.75rem 0;display:flex;gap:1.5rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="df_dep50" ${p.deposit_50_paid?'checked':''}> 50% deposit paid</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="df_fin50" ${p.final_50_paid?'checked':''}> Final 50% paid</label>
      </div>
      ${isSampling ? `
      <div class="section-divider" style="margin:.75rem 0">Sampling</div>
      <div class="form-grid">
        <div class="form-row"><label>Manufacturer order date</label><input id="df_mfr_order_date" type="date" value="${p.manufacturer_order_date||''}"></div>
        <div class="form-row" style="justify-content:flex-end;padding-top:1.5rem">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="df_photos_sent" ${p.photographer_samples_sent?'checked':''}> Samples sent to photographer</label>
        </div>
        <div class="form-row" style="grid-column:span 2">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="df_photos_approved" ${p.photographer_photos_approved?'checked':''}> Photos approved</label>
        </div>
      </div>` : '<input type="hidden" id="df_mfr_order_date" value=""><input type="hidden" id="df_photos_sent"><input type="hidden" id="df_photos_approved">'}
      ${isWarehouse ? `
      <div class="section-divider" style="margin:.75rem 0">Warehouse Receiving</div>
      <div class="form-grid">
        <div class="form-row"><label>Units ordered</label><input id="df_units_ordered" type="number" value="${p.units_ordered||''}" placeholder="300"></div>
        <div class="form-row"><label>Units received</label><input id="df_units_received" type="number" value="${p.units_received||''}" placeholder="298"></div>
      </div>` : '<input type="hidden" id="df_units_ordered" value=""><input type="hidden" id="df_units_received" value="">'}
      <div class="form-row"><label>Notes</label><textarea id="df_notes">${p.notes||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="dtcFmCancel">Cancel</button>
      <button class="btn btn-accent" id="dtcFmSave">Save product</button>
    </div>`;

  overlay.classList.remove('hidden');
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const cb = id => document.getElementById(id)?.checked || false;

  document.getElementById('dtcFmClose').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('dtcFmCancel').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('dtcFmSave').addEventListener('click', () => {
    onSave({
      name: g('df_name'), product_type: g('df_type'), category: g('df_category'),
      phase: g('df_phase'), manufacturer: g('df_manufacturer'), priority: g('df_priority'), drop_date: g('df_drop_date'),
      phase_changed_at: g('df_phase_changed_at'), est_cost: g('df_est_cost'), units: g('df_units'),
      figma_link: g('df_figma'), tech_pack_link: g('df_techpack'),
      deposit_50_paid: cb('df_dep50'), final_50_paid: cb('df_fin50'),
      manufacturer_order_date: g('df_mfr_order_date'),
      photographer_samples_sent: cb('df_photos_sent'),
      photographer_photos_approved: cb('df_photos_approved'),
      units_ordered: g('df_units_ordered'), units_received: g('df_units_received'),
      notes: g('df_notes'),
    });
  });
}
