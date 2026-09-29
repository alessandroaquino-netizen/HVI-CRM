// ─── DTC Phases (6 now — Sampling is its own phase) ──────────────────────
export const DTC_PHASES = [
  { id: 'idea',       label: 'Idea Phase',          color: '9B7FE8' },
  { id: 'design',     label: 'Design',               color: '5B9CF6' },
  { id: 'tech-pack',  label: 'Tech Pack',             color: 'F0C040' },
  { id: 'sampling',   label: 'Sampling',              color: 'E8874A' },
  { id: 'production', label: 'Production',            color: 'E05555' },
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
    warehouse:  0,
  } : { idea: totalWeeks, design: totalWeeks * 0.9, 'tech-pack': totalWeeks * 0.6, sampling: totalWeeks * 0.4, production: totalWeeks * 0.2, warehouse: 0 };

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

  return [
    { label: 'Design', start: designFirstStart, end: designFinalStart },
    { label: 'Sampling', start: designFinalStart, end: samplingStart },
    { label: 'Production', start: samplingStart, end: productionStart },
    { label: 'Shipping', start: productionStart, end: shippingStart },
    { label: 'Drop', start: shippingStart, end: drop },
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
