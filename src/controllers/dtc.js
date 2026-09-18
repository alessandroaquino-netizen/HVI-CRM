import { supabase } from '../supabase.js';

// ─── dtc_products mapping ─────────────────────────────────────────────────
export function rowToDtcProduct(r) {
  return {
    id:                         r.id,
    name:                       r.name                       || '',
    product_type:               r.product_type               || '',
    category:                   r.category                   || '',
    phase:                      r.phase                      || 'idea',
    manufacturer:               r.manufacturer               || '',
    drop_date:                  r.drop_date                  || '',
    figma_link:                 r.figma_link                 || '',
    tech_pack_link:             r.tech_pack_link             || '',
    deposit_50_paid:            r.deposit_50_paid            || false,
    final_50_paid:              r.final_50_paid              || false,
    est_cost:                   r.est_cost   != null ? Number(r.est_cost)   : null,
    units:                      r.units      != null ? Number(r.units)      : null,
    notes:                      r.notes                      || '',
    phase_changed_at:           r.phase_changed_at           || '',
    last_activity:              r.last_activity              || '',
    // v2 fields
    manufacturer_order_date:    r.manufacturer_order_date    || '',
    photographer_samples_sent:  r.photographer_samples_sent  || false,
    photographer_photos_approved: r.photographer_photos_approved || false,
    units_ordered:              r.units_ordered  != null ? Number(r.units_ordered)  : null,
    units_received:             r.units_received != null ? Number(r.units_received) : null,
    premarketing_started_at:    r.premarketing_started_at    || '',
    created_at:                 r.created_at                 || '',
  };
}

function dtcProductToRow(p) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name:                       p.name             || null,
    product_type:               p.product_type     || null,
    category:                   p.category         || null,
    phase:                      p.phase            || 'idea',
    manufacturer:               p.manufacturer     || null,
    drop_date:                  p.drop_date        || null,
    figma_link:                 p.figma_link       || null,
    tech_pack_link:             p.tech_pack_link   || null,
    deposit_50_paid:            !!p.deposit_50_paid,
    final_50_paid:              !!p.final_50_paid,
    est_cost:   p.est_cost  != null && p.est_cost  !== '' ? parseFloat(p.est_cost)  : null,
    units:      p.units     != null && p.units     !== '' ? parseFloat(p.units)     : null,
    notes:                      p.notes            || null,
    phase_changed_at:           p.phase_changed_at || today,
    last_activity:              today,
    manufacturer_order_date:    p.manufacturer_order_date    || null,
    photographer_samples_sent:  !!p.photographer_samples_sent,
    photographer_photos_approved: !!p.photographer_photos_approved,
    units_ordered:  p.units_ordered  != null && p.units_ordered  !== '' ? parseFloat(p.units_ordered)  : null,
    units_received: p.units_received != null && p.units_received !== '' ? parseFloat(p.units_received) : null,
    premarketing_started_at:    p.premarketing_started_at || null,
  };
}

// ─── dtc_financials mapping ───────────────────────────────────────────────
export function rowToDtcFinancial(r) {
  return {
    id:                         r.id,
    dtc_product_id:             r.dtc_product_id             || null,
    product_name:               r.product_name               || '',
    manufacturer:               r.manufacturer               || '',
    order_number:               r.order_number               || '',
    invoice_number:             r.invoice_number             || '',
    deposit_amount:             r.deposit_amount   != null ? Number(r.deposit_amount)   : null,
    deposit_paid_date:          r.deposit_paid_date          || '',
    final_amount:               r.final_amount     != null ? Number(r.final_amount)     : null,
    final_paid_date:            r.final_paid_date            || '',
    notes:                      r.notes                      || '',
    // v2 fields
    paid_in_full:               r.paid_in_full               || false,
    full_payment_date:          r.full_payment_date          || '',
    expected_next_payment_date: r.expected_next_payment_date || '',
    photographer_fee:           r.photographer_fee  != null ? Number(r.photographer_fee)  : null,
    photographer_paid_date:     r.photographer_paid_date     || '',
    additional_payment_amount:  r.additional_payment_amount != null ? Number(r.additional_payment_amount) : null,
    additional_payment_note:    r.additional_payment_note    || '',
    additional_payment_date:    r.additional_payment_date    || '',
    created_at:                 r.created_at                 || '',
  };
}

function dtcFinancialToRow(f) {
  return {
    dtc_product_id:             f.dtc_product_id    || null,
    product_name:               f.product_name      || null,
    manufacturer:               f.manufacturer      || null,
    order_number:               f.order_number      || null,
    invoice_number:             f.invoice_number    || null,
    deposit_amount:             f.deposit_amount    != null && f.deposit_amount    !== '' ? parseFloat(f.deposit_amount)    : null,
    deposit_paid_date:          f.deposit_paid_date || null,
    final_amount:               f.final_amount      != null && f.final_amount      !== '' ? parseFloat(f.final_amount)      : null,
    final_paid_date:            f.final_paid_date   || null,
    notes:                      f.notes             || null,
    paid_in_full:               !!f.paid_in_full,
    full_payment_date:          f.full_payment_date          || null,
    expected_next_payment_date: f.expected_next_payment_date || null,
    photographer_fee:           f.photographer_fee  != null && f.photographer_fee  !== '' ? parseFloat(f.photographer_fee)  : null,
    photographer_paid_date:     f.photographer_paid_date     || null,
    additional_payment_amount:  f.additional_payment_amount != null && f.additional_payment_amount !== '' ? parseFloat(f.additional_payment_amount) : null,
    additional_payment_note:    f.additional_payment_note   || null,
    additional_payment_date:    f.additional_payment_date   || null,
  };
}

// ─── dtc_marketing mapping ────────────────────────────────────────────────
export function rowToDtcMarketing(r) {
  return {
    id:                r.id,
    dtc_product_id:    r.dtc_product_id || null,
    product_name:      r.product_name   || '',
    premarketing_start: r.premarketing_start || '',
    drop_date:         r.drop_date      || '',
    notes:             r.notes          || '',
    phase:             r.phase          || 'pre-marketing',
    created_at:        r.created_at     || '',
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────
export async function fetchDtcProducts() {
  const { data, error } = await supabase.from('dtc_products').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToDtcProduct);
}

export async function saveDtcProduct(product, editingId = null) {
  const row = dtcProductToRow(product);
  if (editingId) {
    const { error } = await supabase.from('dtc_products').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('dtc_products').insert(row);
    if (error) throw error;
  }
}

export async function updateDtcPhase(id, phase) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('dtc_products').update({ phase, phase_changed_at: today, last_activity: today }).eq('id', id);
  if (error) throw error;
}

export async function startPremarketing(id) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('dtc_products').update({ premarketing_started_at: today, last_activity: today }).eq('id', id);
  if (error) throw error;
  // Also create a marketing record
  const prod = (await supabase.from('dtc_products').select('name,drop_date').eq('id', id).single()).data;
  if (prod) {
    await supabase.from('dtc_marketing').insert({ dtc_product_id: id, product_name: prod.name, drop_date: prod.drop_date, premarketing_start: today });
  }
}

export async function deleteDtcProduct(id) {
  const { error } = await supabase.from('dtc_products').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchDtcFinancials() {
  const { data, error } = await supabase.from('dtc_financials').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToDtcFinancial);
}

export async function saveDtcFinancial(financial, editingId = null) {
  const row = dtcFinancialToRow(financial);
  if (editingId) {
    const { error } = await supabase.from('dtc_financials').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('dtc_financials').insert(row);
    if (error) throw error;
  }
}

export async function deleteDtcFinancial(id) {
  const { error } = await supabase.from('dtc_financials').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchDtcMarketing() {
  const { data, error } = await supabase.from('dtc_marketing').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToDtcMarketing);
}

export function subscribeToDtc(supabaseClient, onChange) {
  return supabaseClient
    .channel('dtc-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dtc_products' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dtc_financials' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dtc_marketing' }, onChange)
    .subscribe();
}
