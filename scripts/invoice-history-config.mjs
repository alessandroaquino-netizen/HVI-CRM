// Decisions for the historical load that cannot be read from the documents alone.
// Every entry names its evidence so a person can overrule it in the app (Invoices → open → edit).

// Products the invoices refer to. Created only if a product with that exact name does not exist yet.
export const HISTORY_PRODUCTS = [
  { name: 'Flannel - Black/Yellow OG',        type: 'flannel',               category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2614' },
  { name: 'Flannel - Red',                    type: 'flannel',               category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2621' },
  { name: 'Flannel - Olive',                  type: 'flannel',               category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2621' },
  { name: 'Flannel - Blue/Grey',              type: 'flannel',               category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2628' },
  { name: 'Arc Button Up - Blue',             type: 'button-up',             category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2626' },
  { name: 'Arc Button Up - Pink',             type: 'button-up',             category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2627' },
  { name: 'White Bucket Truck Polo (Reorder)',type: 'polo',                  category: 'restock',    phase: 'production', mfr: 'bing-bing', ref: 'HVI2625' },
  { name: 'Black Performance Hoodie 2.0',     type: 'hoodie',                category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2624' },
  { name: 'Camo Style Polo',                  type: 'polo',                  category: 'new-design', phase: 'design',     mfr: 'bing-bing', ref: 'HVI2630' },
  { name: 'Foreman - Olive Button Up',        type: 'button-up',             category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2616' },
  { name: 'Foreman - Navy Blue Button Up',    type: 'button-up',             category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2617' },
  { name: 'Foreman Black Long Sleeve',        type: 'long-sleeve-button-up', category: 'new-design', phase: 'tech-pack',  mfr: 'bing-bing', ref: 'HVI2619' },
  { name: 'Subtle Hawaiian Button Up',        type: 'button-up',             category: 'new-design', phase: 'warehouse',  mfr: 'bing-bing', ref: 'HVI2618' },
  { name: 'Black Overtime Polo',              type: 'polo',                  category: 'new-design', phase: 'warehouse',  mfr: 'bing-bing', ref: 'HVI2620' },
  { name: 'Blackout Islander Button Up',      type: 'button-up',             category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2629' },
  { name: 'Neon Islander Button Up',          type: 'button-up',             category: 'new-design', phase: 'production', mfr: 'bing-bing', ref: 'HVI2629' },
];

// description on the document → product name, when the document alone is ambiguous
export const FORCED = {
  'HVI2614 - Black Groundbreaker Flannel.xls': { 'Flannel Shirt': 'Flannel - Black/Yellow OG' },
  'Final Invoice HVI2616.17.18 - Olive Button Up, Navy Button Up, Neutral Button Up, Olive Long Sleeve Samples.xlsx': {
    'Solid Navy': 'Foreman - Navy Blue Button Up', 'Solid Olive': 'Foreman - Olive Button Up',
    'Solid Olive Long Sleeve samples': 'Foreman - Olive Button Up',
  },
  'Final Invoice HVI2614.19 - Black Groundbreaker Flannel, Longsleeve Black Foreman.xls': { 'Solid Black': 'Foreman Black Long Sleeve' },
  'HVI2628 - Navy Grey Flannel.xls': { 'Olive Green flannel shirt': 'Flannel - Blue/Grey' },
  'HVI2629 - Blackout Islander Button Up, Neon Islander Button Up.xls': {
    'Button Up - Pink / Green Hawaiian design': 'Neon Islander Button Up', 'Button Up - Black / White Hawaiian design': 'Blackout Islander Button Up',
  },
  'HVI2630 - Sample Fee for Camo Polos.xls': { 'Sample fee for Camo Polos': 'Camo Style Polo' },
};

// lines that are not DTC product cost (B2B customer orders etc.)
const MSLCAT = 'MSLCAT / Quanta customer order (Tony: paid separately from the polos, which are the HVI brand). Not a DTC cost.';
export const ALLOCATION_OVERRIDES = {
  'HVI2630 - Sample Fee for Camo Polos.xls': {
    'Mens Button up shirt - Grey and Orange Short Sleeve Button up': { allocation: 'b2b', note: MSLCAT },
    'Womens Button up shirt - Grey and Orange Short Sleeve Button up': { allocation: 'b2b', note: MSLCAT },
    'Photography': { allocation: 'b2b', note: 'Photography for the 4 MSLCAT designs (email 2026-08-26). ' + MSLCAT },
    'Fedex Fee (Door to Door including Durty /Tax )': { allocation: 'b2b', note: 'Courier charge listed with the MSLCAT group; confirm with the payment split. ' + MSLCAT },
  },
};

// facts taken from the email threads (payment confirmations, delivery) — approximate dates are marked in the note
export const PAYMENTS = {
  'White Bucket Truck Polo (Reorder)': { deposit_paid_date: '2026-08-28', note: 'Deposit: payment confirmation email 2026-08-28.' },
  'Arc Button Up - Blue':              { deposit_paid_date: '2026-09-08', note: 'Deposit: payment confirmation email sent evening of 2026-09-08 (US Pacific).' },
  'Black Overtime Polo':               { final_paid_date: '2026-09-13', note: 'Balance: Tony sent payment confirmation 2026-09-13 (email "payment confirmation for both orders").' },
  'Blackout Islander Button Up':       { deposit_paid_date: '2026-10-08', note: 'Deposit: payment confirmation email 2026-10-08 (covers both Islander designs).' },
  'Neon Islander Button Up':           { deposit_paid_date: '2026-10-08', note: 'Deposit: payment confirmation email 2026-10-08 (covers both Islander designs).' },
  'Camo Style Polo':                   { paid_in_full: true, full_payment_date: '2026-10-21', note: 'Sample fee paid 2026-10-21 (separate payment for the HVI-brand polos).' },
};
