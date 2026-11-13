import { supabase } from '../supabase.js';
import { sizesFor, parseLabels } from '../dtc_constants.js';

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
  const std = sizesFor(product.product_type);
  const rows = !variants.length && std.length
    ? std.filter(sz => !have.has(sz)).map(sz => ({ dtc_product_id: product.id, option_label: sz }))
    : variants.length
    ? variants.filter(v => !have.has(v.option_label)).map(v => ({ dtc_product_id: product.id, option_label: v.option_label, sku: v.sku || null, qty_ordered: v.units_ordered != null ? Math.round(v.units_ordered) : null, qty_received: v.units_received != null ? Math.round(v.units_received) : null }))
    : (have.has('Total') ? [] : [{ dtc_product_id: product.id, option_label: 'Total', qty_ordered: product.units_ordered != null ? Math.round(product.units_ordered) : null, qty_received: product.units_received != null ? Math.round(product.units_received) : null }]);
  if (!rows.length) return 0;
  const { error } = await supabase.from('dtc_inventory').insert(rows);
  if (error) throw error;
  return rows.length;
}

// Adds several sizes or variants at once ("4XL, 5XL" or "Black, Navy"); existing ones are left alone.
export async function addInventoryLabels(productId, text, existing) {
  const have = new Set(existing.map(r => r.option_label));
  const rows = parseLabels(text).filter(l => !have.has(l)).map(l => ({ dtc_product_id: productId, option_label: l }));
  if (!rows.length) return 0;
  const { error } = await supabase.from('dtc_inventory').insert(rows);
  if (error) throw error;
  return rows.length;
}

// Sets the ordered quantity per size from a confirmed email import; other counts are never touched.
export async function upsertOrdered(productId, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('dtc_inventory').upsert(rows.map(r => ({ dtc_product_id: productId, option_label: r.option_label, qty_ordered: r.qty_ordered })), { onConflict: 'dtc_product_id,option_label' });
  if (error) throw error;
}
