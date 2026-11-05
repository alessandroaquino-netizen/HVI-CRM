// Pure helpers: compare what was ordered, shipped, received, rejected and put into inventory.
// A count that was never entered is null; a gap is only reported when both sides were entered.
export const FIELDS = ['qty_ordered', 'qty_shipped', 'qty_received', 'qty_rejected', 'qty_sellable', 'qty_shelved', 'qty_reserve'];
const has = v => v != null;
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
const any = (rows, k) => rows.some(r => has(r[k]));

// Gaps for one row. Positive `short` = fewer units than expected.
export function rowGaps(r) {
  const out = [];
  if (has(r.qty_ordered) && has(r.qty_shipped) && r.qty_ordered !== r.qty_shipped) out.push({ id: 'shipped', label: r.qty_shipped < r.qty_ordered ? 'Manufacturer shipped fewer than ordered' : 'Manufacturer shipped more than ordered', diff: r.qty_ordered - r.qty_shipped });
  if (has(r.qty_shipped) && has(r.qty_received) && r.qty_shipped !== r.qty_received) out.push({ id: 'received', label: r.qty_received < r.qty_shipped ? 'Received fewer than shipped' : 'Received more than shipped', diff: r.qty_shipped - r.qty_received });
  else if (!has(r.qty_shipped) && has(r.qty_ordered) && has(r.qty_received) && r.qty_ordered !== r.qty_received) out.push({ id: 'received', label: r.qty_received < r.qty_ordered ? 'Received fewer than ordered' : 'Received more than ordered', diff: r.qty_ordered - r.qty_received });
  if (has(r.qty_received) && has(r.qty_sellable) && r.qty_sellable !== r.qty_received - (r.qty_rejected || 0)) { const exp = r.qty_received - (r.qty_rejected || 0); out.push({ id: 'sellable', label: 'Sellable does not match received minus rejected', diff: exp - r.qty_sellable }); }
  if (has(r.qty_sellable) && (has(r.qty_shelved) || has(r.qty_reserve)) && (r.qty_shelved || 0) + (r.qty_reserve || 0) !== r.qty_sellable) out.push({ id: 'shelved', label: 'Shelved plus reserve does not match sellable', diff: r.qty_sellable - (r.qty_shelved || 0) - (r.qty_reserve || 0) });
  return out;
}

export function productTotals(rows) {
  const t = {};
  for (const k of FIELDS) t[k] = any(rows, k) ? sum(rows, k) : null;
  t.gaps = rows.flatMap(r => rowGaps(r).map(g => ({ ...g, option: r.option_label })));
  t.counted = any(rows, 'qty_sellable');
  return t;
}

// Landed cost per unit. Sellable units are the right divisor once they are counted: defects and shortages raise the real cost.
export function costPerUnit(cost, rows) {
  if (!cost) return null;
  const t = productTotals(rows);
  const sellable = t.qty_sellable;
  if (sellable) return { perUnit: Math.round((cost.total / sellable) * 100) / 100, units: sellable, basis: 'sellable' };
  return cost.perUnit != null ? { perUnit: cost.perUnit, units: cost.basisUnits, basis: 'invoice' } : null;
}
