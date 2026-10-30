// Product matching for invoice lines. Supplier descriptions rarely equal our product names
// ("New Lightning" is our "Arc Button Up - Blue"), so a line is resolved by several independent signals,
// strongest first, and anything that is not certain is surfaced for a person to confirm:
//   1. an alias the team confirmed before            (certain)
//   2. lineage: same order ref, unit price and ~quantity as a line of an earlier invoice (pro-forma → final)
//   3. our product's order ref equals a ref on the document   (certain)
//   4. name similarity (token overlap, with synonyms)  (suggested above 0.6)
//   5. for generic lines ("MEN'S POLO SHIRTS", "Flannel"): the product names written in the file name

const STOP = new Set(['shirt', 'shirts', 'mens', 'men', 'womens', 'women', 'new', 'the', 'a', 'of', 'for', 'and', 'with',
  'sample', 'samples', 'fee', 'design', 'style', 'short', 'sleeve', 'sleeves', 'final', 'invoice', 'pro', 'forma', 'proforma', 'solid']);
const SYN = { arch: 'arc', hawaii: 'hawaiian', grey: 'gray', blackout: 'black', up: 'up' };

export function tokens(s) {
  let t = String(s || '').toLowerCase().replace(/hvi\d[\d.\-]*/g, ' ').replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean).map(w => SYN[w] || w).filter(w => !STOP.has(w));
  if (t.includes('olive')) t = t.filter(w => w !== 'green');
  return [...new Set(t)];
}
export const normKey = s => tokens(s).sort().join(' ');

function tokenScore(q, p) {
  const A = new Set(q), B = new Set(p);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  const jac = inter / (A.size + B.size - inter);
  return inter === A.size ? Math.max(jac, 0.7) : jac;      // everything the line says is in the product name
}
export function similarity(a, b) { return tokenScore(tokens(a), tokens(b)); }

// "Final Invoice HVI2616.17.18 - Olive Button Up, Navy Button Up, Neutral Button Up.xls" → ["Olive Button Up", ...]
export function fileNameProducts(fileName) {
  const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
  const afterDash = base.split(/\s+-\s+/).slice(1).join(' - ') || '';
  return afterDash.split(/,|\band\b/i)
    .map(s => s.replace(/^\s*sample fee for\s+/i, '').replace(/\bsamples?\b/i, '').trim()).filter(Boolean);
}

export function matchByName(text, products, { minSuggest = 0.6, context = '' } = {}) {
  const q = tokens(text + ' ' + context);
  const scored = products.map(p => ({ product: p, score: tokenScore(q, tokens(p.name)) })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { candidates: [] };
  const unique = !scored[1] || best.score - scored[1].score >= 0.15;
  return { candidates: scored.slice(0, 3), best: best.score >= minSuggest && unique ? best : null };
}

// Earlier invoice lines (usually the pro-forma) that later lines probably repeat. A prior line can only be
// claimed once, by the closest quantity, so three similar lines cannot all inherit the same product.
export function assignLineage(rows, refs, prior) {
  const refSet = new Set(refs);
  const pool = [];
  for (const inv of prior) {
    if (!(inv.refs || []).some(r => refSet.has(r))) continue;
    for (const l of inv.lines) if (l.line_type === 'product' && l.dtc_product_id) pool.push({ invoice: inv, line: l, used: false });
  }
  const pairs = [];
  rows.forEach((r, ri) => pool.forEach((c, pi) => {
    const q = Number(c.line.quantity);
    if (r.quantity == null || Math.abs(Number(c.line.unit_price) - r.unitPrice) > 0.005) return;
    if (Math.abs(q - r.quantity) / Math.max(q, r.quantity) > 0.06) return;
    pairs.push({ ri, pi, d: Math.abs(q - r.quantity) });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const out = new Map(); const usedRow = new Set();
  for (const p of pairs) {
    if (usedRow.has(p.ri) || pool[p.pi].used) continue;
    // a second equally close candidate means we cannot tell which one it is
    const rivals = pairs.filter(x => x.ri === p.ri && x.pi !== p.pi && x.d === p.d && !pool[x.pi].used);
    if (rivals.length) continue;
    usedRow.add(p.ri); pool[p.pi].used = true;
    out.set(p.ri, { productId: pool[p.pi].line.dtc_product_id, priorInvoice: pool[p.pi].invoice, priorLine: pool[p.pi].line });
  }
  return out;
}
