import { MANUFACTURERS } from '../dtc_constants.js';
import { formatDate } from '../utils.js';
import { renderListDetail } from './modal.js';

export function renderDtcFinancials(financials, products) {
  const el = document.getElementById('dtcFinancialsView');
  if (!el) return;

  const totalDeposit   = financials.reduce((a,f) => a + (f.deposit_amount||0), 0);
  const totalFinal     = financials.reduce((a,f) => a + (f.final_amount||0), 0);
  const totalPhotog    = financials.reduce((a,f) => a + (f.photographer_fee||0), 0);
  const totalAddit     = financials.reduce((a,f) => a + (f.additional_payment_amount||0), 0);
  const depositPaid    = financials.filter(f => f.deposit_paid_date).reduce((a,f) => a + (f.deposit_amount||0), 0);
  const finalPaid      = financials.filter(f => f.final_paid_date || f.paid_in_full || f.full_payment_date).reduce((a,f) => a + (f.final_amount||0), 0);
  const photogPaid     = financials.filter(f => f.photographer_paid_date).reduce((a,f) => a + (f.photographer_fee||0), 0);
  const depositPending = totalDeposit - depositPaid;
  const finalPending   = totalFinal   - finalPaid;
  const photogPending  = totalPhotog  - photogPaid;
  const grandTotal     = totalDeposit + totalFinal + totalPhotog + totalAddit;
  const totalPaid      = depositPaid  + finalPaid  + photogPaid;

  // Group by manufacturer
  const byMfr = {};
  MANUFACTURERS.forEach(m => { byMfr[m.id] = { label: m.label, rows: [] }; });
  financials.forEach(f => {
    const key = f.manufacturer || 'other';
    if (!byMfr[key]) byMfr[key] = { label: key, rows: [] };
    byMfr[key].rows.push(f);
  });

  el.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:2rem">
      <div class="kpi-card" data-kpi="total"><div class="kpi-label">Total invoiced</div><div class="kpi-val">$${grandTotal.toLocaleString()}</div></div>
      <div class="kpi-card" data-kpi="depositPending" style="${depositPending>0?'border-color:rgba(240,192,64,.4)':''}">
        <div class="kpi-label">Deposits pending</div>
        <div class="kpi-val" style="color:${depositPending>0?'var(--accent)':'var(--text3)'}">$${depositPending.toLocaleString()}</div>
        <div class="kpi-sub">$${depositPaid.toLocaleString()} paid of $${totalDeposit.toLocaleString()}</div>
      </div>
      <div class="kpi-card" data-kpi="finalPending" style="${finalPending>0?'border-color:rgba(224,85,85,.4)':''}">
        <div class="kpi-label">Final payments pending</div>
        <div class="kpi-val" style="color:${finalPending>0?'var(--red)':'var(--text3)'}">$${finalPending.toLocaleString()}</div>
        <div class="kpi-sub">$${finalPaid.toLocaleString()} paid of $${totalFinal.toLocaleString()}</div>
      </div>
      <div class="kpi-card" data-kpi="photogPending" style="${photogPending>0?'border-color:rgba(91,156,246,.4)':''}">
        <div class="kpi-label">Photographer pending</div>
        <div class="kpi-val" style="color:${photogPending>0?'var(--blue)':'var(--text3)'}">$${photogPending.toLocaleString()}</div>
        <div class="kpi-sub">$${photogPaid.toLocaleString()} paid of $${totalPhotog.toLocaleString()}</div>
      </div>
      <div class="kpi-card" data-kpi="paid"><div class="kpi-label">Total paid to date</div><div class="kpi-val" style="color:var(--green)">$${totalPaid.toLocaleString()}</div><div class="kpi-sub">of $${grandTotal.toLocaleString()} total due</div></div>
    </div>

    ${Object.entries(byMfr).filter(([,v]) => v.rows.length > 0).map(([mfrId, mfr]) => `
      <div style="margin-bottom:2rem">
        <div class="section-divider" style="margin-bottom:.75rem">${mfr.label}</div>
        <table class="list-table">
          <thead><tr>
            <th>Product</th><th>Order #</th><th>Invoice #</th>
            <th>Deposit</th><th>Dep. paid</th>
            <th>Final</th><th>Final paid</th>
            <th>Photographer</th><th>Photo paid</th>
            <th>Additional</th><th>Next pmt due</th>
            <th>Notes</th><th></th>
          </tr></thead>
          <tbody>
            ${mfr.rows.map(f => `<tr>
              <td>${f.product_name||'—'}</td>
              <td style="font-family:var(--mono);font-size:11px">${f.order_number||'—'}</td>
              <td style="font-family:var(--mono);font-size:11px">${f.invoice_number||'—'}</td>
              <td>${f.deposit_amount?'$'+Number(f.deposit_amount).toLocaleString():'—'}</td>
              <td style="color:${f.deposit_paid_date?'var(--green)':'var(--red)'}">${f.deposit_paid_date?formatDate(f.deposit_paid_date):'✗'}</td>
              <td>${f.final_amount?'$'+Number(f.final_amount).toLocaleString():'—'}</td>
              <td style="color:${f.final_paid_date||f.paid_in_full?'var(--green)':'var(--red)'}">${f.paid_in_full?'✓ Paid full':(f.final_paid_date?formatDate(f.final_paid_date):'✗')}</td>
              <td>${f.photographer_fee?'$'+Number(f.photographer_fee).toLocaleString():'—'}</td>
              <td style="color:${f.photographer_paid_date?'var(--green)':'var(--text3)'}">${f.photographer_paid_date?formatDate(f.photographer_paid_date):'—'}</td>
              <td>${f.additional_payment_amount?'$'+Number(f.additional_payment_amount).toLocaleString()+(f.additional_payment_note?' ('+f.additional_payment_note+')':''):'—'}</td>
              <td style="font-family:var(--mono);font-size:11px;color:${f.expected_next_payment_date&&f.expected_next_payment_date<new Date().toISOString().slice(0,10)?'var(--red)':'var(--text3)'}">${f.expected_next_payment_date?formatDate(f.expected_next_payment_date):'—'}</td>
              <td style="font-size:11px;color:var(--text3)">${f.notes||'—'}</td>
              <td style="display:flex;gap:4px;white-space:nowrap">
                <button class="btn btn-sm btn-ghost" data-edit-fin="${f.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-del-fin="${f.id}">✕</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`).join('')}

    ${financials.length === 0 ? `<div style="text-align:center;color:var(--text3);padding:3rem;font-size:13px">No transactions yet.</div>` : ''}`;

  const finRow = f => ({ id: f.dtc_product_id || null, type: 'dtc', primary: f.product_name || '—', secondary: [f.manufacturer, f.invoice_number].filter(Boolean).join(' · '), value: '' });
  const drilldowns = {
    total:          () => renderListDetail('All Transactions', `$${grandTotal.toLocaleString()} total invoiced`, financials.map(finRow)),
    depositPending: () => renderListDetail('Deposits Pending', `$${depositPending.toLocaleString()} outstanding`, financials.filter(f => f.deposit_amount && !f.deposit_paid_date).map(finRow)),
    finalPending:   () => renderListDetail('Final Payments Pending', `$${finalPending.toLocaleString()} outstanding`, financials.filter(f => f.final_amount && !f.final_paid_date && !f.paid_in_full).map(finRow)),
    photogPending:  () => renderListDetail('Photographer Payments Pending', `$${photogPending.toLocaleString()} outstanding`, financials.filter(f => f.photographer_fee && !f.photographer_paid_date).map(finRow)),
    paid:           () => renderListDetail('Paid to Date', `$${totalPaid.toLocaleString()} paid of $${grandTotal.toLocaleString()}`, financials.filter(f => f.deposit_paid_date || f.final_paid_date || f.paid_in_full || f.photographer_paid_date).map(finRow)),
  };
  el.querySelectorAll('[data-kpi]').forEach(card => {
    const fn = drilldowns[card.dataset.kpi];
    if (!fn) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', fn);
  });
}

export function renderDtcFinancialForm(f = {}, editingId, products, { onSave }) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const productOpts = `<option value="">— No product linked —</option>` +
    products.map(p => `<option value="${p.id}" data-name="${p.name}" ${f.dtc_product_id===p.id?'selected':''}>${p.name}</option>`).join('');
  const mfrOpts = MANUFACTURERS.map(m => `<option value="${m.id}" ${f.manufacturer===m.id?'selected':''}>${m.label}</option>`).join('');

  box.innerHTML = `
    <div class="modal-header">
      <h3>${editingId?'Edit transaction':'New transaction'}</h3>
      <button class="btn btn-sm btn-ghost" id="finFmClose">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-row"><label>Linked product</label><select id="ff_product_id">${productOpts}</select></div>
      <div class="form-grid">
        <div class="form-row"><label>Manufacturer</label><select id="ff_manufacturer"><option value="">— Select —</option>${mfrOpts}</select></div>
        <div class="form-row"><label>Order number</label><input id="ff_order" value="${f.order_number||''}" placeholder="ORD-001"></div>
        <div class="form-row"><label>Invoice number</label><input id="ff_invoice" value="${f.invoice_number||''}" placeholder="INV-001"></div>
        <div class="form-row"><label>Deposit amount ($)</label><input id="ff_dep_amt" type="number" value="${f.deposit_amount||''}"></div>
        <div class="form-row"><label>Deposit paid date</label><input id="ff_dep_date" type="date" value="${f.deposit_paid_date||''}"></div>
        <div class="form-row"><label>Final amount ($)</label><input id="ff_fin_amt" type="number" value="${f.final_amount||''}"></div>
        <div class="form-row"><label>Final paid date</label><input id="ff_fin_date" type="date" value="${f.final_paid_date||''}"></div>
      </div>
      <div style="margin:.5rem 0">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="ff_paid_full" ${f.paid_in_full?'checked':''}> Paid in full (100% — single payment)
        </label>
      </div>
      <div class="form-grid">
        <div class="form-row"><label>Full payment date (if 100%)</label><input id="ff_full_date" type="date" value="${f.full_payment_date||''}"></div>
        <div class="form-row"><label>Expected next payment date</label><input id="ff_next_pmt" type="date" value="${f.expected_next_payment_date||''}"></div>
        <div class="form-row"><label>Photographer fee ($)</label><input id="ff_photog_fee" type="number" value="${f.photographer_fee||''}"></div>
        <div class="form-row"><label>Photographer paid date</label><input id="ff_photog_date" type="date" value="${f.photographer_paid_date||''}"></div>
        <div class="form-row"><label>Additional payment ($)</label><input id="ff_add_amt" type="number" value="${f.additional_payment_amount||''}" placeholder="e.g. duties, sample fees"></div>
        <div class="form-row"><label>Additional payment date</label><input id="ff_add_date" type="date" value="${f.additional_payment_date||''}"></div>
      </div>
      <div class="form-row"><label>Additional payment note</label><input id="ff_add_note" value="${f.additional_payment_note||''}" placeholder="e.g. customs duty"></div>
      <div class="form-row"><label>Notes</label><textarea id="ff_notes">${f.notes||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="finFmCancel">Cancel</button>
      <button class="btn btn-accent" id="finFmSave">Save transaction</button>
    </div>`;

  overlay.classList.remove('hidden');
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const cb = id => document.getElementById(id)?.checked || false;
  document.getElementById('finFmClose').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('finFmCancel').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('finFmSave').addEventListener('click', () => {
    const productId = g('ff_product_id');
    const productEl = document.querySelector(`#ff_product_id option[value="${productId}"]`);
    onSave({
      dtc_product_id: productId||null, product_name: productEl?.dataset.name||'',
      manufacturer: g('ff_manufacturer'), order_number: g('ff_order'), invoice_number: g('ff_invoice'),
      deposit_amount: g('ff_dep_amt'), deposit_paid_date: g('ff_dep_date'),
      final_amount: g('ff_fin_amt'), final_paid_date: g('ff_fin_date'),
      paid_in_full: cb('ff_paid_full'), full_payment_date: g('ff_full_date'),
      expected_next_payment_date: g('ff_next_pmt'),
      photographer_fee: g('ff_photog_fee'), photographer_paid_date: g('ff_photog_date'),
      additional_payment_amount: g('ff_add_amt'), additional_payment_note: g('ff_add_note'), additional_payment_date: g('ff_add_date'),
      notes: g('ff_notes'),
    });
  });
}
