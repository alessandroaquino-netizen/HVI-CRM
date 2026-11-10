// Reads dates and milestones out of an email thread (plain text) without any AI: keyword + date rules.
// Every suggestion carries the sentence it came from so a person can confirm it. The AI function returns the same shape.
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_RES = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, f: m => [+m[1], +m[2] - 1, +m[3]] },
  { re: new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi'), f: m => [m[3] ? +m[3] : null, MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]] },
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\.?(?:,?\\s+(\\d{4}))?\\b`, 'gi'), f: m => [m[3] ? +m[3] : null, MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]] },
  { re: /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, f: m => [m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]] },      // US month/day/year, as in the supplier emails
];
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const valid = (y, m, d) => { const t = new Date(Date.UTC(y, m, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d; };

// All dates in a text, with their position. A date with no year takes the year of `context` (the email's own date) and
// rolls to the next year when that would put it well before the email.
export function findDates(text, context) {
  const out = []; const c = new Date(context + 'T00:00:00Z');
  for (const { re, f } of DATE_RES) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      let [y, mo, d] = f(m); if (mo == null || Number.isNaN(mo)) continue;
      if (y == null) { y = c.getUTCFullYear(); if (new Date(Date.UTC(y, mo, d)) < new Date(c.getTime() - 60 * 86400000)) y += 1; }
      if (!valid(y, mo, d)) continue;
      out.push({ date: iso(y, mo, d), index: m.index, end: m.index + m[0].length });
    }
  }
  return out.sort((a, b) => a.index - b.index).filter((x, i, arr) => !arr.some((y, j) => j < i && y.index <= x.index && y.end >= x.end));
}

const RULES = [
  { kind: 'order_placed',     re: /(order (?:was |has been )?placed|placed (?:the|our) order|po (?:issued|sent|received)|deposit (?:received|paid|confirmed)|(?:received|got|have) (?:the |your |our )?(?:50% )?(?:deposit|payment)|order confirmed)/i },
  { kind: 'sampling_end',     re: /(samples?\b.{0,40}(approved|ready|sent|shipped|completed|done)|(approved|received).{0,25}samples?)/i },
  { kind: 'sampling_start',   re: /(start(?:ed|ing)?|begin|began|working on|making).{0,30}samples?/i },
  { kind: 'production_start', re: /((start(?:ed|ing|s)?|begin(?:s|ning)?|began|commenc\w+|moving into|move into|moved into|entering|entered|going into|kick(?:ed)? off).{0,40}(production|bulk|manufactur\w+|cutting|sewing))|((production|bulk|manufacturing).{0,40}(start(?:ed|s)?|begin\w*|began|commenc\w+|kick(?:ed)? off))/i },
  { kind: 'production_end',   re: /((production|bulk|manufacturing|sewing).{0,40}(complete\w*|finish\w*|done|ready))|((complete\w*|finish\w*).{0,30}(production|bulk|manufacturing))/i },
  { kind: 'shipped',          re: /(shipped|dispatched|\bship(?:ping)? (?:on|by|out|date)\b|picked up|handed (?:over )?to|sent out|ship date|will ship|shipping out|departed)/i },
  { kind: 'delivery_eta',     re: /(deliver\w*|arriv\w*|\beta\b|expected (?:to )?(?:be )?(?:at|in)|landing)/i },
  { kind: 'design_end',       re: /((tech ?pack|artwork|design|mock-?ups?).{0,30}(approved|final\w*|confirmed|received))/i },
];
export const KIND_LABELS = {
  order_placed: 'Order placed with the manufacturer', sampling_start: 'Sampling started', sampling_end: 'Sampling finished / samples approved',
  production_start: 'Production started', production_end: 'Production finished', shipped: 'Shipped', delivery_eta: 'Expected delivery', design_end: 'Design / tech pack approved',
};

// Order of the phases, used to suggest a phase change.
const PHASE_OF_KIND = { design_end: 'design', sampling_start: 'sampling', sampling_end: 'sampling', order_placed: 'production', production_start: 'production', production_end: 'production', shipped: 'shipping' };

const CARRIER_WORD = [['fedex', /fedex/i], ['ups', /\bups\b/i], ['dhl', /\bdhl\b/i], ['usps', /\busps\b/i]];
export function findTracking(text) {
  const out = [];
  for (const m of text.matchAll(/\b1Z[0-9A-Z]{16}\b/g)) out.push({ number: m[0], carrier: 'ups', index: m.index });
  for (const m of text.matchAll(/(?:tracking|track|awb|waybill|fedex|dhl)\D{0,25}(\d[\d ]{8,20}\d)/gi)) {
    const digits = m[1].replace(/\s/g, ''); if (digits.length < 10 || digits.length > 22) continue;
    const ctx = text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 20);
    const carrier = CARRIER_WORD.find(([, re]) => re.test(ctx))?.[0] || (digits.length === 12 || digits.length === 15 ? 'fedex' : digits.length === 10 ? 'dhl' : 'other');
    out.push({ number: digits, carrier, index: m.index });
  }
  return out.filter((x, i, a) => a.findIndex(y => y.number === x.number) === i);
}

// Sentences or lines of the thread, each tagged with the date of the email it belongs to ("On Tue, Oct 6, 2026 at 3:12 PM ... wrote:" or "Date: ...").
function segments(text, today) {
  const lines = text.replace(/\r/g, '').split('\n'); const out = []; let ctx = today;
  for (const raw of lines) {
    const line = raw.trim(); if (!line) continue;
    if (/^(date|sent|on .+wrote)\b|^(from|to|subject):/i.test(line) || /wrote:$/i.test(line)) { const d = findDates(line, ctx)[0]; if (d && /^(date|sent|on)\b/i.test(line)) ctx = d.date; if (/^(date|sent|from|to|subject)\b/i.test(line)) continue; }
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z])/)) if (s.trim().length > 8) out.push({ text: s.trim(), ctx });
  }
  return out;
}

export function parseEmailText(text, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const events = []; const seen = new Set();
  const scan = (piece, ctx, full) => {
    const dates = findDates(piece, ctx); if (!dates.length) return 0; let n = 0;
    for (const rule of RULES) {
      const m = piece.match(rule.re); if (!m) continue;
      const at = m.index; const d = dates.reduce((best, x) => (Math.abs(x.index - at) < Math.abs(best.index - at) ? x : best), dates[0]);
      const key = `${rule.kind}|${d.date}`; if (seen.has(key)) continue; seen.add(key);
      events.push({ kind: rule.kind, date: d.date, quote: full.length > 220 ? full.slice(0, 217) + '…' : full, confidence: dates.length === 1 ? 'medium' : 'low', emailDate: ctx });
      n++; break;                                          // one meaning per clause: the first rule that fits
    }
    return n;
  };
  for (const seg of segments(text, today)) {
    // "…approved on Oct 5 and we are moving into production on Oct 12": read each clause on its own, fall back to the whole sentence.
    const clauses = seg.text.split(/,?\s+(?:and|but|then)\s+|;\s*/i);
    let found = 0; if (clauses.length > 1) for (const c of clauses) found += scan(c, seg.ctx, seg.text);
    if (!found) scan(seg.text, seg.ctx, seg.text);
  }
  const tracking = findTracking(text);
  return { events: events.sort((a, b) => a.date.localeCompare(b.date)), tracking, quantities: findQuantities(text), source: 'rules' };
}

// ─── Quantities: size breakdowns ("S 20, M 40, L 60"), a total ("300 pcs") and the order reference ───
const SIZE_NORM = { xxs: 'XXS', xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'XL', xxl: '2XL', '2xl': '2XL', xxxl: '3XL', '3xl': '3XL', '4xl': '4XL', '5xl': '5XL' };
const SIZE_RE = '(XXXL|XXL|XXS|XS|XL|S|M|L|[2-5]XL)';
export function findQuantities(text) {
  const sizes = []; const seen = new Set();
  for (const line of text.split('\n')) {
    const a = [...line.matchAll(new RegExp(`\\b${SIZE_RE}\\b\\s*[:=\\-–]?\\s*(\\d{1,4})\\b(?!\\s*(?:%|in\\b|cm\\b|inch))`, 'g'))];
    const b = [...line.matchAll(new RegExp(`\\b(\\d{1,4})\\s*[x×]?\\s*${SIZE_RE}\\b`, 'g'))];
    const hits = a.length >= b.length ? a.map(m => [m[1], +m[2]]) : b.map(m => [m[2], +m[1]]);
    if (hits.length < 3) continue;                                  // a real breakdown lists several sizes on one line
    for (const [sz, qty] of hits) { const k = SIZE_NORM[sz.toLowerCase()] || sz.toUpperCase(); if (!seen.has(k)) { seen.add(k); sizes.push({ size: k, qty, quote: line.trim().slice(0, 200) }); } }
  }
  const unit = '(?:pcs|pieces|units|garments|shirts|polos|hoodies|caps|hats)';
  const tot = text.match(new RegExp(`total\\D{0,20}(\\d{2,5})\\s*${unit}?`, 'i')) || text.match(new RegExp(`(\\d{2,5})\\s*${unit}\\b`, 'i'));
  const ref = text.match(/\bHVI\d{4}(?:[\s.\-]\d{2})*\b/)?.[0] || '';
  const subject = text.match(/^subject:\s*(.+)$/im)?.[1]?.trim() || '';
  const total = tot ? +tot[1] : (sizes.length ? sizes.reduce((a, x) => a + x.qty, 0) : null);
  return { sizes, total, ref, subject };
}

export const phaseForKind = k => PHASE_OF_KIND[k] || null;
