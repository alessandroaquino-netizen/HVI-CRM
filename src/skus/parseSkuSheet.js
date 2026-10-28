// Template-agnostic reader for SKU / size-breakdown sheets such as the Print Theory order sheet.
// It finds the header row by its titles (SKU, product, size, colour …), treats every date-like title to the right
// as an order column (quantities ordered on that date), and checks the sheet against itself (duplicate SKUs,
// totals that do not equal the sum of the order columns) so errors in the source are shown, not imported silently.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const str = v => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')).replace(/\s+/g, ' ').trim();

// "7.17.23" → 2023-07-17,  "Dec '22" → 2022-12-01,  "6/5/2025" → 2025-06-05,  Date → ISO
export function parseOrderDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = str(v);
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; }
  m = s.match(/^([A-Za-z]{3,9})\.?\s*['’]?(\d{2,4})$/);
  if (m && MONTHS[m[1].slice(0, 4).toLowerCase()] || m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    const mo = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()];
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${String(mo).padStart(2, '0')}-01`;
  }
  return '';
}

export function parseSkuSheet(sheets) {
  const warnings = [];
  for (const sheet of sheets) {
    const grid = sheet.rows;
    const h = grid.findIndex(r => r.some(c => /^sku\b/i.test(str(c))) && r.some(c => /^product/i.test(str(c))));
    if (h < 0) continue;
    const header = grid[h].map(str);
    const col = re => header.findIndex(c => re.test(c));
    const idx = { sku: col(/^sku/i), product: col(/^product/i), size: col(/^size/i), color: col(/colou?r/i), model: col(/brand|model/i), design: col(/design/i), pocket: col(/pocket/i), total: col(/^totals?$/i) };
    const orderCols = header.map((c, i) => ({ i, label: grid[h][i], date: parseOrderDate(grid[h][i]) })).filter(x => x.date && x.i > Math.max(idx.sku, idx.product, idx.size));

    const rows = [], seen = new Map();
    for (let r = h + 1; r < grid.length; r++) {
      const row = grid[r], sku = str(row[idx.sku]);
      if (!sku) continue;
      const orders = orderCols.map(o => ({ date: o.date, qty: Number(row[o.i]) })).filter(o => Number.isFinite(o.qty) && o.qty !== 0);
      const sum = orders.reduce((a, o) => a + o.qty, 0);
      const item = {
        rowNumber: r + 1, sku, product: str(row[idx.product]), size: idx.size >= 0 ? str(row[idx.size]) : '', color: idx.color >= 0 ? str(row[idx.color]) : '',
        model: idx.model >= 0 ? str(row[idx.model]) : '', design: idx.design >= 0 ? str(row[idx.design]) : '', pocket: idx.pocket >= 0 ? str(row[idx.pocket]) : '',
        sheetTotal: idx.total >= 0 && Number.isFinite(Number(row[idx.total])) && row[idx.total] !== '' ? Number(row[idx.total]) : null, orders, sumOrders: sum,
      };
      if (!item.product) warnings.push({ level: 'warn', msg: `Row ${item.rowNumber} (${sku}) has no product name.` });
      if (item.sheetTotal != null && Math.abs(item.sheetTotal - sum) > 0.01) warnings.push({ level: 'warn', msg: `${sku} (${item.product}${item.size ? ', ' + item.size : ''}): the sheet's Totals says ${item.sheetTotal} but its order columns add up to ${sum}. The order columns are used.`, sku });
      if (seen.has(sku)) warnings.push({ level: 'error', msg: `SKU ${sku} appears twice (rows ${seen.get(sku)} and ${item.rowNumber}: ${item.product}). Only the first row is imported; fix the sheet.`, sku, duplicate: true });
      else { seen.set(sku, item.rowNumber); rows.push(item); }
    }
    return { ok: true, sheetName: sheet.name, columns: idx, orderColumns: orderCols.map(o => ({ label: str(o.label), date: o.date })), rows, warnings };
  }
  return { ok: false, error: 'No SKU table found (looked for a header row with "SKU" and "Product").', warnings };
}

// Group rows by product and total the orders placed on/after `from`.
export function summarizeSkus(parsed, from) {
  const byProduct = new Map();
  for (const r of parsed.rows) {
    const p = byProduct.get(r.product) || { product: r.product, skus: [], units: 0, allTime: 0 };
    const inWindow = r.orders.filter(o => !from || o.date >= from).reduce((a, o) => a + o.qty, 0);
    p.skus.push({ ...r, windowQty: inWindow }); p.units += inWindow; p.allTime += r.sumOrders;
    byProduct.set(r.product, p);
  }
  return [...byProduct.values()];
}
