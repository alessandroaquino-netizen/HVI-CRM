// Landed-cost method (Nov 2026): freight is split by gross weight from the packing list, photography by the pro-forma charges.
// Real final invoice HVI2621.25.26.27 (5 products, one $5,755.90 freight line); expected numbers are Adriana's reconciliation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseInvoiceSheets } from '../src/invoices/parse.js';
import { buildPlan, allocateByWeight } from '../src/invoices/plan.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/final-hvi2621-25-26-27.json', import.meta.url), 'utf8'));
const names = { olive: 'Flannel - Olive', red: 'Flannel - Red', blue: 'Arc Button Up - Blue', pink: 'Arc Button Up - Pink', polo: 'White Bucket Truck Polo (Reorder)' };
const products = Object.entries(names).map(([id, name]) => ({ id, name, order_ref: '' }));
const forced = { 'Olive Flannel': 'olive', 'Red Flannel': 'red', 'New Lightning': 'blue', 'Pink New Lightning': 'pink', 'White Bucket Truck': 'polo' };
// pro-forma invoices carried a different (per-order) freight figure and the photography charge of the 4 shirts
const pf = (id, ship, photo) => ({ id: 'pf-' + id, manufacturer: 'bing-bing', doc_type: 'proforma', refs: ['HVI2621', 'HVI2625', 'HVI2626', 'HVI2627'],
  lines: [{ dtc_product_id: id, line_type: 'shipping', amount: ship }, ...(photo ? [{ dtc_product_id: id, line_type: 'photography', amount: photo }] : [])] });
const prior = [pf('olive', 1130.5, 45), pf('red', 1130.5, 45), pf('blue', 1251, 45), pf('pink', 1251, 45), pf('polo', 992.9, 0)];

function perUnit(plan) {
  const out = {};
  for (const p of plan.productsFin) out[p.productId] = { ...p, perUnit: Math.round(p.total / (p.packed || p.units) * 100) / 100 };
  return out;
}

const parsed = parseInvoiceSheets(fx.sheets, { fileName: fx.fileName });
const plan = buildPlan({ parsed, fileName: fx.fileName, products, priorInvoices: prior, forcedMap: forced });
const c = perUnit(plan);
assert.equal(c.blue.shipping, 822.27); assert.equal(c.olive.shipping, 1644.54); assert.equal(c.red.shipping, 1644.54); assert.equal(c.pink.shipping, 822.27);
assert.ok(Math.abs(c.polo.shipping - 822.27) <= 0.01);
assert.equal(Math.round(Object.values(c).reduce((a, p) => a + p.shipping, 0) * 100) / 100, 5755.9, 'freight is fully allocated');
assert.equal(c.blue.photography, 45); assert.equal(c.polo.photography, 0);
// the five per-unit costs from Adriana's reconciliation (photography included)
assert.equal(c.olive.perUnit, 16.81); assert.equal(c.red.perUnit, 16.81); assert.equal(c.blue.perUnit, 12.8); assert.equal(c.pink.perUnit, 12.67); assert.equal(c.polo.perUnit, 10.35);
assert.equal(c.blue.goods, 3100); assert.equal(c.blue.total, 3967.27);
assert.ok(plan.rows.filter(r => r.lineType === 'shipping').every(r => r.allocBasis === 'gross_weight'));

// no weights on the packing list → volume; neither → pro-forma charges; neither of those → goods value
const strip = (keys) => { const p = structuredClone(parsed); p.lines.forEach(l => keys.forEach(k => { l[k] = null; })); return p; };
const planCbm = buildPlan({ parsed: strip(['grossKg']), fileName: fx.fileName, products, priorInvoices: prior, forcedMap: forced });
assert.ok(planCbm.rows.filter(r => r.lineType === 'shipping').every(r => r.allocBasis === 'cbm'));
const planPf = buildPlan({ parsed: strip(['grossKg', 'cbm']), fileName: fx.fileName, products, priorInvoices: prior, forcedMap: forced });
assert.ok(planPf.rows.filter(r => r.lineType === 'shipping').every(r => r.allocBasis === 'proforma'));
assert.equal(perUnit(planPf).blue.shipping, 1251);
const planGv = buildPlan({ parsed: strip(['grossKg', 'cbm']), fileName: fx.fileName, products, priorInvoices: [], forcedMap: forced });
assert.ok(planGv.rows.filter(r => r.lineType === 'shipping').every(r => r.allocBasis === 'goods_value'));

// part of the shipment is not DTC: its weight share is carved out instead of being charged to the DTC products
const w = allocateByWeight(1000, [{ productId: 'a', weight: 60 }], 40);
assert.deepEqual(w, { parts: [{ productId: 'a', amount: 600 }], otherAmount: 400 });
assert.equal(allocateByWeight(100, [{ productId: 'a', weight: 0 }]), null);
console.log('invoice landed-cost method: all checks passed');

// ── verification dashboard ──
import { verifyInvoices } from '../src/invoices/verify.js';
const P = ['a', 'b', 'c', 'd'].map(k => ({ id: k, name: 'Polo ' + k.toUpperCase(), product_type: 'polo' }));
const L = (pid, type, q, u, extra = {}) => ({ dtc_product_id: pid, line_type: type, quantity: q, unit_price: u, amount: q && u ? q * u : extra.amount, allocation: 'dtc', ...extra });
const inv = (id, num, doc, date, refs, lines, extra = {}) => ({ id, invoice_number: num, doc_type: doc, invoice_date: date, manufacturer: 'bing-bing', refs, lines, warnings: [], total_amount: lines.reduce((a, l) => a + Number(l.amount || 0), 0), ...extra });
const invs = [
  inv('p1', 'HVI1', 'proforma', '2026-08-01', ['HVI1'], [L('a', 'product', 100, 7.8), L('a', 'shipping', null, null, { amount: 500 })]),
  inv('p2', 'HVI2', 'proforma', '2026-08-01', ['HVI2'], [L('b', 'product', 100, 7.8)]),
  inv('p3', 'HVI3', 'proforma', '2026-08-01', ['HVI3'], [L('c', 'product', 100, 7.8)]),
  inv('p4', 'HVI4', 'proforma', '2026-08-01', ['HVI4'], [L('d', 'product', 100, 9.5)]),
  inv('f1', 'HVI1', 'final', '2026-09-01', ['HVI1'], [L('a', 'product', 110, 8.2, { gross_weight_kg: 50 }), L('a', 'shipping', null, null, { amount: 700 })], { deposit_paid: 390 }),
];
const v = verifyInvoices(invs, P);
const kinds = v.findings.map(f => f.kind);
assert.ok(kinds.includes('price-changed')); assert.ok(kinds.includes('quantity-changed')); assert.ok(kinds.includes('freight-changed'));
assert.ok(v.findings.some(f => f.kind === 'unit-price-outlier' && /Polo D/.test(f.message)), 'the $9.50 polo is flagged against the $7.80 median');
assert.ok(!v.findings.some(f => f.kind === 'unit-price-outlier' && /Polo B/.test(f.message)));
assert.equal(v.findings.find(f => f.kind === 'price-changed').severity, 'warn');
console.log('invoice verification: all checks passed');
