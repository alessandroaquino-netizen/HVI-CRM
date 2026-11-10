// Maps confirmed email milestones onto product fields and phase-timeline rows (pure).
// What each kind of event writes. `phaseDates` entries are { phase_key, planned_start?, planned_end? }.
export function planChanges(product, existingPhaseDates, picked) {
  const fields = {}; const phase = {}; let phaseTo = null;
  const setPhase = (key, which, date) => { (phase[key] ||= {})[which] = date; };
  for (const e of picked.events) {
    switch (e.kind) {
      case 'order_placed':     fields.manufacturer_order_date = e.date; break;
      case 'design_end':       setPhase('design', 'planned_end', e.date); break;
      case 'sampling_start':   setPhase('sampling', 'planned_start', e.date); break;
      case 'sampling_end':     setPhase('sampling', 'planned_end', e.date); break;
      case 'production_start': setPhase('production', 'planned_start', e.date); break;
      case 'production_end':   setPhase('production', 'planned_end', e.date); setPhase('shipping', 'planned_start', e.date); break;
      case 'shipped':          fields.shipped_date = e.date; setPhase('shipping', 'planned_start', e.date); break;
      case 'delivery_eta':     fields.estimated_delivery_date = e.date; setPhase('shipping', 'planned_end', e.date); break;
    }
  }
  const inventoryRows = [];
  if (picked.quantities) {
    const q = picked.quantities;
    for (const r of q.sizes || []) inventoryRows.push({ option_label: r.size, qty_ordered: r.qty });
    const total = q.total ?? (q.sizes?.length ? q.sizes.reduce((a, r) => a + r.qty, 0) : null);
    if (total != null) { fields.units_ordered = total; }
    if (q.ref && !product.order_ref) fields.order_ref = q.ref.replace(/\s+/g, ' ').trim();
  }
  if (picked.tracking) { fields.tracking_number = picked.tracking.number; fields.carrier = picked.tracking.carrier; }
  if (picked.movePhase) phaseTo = picked.movePhase;
  const rows = Object.entries(phase).map(([phase_key, v]) => {
    const old = existingPhaseDates.find(d => d.phase_key === phase_key) || {};
    return { phase_key, planned_start: v.planned_start || old.planned_start || null, planned_end: v.planned_end || old.planned_end || null };
  });
  return { fields, phaseRows: rows, phaseTo, inventoryRows };
}

