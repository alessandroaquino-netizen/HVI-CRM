import { MANUFACTURERS } from '../dtc_constants.js';
import { formatDate } from '../utils.js';
import { buildPlan } from '../invoices/plan.js';
import { ACCEPTED_TYPES } from '../invoices/readFile.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n == null || n === '' ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const LINE_TYPES = ['product', 'photography', 'shipping', 'sample_fee', 'fee', 'other'];
const TYPE_LABEL = { product: 'Product', photography: 'Photography', shipping: 'Shipping / duty', sample_fee: 'Sample fee', fee: 'Other fee', other: 'Other' };
const METHOD_LABEL = { rules: 'Rules', ai: 'AI', manual: 'Manual', history: 'History load' };
const LEVEL_STYLE = { error: 'var(--red)', warn: 'var(--accent)', info: 'var(--text3)' };
const CONF_STYLE = { certain: 'var(--green)', chosen: 'var(--green)', suggested: 'var(--accent)', conflict: 'var(--red)', none: 'var(--red)' };

// ─── List page ────────────────────────────────────────────────────────────
export function renderDtcInvoices(invoices, products, { onUpload, onOpen }) {
  const el = document.getElementById('dtcInvoicesView');
  if (!el) return;
  const pname = id => products.find(p => p.id === id)?.name;
  const finals = invoices.filter(i => i.doc_type === 'final');
  const sorted = [...invoices].sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''));
  const attention = invoices.filter(i => i.warnings.some(w => w.level === 'error' || w.level === 'warn')).length;
  const kpi = (l, v, sub) => `<div class="kpi-card" style="padding:.9rem 1.1rem"><div class="kpi-label">${l}</div><div class="kpi-val" style="font-size:22px">${v}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem">
      <div style="font-size:12px;color:var(--text3);max-width:760px">
        Upload a supplier invoice (pro-forma or final, .xls / .xlsx / .csv). The system reads the lines whatever the layout, matches each one to a product,
        splits shared charges (courier, photography, fees) across products, and shows everything for review before anything is saved.
        Saving fills the product's financial record. Exact duplicates are blocked.
      </div>
      <label class="btn btn-accent" style="cursor:pointer;white-space:nowrap">⬆ Upload invoices
        <input type="file" id="invoiceFileInput" multiple accept="${ACCEPTED_TYPES}" style="display:none"></label>
    </div>
    <div class="proj-summary" style="grid-template-columns:repeat(4,1fr);margin-bottom:1.2rem">
      ${kpi('Documents', invoices.length, `${finals.length} final · ${invoices.length - finals.length} pro-forma`)}
      ${kpi('Total on final invoices', money(finals.reduce((a, i) => a + Number(i.total_amount || 0), 0)))}
      ${kpi('With warnings', attention, 'open one to review')}
      ${kpi('Products with cost data', new Set(invoices.flatMap(i => i.lines.filter(l => l.dtc_product_id).map(l => l.dtc_product_id))).size)}
    </div>
    <div id="invoiceDropZone" style="border:1px dashed var(--border2);border-radius:var(--radius);padding:1rem;text-align:center;color:var(--text3);font-size:12px;margin-bottom:1rem">Drop invoice files here</div>
    <table class="list-table">
      <thead><tr><th>Date</th><th>Type</th><th>Invoice #</th><th>Supplier</th><th>Products</th><th>Total</th><th>Source</th><th></th></tr></thead>
      <tbody>${sorted.map(i => {
        const prods = [...new Set(i.lines.filter(l => l.dtc_product_id && l.line_type === 'product').map(l => pname(l.dtc_product_id)).filter(Boolean))];
        const warn = i.warnings.filter(w => w.level !== 'info').length;
        return `<tr data-open-invoice="${i.id}" style="cursor:pointer">
          <td style="font-family:var(--mono);font-size:12px">${i.invoice_date ? formatDate(i.invoice_date) : '—'}</td>
          <td><span class="badge" style="background:${i.doc_type === 'final' ? 'rgba(76,175,125,.2);color:var(--green)' : 'rgba(240,192,64,.2);color:var(--accent)'}">${i.doc_type === 'proforma' ? 'Pro-forma' : i.doc_type}</span></td>
          <td style="font-family:var(--mono);font-size:12px">${esc(i.invoice_number)}</td>
          <td style="font-size:12px">${esc(MANUFACTURERS.find(m => m.id === i.manufacturer)?.label || i.manufacturer || '—')}</td>
          <td style="font-size:12px;color:var(--text2)">${esc(prods.slice(0, 3).join(', '))}${prods.length > 3 ? ` +${prods.length - 3}` : ''}</td>
          <td style="font-family:var(--mono)">${money(i.total_amount)}</td>
          <td style="font-size:11px;color:var(--text3)">${METHOD_LABEL[i.extraction_method] || ''}${warn ? ` · <span style="color:var(--accent)">${warn} warning${warn > 1 ? 's' : ''}</span>` : ''}</td>
          <td>${i.file_path ? '📎' : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="8" style="color:var(--text3)">No invoices yet. Upload one to get started.</td></tr>'}</tbody>
    </table>`;
  const input = el.querySelector('#invoiceFileInput');
  input.addEventListener('change', () => { if (input.files.length) onUpload([...input.files]); input.value = ''; });
  const drop = el.querySelector('#invoiceDropZone');
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.borderColor = ''; }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) onUpload([...e.dataTransfer.files]); });
  el.querySelectorAll('[data-open-invoice]').forEach(r => r.addEventListener('click', () => onOpen(r.dataset.openInvoice)));
}

// ─── Review modal (one uploaded file at a time) ───────────────────────────
// items: [{ file, hash, method, parsed }]  ctx: { products, aliases, invoices, financials, onSave, onCreateProduct, onDone }
export function renderInvoiceReview(items, ctx) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  let idx = 0;
  const state = items.map(it => ({ ...it, forced: {}, alloc: {}, types: {}, manufacturer: it.parsed.manufacturerGuess || '', docType: it.parsed.docType, depositPct: null,
    invoiceNumber: it.parsed.invoiceNumber, invoiceDate: it.parsed.invoiceDate, confirmed: new Set(), applyFin: null, depositDate: '', saved: false }));

  const prior = () => ctx.invoices.map(i => ({ ...i, lines: i.lines }));
  const planFor = s => {
    const parsed = { ...s.parsed, docType: s.docType, invoiceNumber: s.invoiceNumber, invoiceDate: s.invoiceDate, manufacturerGuess: s.manufacturer,
      lines: s.parsed.lines.map(l => ({ ...l, lineType: s.types[l.description] || l.lineType })) };
    const allocationOverrides = {};
    Object.entries(s.alloc).forEach(([d, a]) => { if (a !== 'dtc') allocationOverrides[d] = { allocation: a, note: a === 'b2b' ? 'Marked as not DTC (B2B / customer order).' : 'Ignored by reviewer.' }; });
    return buildPlan({ parsed, fileName: s.file?.name || '', products: ctx.products, aliases: ctx.aliases, priorInvoices: prior(), depositPct: s.depositPct ?? undefined, forcedMap: s.forced, allocationOverrides });
  };

  const draw = () => {
    const s = state[idx];
    const plan = planFor(s);
    const pn = id => ctx.products.find(p => p.id === id)?.name || '';
    const conflicts = plan.rows.filter(r => r.confidence === 'conflict' && !s.confirmed.has(r.description));
    const unresolved = plan.rows.filter(r => r.lineType === 'product' && r.allocation === 'dtc' && !r.productId);
    const blocking = plan.warnings.filter(w => w.duplicate);
    const hasErr = !!(conflicts.length || unresolved.length || blocking.length);
    const finFor = pid => ctx.financials.find(f => f.dtc_product_id === pid);
    if (!s.applyFin) s.applyFin = new Set(plan.productsFin.filter(pf => { const f = finFor(pf.productId); return !f || (!f.deposit_amount && !f.final_amount); }).map(pf => pf.productId));

    const productSelect = r => {
      const opts = ctx.products.map(p => `<option value="${p.id}" ${r.productId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
      return `<select class="inv-product" data-desc="${esc(r.description)}" style="max-width:210px"><option value="">— choose —</option>${opts}<option value="__new">+ New product…</option></select>`;
    };
    const rowsHtml = plan.rows.map(r => {
      const split = r.splitOf != null;
      const color = CONF_STYLE[r.confidence] || 'var(--text3)';
      const isConflict = r.confidence === 'conflict';
      return `<tr style="${split ? 'background:rgba(255,255,255,.02)' : ''}">
        <td style="max-width:260px;${split ? 'padding-left:22px;color:var(--text3)' : ''}">${split ? '↳ ' : ''}${esc(r.description)}</td>
        <td>${split ? '<span style="color:var(--text3);font-size:11px">' + TYPE_LABEL[r.lineType] + '</span>' :
          `<select class="inv-type" data-desc="${esc(r.description)}">${LINE_TYPES.map(t => `<option value="${t}" ${r.lineType === t ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}</select>`}</td>
        <td style="font-family:var(--mono);font-size:12px;text-align:right">${r.quantity ?? ''}${r.packedQuantity != null && r.packedQuantity !== r.quantity ? `<div style="color:var(--accent);font-size:10px">packed ${r.packedQuantity}</div>` : ''}</td>
        <td style="font-family:var(--mono);font-size:12px;text-align:right">${r.unitPrice ?? ''}</td>
        <td style="font-family:var(--mono);font-size:12px;text-align:right">${money(r.amount)}</td>
        <td>${split ? `<span style="font-size:12px">${esc(pn(r.productId))}</span>` : `<select class="inv-alloc" data-desc="${esc(r.description)}" style="width:92px">
            <option value="dtc" ${r.allocation === 'dtc' ? 'selected' : ''}>DTC</option><option value="b2b" ${r.allocation === 'b2b' ? 'selected' : ''}>Not DTC</option><option value="ignore" ${r.allocation === 'ignore' ? 'selected' : ''}>Ignore</option></select>`}</td>
        <td>${split || r.allocation !== 'dtc' || !['product', 'sample_fee', 'fee'].includes(r.lineType) ? '' : productSelect(r)}</td>
        <td style="font-size:11px;color:${color}">${r.allocation !== 'dtc' ? '' : (isConflict ? '⚠ conflict' : r.confidence === 'none' ? '✗ none' : r.confidence)}
          ${isConflict && !s.confirmed.has(r.description) ? `<br><label style="color:var(--text2);cursor:pointer"><input type="checkbox" class="inv-confirm" data-desc="${esc(r.description)}"> I checked</label>` : ''}
          ${r.note ? `<div style="color:var(--text3);font-size:10px;max-width:260px">${esc(r.note)}</div>` : ''}</td></tr>`;
    }).join('');

    box.setAttribute('data-wide', '1');
    box.innerHTML = `
      <div class="modal-header"><h3>Review invoice ${state.length > 1 ? `(${idx + 1} of ${state.length})` : ''} <span style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-left:8px">${esc(s.file?.name || '')} · read by ${METHOD_LABEL[s.method] || s.method}</span></h3>
        <button class="btn btn-sm btn-ghost" id="invClose">✕</button></div>
      <div class="modal-body">
        <div class="form-grid" style="grid-template-columns:repeat(5,1fr)">
          <div class="form-row"><label>Supplier</label><select id="inv_mfr"><option value="">— select —</option>${MANUFACTURERS.map(m => `<option value="${m.id}" ${s.manufacturer === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div>
          <div class="form-row"><label>Document</label><select id="inv_type"><option value="proforma" ${s.docType === 'proforma' ? 'selected' : ''}>Pro-forma</option><option value="final" ${s.docType === 'final' ? 'selected' : ''}>Final invoice</option><option value="other" ${s.docType === 'other' ? 'selected' : ''}>Other</option></select></div>
          <div class="form-row"><label>Invoice #</label><input id="inv_no" value="${esc(s.invoiceNumber)}"></div>
          <div class="form-row"><label>Date</label><input id="inv_date" type="date" value="${esc(s.invoiceDate)}"></div>
          <div class="form-row"><label>Deposit % (pro-forma)</label><input id="inv_pct" type="number" min="0" max="100" value="${plan.header.depositPct}"></div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin:2px 0 10px">Order refs: <b>${esc(plan.header.refs.join(', ') || '—')}</b> ·
          Document total <b>${money(plan.header.total)}</b>${plan.header.depositTotal ? ` · deposits listed <b>${money(plan.header.depositTotal)}</b>` : ''}${plan.header.overpaid ? ` · overpaid ${money(plan.header.overpaid)}` : ''}${plan.header.balance != null ? ` · balance <b>${money(plan.header.balance)}</b>` : ''}</div>

        ${plan.warnings.length ? `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;margin-bottom:12px">${plan.warnings.map(w =>
          `<div style="font-size:12px;color:${LEVEL_STYLE[w.level]};margin:2px 0">${w.level === 'error' ? '✗' : w.level === 'warn' ? '⚠' : 'ℹ'} ${esc(w.msg)}</div>`).join('')}</div>` : ''}

        <div style="overflow-x:auto"><table class="list-table"><thead><tr><th>Line on the document</th><th>Type</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Amount</th><th>Counts as</th><th>Product</th><th>Match</th></tr></thead>
          <tbody>${rowsHtml}</tbody></table></div>

        <div class="section-divider" style="margin:1rem 0 .5rem">What will be saved per product</div>
        <table class="list-table"><thead><tr><th>Product</th><th>Goods</th><th>Photo</th><th>Shipping</th><th>Fees</th><th>Total</th><th>Units</th><th>Cost / unit</th><th>Deposit</th><th>Final</th><th>Financial record</th></tr></thead>
          <tbody>${plan.productsFin.map(pf => {
            const f = finFor(pf.productId);
            const existing = f && (f.deposit_amount || f.final_amount) ? `currently ${money(f.deposit_amount)} / ${money(f.final_amount)}` : 'empty';
            return `<tr><td>${esc(pn(pf.productId))}</td><td>${money(pf.goods)}</td><td>${money(pf.photography)}</td><td>${money(pf.shipping)}</td><td>${money(pf.fees)}</td><td><b>${money(pf.total)}</b></td>
              <td>${pf.units || '—'}</td><td>${pf.units ? money(pf.total / pf.units) : '—'}</td><td>${money(pf.deposit)}<div style="font-size:10px;color:var(--text3)">${esc(pf.depositBasis || '')}</div></td><td>${money(pf.final)}</td>
              <td style="font-size:11px"><label style="cursor:pointer"><input type="checkbox" class="inv-applyfin" data-pid="${pf.productId}" ${s.applyFin.has(pf.productId) ? 'checked' : ''}> update</label><div style="color:var(--text3)">${existing}</div></td></tr>`;
          }).join('') || '<tr><td colspan="11" style="color:var(--text3)">No DTC products on this document.</td></tr>'}</tbody></table>
        ${s.docType === 'final' && plan.productsFin.some(p => p.depositPaid) ? `<div class="form-row" style="max-width:260px;margin-top:10px"><label>Deposit paid on (optional)</label><input id="inv_depdate" type="date" value="${esc(s.depositDate)}"></div>` : ''}
      </div>
      <div class="modal-footer">
        <span style="margin-right:auto;font-size:12px;color:${hasErr ? 'var(--red)' : 'var(--green)'}">${hasErr ? `${unresolved.length ? unresolved.length + ' line(s) need a product. ' : ''}${conflicts.length ? conflicts.length + ' conflict(s) to confirm. ' : ''}${blocking.length ? 'Duplicate.' : ''}` : 'Everything is matched. Review the amounts, then save.'}</span>
        ${state.length > 1 && idx < state.length - 1 ? '<button class="btn" id="invSkip">Skip this file</button>' : ''}
        <button class="btn" id="invCancel">Cancel</button>
        <button class="btn btn-accent" id="invSave" ${hasErr ? 'disabled' : ''}>Save invoice</button>
      </div>`;
    overlay.classList.remove('hidden');

    const redraw = () => draw();
    const val = id => box.querySelector('#' + id)?.value;
    box.querySelector('#inv_mfr').addEventListener('change', e => { s.manufacturer = e.target.value; s.depositPct = null; redraw(); });
    box.querySelector('#inv_type').addEventListener('change', e => { s.docType = e.target.value; redraw(); });
    box.querySelector('#inv_no').addEventListener('change', e => { s.invoiceNumber = e.target.value.trim(); redraw(); });
    box.querySelector('#inv_date').addEventListener('change', e => { s.invoiceDate = e.target.value; });
    box.querySelector('#inv_pct').addEventListener('change', e => { s.depositPct = Number(e.target.value) || 0; redraw(); });
    box.querySelector('#inv_depdate')?.addEventListener('change', e => { s.depositDate = e.target.value; });
    box.querySelectorAll('.inv-type').forEach(el => el.addEventListener('change', () => { s.types[el.dataset.desc] = el.value; redraw(); }));
    box.querySelectorAll('.inv-alloc').forEach(el => el.addEventListener('change', () => { s.alloc[el.dataset.desc] = el.value; redraw(); }));
    box.querySelectorAll('.inv-confirm').forEach(el => el.addEventListener('change', () => { if (el.checked) s.confirmed.add(el.dataset.desc); redraw(); }));
    box.querySelectorAll('.inv-applyfin').forEach(el => el.addEventListener('change', () => { el.checked ? s.applyFin.add(el.dataset.pid) : s.applyFin.delete(el.dataset.pid); }));
    box.querySelectorAll('.inv-product').forEach(el => el.addEventListener('change', async () => {
      if (el.value === '__new') {
        const name = prompt('Name of the new product:', el.dataset.desc.replace(/\s+/g, ' '));
        if (!name) { redraw(); return; }
        const created = await ctx.onCreateProduct(name.trim(), s.manufacturer);
        if (created) { ctx.products.push(created); s.forced[el.dataset.desc] = created.id; s.confirmed.add(el.dataset.desc); }
        redraw(); return;
      }
      if (el.value) { s.forced[el.dataset.desc] = el.value; s.confirmed.add(el.dataset.desc); } else delete s.forced[el.dataset.desc];
      redraw();
    }));
    const next = () => { if (idx < state.length - 1) { idx++; draw(); } else { overlay.classList.add('hidden'); ctx.onDone(); } };
    box.querySelector('#invClose').addEventListener('click', () => { overlay.classList.add('hidden'); ctx.onDone(); });
    box.querySelector('#invCancel').addEventListener('click', () => { overlay.classList.add('hidden'); ctx.onDone(); });
    box.querySelector('#invSkip')?.addEventListener('click', next);
    box.querySelector('#invSave').addEventListener('click', async e => {
      e.target.disabled = true; e.target.textContent = 'Saving…';
      try {
        const depositPaidDates = s.depositDate ? Object.fromEntries(plan.productsFin.filter(p => p.depositPaid).map(p => [p.productId, s.depositDate])) : {};
        await ctx.onSave({ plan: { ...plan, productsFin: plan.productsFin }, parsed: s.parsed, file: s.file, hash: s.hash, method: s.method, applyFin: s.applyFin, depositPaidDates });
        s.saved = true; next();
      } catch (err) { alert('Could not save: ' + err.message); e.target.disabled = false; e.target.textContent = 'Save invoice'; }
    });
  };
  draw();
}

// ─── Saved invoice detail ─────────────────────────────────────────────────
export function renderInvoiceDetail(inv, products, { onDelete, onOpenFile, onAttach }) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const pn = id => products.find(p => p.id === id)?.name || '';
  const sum = f => inv.lines.filter(f).reduce((a, l) => a + Number(l.amount), 0);
  box.setAttribute('data-wide', '1');
  box.innerHTML = `
    <div class="modal-header"><h3>${inv.doc_type === 'proforma' ? 'Pro-forma' : 'Invoice'} ${esc(inv.invoice_number)}</h3>
      <div style="display:flex;gap:6px">${inv.file_path ? '<button class="btn btn-sm" id="invFile">Open original</button>' : '<label class="btn btn-sm" style="cursor:pointer">Attach original<input type="file" id="invAttach" style="display:none"></label>'}
        <button class="btn btn-sm btn-danger" id="invDelete">Delete</button><button class="btn btn-sm btn-ghost" id="invDClose">✕</button></div></div>
    <div class="modal-body">
      <div class="detail-grid">
        <div class="detail-field"><div class="lbl">Supplier</div><div class="val">${esc(MANUFACTURERS.find(m => m.id === inv.manufacturer)?.label || inv.manufacturer || '—')}</div></div>
        <div class="detail-field"><div class="lbl">Date</div><div class="val">${inv.invoice_date ? formatDate(inv.invoice_date) : '—'}</div></div>
        <div class="detail-field"><div class="lbl">Order refs</div><div class="val">${esc(inv.refs.join(', ') || '—')}</div></div>
        <div class="detail-field"><div class="lbl">Document total</div><div class="val">${money(inv.total_amount)}</div></div>
        <div class="detail-field"><div class="lbl">Deposits listed / balance</div><div class="val">${money(inv.deposit_paid)} / ${money(inv.balance_due)}</div></div>
        <div class="detail-field"><div class="lbl">Counted as DTC / not DTC</div><div class="val">${money(sum(l => l.allocation === 'dtc'))} / ${money(sum(l => l.allocation === 'b2b'))}</div></div>
      </div>
      ${inv.warnings.length ? `<div class="section-divider" style="margin:1rem 0 .5rem">Warnings at import</div>${inv.warnings.map(w => `<div style="font-size:12px;color:${LEVEL_STYLE[w.level] || 'var(--text2)'}">${w.level === 'error' ? '✗' : '⚠'} ${esc(w.msg)}</div>`).join('')}` : ''}
      <div class="section-divider" style="margin:1rem 0 .5rem">Lines</div>
      <div style="overflow-x:auto"><table class="list-table"><thead><tr><th>Description</th><th>Type</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Amount</th><th>Counts as</th><th>Product</th><th>Note</th></tr></thead>
      <tbody>${inv.lines.map(l => `<tr><td style="${l.split_of != null ? 'padding-left:22px;color:var(--text3)' : ''}">${l.split_of != null ? '↳ ' : ''}${esc(l.description)}</td><td style="font-size:11px">${TYPE_LABEL[l.line_type]}</td>
        <td style="font-family:var(--mono);font-size:12px;text-align:right">${l.quantity ?? ''}${l.packed_quantity != null && Number(l.packed_quantity) !== Number(l.quantity) ? ` <span style="color:var(--accent)">(packed ${l.packed_quantity})</span>` : ''}</td>
        <td style="font-family:var(--mono);font-size:12px;text-align:right">${l.unit_price ?? ''}</td><td style="font-family:var(--mono);font-size:12px;text-align:right">${money(l.amount)}</td>
        <td style="font-size:11px">${l.allocation === 'dtc' ? 'DTC' : l.allocation === 'b2b' ? 'Not DTC' : 'Ignored'}</td><td style="font-size:12px">${esc(pn(l.dtc_product_id))}</td><td style="font-size:10px;color:var(--text3);max-width:260px">${esc(l.note || '')}</td></tr>`).join('')}</tbody></table></div>
      <div style="font-size:11px;color:var(--text3);margin-top:10px">Deleting an invoice removes its lines and the stored file. Amounts already copied to a product's financial record stay there until edited in DTC Financials.</div>
    </div>`;
  overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');
  box.querySelector('#invDClose').addEventListener('click', close);
  box.querySelector('#invDelete').addEventListener('click', () => onDelete(inv));
  box.querySelector('#invFile')?.addEventListener('click', () => onOpenFile(inv));
  box.querySelector('#invAttach')?.addEventListener('change', e => { if (e.target.files[0]) onAttach(inv, e.target.files[0]); });
}
