// Cost per product from saved invoice lines. A final invoice replaces the pro-forma for the same product.
const round2 = n => Math.round(n * 100) / 100;

export function productCosts(invoices) {
  const best = new Map();    // productId → { rank, date, invoice }
  for (const inv of invoices) {
    const rank = inv.doc_type === 'final' ? 2 : 1;
    for (const pid of new Set(inv.lines.filter(l => l.dtc_product_id && l.allocation === 'dtc').map(l => l.dtc_product_id))) {
      const cur = best.get(pid);
      if (!cur || rank > cur.rank || (rank === cur.rank && (inv.invoice_date || '') > (cur.invoice.invoice_date || ''))) best.set(pid, { rank, invoice: inv });
    }
  }
  const out = new Map();
  for (const [pid, { invoice }] of best) {
    const c = { goods: 0, photography: 0, shipping: 0, fees: 0, total: 0, units: 0, packed: 0, invoice };
    for (const l of invoice.lines.filter(x => x.dtc_product_id === pid && x.allocation === 'dtc')) {
      const a = Number(l.amount);
      if (l.line_type === 'product') { c.goods += a; c.units += Number(l.quantity || 0); c.packed += Number(l.packed_quantity ?? l.quantity ?? 0); }
      else if (l.line_type === 'photography') c.photography += a;
      else if (l.line_type === 'shipping') c.shipping += a;
      else c.fees += a;
      c.total += a;
    }
    const units = c.packed || c.units;
    Object.assign(c, { goods: round2(c.goods), photography: round2(c.photography), shipping: round2(c.shipping), fees: round2(c.fees), total: round2(c.total),
      perUnit: units ? round2(c.total / units) : null, goodsPerUnit: units ? round2(c.goods / units) : null, basisUnits: units });
    out.set(pid, c);
  }
  return out;
}
