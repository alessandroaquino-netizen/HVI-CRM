// Development-only demo data (loaded with ?mock=1 on the dev server; never part of the production build).
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const pick = a => a[Math.floor(rnd() * a.length)];
const uid = p => p + Math.random().toString(36).slice(2, 9);

const COMPANIES = ['Sturgeon Electric', 'Hooper Corporation', 'Rosendin Electric', 'Michels Power', 'ArchKey Solutions', 'Cache Valley Electric', 'Service Electric', 'IBEW Local 47', 'Ward Electric', 'New River Electrical',
  'Miller Electric', 'E-J Electric', 'Black & McDonald', 'Aldridge Electric', 'Hunt Electric', 'Northline Utilities', 'Wilson Construction', 'Dynalectric', 'Cupertino Electric', 'Redwood Electric Group',
  'Mass Electric', 'INTREN', 'MJ Electric', 'PAR Electrical', 'Riggs Distler', 'Contra Costa Electric'];
const PEOPLE = ['Steve Lindley', 'Maria Gomez', 'Jake Turner', 'Priya Shah', 'Dan Whitaker', 'Laura Chen', 'Tom Reyes', 'Alicia Brown', 'Mark Ward', 'Ike Poe', 'Sherina Edwards', 'Greg Fowler'];
const STAGES = ['Prospect', 'Contacted', 'Discovery Call', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'Not Qualified'];

export function mockLeads() {
  return COMPANIES.slice(0, 24).map((company, i) => {
    const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(rnd() * STAGES.length))];
    const open = !['Closed Won', 'Closed Lost', 'Not Qualified'].includes(stage);
    return { id: 'lead' + i, company, contact: pick(PEOPLE), title: pick(['Marketing Director', 'VP Operations', 'Safety Manager', 'Procurement', 'CEO']), phone: '555-010' + (10 + i), email: `contact${i}@example.com`,
      segment: pick(['High voltage contractor', 'Utility company', 'Union local', 'Other']), stage, disc: pick(['D', 'I', 'S', 'C', '']), est: String(Math.round((5 + rnd() * 90) * 1000)), units: String(Math.round(50 + rnd() * 400)),
      proposalDate: day(-Math.round(rnd() * 30)), followupDate: open && rnd() > 0.35 ? day(Math.round(rnd() * 12) - 5) : '', followupNote: open ? pick(['Send mockups', 'Call about deposit', 'Check sample feedback', 'Intro email reply']) : '',
      lastActivity: day(-Math.round(rnd() * 20)), notes: 'Interested in custom button-ups for crews.', collected: stage === 'Closed Won' ? String(Math.round(rnd() * 20000)) : '', stage_changed_at: day(-Math.round(rnd() * 25)),
      created_at: day(-Math.round(30 + rnd() * 80)), cadenceTotal: '', necaLeadId: i % 7 === 0 ? 'neca' + i : null, source: pick(['NECA', 'Referral', 'IBEW / Union', 'Conference / event', 'Inbound / website']) };
  });
}

export function mockProjects(leads) {
  return leads.filter(l => l.stage === 'Closed Won').slice(0, 5).map((l, i) => ({ id: 'proj' + i, lead_id: l.id, company: l.company, contact: l.contact, stage: [2, 4, 7, 9, 12][i % 5], est_value: Number(l.est) || 25000,
    collected: Math.round((Number(l.est) || 25000) * 0.3), deposit_20_paid: true, payment_50_paid: i > 1, final_paid: false, notes: '', stage_changed_at: day(-Math.round(rnd() * 25)), last_activity: day(-3), created_at: day(-60) }));
}

const P = (name, type, category, phase, mfr, drop, extra = {}) => ({ id: uid('dtc'), name, product_type: type, category, phase, manufacturer: mfr, drop_date: drop, priority: pick(['', 'low', 'medium', 'high']), figma_link: '', tech_pack_link: '',
  deposit_50_paid: false, final_50_paid: false, est_cost: null, units: null, notes: '', phase_changed_at: day(-12), last_activity: day(-2), manufacturer_order_date: '', photographer_samples_sent: false, photographer_photos_approved: false,
  units_ordered: null, units_received: null, premarketing_started_at: '', created_at: day(-40), order_ref: '', ...extra });

export function mockDtcProducts() {
  return [
    P('Kids Pajamas (collab)', 'other', 'new-design', 'shipping', 'other', day(-8), { units_ordered: 200, quoted_production_weeks: 4, production_started_on: day(-70), production_finished_on: day(-6), carrier: 'ups', tracking_number: '1Z999AA10123456784', shipped_date: day(-6), estimated_delivery_date: day(5) }),
    P('Strictly Wild Knife (drop-ship)', 'other', 'new-design', 'warehouse', 'other', day(21), { fulfillment: 'dropship' }),
    P('Flannel - Black/Yellow OG', 'flannel', 'new-design', 'warehouse', 'bing-bing', day(-40), { units_ordered: 317, est_cost: 5122 }),
    P('Flannel - Red', 'flannel', 'new-design', 'production', 'bing-bing', day(24), { units_ordered: 315, est_cost: 4782 }),
    P('Flannel - Olive', 'flannel', 'new-design', 'production', 'bing-bing', day(24), { units_ordered: 315, est_cost: 4782 }),
    P('Flannel - Blue/Grey', 'flannel', 'new-design', 'production', 'bing-bing', day(38), { units_ordered: 325, est_cost: 3766 }),
    P('Arc Button Up - Blue', 'button-up', 'new-design', 'shipping', 'bing-bing', day(12), { units_ordered: 310, est_cost: 4396, priority: 'high', carrier: 'fedex', tracking_number: '771234567890', shipped_date: day(-5), estimated_delivery_date: day(4) }),
    P('Arc Button Up - Pink', 'button-up', 'new-design', 'production', 'bing-bing', day(-9), { units_ordered: 325, est_cost: 4546 }),
    P('White Bucket Truck Polo (Reorder)', 'polo', 'restock', 'shipping', 'bing-bing', day(9), { units_ordered: 323, est_cost: 3512, carrier: 'dhl', tracking_number: '4455667788', shipped_date: day(-14), estimated_delivery_date: day(-2) }),
    P('Black Performance Hoodie 2.0', 'hoodie', 'new-design', 'sampling', 'bing-bing', day(70), { units_ordered: 165, est_cost: 2709 }),
    P('Camo Style Polo', 'polo', 'new-design', 'design', 'bing-bing', day(120)),
    P('Foreman - Olive Button Up', 'button-up', 'new-design', 'production', 'bing-bing', day(30)),
    P('Foreman - Navy Blue Button Up', 'button-up', 'new-design', 'production', 'bing-bing', day(30)),
    P('Foreman Black Long Sleeve', 'long-sleeve-button-up', 'new-design', 'tech-pack', 'bing-bing', ''),
    P('Subtle Hawaiian Button Up', 'button-up', 'new-design', 'warehouse', 'bing-bing', day(-60)),
    P('Black Overtime Polo', 'polo', 'new-design', 'warehouse', 'bing-bing', day(-45)),
    P('Blackout Islander Button Up', 'button-up', 'new-design', 'production', 'bing-bing', day(60), { premarketing_started_at: day(-3) }),
    P('Neon Islander Button Up', 'button-up', 'new-design', 'production', 'bing-bing', day(60)),
    P('Skeleton Crew Tee', 'tee', 'restock', 'idea', 'print-theory', day(150)),
    P('Black Bolt Trucker', 'hat-embroidered', 'restock', 'sampling', 'print-theory', day(95)),
  ];
}

export function mockDtcFinancials(products) {
  return products.filter(p => p.est_cost).map((p, i) => {
    const dep = Math.round(p.est_cost / 2), paid = i % 3 !== 2;
    return { id: uid('fin'), dtc_product_id: p.id, product_name: p.name, manufacturer: p.manufacturer, order_number: 'HVI26' + (14 + i), invoice_number: 'HVI26' + (14 + i), deposit_amount: dep, deposit_paid_date: paid ? day(-30 - i) : '',
      final_amount: p.est_cost - dep, final_paid_date: p.phase === 'warehouse' ? day(-35) : '', notes: '', paid_in_full: false, full_payment_date: '', expected_next_payment_date: p.phase === 'warehouse' ? '' : day(Math.round(rnd() * 40) - 4),
      photographer_fee: null, photographer_paid_date: '', additional_payment_amount: null, additional_payment_note: '', additional_payment_date: '', created_at: day(-40) };
  });
}

export function mockInvoices(products) {
  const p = n => products.find(x => x.name === n)?.id;
  const line = (i, d, t, q, u, a, pid) => ({ id: uid('il'), position: i, description: d, line_type: t, quantity: q, unit_price: u, amount: a, packed_quantity: q, dtc_product_id: pid, allocation: 'dtc', split_of: null, note: '' });
  return [
    { id: 'inv1', manufacturer: 'bing-bing', invoice_number: 'HVI2626', doc_type: 'proforma', invoice_date: day(-55), total_amount: 4396, deposit_paid: null, balance_due: null, refs: ['HVI2626'], deposits: [], warnings: [], extraction_method: 'rules', file_path: null,
      lines: [line(0, 'New Arc Button Up Shirt', 'product', 310, 10, 3100, p('Arc Button Up - Blue')), line(1, 'photography', 'photography', 1, 45, 45, p('Arc Button Up - Blue')), line(2, 'Fedex Fee', 'shipping', null, null, 1251, p('Arc Button Up - Blue'))] },
    { id: 'inv2', manufacturer: 'bing-bing', invoice_number: 'HVI2621.25.26.27', doc_type: 'final', invoice_date: day(-29), total_amount: 22018.8, deposit_paid: 9805.3, balance_due: 12203.5, refs: ['HVI2621', 'HVI2625'], deposits: [], warnings: [{ level: 'warn', msg: 'White Bucket Truck shipped 323 pcs vs 310 on the pro-forma.' }], extraction_method: 'history', file_path: 'x',
      lines: [line(0, 'Olive Flannel', 'product', 315, 11.45, 3606.75, p('Flannel - Olive')), line(1, 'Red Flannel', 'product', 315, 11.45, 3606.75, p('Flannel - Red'))] },
  ];
}

export function mockNeca(leads) {
  const tiers = ['A', 'A', 'B', 'B', 'B', 'C', 'C', 'C', 'C', 'C'];
  return Array.from({ length: 64 }, (_, i) => {
    const tier = pick(tiers), score = tier === 'A' ? 76 + Math.round(rnd() * 22) : tier === 'B' ? 50 + Math.round(rnd() * 24) : 20 + Math.round(rnd() * 28);
    const researched = i % 9 === 0;
    return { id: 'neca' + i, neca_member_id: '', company: (COMPANIES[i % COMPANIES.length] + (i >= COMPANIES.length ? ' ' + (['West', 'East', 'South', 'Inc'][i % 4]) : '')), address: '1 Main St', city: pick(['San Jose', 'Portland', 'Chicago', 'Atlanta', 'Denver', 'Madison']), state: pick(['CA', 'OR', 'IL', 'GA', 'CO', 'WI']),
      zip: '', website: 'www.example.com', chapter: 'Santa Clara Valley Chapter NECA', division: '', qualification_status: researched ? 'researched' : 'preliminary', tier, score, score_rationale: 'Preliminary score from directory data.', buying_signals: researched ? 'Recent expansion and a 110-year milestone.' : '',
      suggested_angle: researched ? 'Saw your 110-year milestone. We make fully custom button-ups for electrical contractors.' : '', instagram: '', employee_estimate: '', contacts: researched ? [{ role: 'buyer', name: pick(PEOPLE), title: 'Marketing Director' }] : [],
      outreach_status: pick(['not_contacted', 'not_contacted', 'not_contacted', 'contacted', 'replied']), last_contacted_at: '', notes: '', source: i % 11 === 0 ? 'IBEW / Union' : 'NECA', memberships_count: 1 + (i % 6 === 0 ? 8 : 0), locations: '', chapters: '',
      score_breakdown: [{ key: 'fit', label: 'Strong electrical / high-voltage fit', max: 20, earned: 14, status: 'verified', note: 'NECA line chapter.' }, { key: 'employees', label: '100+ employees', max: 15, earned: 15, status: 'estimated', note: 'Many listings.' }, { key: 'events', label: 'Attends conferences / events', max: 10, earned: 0, status: 'unverified', note: 'Not yet researched.' }],
      factors_evaluated: 2 + (i % 5), employee_band: pick(['', '101-500', '501-1000', '1000+']), top_executive_name: researched ? pick(PEOPLE) : '', top_executive_title: researched ? 'CEO' : '', research_sources: '', linked_lead_id: i % 13 === 0 ? leads[0]?.id : null,
      suggested_lead_id: i % 17 === 1 ? leads[1]?.id : null, suggested_reason: 'Similar name to pipeline lead' };
  });
}

// ── Inventory and marketing drops (demo) ─────────────────────────────────
export function mockInventory(products) {
  const out = [];
  const add = (p, label, o, a, r, rej, sell, shelf, res) => out.push({ id: uid('inv'), dtc_product_id: p.id, option_label: label, sku: `${p.name.slice(0, 3).toUpperCase()}-${label}`, qty_ordered: o, qty_shipped: a, qty_received: r, qty_rejected: rej, qty_sellable: sell, qty_shelved: shelf, qty_reserve: res, notes: '', updated_at: new Date().toISOString(), updated_by: 'demo' });
  products.filter(p => ['warehouse', 'shipping'].includes(p.phase)).forEach((p, i) => {
    ['S', 'M', 'L', 'XL'].forEach((sz, j) => {
      if (p.phase === 'shipping') add(p, sz, 80 + j * 10, 80 + j * 10 - (j === 1 ? 4 : 0), null, null, null, null, null);
      else if (i % 2 === 0) add(p, sz, 80 + j * 10, 80 + j * 10, 80 + j * 10 - (j === 2 ? 3 : 0), j === 1 ? 2 : 0, 80 + j * 10 - (j === 2 ? 3 : 0) - (j === 1 ? 2 : 0), 40, 40 + j * 10 - (j === 2 ? 3 : 0) - (j === 1 ? 2 : 0));
      else add(p, sz, 80 + j * 10, null, 80 + j * 10, null, null, null, null);
    });
  });
  return out;
}

export async function mockDropflow(products) {
  const [{ parseTemplates }, E, sqlMod] = await Promise.all([import('../dropflow/seed.js'), import('../dropflow/engine.js'), import('../../migration_dropflow.sql?raw')]);
  const templates = parseTemplates(sqlMod.default);
  const roles = [['tony', 'Tony'], ['adriana', 'Adriana'], ['kuerstine', 'Kuerstine'], ['ryanne', 'Ryanne'], ['aira', 'Aira'], ['paul', 'Paul (photographer)'], ['warehouse', 'Warehouse']].map(([role, display_name], i) => ({ role, display_name, email: role === 'adriana' ? 'demo@highvoltageindustries.com' : null, is_external: role === 'paul', sort: i }));
  const fridays = [E.nextFriday(day(0)), E.nextFriday(day(8)), E.nextFriday(day(15))];
  const picks = products.filter(p => ['production', 'shipping', 'sampling'].includes(p.phase)).slice(0, 3);
  const drops = []; const tasks = []; const events = [];
  picks.forEach((p, i) => {
    const d = { id: uid('drop'), dtc_product_id: p.id, drop_type: i === 2 ? 'restock' : 'new_product', launch_date: fridays[i], vault_date: E.addDays(fridays[i], -2), inventory_eta: null, stock_mode: i === 1 ? 'preorder' : 'in_stock', phase: ['assets', 'creative', 'brief'][i],
      ai_photo_in_use: i === 1, link_product_info: i === 0 ? 'https://docs.google.com/spreadsheets' : null, link_walkthrough: i === 0 ? 'https://drive.google.com' : null, link_shot_list: null, link_photos: null, link_shopify_official: null, link_shopify_placeholder: null, link_sop: null, link_campaign: null, notes: null, created_at: new Date().toISOString() };
    drops.push(d);
    E.generateTasks(d, templates).forEach((t, k) => {
      const early = ['walkthrough', 'walkthrough_link', 'tech_details', 'copy_core', 'pricing', 'info_sheet', 'sku_cost', 'shot_list'];
      const done = i === 0 ? k < 14 : i === 1 ? k < 22 : k < 4;
      tasks.push({ ...t, id: uid('task'), drop_id: d.id, status: t.status === 'na' ? 'na' : (done && early.concat(templates.slice(8, 30).map(x => x.key)).includes(t.template_key) ? 'complete' : (k % 11 === 0 ? 'in_progress' : 'not_started')),
        workaround: i === 1 && t.template_key === 'photo_intake' ? 'Approved temporary AI photography' : null, prev_due_date: null, due_changed_at: null, due_locked: false, is_replacement: false, completed_at: null, completed_by: null, created_at: new Date().toISOString() });
    });
    events.push({ id: uid('ev'), drop_id: d.id, kind: 'created', message: `Drop created for ${p.name}: launch ${d.launch_date}.`, roles: [], created_by: 'demo@highvoltageindustries.com', created_at: new Date().toISOString() });
  });
  if (drops[1]) events.push({ id: uid('ev'), drop_id: drops[1].id, kind: 'preorder', message: `${picks[1].name}: converted to pre-order. Update Shopify, email, banners, social and paid messaging.`, roles: ['kuerstine', 'aira', 'ryanne'], created_by: 'demo@highvoltageindustries.com', created_at: new Date().toISOString() });
  return { loaded: true, error: '', drops, tasks, templates, roles, events };
}

export async function mockKpis() {
  const seed = (await import('./kpiSeed.json')).default; const Q = '2026-Q4'; const now = new Date().toISOString();
  const kpis = seed.kpis.map(k => ({ ...k, id: 'kpi-' + k.key, seed_key: k.key, active: true, created_at: now }));
  const values = seed.values.map(v => ({ id: `kv-${v.key}-${v.d}`, kpi_id: 'kpi-' + v.key, period_start: v.d, value: v.value, qtd_value: v.qtd, note: null, updated_by: 'demo', updated_at: now }));
  const rocks = seed.rocks.map(r => ({ id: r.key, seed_key: r.key, quarter: Q, owner_name: r.owner_name, position: r.position, title: r.title, tactics: r.tactics, status: 'not_started', created_at: now, updated_at: now }));
  const rockKpis = seed.rocks.flatMap(r => r.kpis.map(k => ({ rock_id: r.key, kpi_id: 'kpi-' + k })));
  return { kpis, values, rocks, rockKpis };
}
