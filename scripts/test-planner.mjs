import assert from 'node:assert/strict';
import { planBackward } from '../src/dtc_constants.js';
const p = planBackward({ product_type: 'flannel', category: 'new-line', drop_date: '2027-03-12' });
assert.equal(p.totalWeeks, 21); assert.equal(p.phases.at(-1).end, '2027-03-12'); assert.equal(p.phases[0].label, 'Ideation');
assert.equal(p.startBy, p.phases[0].start);
const days = (new Date('2027-03-12') - new Date(p.startBy)) / 86400000; assert.ok(Math.abs(days - 21 * 7) <= 3, 'spans about the total lead time ' + days);
for (let i = 1; i < p.phases.length; i++) assert.equal(p.phases[i].start, p.phases[i - 1].end, 'stages are contiguous');
const r = planBackward({ product_type: 'button-up', category: 'restock', drop_date: '2027-01-15' });
assert.deepEqual(r.phases.map(x => x.label), ['Production', 'Shipping']); assert.equal(r.totalWeeks, 5);
const h = planBackward({ product_type: 'hoodie', category: 'new-design', drop_date: '2027-02-01' });   // no stage weights for this type
assert.equal(h.phases, null); assert.equal(h.totalWeeks, 8); assert.equal(h.startBy, '2026-12-07');
assert.equal(planBackward({ product_type: 'nope', drop_date: '2027-01-01' }), null);
console.log('planner: all checks passed');
