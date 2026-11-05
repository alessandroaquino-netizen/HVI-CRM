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
