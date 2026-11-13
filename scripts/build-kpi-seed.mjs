// Builds data_kpi_q4_2026.sql (KPI definitions, Rocks and the weekly values already entered) from the Notion exports in data/notion.
// Usage: node scripts/build-kpi-seed.mjs   — the output is idempotent (ON CONFLICT DO NOTHING), so it never overwrites edits made in the app.
import fs from 'node:fs';

const Q = '2026-Q4';
const YEAR = 2026;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// ── minimal RFC-4180 CSV parser (the export has quoted multi-line cells) ──
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// "Oct.19" / "Nov. 2" → '2026-10-19'
const weekIso = h => { const m = /([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})/.exec(h); if (!m) return null; return `${YEAR}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`; };

// "$22,061.10" → 22061.1 · "29.68%" → 29.68 · "QTD: 2.15" → 2.15 · links / blanks → null
const num = s => { const t = norm(s); if (!t || /^https?:/i.test(t)) return null; const m = /-?\d[\d,]*\.?\d*/.exec(t.replace(/^QTD:\s*/i, '')); return m ? parseFloat(m[0].replace(/,/g, '')) : null; };

const csv = parseCsv(fs.readFileSync(new URL('../data/notion/q4-2026-kpis.csv', import.meta.url), 'utf8'));
const header = csv[0]; const body = csv.slice(1).filter(r => r.some(c => norm(c)));
const PARENT = header.indexOf('Parent item');
const weekCols = header.map((h, i) => ({ i, d: weekIso(h) })).filter(x => x.d && x.i > 0 && x.i < PARENT - 1);

function findRow(label, parent) {
  const r = body.find(r => norm(r[0]).startsWith(norm(label)) && (!parent || norm(r[PARENT]).includes(parent)));
  if (!r) throw new Error(`CSV row not found: "${label}" / "${parent}"`);
  return r;
}

const C = 'Company';
// label/parent locate the Notion row; qtd* locate the row holding the quarter-to-date figures.
const KPIS = [
  { key: 'dtc_revenue',       name: 'Weekly DTC revenue',                          owner: C, unit: 'usd',   target: 20000, scope: 'week',    dir: 'higher', agg: 'sum',    label: 'Weekly DTC revenue', qtd: ['QTD:', 'Weekly DTC revenue'], source: 'shopify' },
  { key: 'ad_spend_pct',      name: 'Ad spend as % of DTC revenue',                owner: C, unit: 'pct',   target: 25,    scope: 'week',    dir: 'lower',  agg: 'none',   label: 'Ad spend as % of DTC revenue', qtd: ['QTD:', 'Ad spend as % of DTC revenue'], source: 'meta' },
  { key: 'klaviyo_pct',       name: 'Klaviyo revenue as % of DTC revenue',         owner: C, unit: 'pct',   target: 35,    scope: 'week',    dir: 'higher', agg: 'none',   label: 'Klaviyo revenue as % of DTC revenue', qtd: ['QTD:', 'Klaviyo revenue as % of DTC revenue'], source: 'klaviyo' },
  { key: 'ltv_cac',           name: 'LTV:CAC',                                     owner: C, unit: 'ratio', target: 2,     scope: 'week',    dir: 'higher', agg: 'none',   label: 'LTV:CAC', qtd: ['QTD:', 'LTV:CAC'] },

  { key: 'ltv_90',            name: '90-day LTV',                                  owner: 'Aira Viray', unit: 'usd',   target: 62,   scope: 'week', dir: 'higher', agg: 'latest', label: '1) 90-Day LTV', source: 'shopify' },
  { key: 'repeat_q2',         name: 'Repeat purchase: Q2 2026 customers, 1st→2nd',  owner: 'Aira Viray', group: 'Repeat purchase rate', unit: 'pct', target: 42, scope: 'week', dir: 'higher', agg: 'latest', label: 'a. Q2 2026 customers', source: 'shopify' },
  { key: 'repeat_q3',         name: 'Repeat purchase: Q3 2026 customers, 1st→2nd',  owner: 'Aira Viray', group: 'Repeat purchase rate', unit: 'pct', target: 40, scope: 'week', dir: 'higher', agg: 'latest', label: 'b. Q3 2026 customers', source: 'shopify' },
  { key: 'fanatic_pct',       name: 'Fanatic development: 12-month customers with 3+ purchases', owner: 'Aira Viray', unit: 'pct', target: 15, scope: 'week', dir: 'higher', agg: 'latest', label: 'Fanatic development', source: 'shopify' },
  { key: 'loyalty_members',   name: 'Loyalty program: active members',             owner: 'Aira Viray', group: 'Loyalty program', unit: 'count', target: 3500, scope: 'point', dir: 'higher', agg: 'latest', label: 'a. Total active members', source: 'klaviyo' },
  { key: 'loyalty_active',    name: 'Loyalty program: % of members purchasing in last 90 days', owner: 'Aira Viray', group: 'Loyalty program', unit: 'pct', target: 32, scope: 'week', dir: 'higher', agg: 'latest', label: 'b. % of loyalty members', source: 'klaviyo' },
  { key: 'loyalty_buyers',    name: 'Loyalty members who purchased (90 days)',      owner: 'Aira Viray', group: 'Loyalty program', unit: 'count', target: null, scope: 'week', dir: 'higher', agg: 'latest', label: 'Loyalty Members Purchasers', source: 'klaviyo' },

  { key: 'conversion',        name: 'Sitewide conversion rate',                    owner: 'Kuerstine Geguira', unit: 'pct', target: 4.5, scope: 'week', dir: 'higher', agg: 'none', label: 'Weekly', parent: 'Sitewide Conversion Rate', qtd: ['QTD:', 'Sitewide Conversion Rate'], source: 'shopify' },
  { key: 'organic_sessions',  name: 'Organic social sessions',                     owner: 'Kuerstine Geguira', unit: 'count', target: 8000, scope: 'quarter', dir: 'higher', agg: 'sum', label: 'Weekly', parent: 'Organic Social Sessions', qtd: ['QTD:', 'Organic Social Sessions'], source: 'ga4' },
  { key: 'cs_closed',         name: 'Customer service: closed inquiries',          owner: 'Kuerstine Geguira', group: 'Customer service (goal: 100% answered same day)', unit: 'count', target: null, scope: 'week', dir: 'higher', agg: 'sum', label: 'Closed Inquiries ', parent: 'Customer Service' },
  { key: 'cs_open',           name: 'Customer service: open inquiries',            owner: 'Kuerstine Geguira', group: 'Customer service (goal: 100% answered same day)', unit: 'count', target: 0, scope: 'point', dir: 'lower', agg: 'latest', label: 'Open Inquiries', parent: 'Customer Service' },
  { key: 'cs_reachouts',      name: 'Customer service: reachouts',                 owner: 'Kuerstine Geguira', group: 'Customer service (goal: 100% answered same day)', unit: 'count', target: null, scope: 'week', dir: 'higher', agg: 'sum', label: 'Reachouts', parent: 'Customer Service' },
  { key: 'orders_open',       name: 'Open orders (all vendors)',                   owner: 'Kuerstine Geguira', group: 'Orders', unit: 'count', target: null, scope: 'week', dir: 'lower', agg: 'latest', label: 'Open Orders', parent: 'Customer Service' },
  { key: 'orders_closed',     name: 'Closed orders (all vendors)',                 owner: 'Kuerstine Geguira', group: 'Orders', unit: 'count', target: null, scope: 'week', dir: 'higher', agg: 'sum', label: 'Closed Orders', parent: 'Customer Service' },
  ...[['HVI ITEMS', 'HVI items'], ['SW', 'SW'], ['BENCHMARK', 'Benchmark'], ['COEWEAR', 'Coewear'], ['CAMEL CITY', 'Camel City']].map(([l, n], i) =>
    ({ key: 'open_' + n.toLowerCase().replace(/\W+/g, '_'), name: 'Open orders: ' + n, owner: 'Kuerstine Geguira', group: 'Open orders by vendor', unit: 'count', target: null, scope: 'week', dir: 'lower', agg: 'latest', label: l, parent: 'Open Orders' })),
  ...[['HVI ITEMS', 'HVI items'], ['STRICTLY WILD', 'Strictly Wild'], ['BENCHMARK FR', 'Benchmark FR'], ['COEWEAR', 'Coewear'], ['CAMEL CITY MILL', 'Camel City Mill']].map(([l, n]) =>
    ({ key: 'closed_' + n.toLowerCase().replace(/\W+/g, '_'), name: 'Closed orders: ' + n, owner: 'Kuerstine Geguira', group: 'Closed orders by vendor', unit: 'count', target: null, scope: 'week', dir: 'higher', agg: 'sum', label: l, parent: 'Closed Orders' })),

  { key: 'blended_roas',      name: 'Blended ROAS',                                owner: 'Ryanne Amamagid', group: 'ROAS', unit: 'ratio', target: null, scope: 'week', dir: 'higher', agg: 'avg', label: 'https://docs.google.com/spreadsheets/d/1BqyQ', source: 'meta' },
  { key: 'meta_roas_7',       name: 'Meta ROAS (last 7 days)',                     owner: 'Ryanne Amamagid', group: 'ROAS', unit: 'ratio', target: 2.5, scope: 'week', dir: 'higher', agg: 'none', label: 'Last 7 Days', parent: 'a. Meta', qtd: ['a. Meta', 'Blended ROAS'], source: 'meta' },
  { key: 'meta_roas_14',      name: 'Meta ROAS (last 14 days)',                    owner: 'Ryanne Amamagid', group: 'ROAS', unit: 'ratio', target: 2.5, scope: 'week', dir: 'higher', agg: 'none', label: 'Last 14 Days', parent: 'a. Meta', source: 'meta' },
  { key: 'google_roas_7',     name: 'Google ROAS (last 7 days)',                   owner: 'Ryanne Amamagid', group: 'ROAS', unit: 'ratio', target: 8.5, scope: 'week', dir: 'higher', agg: 'none', label: 'Last 7 Days', parent: 'b. Google', qtd: ['b. Google', 'Blended ROAS'], source: 'google' },
  { key: 'google_roas_14',    name: 'Google ROAS (last 14 days)',                  owner: 'Ryanne Amamagid', group: 'ROAS', unit: 'ratio', target: 8.5, scope: 'week', dir: 'higher', agg: 'none', label: 'Last 14 Days', parent: 'b. Google', source: 'google' },
  { key: 'ai_sessions',       name: 'AI-attributed sessions',                      owner: 'Ryanne Amamagid', group: 'AI search (AEO)', unit: 'count', target: 200, scope: 'quarter', dir: 'higher', agg: 'sum', label: 'https://admin.shopify.com', source: 'shopify', combined: true },
  { key: 'ai_revenue',        name: 'AI-attributed revenue',                       owner: 'Ryanne Amamagid', group: 'AI search (AEO)', unit: 'usd', target: 2000, scope: 'quarter', dir: 'higher', agg: 'sum', label: 'AI Attributed Revenue', source: 'shopify', note: 'Notion note: $428.47 so far this quarter. No weekly breakdown was provided.' },
  { key: 'creatives',         name: 'Ad creatives produced',                       owner: 'Ryanne Amamagid', group: 'Creative output & performance', unit: 'count', target: 8, scope: 'week', dir: 'higher', agg: 'sum', label: 'a. Ad creatives produced', parent: 'Creative Output' },
  { key: 'ctr',               name: 'Ad CTR',                                      owner: 'Ryanne Amamagid', group: 'Creative output & performance', unit: 'pct', target: 1.5, scope: 'week', dir: 'higher', agg: 'avg', label: 'b. CTR', parent: 'Creative Output', source: 'meta' },
  { key: 'click_to_purchase', name: 'Click-to-purchase rate',                      owner: 'Ryanne Amamagid', group: 'Creative output & performance', unit: 'pct', target: 5.5, scope: 'week', dir: 'higher', agg: 'avg', label: 'c. Click to purchase', parent: 'Creative Output', source: 'meta' },
];

const ROCK_OWNER = { Aira: 'Aira Viray', kuerstine: 'Kuerstine Geguira', Ryanne: 'Ryanne Amamagid' };
const ROCK_TITLES = [
  ['BFCM strategy lead', ['dtc_revenue', 'ad_spend_pct', 'klaviyo_pct']],
  ['Repeat purchase and LTV', ['ltv_90', 'repeat_q2', 'repeat_q3', 'fanatic_pct']],
  ['Loyalty program growth', ['loyalty_members', 'loyalty_active', 'loyalty_buyers']],
  ['Organic social strategy', ['organic_sessions']],
  ['Customer service and feedback system', ['cs_closed', 'cs_open', 'cs_reachouts']],
  ['Sitewide conversion to 4.5%', ['conversion']],
  ['Meta creative strategy', ['creatives', 'ctr', 'click_to_purchase', 'ad_spend_pct']],
  ['AI-search visibility', ['ai_sessions', 'ai_revenue']],
  ['BFCM paid media support', ['meta_roas_7', 'google_roas_7', 'blended_roas']],
];

const sq = s => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";
const nn = n => n == null ? 'NULL::numeric' : String(n);

// ── KPI definitions ──
const out = ['-- Generated by scripts/build-kpi-seed.mjs from the Notion exports (Q4 2026 KPIs and Rocks). Idempotent: never overwrites edits.',
  '-- Run AFTER migration_kpi.sql.', ''];
const defRows = KPIS.map((k, i) => `  (${sq(k.key + '-' + Q)}, ${sq(Q)}, ${sq(k.name)}, ${sq(k.owner)}, ${sq(k.group || null)}, ${sq(k.unit)}, ${nn(k.target)}, ${sq(k.scope)}, ${sq(k.dir)}, ${sq(k.agg)}, ${sq(k.source || 'manual')}, ${sq(k.note || null)}, ${(i + 1) * 10})`);
out.push('INSERT INTO kpis (seed_key, quarter, name, owner_name, group_name, unit, target_value, target_scope, direction, aggregation, source, note, sort_order) VALUES',
  defRows.join(',\n'), 'ON CONFLICT (seed_key) DO NOTHING;', '');

// ── weekly values ──
// Earlier versions seeded these as 'none'; move the untouched ones to the right quarter-to-date rule (idempotent, never touches an edited KPI).
const moved = KPIS.filter(k => k.agg !== 'none' && !k.qtd);
out.push('UPDATE kpis SET aggregation = v.agg FROM (VALUES', moved.map(k => `  (${sq(k.key + '-' + Q)}, ${sq(k.agg)})`).join(',\n'), ") AS v(seed_key, agg) WHERE kpis.seed_key = v.seed_key AND kpis.aggregation = 'none';", '');
const vals = []; const stats = { values: 0, skipped: [] };
for (const k of KPIS) {
  const row = findRow(k.label, k.parent);
  const qrow = k.qtd ? findRow(k.qtd[0], k.qtd[1]) : null;
  for (const { i, d } of weekCols) {
    let value = null, qtd = null; const raw = norm(row[i]);
    if (k.combined && /QTD:/i.test(raw)) { const [a, b] = raw.split(/QTD:/i); value = num(a); qtd = num(b); }
    else value = num(raw);
    if (qrow && qtd == null) qtd = num(qrow[i]);
    if (k.qtd && k.qtd[0] === 'a. Meta' || k.qtd && k.qtd[0] === 'b. Google') { /* QTD ROAS rows already numeric */ }
    if (raw && value == null && !k.combined) stats.skipped.push(`${k.key} ${d}: "${raw.slice(0, 40)}"`);
    if (value == null && qtd == null) continue;
    vals.push(`  (${sq(k.key + '-' + Q)}, ${sq(d)}, ${nn(value)}, ${nn(qtd)})`); stats.values++;
  }
}
out.push('INSERT INTO kpi_values (kpi_id, period_start, value, qtd_value, updated_by)',
  "SELECT k.id, v.d::date, v.val, v.q, 'notion-import' FROM (VALUES", vals.join(',\n'),
  ') AS v(seed_key, d, val, q) JOIN kpis k ON k.seed_key = v.seed_key', 'ON CONFLICT (kpi_id, period_start) DO NOTHING;', '');

// ── Rocks ──
const rocksCsv = parseCsv(fs.readFileSync(new URL('../data/notion/q4-2026-rocks.csv', import.meta.url), 'utf8')).slice(1).filter(r => r.some(c => norm(c)));
const rocks = rocksCsv.map((r, idx) => ({ owner: ROCK_OWNER[norm(r[0])] || norm(r[0]), pos: (idx % 3) + 1, tactics: norm(r[5]), idx }));
const rockRows = rocks.map((r, i) => `  (${sq('rock-' + Q + '-' + (i + 1))}, ${sq(Q)}, ${sq(r.owner)}, ${r.pos}, ${sq(ROCK_TITLES[i][0])}, ${sq(r.tactics)}, 'not_started')`);
out.push('INSERT INTO rocks (seed_key, quarter, owner_name, position, title, tactics, status) VALUES', rockRows.join(',\n'), 'ON CONFLICT (seed_key) DO NOTHING;', '');
const links = []; ROCK_TITLES.forEach(([, keys], i) => keys.forEach(k => { if (!KPIS.some(x => x.key === k)) throw new Error('unknown KPI ' + k); links.push(`  (${sq('rock-' + Q + '-' + (i + 1))}, ${sq(k + '-' + Q)})`); }));
out.push('INSERT INTO rock_kpis (rock_id, kpi_id)', 'SELECT r.id, k.id FROM (VALUES', links.join(',\n'), ') AS l(rock_key, kpi_key)',
  'JOIN rocks r ON r.seed_key = l.rock_key JOIN kpis k ON k.seed_key = l.kpi_key', 'ON CONFLICT DO NOTHING;', '');

fs.writeFileSync(new URL('../data_kpi_q4_2026.sql', import.meta.url), out.join('\n'));
// Same data as JSON for the dev-only mock mode (?mock=1).
const jsonKpis = KPIS.map((k, i) => ({ key: k.key, quarter: Q, name: k.name, owner_name: k.owner, group_name: k.group || null, unit: k.unit, target_value: k.target, target_scope: k.scope, direction: k.dir, aggregation: k.agg, source: k.source || 'manual', note: k.note || null, sort_order: (i + 1) * 10 }));
const jsonValues = vals.map(v => { const m = /\('([^']+)', '([^']+)', ([^,]+), ([^)]+)\)/.exec(v); const f = x => (x.startsWith('NULL') ? null : Number(x)); return { key: m[1].replace('-' + Q, ''), d: m[2], value: f(m[3].trim()), qtd: f(m[4].trim()) }; });
fs.writeFileSync(new URL('../src/dev/kpiSeed.json', import.meta.url), JSON.stringify({ kpis: jsonKpis, values: jsonValues, rocks: rocks.map((r, i) => ({ key: 'rock-' + (i + 1), owner_name: r.owner, position: r.pos, title: ROCK_TITLES[i][0], tactics: r.tactics, kpis: ROCK_TITLES[i][1] })) }));
console.log(`KPIs: ${KPIS.length} · weekly values: ${stats.values} · rocks: ${rocks.length} · links: ${links.length}`);
if (stats.skipped.length) console.log('Non-numeric cells left empty (links/text):\n  ' + stats.skipped.join('\n  '));
