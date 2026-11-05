import { supabase } from '../supabase.js';
import { normalizeTracker, EASYPOST_CARRIER } from '../tracking/status.js';

// Asks the track-shipment Edge Function for the latest carrier status and stores it on the product.
export async function refreshTracking(product) {
  if (!product.tracking_number) throw new Error('Add a tracking number first.');
  const { data, error } = await supabase.functions.invoke('track-shipment', { body: { trackingNumber: product.tracking_number, carrier: EASYPOST_CARRIER[product.carrier] || null } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* keep generic message */ }
    throw new Error(/not found|404|Failed to send/i.test(msg) ? 'Tracking service is not set up yet (see docs/shipment-tracking.md).' : msg);
  }
  if (data?.error) throw new Error(data.error);
  const row = normalizeTracker(data.tracker);
  const { error: upErr } = await supabase.from('dtc_products').update(row).eq('id', product.id);
  if (upErr) throw upErr;
  return row;
}
