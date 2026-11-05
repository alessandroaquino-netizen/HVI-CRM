// Normalises an EasyPost tracker into the shape stored on dtc_products (see migration_dtc_tracking.sql).
export const TRACKING_STATUSES = {
  unknown:              { label: 'No tracking info yet', tone: 'muted' },
  pre_transit:          { label: 'Label created, not yet moving', tone: 'muted' },
  in_transit:           { label: 'In transit', tone: 'blue' },
  out_for_delivery:     { label: 'Out for delivery', tone: 'amber' },
  available_for_pickup: { label: 'Ready for pickup', tone: 'amber' },
  delivered:            { label: 'Delivered', tone: 'green' },
  return_to_sender:     { label: 'Returning to sender', tone: 'red' },
  failure:              { label: 'Delivery problem', tone: 'red' },
  cancelled:            { label: 'Cancelled', tone: 'red' },
  error:                { label: 'Carrier error', tone: 'red' },
};
const place = l => [l?.city, l?.state, l?.country].filter(Boolean).join(', ');

export function normalizeTracker(t) {
  const events = (t.tracking_details || []).map(d => ({ at: d.datetime || null, status: d.status || null, message: d.message || d.description || '', place: place(d.tracking_location) }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const status = TRACKING_STATUSES[t.status] ? t.status : 'unknown';
  const delivered = status === 'delivered' ? (events.find(e => e.status === 'delivered')?.at || t.updated_at || null) : null;
  return {
    tracking_status: status,
    tracking_status_detail: t.status_detail || null,
    tracking_eta: t.est_delivery_date ? String(t.est_delivery_date).slice(0, 10) : null,
    tracking_location: events[0]?.place || null,
    tracking_events: events.slice(0, 25),
    tracking_delivered_at: delivered,
    tracking_checked_at: new Date().toISOString(),
  };
}

// Carrier ids used by the app → EasyPost carrier names. `other` lets EasyPost detect the carrier from the number.
export const EASYPOST_CARRIER = { fedex: 'FedEx', ups: 'UPS', dhl: 'DHLExpress', usps: 'USPS' };

export function needsRefresh(product, maxAgeHours = 6, now = Date.now()) {
  if (!product.tracking_number || product.tracking_status === 'delivered') return false;
  if (!product.tracking_checked_at) return true;
  return now - new Date(product.tracking_checked_at).getTime() > maxAgeHours * 3600 * 1000;
}
