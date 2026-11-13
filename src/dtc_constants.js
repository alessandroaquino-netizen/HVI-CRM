// ─── DTC Phases (7: Sampling and Shipping are their own phases) ──────────────────────
export const DTC_PHASES = [
  { id: 'idea',       label: 'Idea Phase',          color: '9B7FE8' },
  { id: 'design',     label: 'Design',               color: '5B9CF6' },
  { id: 'tech-pack',  label: 'Tech Pack',             color: 'F0C040' },
  { id: 'sampling',   label: 'Sampling',              color: 'E8874A' },
  { id: 'production', label: 'Production',            color: 'E05555' },
  { id: 'shipping',   label: 'Shipping',              color: '2FA4B8' },
  { id: 'warehouse',  label: 'Warehouse',             color: '4CAF7D' },
];

// ─── Product categories ───────────────────────────────────────────────────
export const PRODUCT_CATEGORIES = [
  { id: 'restock',    label: 'Restock',                  color: '4CAF7D' },
  { id: 'new-design', label: 'New Design (existing line)', color: '5B9CF6' },
  { id: 'new-line',   label: 'New Product Line',          color: '9B7FE8' },
];

// ─── Priority ──────────────────────────────────────────────────────────────
export const PRIORITIES = [
  { id: 'low',    label: 'Low',    color: '8A8F98' },
  { id: 'medium', label: 'Medium', color: 'F0C040' },
  { id: 'high',   label: 'High',   color: 'E05555' },
];

// ─── Product types with lead times by category ────────────────────────────
// totalWeeks: { restock, 'new-design', 'new-line' }
// phases breakdown in weeks (used for risk calc)
export const PRODUCT_TYPES = [
  {
    id: 'button-up', label: 'Button-Up', manufacturer: 'bing-bing',
    totalWeeks: { restock: 5, 'new-design': 8, 'new-line': 18 },
    phases: { design_first: 1, design_final: 4, sampling: 3, production: 6, shipping: 3 },
  },
  {
    id: 'polo', label: 'Polo', manufacturer: 'bing-bing',
    totalWeeks: { restock: 5, 'new-design': 8, 'new-line': 18 },
    phases: { design_first: 1, design_final: 4, sampling: 3, production: 6, shipping: 3 },
  },
  {
    id: 'flannel', label: 'Flannel', manufacturer: 'bing-bing',
    totalWeeks: { restock: 5, 'new-design': 8, 'new-line': 21 },
    phases: { design_first: 1, design_final: 4, sampling: 3, production: 10, shipping: 3 },
  },
  {
    id: 'jersey', label: 'Jersey', manufacturer: 'bing-bing',
    totalWeeks: { restock: 5, 'new-design': 8, 'new-line': 18 },
    phases: { design_first: 1, design_final: 4, sampling: 3, production: 6, shipping: 3 },
  },
  {
    id: 'long-sleeve-button-up', label: 'Long Sleeve Button-Up', manufacturer: 'bing-bing',
    totalWeeks: { restock: 5, 'new-design': 8, 'new-line': 18 },
    phases: { design_first: 1, design_final: 4, sampling: 3, production: 6, shipping: 3 },
  },
  {
    id: 'hoodie', label: 'Hoodie', manufacturer: 'bing-bing',
    totalWeeks: { restock: 5, 'new-design': 8, 'new-line': null },
    phases: null,
  },
  {
    id: 'board-short', label: 'Board Short', manufacturer: 'bing-bing',
    totalWeeks: { restock: 5, 'new-design': 8, 'new-line': null },
    phases: null,
  },
  {
    id: 'tee', label: 'T-Shirt', manufacturer: 'screen-printer',
    totalWeeks: { restock: 3, 'new-design': 5, 'new-line': 5 },
    phases: { design_first: 1, design_final: 2, sampling: 1, production: 3, shipping: 1 },
  },
  {
    id: 'hat-embroidered', label: 'Hat (Embroidered)', manufacturer: 'print-theory',
    totalWeeks: { restock: 3, 'new-design': 5, 'new-line': 5 },
    phases: null,
  },
  {
    id: 'hat-stormcode', label: 'Hat (Stormcode)', manufacturer: 'alibaba',
    totalWeeks: { restock: 6, 'new-design': 8, 'new-line': 8 },
    phases: null,
  },
  {
    id: 'hat-other', label: 'Hat (Other Alibaba)', manufacturer: 'alibaba',
    totalWeeks: { restock: 5, 'new-design': 5, 'new-line': 5 },
    phases: null,
  },
  {
    id: 'keychain', label: 'Keychain / Accessory', manufacturer: 'alibaba',
    totalWeeks: { restock: 5, 'new-design': 5, 'new-line': 5 },
    phases: null,
  },
  {
    id: 'challenge-coin', label: 'Challenge Coin', manufacturer: 'all-about-cc',
    totalWeeks: { restock: 5, 'new-design': 6, 'new-line': 6 },
    phases: null,
  },
  {
    id: 'sticker', label: 'Sticker', manufacturer: 'sticker-mule',
    totalWeeks: { restock: 2, 'new-design': 2, 'new-line': 2 },
    phases: null,
  },
  {
    id: 'other', label: 'Other', manufacturer: 'other',
    totalWeeks: { restock: null, 'new-design': null, 'new-line': null },
    phases: null,
  },
];

// ─── Manufacturers (own-produced only — dropship removed from lifecycle) ──
export const MANUFACTURERS = [
  { id: 'bing-bing',      label: 'Bing Bing (China)',           payment: '50/50' },
  { id: 'screen-printer', label: 'US Screen Printer',           payment: '50/50' },
  { id: 'print-theory',   label: 'Print Theory / Avi (Hats)',   payment: '50/50' },
  { id: 'alibaba',        label: 'Alibaba',                     payment: '50/50' },
  { id: 'all-about-cc',   label: 'All About Challenge Coins',   payment: 'standard' },
  { id: 'sticker-mule',   label: 'Sticker Mule',                payment: 'standard' },
  { id: 'other',          label: 'Other',                       payment: 'standard' },
];

// Drop-ship suppliers — appear in calendar/marketing only, not in product lifecycle
export const DROPSHIP_SUPPLIERS = [
  { id: 'selby',      label: 'Selby Knives' },
  { id: 'benchmark',  label: 'Benchmark FR' },
  { id: 'camel-city', label: 'Camel City Mill' },
  { id: 'co-eyewear', label: 'Co Eyewear' },
];

// ─── Seasonal windows (DTC-first framing) ────────────────────────────────
export const SEASONAL_WINDOWS = [
  { id: 'winter',    label: 'Winter Season',      start: '2026-01-01', end: '2026-02-28', color: '5B9CF6', opacity: 0.12 },
  { id: 'golf',      label: 'Golf Season',         start: '2026-03-01', end: '2026-06-30', color: '4CAF7D', opacity: 0.10 },
  { id: 'summer',    label: 'Summer (Boardshorts)',start: '2026-06-01', end: '2026-08-31', color: 'F0C040', opacity: 0.10 },
  { id: 'fall',      label: 'Fall (Flannels/Hoodies)',start:'2026-09-01',end:'2026-11-30', color: 'E8874A', opacity: 0.10 },
  { id: 'holiday',   label: 'Holiday / BFCM',      start: '2026-11-01', end: '2026-12-31', color: '9B7FE8', opacity: 0.12 },
];

export const KEY_DATES = [
  { date: '2026-04-18', label: 'Lineman Day',                       color: 'F0C040' },
  { date: '2026-11-27', label: 'Black Friday',                       color: 'E05555' },
  { date: '2026-11-30', label: 'Cyber Monday',                       color: 'E05555' },
  { date: '2026-09-01', label: 'Suicide Prevention Month',           color: '5B9CF6', month: true },
  { date: '2026-10-01', label: 'Breast Cancer Awareness Month',      color: 'E05555', month: true },
  { date: '2026-03-15', label: 'Spring Graduation (line schools)',    color: '4CAF7D' },
  { date: '2026-06-15', label: 'Summer Graduation (line schools)',    color: '4CAF7D' },
  { date: '2026-11-15', label: 'Fall Graduation (line schools)',      color: '4CAF7D' },
];

// ─── Risk calculation ─────────────────────────────────────────────────────
export function getLeadWeeks(product) {
  const type = PRODUCT_TYPES.find(t => t.id === product.product_type);
  if (!type) return null;
  const cat = product.category || 'new-line';
  return type.totalWeeks[cat] ?? null;
}

export function calcDropRisk(product) {
  if (!product.drop_date) return 'unknown';
  const totalWeeks = getLeadWeeks(product);
  if (!totalWeeks) return 'unknown';

  const today = new Date();
  const drop  = new Date(product.drop_date);
  const weeksLeft = (drop - today) / (7 * 24 * 3600 * 1000);

  // Weeks still needed from current phase onward
  const type = PRODUCT_TYPES.find(t => t.id === product.product_type);
  const ph   = type?.phases;
  const weeksNeeded = ph ? {
    idea:       totalWeeks,
    design:     totalWeeks - (ph.design_first || 1),
    'tech-pack': ph.sampling + ph.production + ph.shipping,
    sampling:   ph.production + ph.shipping,
    production: ph.shipping,
    shipping:   1,
    warehouse:  0,
  } : { idea: totalWeeks, design: totalWeeks * 0.9, 'tech-pack': totalWeeks * 0.6, sampling: totalWeeks * 0.4, production: totalWeeks * 0.2, shipping: 1, warehouse: 0 };

  const needed = weeksNeeded[product.phase] ?? 0;
  if (needed === 0) return 'ok';
  if (weeksLeft < 0)        return 'overdue';
  if (weeksLeft < needed)   return 'overdue';
  if (weeksLeft < needed * 1.25) return 'at-risk';
  return 'ok';
}

// Expected date range per sub-phase, walking backward from drop_date using the
// product type's phases breakdown (weeks). Returns null for types with no phases data
// (hats/accessories/etc.) or products with no drop_date/product_type.
export function phaseDatesForProduct(product) {
  if (!product.drop_date) return null;
  const type = PRODUCT_TYPES.find(t => t.id === product.product_type);
  const ph = type?.phases;
  if (!ph) return null;

  const addDays = (dateStr, days) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const drop = product.drop_date;
  const shippingStart   = addDays(drop, -ph.shipping * 7);
  const productionStart = addDays(shippingStart, -ph.production * 7);
  const samplingStart   = addDays(productionStart, -ph.sampling * 7);
  const designFinalStart = addDays(samplingStart, -ph.design_final * 7);
  const designFirstStart = addDays(designFinalStart, -ph.design_first * 7);

  // Each window runs from the start of that phase to the start of the next one; Drop is the single drop date.
  return [
    { label: 'Design', start: designFirstStart, end: samplingStart },
    { label: 'Sampling', start: samplingStart, end: productionStart },
    { label: 'Production', start: productionStart, end: shippingStart },
    { label: 'Shipping', start: shippingStart, end: drop },
    { label: 'Drop', start: drop, end: drop },
  ];
}

export function daysInPhase(product) {
  if (!product.phase_changed_at) return 0;
  return Math.floor((new Date() - new Date(product.phase_changed_at)) / 86400000);
}

export function weeksUntilDrop(product) {
  if (!product.drop_date) return null;
  return Math.round((new Date(product.drop_date) - new Date()) / (7 * 24 * 3600 * 1000));
}

// ─── Manufacturer blackout periods (Oct 21 team sync) ─────────────────────
// Bing Bing closes for the whole of February (Lunar New Year). Q1 and February-conference orders must be
// finalized by Nov 1; anything still open ships after April 15. Edit this list when dates change.
export const MANUFACTURER_BLACKOUTS = [
  { id: 'bb-cutoff-2026', manufacturer: 'bing-bing', kind: 'cutoff',  label: 'Order cutoff for Q1 / February conference', start: '2026-11-01', end: '2026-11-01',
    note: 'Orders needed for Q1 and the February conference must be finalized by Nov 1.' },
  { id: 'bb-closure-2027', manufacturer: 'bing-bing', kind: 'closure', label: 'Lunar New Year closure', start: '2027-02-01', end: '2027-02-28',
    note: 'Bing Bing (China) is closed for all of February: no production.' },
  { id: 'bb-delay-2027', manufacturer: 'bing-bing', kind: 'delay',   label: 'Shipments delayed until Apr 15', start: '2027-03-01', end: '2027-04-14',
    note: 'Orders still open at the closure ship from April 15.' },
];

export function blackoutsOn(dateStr) { return MANUFACTURER_BLACKOUTS.filter(b => dateStr >= b.start && dateStr <= b.end); }

// Plain-language warnings when a product's production or shipping window overlaps a closure or delay.
export function blackoutWarnings(product) {
  if (!product.manufacturer || product.phase === 'warehouse') return [];
  const out = [];
  const windows = phaseDatesForProduct(product)?.filter(w => ['Production', 'Shipping'].includes(w.label)) || [];
  for (const b of MANUFACTURER_BLACKOUTS.filter(x => x.manufacturer === product.manufacturer && (x.kind === 'closure' || x.kind === 'delay'))) {
    const hit = windows.find(w => w.start <= b.end && w.end >= b.start);
    const dropInside = product.drop_date && product.drop_date >= b.start && product.drop_date <= b.end;
    if (hit || dropInside) out.push(`${b.label} (${b.start} to ${b.end}) overlaps this product's ${hit ? hit.label.toLowerCase() + ' window' : 'drop date'}. ${b.note}`);
  }
  return out;
}

// ─── Shipping (production → warehouse) ────────────────────────────────────
export const CARRIERS = [
  { id: 'fedex', label: 'FedEx', url: n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` },
  { id: 'ups',   label: 'UPS',   url: n => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  { id: 'dhl',   label: 'DHL',   url: n => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}` },
  { id: 'usps',  label: 'USPS',  url: n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}` },
  // 17TRACK looks the number up across carriers, so it also covers freight and anything not listed above.
  { id: 'other', label: 'Other / freight', url: n => `https://t.17track.net/en#nums=${encodeURIComponent(n)}` },
];

export function trackingUrl(carrier, number) {
  const n = (number || '').trim();
  if (!n) return null;
  return (CARRIERS.find(c => c.id === carrier) || CARRIERS[CARRIERS.length - 1]).url(n);
}

// Days from today until the estimated delivery date (negative = late). null when no date is set.
export const bestEta = product => product.tracking_eta || product.estimated_delivery_date || '';
export function daysToDelivery(product, today = new Date().toISOString().slice(0, 10)) {
  const eta = bestEta(product);
  if (!eta) return null;
  return Math.round((new Date(eta) - new Date(today)) / 86400000);
}

// ─── T-minus planning: from a target drop date back to when each stage must start ───────────────────────
// Uses the lead-time table (total weeks per category) and the stage weights of the product type. A restock skips design and
// sampling, a new design in an existing line skips design; the total always matches the table.
const STAGES_BY_CATEGORY = { restock: ['production', 'shipping'], 'new-design': ['sampling', 'production', 'shipping'], 'new-line': ['design_first', 'design_final', 'sampling', 'production', 'shipping'] };
const STAGE_LABEL = { design_first: 'Ideation', design_final: 'Design', sampling: 'Sampling', production: 'Production', shipping: 'Shipping' };
export function planBackward({ product_type, category = 'new-line', drop_date }) {
  const type = PRODUCT_TYPES.find(t => t.id === product_type);
  if (!type || !drop_date) return null;
  const totalWeeks = type.totalWeeks[category] ?? null;
  if (!totalWeeks) return null;
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const stages = (STAGES_BY_CATEGORY[category] || STAGES_BY_CATEGORY['new-line']).filter(s => type.phases);
  let phases = null;
  if (type.phases && stages.length) {
    const sum = stages.reduce((a, s) => a + type.phases[s], 0); const scale = totalWeeks / sum;
    let end = drop_date; const out = [];
    for (const s of [...stages].reverse()) { const days = Math.max(1, Math.round(type.phases[s] * scale * 7)); out.unshift({ id: s, label: STAGE_LABEL[s], start: addDays(end, -days), end, weeks: Math.round((days / 7) * 10) / 10 }); end = addDays(end, -days); }
    phases = out;
  }
  const startBy = phases ? phases[0].start : addDays(drop_date, -totalWeeks * 7);
  return { totalWeeks, startBy, firstStage: phases ? phases[0].label : 'Start', phases };
}

// Quoted vs actual production time (weeks). `actual` is null until production has both a start and an end (or is still running: `running`).
export function productionTime(product, today = new Date().toISOString().slice(0, 10)) {
  const quoted = product.quoted_production_weeks != null && product.quoted_production_weeks !== '' ? Number(product.quoted_production_weeks) : null;
  const start = product.production_started_on || null; const end = product.production_finished_on || null;
  if (!start) return { quoted, actual: null, running: false, variance: null };
  const days = Math.max(0, Math.round((new Date((end || today) + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000));
  const actual = Math.round((days / 7) * 10) / 10;
  return { quoted, actual, running: !end, variance: quoted != null ? Math.round((actual - quoted) * 10) / 10 : null };
}

// ─── Standard size runs per product type (pre-loaded in Inventory and in Sizes & SKUs; anything can be added or removed) ───
const S_3XL = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const S_4XL = [...S_3XL, '4XL'];
export const SIZE_TEMPLATES = {
  'tee': S_3XL, 'hoodie': S_3XL, 'board-short': S_3XL,
  'button-up': S_4XL, 'polo': S_4XL, 'flannel': S_4XL, 'jersey': S_4XL, 'long-sleeve-button-up': S_4XL,
  'hat-embroidered': ['One size'], 'hat-stormcode': ['One size'], 'hat-other': ['One size'],
};
export const sizesFor = productType => SIZE_TEMPLATES[productType] || [];
// Splits "4XL, 5XL" or "Black / Red" lists typed by hand into clean, de-duplicated labels.
export function parseLabels(text) { return [...new Set(String(text || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean))]; }

// Every size the team may need, for the checkbox picker (small through 5XL, plus tall sizes). Colors or other variants go in the free-text box.
export const SIZE_GROUPS = [
  { label: 'Standard', sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'] },
  { label: 'Tall', sizes: ['LT', 'XLT', '2XLT', '3XLT'] },
  { label: 'Other', sizes: ['One size'] },
];
