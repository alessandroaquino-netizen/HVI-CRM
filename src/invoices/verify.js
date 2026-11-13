// Invoice verification: finds cost discrepancies and outliers across the saved supplier invoices (pure functions, tested in
// scripts/test-invoice-costing.mjs). Findings are suggestions for a person to check against the original document, not corrections.
const r2 = n => Math.round(n * 100) / 100;
const median = a => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const sum = (lines, type) => r2(lines.filter(l => l.line_type === type).reduce((a, l) => a + Number(l.amount || 0), 0));

export const THRESHOLDS = { unitPricePct: 0.15, costPerUnitPct: 0.25, freightPerKgPct: 0.3, depositPctPoints: 2, freightChangePct: 0.1 };

export function verifyInvoices(invoices, products, costs = new Map()) {
  const out = []; const T = THRESHOLDS;
  const prod = new Map(products.map(p => [p.id, p]));
  const name = id => prod.get(id)?.name || 'Unmatched product';
  const add = (inv, severity, kind, message, extra = {}) => out.push({ severity, kind, invoiceId: inv?.id, invoiceNumber: inv?.invoice_number, docType: inv?.doc_type, message, ...extra });

  // 1. what the reader already flagged while importing
  for (const inv of invoices) for (const w of inv.warnings || []) if (w.level === 'error' || w.level === 'warn') add(inv, w.level === 'error' ? 'error' : 'warn', 'import', w.msg);

  // 2. final vs pro-forma: price, quantity, freight, deposit, totals
  const proformas = invoices.filter(i => i.doc_type === 'proforma');
  for (const fin of invoices.filter(i => i.doc_type === 'final')) {
    const pfs = proformas.filter(p => (fin.refs || []).some(r => (p.refs || []).includes(r)));
    const finProducts = [...new Set(fin.lines.filter(l => l.line_type === 'product' && l.dtc_product_id).map(l => l.dtc_product_id))];
    for (const pid of finProducts) {
      const f = fin.lines.filter(l => l.line_type === 'product' && l.dtc_product_id === pid);
      const pl = pfs.flatMap(p => p.lines.filter(l => l.line_type === 'product' && l.dtc_product_id === pid));
      if (!pl.length) { if (pfs.length) add(fin, 'info', 'no-proforma', `${name(pid)} has no matching pro-forma line, so its price cannot be compared.`, { productId: pid }); continue; }
      const fu = Number(f[0].unit_price), pu = Number(pl[0].unit_price);
      const fq = f.reduce((a, l) => a + Number(l.quantity || 0), 0), pq = pl.reduce((a, l) => a + Number(l.quantity || 0), 0);
      if (Math.abs(fu - pu) > 0.005) add(fin, 'warn', 'price-changed', `${name(pid)}: unit price is $${fu.toFixed(2)} on the final invoice but was $${pu.toFixed(2)} on the pro-forma (${fu > pu ? '+' : '-'}$${r2(Math.abs(fu - pu) * fq).toLocaleString()} in total).`, { productId: pid });
      if (fq !== pq) add(fin, 'info', 'quantity-changed', `${name(pid)}: ${fq} units on the final invoice vs ${pq} on the pro-forma (${fq > pq ? '+' : ''}${fq - pq}, about $${r2(Math.abs(fq - pq) * fu).toLocaleString()}). Confirm against what was received.`, { productId: pid });
    }
    if (pfs.length) {
      const pfShip = r2(pfs.reduce((a, p) => a + sum(p.lines.filter(l => finProducts.includes(l.dtc_product_id)), 'shipping'), 0)), finShip = sum(fin.lines, 'shipping');
      if (pfShip > 0 && Math.abs(finShip - pfShip) / pfShip > T.freightChangePct) add(fin, 'warn', 'freight-changed', `Freight is $${finShip.toLocaleString()} on the final invoice vs $${pfShip.toLocaleString()} on the pro-formas (${finShip > pfShip ? '+' : ''}${r2((finShip / pfShip - 1) * 100)}%).`);
      const pfTotal = r2(pfs.reduce((a, p) => a + Number(p.total_amount || 0), 0)), dep = Number(fin.deposit_paid || 0);
      if (pfTotal > 0 && dep > 0 && pfs.length === 1) { const pct = dep / pfTotal * 100; if (Math.abs(pct - 50) > T.depositPctPoints) add(fin, 'info', 'deposit', `Deposit paid is ${r2(pct)}% of the pro-forma total (usually 50%).`); }
    }
    if (fin.lines.length && fin.lines.every(l => l.allocation === 'dtc')) {
      const lineSum = r2(fin.lines.reduce((a, l) => a + Number(l.amount || 0), 0));
      if (Math.abs(lineSum - Number(fin.total_amount || 0)) > 0.05) add(fin, 'error', 'total-mismatch', `The lines add up to $${lineSum.toLocaleString()} but the invoice total is $${Number(fin.total_amount).toLocaleString()}.`);
    }
  }

  // 3. unit price vs the other products of the same type from the same supplier (latest document per product)
  const latest = new Map();
  for (const inv of invoices) for (const l of inv.lines) if (l.line_type === 'product' && l.dtc_product_id && l.unit_price != null) {
    const key = `${inv.doc_type === 'final' ? '1' : '0'}|${inv.invoice_date || ''}`;
    const cur = latest.get(l.dtc_product_id);
    if (!cur || key > cur.key) latest.set(l.dtc_product_id, { key, price: Number(l.unit_price), inv, manufacturer: inv.manufacturer });
  }
  const groups = new Map();
  for (const [pid, v] of latest) { const t = prod.get(pid)?.product_type; if (!t) continue; const k = `${v.manufacturer}|${t}`; (groups.get(k) || groups.set(k, []).get(k)).push({ pid, ...v }); }
  const unitPrices = [];
  for (const [k, g] of groups) {
    const m = median(g.map(x => x.price)); const type = k.split('|')[1];
    for (const x of g) {
      unitPrices.push({ productId: x.pid, product: name(x.pid), type, price: x.price, median: m, n: g.length });
      if (g.length >= 3 && m > 0 && Math.abs(x.price / m - 1) > T.unitPricePct) add(x.inv, 'warn', 'unit-price-outlier', `${name(x.pid)}: $${x.price.toFixed(2)} per unit is ${r2(Math.abs(x.price / m - 1) * 100)}% ${x.price > m ? 'above' : 'below'} the median ($${m.toFixed(2)}) of ${g.length} ${type} products from this supplier.`, { productId: x.pid });
    }
  }

  // 4. landed cost per unit vs the same product type, and freight per kg across final invoices
  const byType = new Map();
  for (const [pid, c] of costs) { const t = prod.get(pid)?.product_type; if (t && c.perUnit != null) (byType.get(t) || byType.set(t, []).get(t)).push({ pid, c }); }
  for (const [type, g] of byType) {
    const m = median(g.map(x => x.c.perUnit));
    if (g.length >= 3) for (const x of g) if (Math.abs(x.c.perUnit / m - 1) > T.costPerUnitPct) add(x.c.invoice, 'warn', 'cost-outlier', `${name(x.pid)}: landed cost $${x.c.perUnit.toFixed(2)} per unit is ${r2(Math.abs(x.c.perUnit / m - 1) * 100)}% ${x.c.perUnit > m ? 'above' : 'below'} the median ($${m.toFixed(2)}) for ${type}.`, { productId: x.pid });
  }
  const perKg = [];
  for (const inv of invoices.filter(i => i.doc_type === 'final')) {
    const kg = inv.lines.filter(l => l.line_type === 'product' && l.gross_weight_kg > 0).reduce((a, l) => a + Number(l.gross_weight_kg), 0), ship = sum(inv.lines, 'shipping');
    if (kg > 0 && ship > 0) perKg.push({ inv, v: ship / kg });
  }
  const mk = median(perKg.map(x => x.v));
  if (perKg.length >= 3) for (const x of perKg) if (Math.abs(x.v / mk - 1) > T.freightPerKgPct) add(x.inv, 'warn', 'freight-per-kg', `Freight is $${x.v.toFixed(2)} per kg, ${r2(Math.abs(x.v / mk - 1) * 100)}% ${x.v > mk ? 'above' : 'below'} the usual $${mk.toFixed(2)} per kg on the other final invoices.`);

  const order = { error: 0, warn: 1, info: 2 };
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings: out, unitPrices, freightPerKg: perKg.map(x => ({ invoiceNumber: x.inv.invoice_number, perKg: r2(x.v) })) };
}
