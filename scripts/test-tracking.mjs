import assert from 'node:assert/strict';
import { normalizeTracker, needsRefresh } from '../src/tracking/status.js';
const sample = { status: 'in_transit', status_detail: 'arrived_at_facility', est_delivery_date: '2026-11-12T00:00:00Z', tracking_details: [
  { datetime: '2026-11-03T10:00:00Z', status: 'pre_transit', message: 'Shipment information sent', tracking_location: { city: null } },
  { datetime: '2026-11-05T14:30:00Z', status: 'in_transit', message: 'Arrived at FedEx location', tracking_location: { city: 'MEMPHIS', state: 'TN', country: 'US' } }] };
const n = normalizeTracker(sample);
assert.equal(n.tracking_status, 'in_transit'); assert.equal(n.tracking_eta, '2026-11-12'); assert.equal(n.tracking_location, 'MEMPHIS, TN, US');
assert.equal(n.tracking_events[0].message, 'Arrived at FedEx location'); assert.equal(n.tracking_delivered_at, null);
const d = normalizeTracker({ status: 'delivered', tracking_details: [{ datetime: '2026-11-09T09:00:00Z', status: 'delivered', message: 'Delivered' }] });
assert.equal(d.tracking_delivered_at, '2026-11-09T09:00:00Z');
assert.equal(normalizeTracker({ status: 'weird' }).tracking_status, 'unknown');
const now = Date.parse('2026-11-05T12:00:00Z');
assert.equal(needsRefresh({}, 6, now), false);
assert.equal(needsRefresh({ tracking_number: 'X' }, 6, now), true);
assert.equal(needsRefresh({ tracking_number: 'X', tracking_checked_at: '2026-11-05T10:00:00Z' }, 6, now), false);
assert.equal(needsRefresh({ tracking_number: 'X', tracking_checked_at: '2026-11-05T01:00:00Z' }, 6, now), true);
assert.equal(needsRefresh({ tracking_number: 'X', tracking_status: 'delivered' }, 6, now), false);
console.log('tracking: all checks passed');
