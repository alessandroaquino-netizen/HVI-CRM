import * as XLSX from 'xlsx';
import { parseSkuSheet, summarizeSkus } from '../skus/parseSkuSheet.js';
import { matchByName } from '../invoices/match.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function guessType(name) {
  const n = name.toLowerCase();
  if (/hoodie/.test(n)) return 'hoodie';
  if (/trucker|snapback|flexfit|\bhat\b|\bcap\b|beanie/.test(n)) return 'hat-embroidered';
  if (/\btee\b|tank|crop|long sleeve/.test(n)) return 'tee';
  return 'other';
}

// ctx: { products, onSave(items) → summary string, onCreateProduct(name, type) }
export function renderSkuImport(ctx) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const st = { parsed: null, from: '2026-01-01', file: '', groups: [], choice: {}, include: {}, showIdle: false };

  const group = () => {
    st.groups = summarizeSkus(st.parsed, st.from);
    st.groups.forEach(g => {
      if (!(g.product in st.choice)) {
        const m = matchByName(g.product, ctx.products, { minSuggest: 0.7 });
        st.choice[g.product] = m.best ? m.best.product.id : '__new';
      }
      if (!(g.product in st.include)) st.include[g.product] = g.units > 0;
    });
  };

  const draw = () => {
    box.setAttribute('data-wide', '1');
    const p = st.parsed;
    const visible = st.groups.filter(g => st.showIdle || g.units > 0);
    const chosen = st.groups.filter(g => st.include[g.product]);
    box.innerHTML = `
      <div class="modal-header"><h3>Import SKU sheet</h3><button class="btn btn-sm btn-ghost" id="skClose">✕</button></div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--text3);margin-bottom:12px">
          Reads a supplier SKU / order sheet (for example Print Theory) and fills each product's Sizes &amp; SKUs with the quantities ordered since the date below.
          Existing sizes are updated by SKU code and nothing is deleted.</div>
        <div class="form-grid">
          <div class="form-row"><label>Sheet (.xlsx / .xls / .csv)</label><input type="file" id="skFile" accept=".xls,.xlsx,.xlsm,.csv"></div>
          <div class="form-row"><label>Count orders placed from</label><input type="date" id="skFrom" value="${esc(st.from)}"></div>
        </div>
        ${p ? `
          <div style="font-size:12px;color:var(--text2);margin:4px 0 10px">${esc(st.file)} · sheet "${esc(p.sheetName)}" · ${p.rows.length} SKUs · ${st.groups.length} products · ${p.orderColumns.length} order columns (${esc(p.orderColumns[0]?.label)} to ${esc(p.orderColumns.at(-1)?.label)})</div>
          ${p.warnings.length ? `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;margin-bottom:12px;max-height:130px;overflow:auto">${p.warnings.map(w => `<div style="font-size:12px;color:${w.level === 'error' ? 'var(--red)' : 'var(--accent)'}">${w.level === 'error' ? '✗' : '⚠'} ${esc(w.msg)}</div>`).join('')}</div>` : ''}
          <table class="list-table"><thead><tr><th></th><th>Product on the sheet</th><th>SKUs</th><th>Units since ${esc(st.from)}</th><th>Goes to</th></tr></thead><tbody>
          ${visible.map(g => `<tr><td><input type="checkbox" class="sk-inc" data-p="${esc(g.product)}" ${st.include[g.product] ? 'checked' : ''}></td>
            <td>${esc(g.product)}</td><td>${g.skus.length}</td><td style="font-family:var(--mono)">${g.units}</td>
            <td><select class="sk-ch" data-p="${esc(g.product)}" style="max-width:260px"><option value="__new" ${st.choice[g.product] === '__new' ? 'selected' : ''}>+ Create new product</option>
              ${ctx.products.map(pr => `<option value="${pr.id}" ${st.choice[g.product] === pr.id ? 'selected' : ''}>${esc(pr.name)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--text3)">No product has orders in this period.</td></tr>'}
          </tbody></table>
          <label style="font-size:12px;color:var(--text3);cursor:pointer;display:inline-block;margin-top:8px"><input type="checkbox" id="skIdle" ${st.showIdle ? 'checked' : ''}> also show products with no orders in this period (${st.groups.filter(g => g.units === 0).length})</label>
        ` : ''}
        <div id="skMsg" style="font-size:12px;margin-top:10px;min-height:16px"></div>
      </div>
      <div class="modal-footer"><button class="btn" id="skCancel">Close</button><button class="btn btn-accent" id="skSave" ${p && chosen.length ? '' : 'disabled'}>Import ${chosen.length || ''} product${chosen.length === 1 ? '' : 's'}</button></div>`;
    overlay.classList.remove('hidden');
    const close = () => overlay.classList.add('hidden');
    box.querySelector('#skClose').addEventListener('click', close);
    box.querySelector('#skCancel').addEventListener('click', close);
    box.querySelector('#skFrom').addEventListener('change', e => { st.from = e.target.value || '2026-01-01'; st.include = {}; if (st.parsed) group(); draw(); });
    box.querySelector('#skFile').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellDates: true });
        const parsed = parseSkuSheet(wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) })));
        if (!parsed.ok) { box.querySelector('#skMsg').style.color = 'var(--red)'; box.querySelector('#skMsg').textContent = parsed.error; return; }
        st.parsed = parsed; st.file = f.name; st.choice = {}; st.include = {}; group(); draw();
      } catch (err) { box.querySelector('#skMsg').style.color = 'var(--red)'; box.querySelector('#skMsg').textContent = 'Could not read the file: ' + err.message; }
    });
    box.querySelector('#skIdle')?.addEventListener('change', e => { st.showIdle = e.target.checked; draw(); });
    box.querySelectorAll('.sk-inc').forEach(el => el.addEventListener('change', () => { st.include[el.dataset.p] = el.checked; draw(); }));
    box.querySelectorAll('.sk-ch').forEach(el => el.addEventListener('change', () => { st.choice[el.dataset.p] = el.value; }));
    box.querySelector('#skSave')?.addEventListener('click', async e => {
      e.target.disabled = true; e.target.textContent = 'Importing…';
      try {
        const items = chosen.map(g => ({ productName: g.product, productId: st.choice[g.product] === '__new' ? null : st.choice[g.product], type: guessType(g.product),
          variants: g.skus.filter(s => st.include[g.product] && (s.windowQty > 0 || s.sumOrders > 0)).map(s => ({ sku: s.sku, option_label: [s.size, s.color].filter(Boolean).join(' / ') || s.model || 'Default', units_ordered: s.windowQty })) }));
        const msg = await ctx.onSave(items);
        box.querySelector('#skMsg').style.color = 'var(--green)'; box.querySelector('#skMsg').textContent = msg;
        e.target.textContent = 'Done';
      } catch (err) { box.querySelector('#skMsg').style.color = 'var(--red)'; box.querySelector('#skMsg').textContent = 'Import failed: ' + err.message; e.target.disabled = false; e.target.textContent = 'Import'; }
    });
  };
  draw();
}
