// Template-agnostic invoice extractor for spreadsheet-like documents (.xls, .xlsx, .csv).
//
// It does not rely on fixed cell positions or column headers (merged cells shift them from file to
// file). Instead each row is read by content: text cells form the description and the numbers are
// resolved with the arithmetic check  quantity × unit price = amount.  Fee rows with a single number,
// section headings, totals, deposit/balance blocks and a packing-list sheet are recognised by keyword.
// Everything the parser is unsure about is returned as a warning for the review screen.

const HVI_REF = /HVI\d{2}\d{2}(?:[.,\-/]\d{1,4})*/gi;

export function excelSerialToISO(n) {
  if (!(n > 20000 && n < 80000)) return '';
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
}

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const str = v => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')).replace(/\s+/g, ' ').trim();
const round2 = n => Math.round(n * 100) / 100;

// "HVI2614.19" → ["HVI2614","HVI2619"],  "HVI2621.25.26.27" → 2621, 2625, 2626, 2627,  "HVI2627-1" → ["HVI2627"]
export function expandRefs(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/HVI(\d{4})((?:\.\d{1,4})*)/gi)) {
    const base = m[1];
    out.add('HVI' + base);
    for (const extra of m[2].split('.').filter(Boolean)) {
      out.add('HVI' + base.slice(0, base.length - extra.length) + extra);
    }
  }
  return [...out];
}

function toGrid(sheet) { return sheet.rows.map(r => r.map(c => (c === null || c === undefined ? '' : c))); }

function pickSheets(sheets) {
  const packing = sheets.find(s => /packing/i.test(s.name)) ||
    sheets.find(s => s.rows.some(r => r.some(c => /gross\s*wt|net\s*wt/i.test(str(c)))));
  const invoice = sheets.find(s => s !== packing && /invoice/i.test(s.name)) ||
    sheets.find(s => s !== packing && s.rows.some(r => r.some(c => /description of goods|unit price/i.test(str(c))))) ||
    sheets.find(s => s !== packing) || sheets[0];
  return { invoice, packing };
}

function findLabelValue(grid, labelRe, { valueRe, skipRe } = {}) {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!labelRe.test(str(grid[r][c]))) continue;
      // value: same row to the right, otherwise the same column / neighbours below
      const candidates = [];
      for (let cc = c + 1; cc < Math.min(grid[r].length, c + 4); cc++) candidates.push(grid[r][cc]);
      for (let rr = r + 1; rr <= Math.min(grid.length - 1, r + 3); rr++) {
        candidates.push(grid[rr][c]);
        for (let cc = c + 1; cc <= c + 2; cc++) candidates.push(grid[rr][cc]);
      }
      for (const v of candidates) {
        const s = str(v);
        if (!s) continue;
        if (skipRe && skipRe.test(s)) continue;
        if (valueRe && !valueRe.test(s)) continue;
        return v;
      }
    }
  }
  return '';
}

function classify(desc) {
  const d = desc.toLowerCase();
  if (/photo/.test(d)) return 'photography';
  if (/fedex|freight|shipping|courier|\bdhl\b|\bups\b|\bduty\b|duties|customs|door to door|delivery fee/.test(d)) return 'shipping';
  if (/sample/.test(d)) return 'sample_fee';
  if (/\bfee\b|charge|mode fee|tooling|set-?up|bagging|tagging|label|re-?print|screen|embroider|digitizing/.test(d)) return 'fee';
  return 'product';
}

// Find three numbers a,b,c (in row order) with a × b ≈ c. Prefer the right-most triple.
function qtyPriceAmount(nums) {
  for (let k = nums.length - 1; k >= 2; k--) {
    for (let j = k - 1; j >= 1; j--) {
      for (let i = j - 1; i >= 0; i--) {
        const a = nums[i], b = nums[j], c = nums[k];
        if (c > 0 && Math.abs(a * b - c) <= Math.max(0.05, c * 0.0005)) return { qty: a, unit: b, amount: c };
      }
    }
  }
  return null;
}

function productHint(desc, type) {
  if (type === 'sample_fee') {
    const m = desc.match(/(?:for|-)\s*(.+)$/i);
    if (m) return m[1].replace(/samples?/i, '').trim();
    return desc.replace(/sample(s| fee)?/ig, '').trim();
  }
  return desc;
}

export function parseInvoiceSheets(sheets, { fileName = '' } = {}) {
  const warnings = [];
  const { invoice, packing } = pickSheets(sheets);
  if (!invoice) return { ok: false, error: 'No readable sheet found.', warnings };
  const grid = toGrid(invoice);

  // ── document header ─────────────────────────────────────────────────────
  const topText = grid.slice(0, 6).flat().map(str).join(' ');
  let docType = /pro-?\s*forma|\bPI\b|quotation|estimate/i.test(topText) ? 'proforma' : 'final';
  if (/^\s*final/i.test(fileName)) docType = 'final';

  const invNoRaw = str(findLabelValue(grid, /invoice\s*(no|number|#)/i, { skipRe: /^(date|your order|our s\/c)/i }));
  let dateVal = findLabelValue(grid, /^date$/i);
  const invoiceDate = dateVal instanceof Date ? dateVal.toISOString().slice(0, 10)
    : isNum(dateVal) ? excelSerialToISO(dateVal) : (/^\d{4}-\d{2}-\d{2}/.test(str(dateVal)) ? str(dateVal).slice(0, 10) : '');

  const vendorLabel = grid.findIndex(r => r.some(c => /^(vendor|exporter|seller|supplier|bill from|from)\b/i.test(str(c))));
  let vendor = '';
  if (vendorLabel >= 0) {
    for (let r = vendorLabel; r <= Math.min(grid.length - 1, vendorLabel + 3); r++) {
      const hit = grid[r].map(str).find(s => /\b(co\.?,?\s*ltd|ltd|inc|llc|corp|company|gmbh)\b/i.test(s));
      if (hit) { vendor = hit; break; }
    }
  }
  const brand = grid.slice(0, 8).flat().map(str).find(s => /^[A-Z]{4,12}$/.test(s) && !/^(INVOICE|VENDOR|PCS|CTNS|VESSEL|FOB|CHINA)$/.test(s)) || '';
  const vendorText = [vendor, brand].filter(Boolean).join(' / ');
  let manufacturerGuess = '';
  if (/bing\s*bing|thor/i.test(vendorText + ' ' + fileName)) manufacturerGuess = 'bing-bing';
  else if (/print\s*theory/i.test(vendorText + ' ' + fileName)) manufacturerGuess = 'print-theory';
  else if (/sticker\s*mule/i.test(vendorText)) manufacturerGuess = 'sticker-mule';

  const refsInSheet = expandRefs(grid.flat().map(str).join(' '));
  const refsInFile = expandRefs(fileName);
  const invoiceRefs = expandRefs(invNoRaw);
  const refs = [...new Set([...invoiceRefs, ...refsInFile])];
  if (!invNoRaw) warnings.push({ level: 'warn', msg: 'Invoice number not found in the document; using the file name.' });
  const invoiceNumber = invNoRaw || (fileName.match(/HVI[\d.\-]+/i)?.[0] || fileName.replace(/\.[a-z0-9]+$/i, ''));
  if (invNoRaw && refsInFile.length && !refsInFile.every(r => invoiceRefs.includes(r)) && !invoiceRefs.every(r => refsInFile.includes(r))) {
    warnings.push({ level: 'warn', msg: `File name references ${refsInFile.join(', ')} but the document says ${invoiceRefs.join(', ') || invNoRaw}.` });
  }

  // ── line items ──────────────────────────────────────────────────────────
  let start = grid.findIndex(r => r.some(c => /description of goods|^description$|^item$/i.test(str(c))) &&
                                  r.some(c => /quantity|qty|pcs|unit price|price/i.test(str(c))));
  start = start < 0 ? 0 : start + 1;
  let end = grid.findIndex((r, i) => i >= start && r.some(c => /^total\b/i.test(str(c))));
  if (end < 0) { end = grid.length; warnings.push({ level: 'warn', msg: 'No TOTAL row found; totals could not be cross-checked.' }); }

  const lines = [];
  let section = '';
  for (let r = start; r < end; r++) {
    const row = grid[r];
    const texts = row.map(str).filter(s => s && !/^(pcs|usd|ctns|kgs|cbm|eur)$/i.test(s) && !isNum(Number(s.replace(/,/g, ''))));
    const nums = row.filter(isNum);
    if (!texts.length && !nums.length) continue;
    const desc = texts.join(' ').trim();
    if (!nums.length) {
      if (/^[A-Z'’ \-&/]{4,}$/.test(desc) && desc.length < 40) section = desc;          // "MEN'S SHIRTS"
      continue;                                                                          // spec blocks, notes
    }
    if (!desc) continue;

    let qty = null, unit = null, amount = null, inferred = false;
    const triple = qtyPriceAmount(nums);
    if (triple) ({ qty, unit, amount } = triple);
    else if (nums.length === 1) amount = nums[0];
    else if (nums.length === 2) { [qty, unit] = nums; amount = round2(qty * unit); inferred = true; }
    else { amount = nums[nums.length - 1]; warnings.push({ level: 'warn', msg: `Row "${desc}": could not reconcile quantity × price = amount; took ${amount} as the amount.` }); }
    const type = classify(desc);
    lines.push({
      description: desc, section, lineType: type, quantity: qty, unitPrice: unit, amount: round2(amount),
      cartons: triple && nums.length > 3 ? nums[0] : null, productHint: productHint(desc, type), inferred,
      // "MEN'S POLO SHIRTS" or "Flannel" say what the garment is but not which design: the matcher must lean on the file name / refs.
      genericDescription: type === 'product' && /^(men'?s|women'?s|ladies|unisex)?\s*(polo\s*)?(shirts?|tees?|hoodies?|jackets?|pants|shorts|hats?|caps?|flannel|solid \w+)$/i.test(desc),
    });
    if (inferred) warnings.push({ level: 'info', msg: `Row "${desc}": amount was blank on the invoice; calculated as ${qty} × ${unit} = ${round2(amount)}.` });
  }

  // ── totals, deposits, balance ───────────────────────────────────────────
  const totals = { quantity: null, amount: null, deposits: [], deposit: 0, overpaid: 0, balance: null };
  if (end < grid.length) {
    const tn = grid[end].filter(isNum);
    if (tn.length) { totals.amount = tn[tn.length - 1]; totals.quantity = tn.length >= 2 ? tn[tn.length - 2] : null; }
    let ctx = '';
    for (let r = end + 1; r < grid.length; r++) {
      const row = grid[r];
      const label = row.map(str).find(s => /^(deposit|balance|overpaid|paid|amount due|total due)\b/i.test(s));
      const ref = row.map(str).find(s => /^HVI\d{4}/i.test(s)) || '';
      const nn = row.filter(isNum);
      if (label) ctx = label.toLowerCase();
      if (!nn.length || (!label && !ref)) continue;
      const amt = nn[nn.length - 1];
      if (/overpaid/.test(ctx)) totals.overpaid += amt;
      else if (/deposit|paid/.test(ctx)) totals.deposits.push({ ref, amount: amt });
      else if (/balance|due/.test(ctx)) totals.balance = amt;
    }
    totals.deposit = round2(totals.deposits.reduce((a, d) => a + d.amount, 0));
  }

  // ── reconciliation ──────────────────────────────────────────────────────
  const sumAmount = round2(lines.reduce((a, l) => a + l.amount, 0));
  if (totals.amount != null && Math.abs(sumAmount - totals.amount) > 0.05) {
    warnings.push({ level: 'error', msg: `Line amounts add up to ${sumAmount} but the document total is ${totals.amount} (difference ${round2(totals.amount - sumAmount)}).` });
  }
  const sumQty = lines.reduce((a, l) => a + (l.quantity || 0), 0);
  const sumQtyNoPhoto = lines.filter(l => l.lineType !== 'photography').reduce((a, l) => a + (l.quantity || 0), 0);
  if (totals.quantity != null && totals.quantity !== sumQty && totals.quantity !== sumQtyNoPhoto) {
    warnings.push({ level: 'warn', msg: `Document total quantity is ${totals.quantity} but the lines add up to ${sumQty} (${sumQtyNoPhoto} without photography).` });
  }
  if (totals.deposit && totals.balance != null && totals.amount != null) {
    const expect = round2(totals.amount - totals.deposit + totals.overpaid * -1);
    if (Math.abs(expect - totals.balance) > 0.05 && Math.abs(round2(totals.amount - totals.deposit) - totals.balance) > 0.05) {
      warnings.push({ level: 'warn', msg: `Balance ${totals.balance} does not equal total − deposits (${round2(totals.amount - totals.deposit)}).` });
    }
  }

  // ── packing list (pieces actually shipped) ──────────────────────────────
  const pack = [];
  if (packing) {
    const pg = toGrid(packing);
    const ps = pg.findIndex(r => r.some(c => /gross\s*wt|net\s*wt/i.test(str(c))));
    let pe = pg.findIndex((r, i) => i > ps && r.some(c => /^total\b/i.test(str(c))));
    if (pe < 0) pe = pg.length;
    for (let r = Math.max(ps, 0) + 1; r < pe; r++) {
      const texts = pg[r].map(str).filter(s => s && !/^(ctns|pcs|kgs|cbm)$/i.test(s) && !isNum(Number(s)));
      const nn = pg[r].filter(isNum);
      if (!texts.length || nn.length < 2) continue;
      pack.push({ description: texts.join(' '), cartons: nn[0], pieces: nn[1], grossKg: nn[2] ?? null, netKg: nn[3] ?? null, cbm: nn[4] ?? null });
    }
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    for (const p of pack) {
      const m = lines.find(l => l.lineType === 'product' && norm(l.description) === norm(p.description));
      if (m) {
        m.packedQuantity = p.pieces;
        if (m.quantity != null && m.quantity !== p.pieces) {
          warnings.push({ level: 'warn', msg: `"${m.description}": invoiced ${m.quantity} pcs but the packing list shows ${p.pieces}.` });
        }
      } else warnings.push({ level: 'info', msg: `Packing list item "${p.description}" has no matching invoice line.` });
    }
  }

  return {
    ok: true, docType, invoiceNumber, invoiceNumberRaw: invNoRaw, invoiceDate, vendor: vendorText, manufacturerGuess,
    currency: 'USD', refs, lines, totals, packing: pack, warnings, sheetNames: sheets.map(s => s.name), hasPackingList: !!packing,
  };
}
