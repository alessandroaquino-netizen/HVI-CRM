import assert from 'node:assert/strict';
import { quarterWeeks, quarterStart, nextQuarter, currentQuarter, weeklyTarget, qtdTarget, ratio, statusOf, evaluateKpi, summarize, fmtValue, fmtTarget, mondayOf } from '../src/kpi/status.js';

const w = quarterWeeks('2026-Q4');
assert.equal(w.length, 13); assert.equal(w[0], '2026-10-05'); assert.equal(w[12], '2026-12-28');
assert.equal(quarterWeeks('2027-Q1')[0], '2027-01-04');
assert.equal(quarterStart('2026-Q3'), '2026-07-01'); assert.equal(nextQuarter('2026-Q4'), '2027-Q1'); assert.equal(nextQuarter('2026-Q1'), '2026-Q2');
assert.equal(currentQuarter('2026-11-10'), '2026-Q4'); assert.equal(mondayOf('2026-11-10'), '2026-11-09'); assert.equal(mondayOf('2026-11-08'), '2026-11-02');

const rev = { unit: 'usd', target_value: 20000, target_scope: 'week', direction: 'higher', aggregation: 'sum' };
assert.equal(statusOf(ratio(rev, 22061, 20000)), 'on_track');
assert.equal(statusOf(ratio(rev, 18500, 20000)), 'at_risk');       // 92.5%
assert.equal(statusOf(ratio(rev, 16770, 20000)), 'off_track');     // 83.9%
assert.equal(statusOf(ratio(rev, 18000, 20000)), 'at_risk');       // exactly 90%
assert.equal(statusOf(null), 'no_data');

const ads = { unit: 'pct', target_value: 25, target_scope: 'week', direction: 'lower', aggregation: 'none' };
assert.equal(statusOf(ratio(ads, 19.94, 25)), 'on_track');
assert.equal(statusOf(ratio(ads, 40.93, 25)), 'off_track');        // 25/40.93 = 61%
assert.equal(statusOf(ratio(ads, 26, 25)), 'at_risk');             // 96%
const open = { target_value: 0, direction: 'lower' };
assert.equal(statusOf(ratio(open, 0, 0)), 'on_track'); assert.equal(statusOf(ratio(open, 1, 0)), 'off_track');

const org = { unit: 'count', target_value: 8000, target_scope: 'quarter', direction: 'higher', aggregation: 'sum' };
assert.ok(Math.abs(weeklyTarget(org) - 615.38) < 0.01);
assert.ok(Math.abs(qtdTarget(org, 6) - 3692.3) < 0.1); assert.equal(qtdTarget(rev, 6), 120000);
assert.equal(qtdTarget(ads, 6), 25);

// evaluateKpi: latest week with data, stored QTD wins, otherwise running sum
const vals = [{ period_start: '2026-10-05', value: 11971.55 }, { period_start: '2026-10-12', value: 17673.4 }, { period_start: '2026-10-19', value: 30359.97, qtd_value: 55454.81 }];
const e = evaluateKpi(rev, vals, w);
assert.equal(e.lastWeek, '2026-10-19'); assert.equal(e.status, 'on_track'); assert.equal(e.qtd, 55454.81); assert.equal(e.qtdStatus, 'at_risk'); // 55.4k / 60k = 92%
const e2 = evaluateKpi(rev, vals.slice(0, 2), w); assert.ok(Math.abs(e2.qtd - 29644.95) < 0.01); assert.equal(e2.qtdStatus, 'off_track'); // 29.6k / 40k = 74%
const e3 = evaluateKpi({ ...ads, target_value: null }, [{ period_start: '2026-10-05', value: 5 }], w); assert.equal(e3.status, 'no_data');
assert.equal(evaluateKpi(rev, [], w).status, 'no_data');
assert.deepEqual(summarize([e, e2, e3]), { on_track: 1, at_risk: 0, off_track: 1, no_data: 1 });

assert.equal(fmtValue('usd', 22061.1), '$22,061'); assert.equal(fmtValue('usd', 61.61), '$61.61'); assert.equal(fmtValue('pct', 29.68), '29.68%');
assert.equal(fmtValue('ratio', 2.5), '2.5x'); assert.equal(fmtValue('count', 2603), '2,603'); assert.equal(fmtValue('count', null), '—');
assert.equal(fmtTarget(ads), '≤ 25% / week'); assert.equal(fmtTarget({ ...org }), '≥ 8,000 / quarter'); assert.equal(fmtTarget({ ...rev, target_value: null }), 'No target');
console.log('kpi status maths: all checks passed');
