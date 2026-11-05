import { supabase } from '../supabase.js';

export async function fetchInventory() {
  const { data, error } = await supabase.from('dtc_inventory').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchInventoryEvents(productId) {
  const { data, error } = await supabase.from('dtc_inventory_events').select('*').eq('dtc_product_id', productId).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
}

const COUNTS = ['qty_ordered', 'qty_shipped', 'qty_received', 'qty_rejected', 'qty_sellable', 'qty_shelved', 'qty_reserve'];
const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));

export async function saveInventoryRow(id, fields) {
  const row = {};
  for (const k of COUNTS) if (k in fields) row[k] = num(fields[k]);
  if ('notes' in fields) row.notes = fields.notes || null;
  if ('sku' in fields) row.sku = fields.sku || null;
  const { error } = await supabase.from('dtc_inventory').update(row).eq('id', id);
  if (error) throw error;
}

export async function addInventoryRow(productId, label, sku = null) {
  const { error } = await supabase.from('dtc_inventory').insert({ dtc_product_id: productId, option_label: label || 'Total', sku });
  if (error) throw error;
}

export async function deleteInventoryRow(id) {
  const { error } = await supabase.from('dtc_inventory').delete().eq('id', id);
  if (error) throw error;
}

// Creates one row per size/SKU that has no inventory row yet (or a single "Total" row for products without sizes).
export async function startCounting(product, variants, existing) {
  const have = new Set(existing.map(r => r.option_label));
  const rows = variants.length
    ? variants.filter(v => !have.has(v.option_label)).map(v => ({ dtc_product_id: product.id, option_label: v.option_label, sku: v.sku || null, qty_ordered: v.units_ordered != null ? Math.round(v.units_ordered) : null, qty_received: v.units_received != null ? Math.round(v.units_received) : null }))
    : (have.has('Total') ? [] : [{ dtc_product_id: product.id, option_label: 'Total', qty_ordered: product.units_ordered != null ? Math.round(product.units_ordered) : null, qty_received: product.units_received != null ? Math.round(product.units_received) : null }]);
  if (!rows.length) return 0;
  const { error } = await supabase.from('dtc_inventory').insert(rows);
  if (error) throw error;
  return rows.length;
}
