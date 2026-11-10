import assert from 'node:assert/strict';
import { parseEmailText, findDates, findTracking } from '../src/emailDates/parse.js';
const ctx = '2026-10-10';
assert.deepEqual(findDates('Nov 12', ctx).map(d => d.date), ['2026-11-12']);
assert.deepEqual(findDates('January 5th', '2026-11-20').map(d => d.date), ['2027-01-05'], 'rolls into next year');
assert.deepEqual(findDates('12 September 2026 and 2026-10-03 and 10/21/2026', ctx).map(d => d.date).sort(), ['2026-09-12', '2026-10-03', '2026-10-21']);
assert.deepEqual(findDates('Feb 30', ctx), [], 'impossible dates are ignored');
const thread = `
From: Thor <sales@bingbing.example>
Date: Tue, Oct 6, 2026 at 3:12 PM
Subject: HVI2621 Flannel Red

Hi Alessandro, we received the deposit on Oct 2. The samples were approved on Oct 5 and we are moving into production on Oct 12.
Production will be completed by Nov 9 and we plan to ship on Nov 10 via DHL, tracking 4455667788.

On Wed, Nov 11, 2026 at 8:00 AM Thor wrote:
Goods were shipped yesterday. FedEx tracking number 771234567890, expected delivery Nov 18.
`;
const r = parseEmailText(thread, { today: '2026-11-12' });
const by = k => r.events.filter(e => e.kind === k).map(e => e.date);
assert.deepEqual(by('order_placed'), ['2026-10-02']);
assert.deepEqual(by('sampling_end'), ['2026-10-05']);
assert.deepEqual(by('production_start'), ['2026-10-12']);
assert.deepEqual(by('production_end'), ['2026-11-09']);
assert.ok(by('shipped').includes('2026-11-10'));
assert.deepEqual(by('delivery_eta'), ['2026-11-18']);
assert.ok(r.events.every(e => e.quote.length > 8 && e.emailDate));
assert.deepEqual(r.tracking.map(t => `${t.carrier}:${t.number}`).sort(), ['dhl:4455667788', 'fedex:771234567890']);
assert.equal(findTracking('UPS 1Z999AA10123456784').at(0).carrier, 'ups');
assert.deepEqual(parseEmailText('Thanks, talk soon!').events, []);
console.log('email dates: all checks passed', r.events.length, 'events');

// planChanges maps events onto the right fields (view helper, pure)
const { planChanges } = await import('../src/emailDates/plan.js');
{
  const plan = planChanges({ id: 'p' }, [{ phase_key: 'production', planned_start: '2026-10-01', planned_end: null }],
    { events: [{ kind: 'production_start', date: '2026-10-12' }, { kind: 'shipped', date: '2026-11-10' }, { kind: 'delivery_eta', date: '2026-11-18' }, { kind: 'order_placed', date: '2026-10-02' }], tracking: { number: '771', carrier: 'fedex' }, movePhase: 'shipping' });
  assert.equal(plan.fields.shipped_date, '2026-11-10'); assert.equal(plan.fields.tracking_number, '771'); assert.equal(plan.fields.manufacturer_order_date, '2026-10-02'); assert.equal(plan.phaseTo, 'shipping');
  assert.deepEqual(plan.phaseRows.find(r => r.phase_key === 'production'), { phase_key: 'production', planned_start: '2026-10-12', planned_end: null });
  assert.equal(plan.phaseRows.find(r => r.phase_key === 'shipping').planned_end, '2026-11-18');
  console.log('email dates: plan checks passed');
}

// Quantities
const { findQuantities } = await import('../src/emailDates/parse.js');
const q = findQuantities('Subject: HVI2621 Red Flannel order\nPlease confirm the breakdown for HVI2621:\nS: 20, M: 60, L: 90, XL: 70, 2XL: 40, 3XL: 20\nTotal 300 pcs.\nSize chart: M 38 in');
assert.equal(q.total, 300); assert.equal(q.ref, 'HVI2621'); assert.equal(q.subject, 'HVI2621 Red Flannel order');
assert.deepEqual(q.sizes.map(s => `${s.size}:${s.qty}`), ['S:20', 'M:60', 'L:90', 'XL:70', '2XL:40', '3XL:20']);
assert.deepEqual(findQuantities('We need L and XL soon, 12 L 14 XL').sizes, [], 'two sizes in a line is not a breakdown');
assert.equal(findQuantities('XXL 10 XL 20 L 30').sizes[0].size, '2XL');
const plan2 = (await import('../src/emailDates/plan.js')).planChanges({ id: 'p' }, [], { events: [], quantities: { sizes: [{ size: 'S', qty: 20 }, { size: 'M', qty: 60 }], total: 80, ref: 'HVI2621' } });
assert.deepEqual(plan2.inventoryRows, [{ option_label: 'S', qty_ordered: 20 }, { option_label: 'M', qty_ordered: 60 }]); assert.equal(plan2.fields.units_ordered, 80); assert.equal(plan2.fields.order_ref, 'HVI2621');
console.log('email quantities: all checks passed');
