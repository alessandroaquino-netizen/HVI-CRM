import { supabase } from '../supabase.js';

function rowToPhaseDate(r) {
  return {
    id:             r.id,
    dtc_product_id: r.dtc_product_id,
    phase_key:      r.phase_key,
    planned_start:  r.planned_start || '',
    planned_end:    r.planned_end   || '',
  };
}

export async function fetchDtcPhaseDates() {
  const { data, error } = await supabase.from('dtc_phase_dates').select('*');
  if (error) throw error;
  return (data || []).map(rowToPhaseDate);
}

export function phaseDatesForDtcProduct(all, productId) {
  return all.filter(d => d.dtc_product_id === productId);
}

// rows: [{ phase_key, planned_start, planned_end }]
export async function saveDtcPhaseDates(productId, rows) {
  const payload = rows.map(r => ({
    dtc_product_id: productId,
    phase_key:      r.phase_key,
    planned_start:  r.planned_start || null,
    planned_end:    r.planned_end   || null,
  }));
  const { error } = await supabase
    .from('dtc_phase_dates')
    .upsert(payload, { onConflict: 'dtc_product_id,phase_key' });
  if (error) throw error;
}

export function subscribeToDtcPhaseDates(onChange) {
  return supabase
    .channel('dtc-phase-dates-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dtc_phase_dates' }, onChange)
    .subscribe();
}
