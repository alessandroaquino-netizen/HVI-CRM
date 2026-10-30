import { calcDropRisk, MANUFACTURER_BLACKOUTS, MANUFACTURERS } from '../dtc_constants.js';
import { formatDate } from '../utils.js';
import { getMyAccess } from '../access.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toLocaleString();
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const CLOSED = ['Closed Won', 'Closed Lost', 'Not Qualified'];

function outstanding(f) {
  let sum = 0;
  if (f.deposit_amount && !f.deposit_paid_date) sum += f.deposit_amount;
  if (f.final_amount && !f.final_paid_date && !f.paid_in_full) sum += f.final_amount;
  if (f.photographer_fee && !f.photographer_paid_date) sum += f.photographer_fee;
  if (f.additional_payment_amount && !f.additional_payment_date) sum += f.additional_payment_amount;
  return sum;
}

// ctx: { leads, necaLeads, products, financials, invoices, can(viewId) }
export function renderSummary(ctx) {
  const el = document.getElementById('summaryView');
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10);
  const sections = [];
  const row = (attr, primary, secondary, right, rightColor) =>
    `<div ${attr} style="display:flex;justify-content:space-between;gap:12px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer">
      <div style="min-width:0"><div style="font-size:13px">${esc(primary)}</div>${secondary ? `<div style="font-size:11px;color:var(--text3)">${esc(secondary)}</div>` : ''}</div>
      <div style="font-size:11px;font-family:var(--mono);color:${rightColor || 'var(--text3)'};white-space:nowrap">${esc(right || '')}</div></div>`;
  const block = (title, items, { color, goView, goLabel, more } = {}) => sections.push(`
    <div class="kpi-card" style="padding:1rem 1.1rem;cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div class="kpi-label" style="margin:0">${esc(title)}</div>
        <span style="font-family:var(--mono);font-size:13px;color:${items.length ? (color || 'var(--accent)') : 'var(--green)'}">${items.length}${more ? '+' : ''}</span></div>
      ${items.length ? items.slice(0, 6).join('') : '<div style="font-size:12px;color:var(--green);padding:6px 0">Nothing needs attention here.</div>'}
      ${items.length > 6 ? `<div style="font-size:11px;color:var(--text3);padding-top:6px">+ ${items.length - 6} more</div>` : ''}
      ${goView && ctx.can(goView) ? `<button class="btn btn-sm btn-ghost" data-go-view="${goView}" style="margin-top:8px">${esc(goLabel || 'Open')} →</button>` : ''}
    </div>`);

  // ── Sales ────────────────────────────────────────────────────────────────
  if (ctx.can('followups')) {
    const due = ctx.leads.filter(l => l.followupDate && l.followupDate <= today && !CLOSED.includes(l.stage)).sort((a, b) => a.followupDate.localeCompare(b.followupDate));
    block('Follow-ups due or overdue', due.map(l => row(`data-open-lead="${l.id}"`, `${l.contact || l.company}${l.contact ? ' · ' + l.company : ''}`, l.followupNote || l.stage,
      l.followupDate < today ? 'overdue ' + formatDate(l.followupDate) : 'today', l.followupDate < today ? 'var(--red)' : 'var(--accent)')), { color: 'var(--red)', goView: 'followups', goLabel: 'Open follow-ups' });
  }

  // ── Potential leads ──────────────────────────────────────────────────────
  if (ctx.can('necaLeads')) {
    const review = ctx.necaLeads.filter(n => !n.linked_lead_id && n.suggested_lead_id);
    block('Possible pipeline matches to confirm', review.map(n => row(`data-open-neca-lead="${n.id}"`, n.company, n.suggested_reason, 'review')), { goView: 'necaLeads', goLabel: 'Open potential leads' });
    const hot = ctx.necaLeads.filter(n => n.tier === 'A' && n.outreach_status === 'not_contacted' && !n.linked_lead_id)
      .sort((a, b) => ((b.qualification_status === 'researched') - (a.qualification_status === 'researched')) || ((b.score ?? 0) - (a.score ?? 0)));
    block('Tier A potential leads not yet contacted', hot.map(n => row(`data-open-neca-lead="${n.id}"`, n.company, [n.top_executive_name, [n.city, n.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
      `${n.score ?? '—'}${n.qualification_status === 'researched' ? ' ✓' : ''}`, 'var(--green)')), { color: 'var(--green)', goView: 'necaLeads', goLabel: 'Open potential leads' });
  }

  // ── DTC ──────────────────────────────────────────────────────────────────
  if (ctx.can('dtcProducts')) {
    const risky = ctx.products.map(p => ({ p, r: calcDropRisk(p) })).filter(x => x.r === 'overdue' || x.r === 'at-risk').sort((a, b) => (a.p.drop_date || '').localeCompare(b.p.drop_date || ''));
    block('Products overdue or at risk', risky.map(({ p, r }) => row(`data-open-dtc="${p.id}"`, p.name, `${p.phase}${p.drop_date ? ' · drop ' + formatDate(p.drop_date) : ''}`, r, r === 'overdue' ? 'var(--red)' : 'var(--accent)')), { color: 'var(--red)', goView: 'dtcProducts', goLabel: 'Open DTC products' });

    const warnings = [];
    for (const b of MANUFACTURER_BLACKOUTS) {
      if (b.end >= today && b.start <= addDays(today, 120)) {
        const mfr = MANUFACTURERS.find(m => m.id === b.manufacturer)?.label || b.manufacturer;
        warnings.push(row('', `${b.label} · ${mfr}`, b.note, b.start === b.end ? formatDate(b.start) : `${formatDate(b.start)} – ${formatDate(b.end)}`, b.start <= today ? 'var(--red)' : 'var(--accent)'));
      }
    }
    block('Manufacturer closures and cutoffs (next 120 days)', warnings, { goView: 'dtcCalendar', goLabel: 'Open DTC calendar' });
  }
  if (ctx.can('dtcFinancials')) {
    const soon = ctx.financials.filter(f => outstanding(f) > 0 && f.expected_next_payment_date && f.expected_next_payment_date <= addDays(today, 7)).sort((a, b) => a.expected_next_payment_date.localeCompare(b.expected_next_payment_date));
    block('Payments due within 7 days or overdue', soon.map(f => row(`data-go-view="dtcFinancials"`, f.product_name || 'Product', f.invoice_number ? 'Invoice ' + f.invoice_number : '', `${money(outstanding(f))} · ${formatDate(f.expected_next_payment_date)}`,
      f.expected_next_payment_date < today ? 'var(--red)' : 'var(--accent)')), { color: 'var(--red)', goView: 'dtcFinancials', goLabel: 'Open DTC financials' });
    const unsched = ctx.financials.filter(f => outstanding(f) > 0 && !f.expected_next_payment_date);
    const empty = ctx.products.filter(p => ['sampling', 'production'].includes(p.phase) && !ctx.financials.some(f => f.dtc_product_id === p.id && (f.deposit_amount || f.final_amount)));
    block('Money owed with no due date', unsched.map(f => row(`data-go-view="dtcFinancials"`, f.product_name || 'Product', '', money(outstanding(f)))), { goView: 'dtcFinancials', goLabel: 'Open DTC financials' });
    block('Products in sampling or production with no amounts', empty.map(p => row(`data-go-view="dtcInvoices"`, p.name, 'Upload its invoice or enter the amounts', p.phase)), { goView: 'dtcInvoices', goLabel: 'Open invoices' });
  }
  if (ctx.can('dtcInvoices')) {
    const flagged = ctx.invoices.filter(i => i.warnings.some(w => w.level === 'error' || w.level === 'warn'));
    block('Invoices with warnings', flagged.map(i => row(`data-go-view="dtcInvoices"`, `${i.doc_type === 'proforma' ? 'Pro-forma' : 'Invoice'} ${i.invoice_number}`, i.warnings.find(w => w.level === 'error' || w.level === 'warn')?.msg, '')), { goView: 'dtcInvoices', goLabel: 'Open invoices' });
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const me = getMyAccess();
  const first = (me?.full_name || (me?.email || '').split('@')[0] || '').split(/[\s._]+/)[0];
  const stat = (n, label) => `<div class="hero-stat"><b>${n}</b><span>${label}</span></div>`;
  const dueN = ctx.leads.filter(l => l.followupDate && l.followupDate <= today && !CLOSED.includes(l.stage)).length;
  const hotN = ctx.can('necaLeads') ? ctx.necaLeads.filter(n => n.tier === 'A' && n.outreach_status === 'not_contacted' && !n.linked_lead_id).length : 0;
  const payN = ctx.can('dtcFinancials') ? ctx.financials.filter(f => outstanding(f) > 0 && f.expected_next_payment_date && f.expected_next_payment_date <= addDays(today, 7)).length : 0;
  const riskN = ctx.can('dtcProducts') ? ctx.products.filter(p => ['overdue', 'at-risk'].includes(calcDropRisk(p))).length : 0;
  el.innerHTML = `
    <div class="hero"><div class="hero-inner">
      <div><h2>${greeting}${first ? `, <em>${first.charAt(0).toUpperCase() + first.slice(1)}</em>` : ''}</h2>
        <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · here is what needs attention today.</p></div>
      <div class="hero-stats">${ctx.can('followups') ? stat(dueN, 'Follow-ups due') : ''}${ctx.can('necaLeads') ? stat(hotN, 'Tier A to contact') : ''}${ctx.can('dtcFinancials') ? stat(payN, 'Payments due') : ''}${ctx.can('dtcProducts') ? stat(riskN, 'Products at risk') : ''}</div>
    </div></div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:1rem">Click any item to open it.</div>
    ${sections.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px">${sections.join('')}</div>` : '<div style="color:var(--text3)">No sections are available for your access.</div>'}`;
}
