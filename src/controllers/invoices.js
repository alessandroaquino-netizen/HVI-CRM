import { supabase } from '../supabase.js';
import { normKey } from '../invoices/match.js';

const BUCKET = 'dtc-invoices';
const PAGE = 1000;

async function fetchAll(table, order) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export async function fetchInvoices() {
  const [invoices, lines] = await Promise.all([fetchAll('dtc_invoices', 'invoice_date'), fetchAll('dtc_invoice_lines', 'position')]);
  const byInvoice = new Map();
  lines.forEach(l => { if (!byInvoice.has(l.invoice_id)) byInvoice.set(l.invoice_id, []); byInvoice.get(l.invoice_id).push(l); });
  return invoices.map(i => ({ ...i, refs: i.refs || [], deposits: i.deposits || [], warnings: i.warnings || [], lines: byInvoice.get(i.id) || [] }));
}

export async function fetchAliases() {
  const { data, error } = await supabase.from('dtc_product_aliases').select('*');
  if (error) throw error;
  return data || [];
}

export async function findDuplicate({ hash, manufacturer, invoiceNumber, docType }) {
  if (hash) {
    const { data } = await supabase.from('dtc_invoices').select('id,invoice_number,doc_type,created_at').eq('file_hash', hash).limit(1);
    if (data?.length) return { kind: 'file', invoice: data[0] };
  }
  const { data } = await supabase.from('dtc_invoices').select('id,invoice_number,doc_type,created_at')
    .eq('manufacturer', manufacturer || '').eq('invoice_number', invoiceNumber).eq('doc_type', docType).limit(1);
  return data?.length ? { kind: 'number', invoice: data[0] } : null;
}

// Saves the reviewed plan: original file, invoice, lines, aliases and the per-product financial records.
export async function saveInvoicePlan({ plan, parsed, file, hash, method, createdBy, products, depositPaidDates = {}, applyFin = new Set() }) {
  const h = plan.header;
  const dup = await findDuplicate({ hash, manufacturer: h.manufacturer, invoiceNumber: h.invoiceNumber, docType: h.docType });
  if (dup) throw new Error(dup.kind === 'file' ? `This exact file was already imported as ${dup.invoice.doc_type} ${dup.invoice.invoice_number}.` : `${h.docType} ${h.invoiceNumber} is already imported.`);

  let filePath = null;
  if (file) {
    filePath = `${hash}/${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const up = await supabase.storage.from(BUCKET).upload(filePath, file, { upsert: true, contentType: file.type || undefined });
    if (up.error) { filePath = null; console.warn('Original file not stored:', up.error.message); }
  }
  const { data: inv, error } = await supabase.from('dtc_invoices').insert({
    manufacturer: h.manufacturer || null, invoice_number: h.invoiceNumber, doc_type: h.docType, invoice_date: h.invoiceDate || null,
    currency: h.currency || 'USD', total_amount: h.total, deposit_paid: parsed.totals.deposit || null, overpaid_amount: parsed.totals.overpaid || null,
    balance_due: parsed.totals.balance, deposits: parsed.totals.deposits, refs: h.refs, file_name: file?.name || null, file_path: filePath, file_hash: hash || null,
    extraction_method: method, warnings: plan.warnings.filter(w => w.level !== 'info'), created_by: createdBy,
  }).select('id').single();
  if (error) throw error;

  const rows = plan.rows.map((r, i) => ({
    invoice_id: inv.id, position: i, description: r.description, line_type: r.lineType, quantity: r.quantity, unit_price: r.unitPrice, amount: r.amount,
    packed_quantity: r.packedQuantity, dtc_product_id: r.allocation === 'dtc' ? r.productId : null, allocation: r.allocation, split_of: r.splitOf ?? null, note: r.note || null,
  }));
  const ins = await supabase.from('dtc_invoice_lines').insert(rows);
  if (ins.error) { await supabase.from('dtc_invoices').delete().eq('id', inv.id); throw ins.error; }

  // aliases for names a person confirmed
  const aliasRows = plan.rows.filter(r => r.lineType === 'product' && r.productId && r.allocation === 'dtc' && ['chosen', 'conflict', 'filename+name', 'name', 'lineage'].includes(r.how) && r.description)
    .map(r => ({ alias_norm: normKey(r.description), alias_text: r.description, dtc_product_id: r.productId })).filter(a => a.alias_norm);
  if (aliasRows.length) await supabase.from('dtc_product_aliases').upsert(aliasRows, { onConflict: 'alias_norm,dtc_product_id', ignoreDuplicates: true });

  // financial record and product facts, per product
  const productById = new Map(products.map(p => [p.id, p]));
  for (const pf of plan.productsFin) {
    const prod = productById.get(pf.productId);
    // always keep the product's facts, but only touch the financial record when the reviewer allowed it
    if (!applyFin.has(pf.productId)) {
      const refs0 = [...new Set([...(prod?.order_ref ? String(prod.order_ref).split(/[ ,;]+/) : []), ...pf.refs])].filter(Boolean).join(' ');
      await supabase.from('dtc_products').update({ order_ref: refs0 || null, units_ordered: pf.units || null, est_cost: pf.total }).eq('id', pf.productId);
      continue;
    }
    const refs = [...new Set([...(prod?.order_ref ? String(prod.order_ref).split(/[ ,;]+/) : []), ...pf.refs])].filter(Boolean).join(' ');
    await supabase.from('dtc_products').update({ order_ref: refs || null, units_ordered: pf.units || null, est_cost: pf.total }).eq('id', pf.productId);
    const { data: fin } = await supabase.from('dtc_financials').select('id,deposit_paid_date,final_paid_date,notes').eq('dtc_product_id', pf.productId).limit(1);
    const note = `From ${h.docType} invoice ${h.invoiceNumber}${h.invoiceDate ? ' (' + h.invoiceDate + ')' : ''}. Deposit: ${pf.depositBasis}.`;
    const patch = {
      order_number: refs || null, invoice_number: h.invoiceNumber, deposit_amount: pf.deposit || null, final_amount: pf.final,
      ...(depositPaidDates[pf.productId] ? { deposit_paid_date: depositPaidDates[pf.productId] } : {}),
      notes: [fin?.[0]?.notes, note].filter(Boolean).join(' | '),
    };
    if (fin?.length) await supabase.from('dtc_financials').update(patch).eq('id', fin[0].id);
    else await supabase.from('dtc_financials').insert({ dtc_product_id: pf.productId, product_name: prod?.name || '', manufacturer: h.manufacturer || null, ...patch });
  }
  return inv.id;
}

export async function deleteInvoice(invoice) {
  if (invoice.file_path) await supabase.storage.from(BUCKET).remove([invoice.file_path]);
  const { error } = await supabase.from('dtc_invoices').delete().eq('id', invoice.id);
  if (error) throw error;
}

export async function invoiceFileUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function attachOriginalFile(invoice, file, hash) {
  const filePath = `${hash}/${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const up = await supabase.storage.from(BUCKET).upload(filePath, file, { upsert: true, contentType: file.type || undefined });
  if (up.error) throw up.error;
  const { error } = await supabase.from('dtc_invoices').update({ file_path: filePath, file_name: file.name, file_hash: hash }).eq('id', invoice.id);
  if (error) throw error;
}
