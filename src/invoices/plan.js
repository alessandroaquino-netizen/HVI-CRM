// Turns a parsed invoice into an importable "plan": every line resolved to a product (or flagged), shared costs
// (courier, photography, fees) split across products, deposit / balance worked out, and the cross-document
// checks run. The same code drives the review screen and the one-off historical load script.
import { tokens, normKey, similarity, fileNameProducts, matchByName, assignLineage } from './match.js';

const round2 = n => Math.round(n * 100) / 100;
export const DEFAULT_DEPOSIT_PCT = { 'bing-bing': 50, 'screen-printer': 50, 'print-theory': 50, alibaba: 50 };
const B2B_HINT = /quanta|mslcat|sturgeon|union|b2b|custom order/i;

// Split `amount` across participants. Weights come from the pro-forma charge for each product when known;
// products without one share what is left by quantity (e.g. a courier bill that grew between PI and final).
export function allocateShared(amount, parts) {
  if (!parts.length) return [];
  const known = parts.filter(p => p.priorAmount > 0);
  const unknown = parts.filter(p => !(p.priorAmount > 0));
  const knownSum = known.reduce((a, p) => a + p.priorAmount, 0);
  const out = new Map();
  if (known.length && unknown.length && knownSum <= amount + 0.005) {
    known.forEach(p => out.set(p.productId, p.priorAmount));
    const rest = amount - knownSum, qSum = unknown.reduce((a, p) => a + (p.qty || 1), 0);
    unknown.forEach(p => out.set(p.productId, rest * (p.qty || 1) / qSum));
  } else if (known.length) {
    known.forEach(p => out.set(p.productId, amount * p.priorAmount / knownSum));
  } else {
    const wSum = parts.reduce((a, p) => a + (p.goods || p.qty || 1), 0);
    parts.forEach(p => out.set(p.productId, amount * (p.goods || p.qty || 1) / wSum));
  }
  const res = parts.map(p => ({ productId: p.productId, amount: round2(out.get(p.productId)) }));
  const diff = round2(amount - res.reduce((a, r) => a + r.amount, 0));
  res[res.length - 1].amount = round2(res[res.length - 1].amount + diff);
  return res;
}

export function buildPlan({ parsed, fileName, products, aliases = [], priorInvoices = [], depositPct, forcedMap = {}, allocationOverrides = {} }) {
  const warnings = parsed.warnings.map(w => ({ ...w }));
  const refs = parsed.refs;
  const manufacturer = parsed.manufacturerGuess || '';
  const pct = depositPct ?? DEFAULT_DEPOSIT_PCT[manufacturer] ?? 0;
  const prior = priorInvoices.filter(i => !manufacturer || !i.manufacturer || i.manufacturer === manufacturer);
  const aliasMap = new Map(aliases.map(a => [a.alias_norm, a.dtc_product_id]));
  const hints = fileNameProducts(fileName);
  const usedHints = new Set();
  const productById = new Map(products.map(p => [p.id, p]));

  // ── resolve product lines ───────────────────────────────────────────────
  const rows = parsed.lines.map((l, i) => ({
    pos: i, description: l.description, lineType: l.lineType, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount,
    packedQuantity: l.packedQuantity ?? null, productId: null, allocation: 'dtc', how: '', confidence: 'none', note: '', candidates: [],
    productHint: l.productHint, generic: !!l.genericDescription,
  }));
  for (const r of rows) { const f = forcedMap[r.description]; if (f && r.lineType !== 'product') { r.productId = f; r.how = 'chosen'; r.confidence = 'certain'; } }
  for (const r of rows) { const ov = allocationOverrides[r.description]; if (ov) { r.allocation = ov.allocation; r.note = ov.note || ''; r.how = 'chosen'; r.confidence = 'chosen'; } }
  const setProduct = (r, productId, how, confidence, note = '') => { r.productId = productId; r.how = how; r.confidence = confidence; r.note = note; };

  const productRows = rows.filter(x => x.lineType === 'product' && x.allocation === 'dtc');
  const lineage = assignLineage(productRows, refs, prior);
  const hintOverlap = (h, r) => tokens(h).filter(t => tokens(r.description).includes(t)).length;
  productRows.forEach((r, idx) => {
    const forced = forcedMap[r.description];
    if (forced) return setProduct(r, forced, 'chosen', 'certain');

    // which product names written in the file name belong to this line?
    const open = hints.filter(h => !usedHints.has(h));
    let hint = '';
    if (r.generic || !tokens(r.description).length) hint = open.length === 1 ? open[0] : (hints.length === 1 ? hints[0] : '');
    else {
      const ranked = open.map(h => ({ h, o: hintOverlap(h, r) })).filter(x => x.o > 0).sort((a, b) => b.o - a.o);
      if (ranked.length && (!ranked[1] || ranked[0].o > ranked[1].o)) hint = ranked[0].h;
    }

    // 1. lineage with an earlier invoice of the same order
    const lin = lineage.get(idx);
    if (lin) {
      const dq = r.quantity - Number(lin.priorLine.quantity);
      if (hint) usedHints.add(hint);
      return setProduct(r, lin.productId, 'lineage', 'certain', `Same order, unit price and quantity as ${lin.priorInvoice.invoice_number}${dq ? ` (${dq > 0 ? '+' : ''}${dq} pcs vs pro-forma)` : ''}.`);
    }
    // 2. alias confirmed before, unless the file name points somewhere else (suppliers copy-paste descriptions)
    const alias = !r.generic && aliasMap.get(normKey(r.description));
    if (alias) {
      const aliasName = productById.get(alias)?.name || '';
      const conflict = hints.length && !hints.some(h => similarity(h, aliasName) >= 0.3);
      if (!conflict) { if (hint) usedHints.add(hint); return setProduct(r, alias, 'alias', 'certain', 'Matched a name the team confirmed before.'); }
      r.note = `Description matches a saved alias (${aliasName}) but the file name says "${hints.join(' / ')}". `;
    }
    // 3. name match, helped by the file-name hint
    const byHint = hint ? matchByName(r.description, products, { context: hint, minSuggest: 0.45 }) : null;
    const byName = matchByName(r.description, products);
    const pick = byHint?.best || byName.best;
    r.candidates = (byHint?.candidates?.length ? byHint.candidates : byName.candidates);
    if (pick) {
      if (hint && byHint?.best) usedHints.add(hint);
      const sure = !hint && pick.score >= 0.99;
      return setProduct(r, pick.product.id, hint ? 'filename+name' : 'name', sure ? 'certain' : 'suggested',
        (r.note || '') + (hint ? `Line says "${r.description}"; file name says "${hint}".` : `Name similarity ${Math.round(pick.score * 100)}%.`));
    }
    const sameRef = products.filter(p => p.order_ref && refs.some(rf => String(p.order_ref).includes(rf)));
    if (sameRef.length === 1) return setProduct(r, sameRef[0].id, 'order_ref', 'suggested', `Product's order ref ${sameRef[0].order_ref} appears on this document.`);
    if (hint) r.note = (r.note || '') + `File name suggests "${hint}", but no product matches it.`;
  });

  // The line and the file name come from the supplier and are often copy-pasted: when they point at different
  // products, never trust the line alone. Those rows must be confirmed by a person before saving.
  for (const r of productRows) {
    if (!r.productId || r.how === 'chosen' || r.how === 'lineage' || !hints.length) continue;
    const name = productById.get(r.productId)?.name || '';
    if (hints.some(h => similarity(h, name) >= 0.3)) continue;
    const alt = matchByName(hints.join(' '), products, { minSuggest: 0.45 });
    const altBest = alt.best?.product;
    r.conflict = true; r.confidence = 'conflict';
    r.note = `${r.note || ''} The line says "${r.description}" (→ ${name}) but the file name says "${hints.join(' / ')}"${altBest ? ` (→ ${altBest.name})` : ''}.`.trim();
    r.candidates = [...(altBest ? [{ product: altBest, score: alt.best.score }] : []), ...r.candidates].filter((c, i, a) => a.findIndex(x => x.product.id === c.product.id) === i);
    if (altBest) r.productId = altBest.id;           // pre-select the file-name product, but it still needs an explicit OK
    r.how = 'conflict';
  }
  for (const r of productRows) if (r.productId && r.confidence === 'suggested' && r.how !== 'conflict' && similarity(r.description, productById.get(r.productId)?.name || '') >= 0.99) r.confidence = 'certain';

  // sample fees: product named in the line ("Sample fee for Camo Polos")
  for (const r of rows.filter(x => x.lineType === 'sample_fee' || x.lineType === 'fee')) {
    if (!r.productHint) continue;
    const m = matchByName(r.productHint, products, { minSuggest: 0.5 });
    if (m.best && r.productHint.length > 3) setProduct(r, m.best.product.id, 'name', 'suggested', `Fee names "${r.productHint}".`);
  }

  // B2B hints
  for (const r of rows) if (B2B_HINT.test(r.description) && !r.productId) { r.allocation = 'b2b'; r.note = (r.note + ' Looks like a B2B / customer order.').trim(); }

  // ── shared charges: split across the DTC products on this invoice ───────
  const dtcProductRows = rows.filter(r => r.lineType === 'product' && r.productId && r.allocation === 'dtc');
  const partsBase = [];
  for (const r of dtcProductRows) {
    let p = partsBase.find(x => x.productId === r.productId);
    if (!p) partsBase.push(p = { productId: r.productId, qty: 0, goods: 0 });
    p.qty += r.quantity || 0; p.goods += r.amount;
  }
  const priorAmountFor = (productId, type) => {
    let sum = 0;
    for (const inv of prior.filter(i => i.doc_type === 'proforma' && (i.refs || []).some(r => refs.includes(r)))) {
      for (const l of inv.lines) if (l.dtc_product_id === productId && l.line_type === type) sum += Number(l.amount);
    }
    return sum;
  };
  const unresolvedProducts = rows.some(r => r.lineType === 'product' && r.allocation === 'dtc' && !r.productId);
  const expanded = [];
  for (const r of rows) {
    const shared = ['shipping', 'photography', 'fee', 'sample_fee'].includes(r.lineType) && !r.productId && r.allocation === 'dtc';
    if (!shared || !partsBase.length || unresolvedProducts) { expanded.push({ ...r, splitOf: null, note: shared && unresolvedProducts ? 'Will be split across products once every product line is matched.' : r.note }); continue; }
    const parts = partsBase.map(p => ({ ...p, priorAmount: priorAmountFor(p.productId, r.lineType) }));
    const alloc = allocateShared(r.amount, parts);
    const basis = parts.some(p => p.priorAmount > 0) ? 'pro-forma charges' : 'goods value';
    alloc.forEach((a, k) => expanded.push({
      ...r, productId: a.productId, amount: a.amount, quantity: r.lineType === 'photography' && r.quantity ? null : r.quantity,
      splitOf: r.pos, splitIndex: k, how: 'allocated', confidence: 'suggested',
      note: `${alloc.length}-way split of ${r.amount} using ${basis}.`,
    }));
  }

  // ── payments: deposit / balance per product ─────────────────────────────
  const perProduct = new Map();
  for (const r of expanded) {
    if (r.allocation !== 'dtc' || !r.productId) continue;
    let p = perProduct.get(r.productId);
    if (!p) perProduct.set(r.productId, p = { productId: r.productId, goods: 0, photography: 0, shipping: 0, fees: 0, total: 0, units: 0, packed: 0 });
    if (r.lineType === 'product') { p.goods += r.amount; p.units += r.quantity || 0; p.packed += r.packedQuantity ?? r.quantity ?? 0; }
    else if (r.lineType === 'photography') p.photography += r.amount;
    else if (r.lineType === 'shipping') p.shipping += r.amount;
    else p.fees += r.amount;
    p.total += r.amount;
  }
  const productsFin = [...perProduct.values()].map(p => ({ ...p, goods: round2(p.goods), photography: round2(p.photography), shipping: round2(p.shipping), fees: round2(p.fees), total: round2(p.total) }));
  const grand = productsFin.reduce((a, p) => a + p.total, 0);
  const deposits = parsed.totals.deposits || [];
  for (const p of productsFin) {
    const prod = productById.get(p.productId);
    const refsOfProduct = new Set(prod?.order_ref ? String(prod.order_ref).split(/[ ,;]+/).filter(Boolean) : []);
    for (const inv of prior) for (const l of inv.lines) if (l.dtc_product_id === p.productId) (inv.refs || []).forEach(x => { if (refs.includes(x)) refsOfProduct.add(x); });
    p.refs = [...refsOfProduct];
  }
  const depositByProduct = new Map(productsFin.map(p => [p.productId, 0]));
  const covered = new Set();
  for (const d of deposits.filter(x => x.ref)) {
    const sharing = productsFin.filter(p => p.refs.includes(d.ref));
    if (!sharing.length) { warnings.push({ level: 'info', msg: `Deposit line ${d.ref} (${d.amount}) matches no product on this document.` }); continue; }
    const split = allocateShared(d.amount, sharing.map(p => ({ productId: p.productId, qty: p.units, goods: p.total, priorAmount: 0 })));
    split.forEach(x => { depositByProduct.set(x.productId, round2(depositByProduct.get(x.productId) + x.amount)); covered.add(x.productId); });
  }
  const noRefDeposit = deposits.filter(x => !x.ref).reduce((a, x) => a + x.amount, 0);
  for (const p of productsFin) {
    const prod = productById.get(p.productId);
    if (parsed.docType === 'proforma' || !deposits.length) {
      p.deposit = pct ? round2(p.total * pct / 100) : 0; p.depositBasis = pct ? `${pct}% of total (supplier terms)` : 'no deposit rule'; p.depositPaid = false;
    } else if (covered.has(p.productId)) {
      p.deposit = depositByProduct.get(p.productId); p.depositBasis = `deposit listed for ${p.refs.filter(r => deposits.some(d => d.ref === r)).join(', ')}`; p.depositPaid = true;
    } else if (noRefDeposit) {
      p.deposit = round2(noRefDeposit * p.total / grand); p.depositBasis = 'single deposit on the invoice, split by value'; p.depositPaid = true;
    } else {
      p.deposit = round2(p.total * pct / 100); p.depositBasis = `no deposit line for this order; assumed ${pct}%`; p.depositPaid = true;
      warnings.push({ level: 'warn', msg: `No deposit line found for ${prod?.name || p.productId}; assumed ${pct}%.` });
    }
    p.final = round2(p.total - p.deposit);
  }

  // ── cross-document checks ───────────────────────────────────────────────
  const sameDoc = priorInvoices.filter(i => i.invoice_number === parsed.invoiceNumber && i.doc_type === parsed.docType && (!manufacturer || i.manufacturer === manufacturer));
  if (sameDoc.length) warnings.push({ level: 'error', msg: `${parsed.docType} ${parsed.invoiceNumber} was already imported on ${String(sameDoc[0].created_at || '').slice(0, 10) || 'an earlier date'}. Delete it first if you want to import it again.`, duplicate: true });
  const overlap = priorInvoices.filter(i => i.doc_type === parsed.docType && i.invoice_number !== parsed.invoiceNumber && (i.refs || []).some(r => refs.includes(r)));
  for (const o of overlap) warnings.push({ level: 'warn', msg: `Order ref(s) ${(o.refs || []).filter(r => refs.includes(r)).join(', ')} also appear on ${o.doc_type} ${o.invoice_number}. Check this is not a duplicate.` });
  if (parsed.docType === 'final') {
    for (const ref of refs) if (!prior.some(i => i.doc_type === 'proforma' && (i.refs || []).includes(ref)) && deposits.length) warnings.push({ level: 'info', msg: `No pro-forma invoice on file for ${ref}, so shared charges were split by goods value.` });
  }
  for (const r of rows.filter(x => x.lineType === 'product')) {
    if (!r.productId && r.allocation === 'dtc') warnings.push({ level: 'error', msg: `"${r.description}" is not matched to a product yet.` });
    if (r.confidence === 'conflict') warnings.push({ level: 'error', msg: `Conflict on "${r.description}": ${r.note}` });
    else if (r.confidence === 'suggested' && r.how !== 'allocated') warnings.push({ level: 'warn', msg: `"${r.description}" → ${productById.get(r.productId)?.name || '?'}: please confirm (${r.note}).` });
  }
  // description vs file name disagree (e.g. "Navy Grey Flannel" file whose line says "Olive Green flannel shirt")
  for (const r of rows.filter(x => x.lineType === 'product' && !x.generic && hints.length === 1)) {
    if (similarity(r.description, hints[0]) < 0.2) warnings.push({ level: 'warn', msg: `File name says "${hints[0]}" but the line says "${r.description}". One of them is probably a copy-paste error; check the product.` });
  }
  // pro-forma vs final: price drift for products that appear on both
  if (parsed.docType === 'final') {
    for (const r of rows.filter(x => x.lineType === 'product' && x.productId)) {
      const anyPrior = prior.flatMap(i => i.lines.map(l => ({ i, l }))).find(x => x.l.dtc_product_id === r.productId && refs.some(rf => (x.i.refs || []).includes(rf)) && x.l.line_type === 'product');
      if (anyPrior && Math.abs(Number(anyPrior.l.unit_price) - r.unitPrice) > 0.005) warnings.push({ level: 'warn', msg: `Unit price for "${r.description}" changed from ${anyPrior.l.unit_price} (pro-forma ${anyPrior.i.invoice_number}) to ${r.unitPrice}.` });
    }
  }
  if (parsed.docType === 'proforma' && pct && parsed.totals.amount) {
    // nothing to check: the deposit is derived from the supplier rule
  }
  const unresolved = rows.filter(r => r.lineType === 'product' && r.allocation === 'dtc' && !r.productId).length;

  return {
    header: { manufacturer, invoiceNumber: parsed.invoiceNumber, docType: parsed.docType, invoiceDate: parsed.invoiceDate, currency: parsed.currency,
      total: parsed.totals.amount, refs, depositTotal: parsed.totals.deposit, overpaid: parsed.totals.overpaid, balance: parsed.totals.balance, depositPct: pct },
    rows: expanded, productsFin, warnings, unresolved,
  };
}
