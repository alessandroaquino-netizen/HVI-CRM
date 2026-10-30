import { computeNecaScore } from '../controllers/neca.js';
import { LEAD_SOURCES } from '../constants.js';
import { donut, hbars, panel } from '../viz.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE_SIZE = 100;

export const NECA_OUTREACH = [
  { id: 'not_contacted',  label: 'Not contacted' },
  { id: 'contacted',      label: 'Contacted' },
  { id: 'replied',        label: 'Replied' },
  { id: 'meeting',        label: 'Meeting' },
  { id: 'not_interested', label: 'Not interested' },
];
const QUAL_STATUS = [
  { id: 'unqualified', label: 'Unqualified' },
  { id: 'preliminary', label: 'Preliminary (directory data only)' },
  { id: 'researched',  label: 'Researched' },
];
const BANDS = ['1-50', '51-100', '101-500', '501-1000', '1000+'];
const BIG_BANDS = ['501-1000', '1000+'];
const CONTACT_ROLES = [
  { id: 'buyer',     label: 'Contact #1 — Likely buyer' },
  { id: 'champion',  label: 'Contact #2 — Influencer / champion' },
  { id: 'executive', label: 'Contact #3 — Executive / escalation' },
];
const FACTOR_STATUS = [
  { id: 'verified',   label: 'Verified' },
  { id: 'estimated',  label: 'Estimated' },
  { id: 'unverified', label: 'Not researched' },
];
const TIER_STYLE = {
  A: 'background:rgba(76,175,125,.2);color:var(--green)',
  B: 'background:rgba(240,192,64,.2);color:var(--accent)',
  C: 'background:rgba(138,143,152,.2);color:var(--text3)',
};
const STATUS_COLOR = { verified: 'var(--green)', estimated: 'var(--accent)', unverified: 'var(--text3)' };
const isLine = l => /line (constructors|builders)/i.test(`${l.chapters} ${l.chapter}`);

const EMPTY = { q: '', tier: '', state: '', outreach: '', status: '', band: '', pipeline: '', exec: '', line: '', source: '' };
let filters = { ...EMPTY };
let page = 0;

function matches(l) {
  if (filters.tier === 'none' ? l.tier : (filters.tier && l.tier !== filters.tier)) return false;
  if (filters.state && l.state !== filters.state) return false;
  if (filters.outreach && l.outreach_status !== filters.outreach) return false;
  if (filters.status && l.qualification_status !== filters.status) return false;
  if (filters.source && l.source !== filters.source) return false;
  if (filters.band === 'big' ? !BIG_BANDS.includes(l.employee_band) : (filters.band && l.employee_band !== filters.band)) return false;
  if (filters.pipeline === 'yes' && !l.linked_lead_id) return false;
  if (filters.pipeline === 'no' && l.linked_lead_id) return false;
  if (filters.exec === 'yes' && !l.top_executive_name) return false;
  if (filters.exec === 'no' && l.top_executive_name) return false;
  if (filters.line === 'yes' && !isLine(l)) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const hay = `${l.company} ${l.city} ${l.state} ${l.chapter} ${l.top_executive_name} ${(l.contacts || []).map(c => c.name).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const TIER_ORDER = { A: 0, B: 1, C: 2, '': 3 };
function sorted(list) {
  return [...list].sort((a, b) =>
    (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) ||
    ((b.qualification_status === 'researched') - (a.qualification_status === 'researched')) ||
    ((b.score ?? -1) - (a.score ?? -1)) || a.company.localeCompare(b.company));
}

export function renderNecaLeads(leads, { onOpen, onMatch, onAdd }) {
  const el = document.getElementById('necaLeadsView');
  if (!el) return;
  const count = t => leads.filter(l => l.tier === t).length;
  const contacted = leads.filter(l => l.outreach_status !== 'not_contacted').length;
  const states = [...new Set(leads.map(l => l.state).filter(Boolean))].sort();
  const sources = [...new Set([...LEAD_SOURCES, ...leads.map(l => l.source).filter(Boolean)])];
  const filtered = sorted(leads.filter(matches));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page >= pages) page = pages - 1;
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sel = (id, cur, opts, all) => `<select class="neca-filter" data-f="${id}" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:4px 8px">
    <option value="">${all}</option>${opts.map(o => `<option value="${esc(o.id)}" ${cur === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const kpi = (label, val, color, sub) => `<div class="kpi-card" style="padding:.9rem 1.1rem"><div class="kpi-label">${label}</div><div class="kpi-val" style="font-size:22px;${color ? 'color:' + color : ''}">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  const chip = (label, set, active) => `<button class="btn btn-sm ${active ? 'btn-accent' : 'btn-ghost'}" data-segment='${esc(JSON.stringify(set))}'>${label}</button>`;
  const isSeg = set => Object.entries(set).every(([k, v]) => filters[k] === v) && Object.entries(filters).every(([k, v]) => k === 'q' || set[k] === v || !v);

  const inPipeline = leads.filter(l => l.linked_lead_id).length;
  const withExec = leads.filter(l => l.top_executive_name).length;
  const researched = leads.filter(l => l.qualification_status === 'researched').length;
  const pendingSugg = leads.filter(l => !l.linked_lead_id && l.suggested_lead_id).length;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem">
      <div style="font-size:12px;color:var(--text3);max-width:760px">
        Companies worth pursuing, from the NECA member directory and from other sources (unions, referrals, events), kept separate from the main Leads. A company is only copied to the pipeline when you click <b>Add to pipeline</b> —
        it always stays on this list. Scores marked <b>prelim</b> use directory data only; open a company to see exactly which rubric factors were scored, estimated or not yet researched.
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0"><button class="btn btn-sm btn-accent" id="necaAddBtn">＋ Add potential lead</button>
      <button class="btn btn-sm" id="necaMatchBtn" title="Tag companies that already exist in the pipeline">↔ Match with pipeline${pendingSugg ? ` (${pendingSugg} to review)` : ''}</button></div>
    </div>
    <div class="proj-summary" style="grid-template-columns:repeat(6,1fr);margin-bottom:1.2rem">
      ${kpi('Total companies', leads.length)}
      ${kpi('A leads', count('A'), 'var(--green)')}
      ${kpi('B leads', count('B'), 'var(--accent)')}
      ${kpi('Researched', researched, 'var(--blue)', 'beyond directory data')}
      ${kpi('With executive', withExec)}
      ${kpi('In pipeline', inPipeline, 'var(--purple)')}
    </div>
    <div class="grid-3" style="margin-bottom:1.25rem">
      ${panel('By tier', donut([
        { label: 'Tier A', value: count('A'), color: 'var(--viz-3)' }, { label: 'Tier B', value: count('B'), color: 'var(--viz-1)' },
        { label: 'Tier C', value: count('C'), color: 'var(--viz-8)' }, { label: 'No tier', value: leads.filter(l => !l.tier).length, color: 'var(--viz-6)' }], { center: leads.length, centerLabel: 'companies' }))}
      ${panel('By size', hbars(['1000+', '501-1000', '101-500', '51-100', '1-50'].map((b, i) => ({ label: b + ' employees', value: leads.filter(l => l.employee_band === b).length, color: `var(--viz-${i + 1})` })).concat([{ label: 'Not researched', value: leads.filter(l => !l.employee_band).length, color: 'var(--viz-8)' }])))}
      ${panel('By source and outreach', hbars([...sources.map((s, i) => ({ label: s, value: leads.filter(l => l.source === s).length, color: `var(--viz-${(i % 8) + 1})` })).filter(r => r.value), { label: 'Contacted', value: contacted, color: 'var(--viz-2)' }]))}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Segments:</span>
      ${chip('Tier A', { tier: 'A' }, isSeg({ tier: 'A' }))}
      ${chip('Large (500+)', { band: 'big' }, isSeg({ band: 'big' }))}
      ${chip('Line contractors', { line: 'yes' }, isSeg({ line: 'yes' }))}
      ${chip('Researched', { status: 'researched' }, isSeg({ status: 'researched' }))}
      ${chip('Has executive', { exec: 'yes' }, isSeg({ exec: 'yes' }))}
      ${chip('Not in pipeline', { pipeline: 'no' }, isSeg({ pipeline: 'no' }))}
      ${chip('In pipeline', { pipeline: 'yes' }, isSeg({ pipeline: 'yes' }))}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
      <input id="necaSearch" placeholder="Search company, city, chapter, executive…" value="${esc(filters.q)}" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:5px 9px;min-width:240px">
      ${sel('tier', filters.tier, [{ id: 'A', label: 'Tier A' }, { id: 'B', label: 'Tier B' }, { id: 'C', label: 'Tier C' }, { id: 'none', label: 'No tier' }], 'All tiers')}
      ${sel('band', filters.band, [{ id: 'big', label: '500+ employees' }, ...BANDS.map(b => ({ id: b, label: b + ' employees' }))], 'All sizes')}
      ${sel('state', filters.state, states.map(s => ({ id: s, label: s })), 'All states')}
      ${sel('outreach', filters.outreach, NECA_OUTREACH, 'All outreach')}
      ${sel('status', filters.status, QUAL_STATUS, 'All qualification')}
      ${sel('source', filters.source, sources.map(s => ({ id: s, label: s })), 'All sources')}
      ${Object.entries(filters).some(([, v]) => v) ? '<button class="btn btn-ghost btn-sm" id="necaClear">✕ Clear</button>' : ''}
      <span style="margin-left:auto;font-size:11px;color:var(--text3)">${filtered.length} of ${leads.length}</span>
    </div>
    <table class="list-table">
      <thead><tr><th>Company</th><th>Source</th><th>Location</th><th>Tier / score</th><th>Size</th><th>Executive</th><th>Pipeline</th><th>Outreach</th></tr></thead>
      <tbody>${slice.map(l => `<tr data-open-neca="${l.id}" style="cursor:pointer">
        <td><div style="font-weight:500">${esc(l.company)}${l.memberships_count > 1 ? ` <span style="font-size:10px;color:var(--text3);font-family:var(--mono)">×${l.memberships_count}</span>` : ''}</div>${l.website ? `<div style="font-size:11px;color:var(--text3)">${esc(l.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</div>` : ''}</td>
        <td style="font-size:11px;color:var(--text3)">${esc(l.source)}</td>
        <td style="font-size:12px;color:var(--text2)">${esc([l.city, l.state].filter(Boolean).join(', '))}</td>
        <td>${l.tier ? `<span class="badge" style="${TIER_STYLE[l.tier]}">${l.tier}</span>` : '<span style="color:var(--text3)">—</span>'}
            <span style="font-family:var(--mono);font-size:12px;margin-left:4px">${l.score ?? ''}</span>
            <span style="font-size:9px;color:var(--text3);margin-left:3px">${l.qualification_status === 'researched' ? 'researched' : l.factors_evaluated ? l.factors_evaluated + '/10 factors' : ''}</span></td>
        <td style="font-size:12px;color:var(--text2)">${esc(l.employee_band || '—')}</td>
        <td style="font-size:12px;color:var(--text2)">${l.top_executive_name ? `${esc(l.top_executive_name)}<div style="font-size:10px;color:var(--text3)">${esc(l.top_executive_title)}</div>` : '<span style="color:var(--text3)">—</span>'}</td>
        <td>${l.linked_lead_id ? '<span class="badge" style="background:rgba(155,127,232,.2);color:var(--purple)">In pipeline</span>' : (l.suggested_lead_id ? '<span style="font-size:10px;color:var(--accent)">Possible match</span>' : '<span style="color:var(--text3)">—</span>')}</td>
        <td style="font-size:12px;color:${l.outreach_status === 'not_contacted' ? 'var(--text3)' : 'var(--blue)'}">${esc(NECA_OUTREACH.find(o => o.id === l.outreach_status)?.label || '')}</td>
      </tr>`).join('') || '<tr><td colspan="8" style="color:var(--text3)">No companies match.</td></tr>'}</tbody>
    </table>
    <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:1rem;font-size:12px;color:var(--text3)">
      <button class="btn btn-sm btn-ghost" id="necaPrev" ${page === 0 ? 'disabled' : ''}>← Prev</button>
      Page ${page + 1} of ${pages}
      <button class="btn btn-sm btn-ghost" id="necaNext" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>
    </div>`;

  const rerender = () => renderNecaLeads(leads, { onOpen, onMatch, onAdd });
  const search = el.querySelector('#necaSearch');
  search.addEventListener('change', () => { filters.q = search.value.trim(); page = 0; rerender(); });
  el.querySelectorAll('.neca-filter').forEach(s => s.addEventListener('change', () => { filters[s.dataset.f] = s.value; page = 0; rerender(); }));
  el.querySelectorAll('[data-segment]').forEach(b => b.addEventListener('click', () => {
    const set = JSON.parse(b.dataset.segment);
    const active = isSeg(set);
    filters = { ...EMPTY, q: filters.q };
    if (!active) Object.assign(filters, set);
    page = 0; rerender();
  }));
  el.querySelector('#necaClear')?.addEventListener('click', () => { filters = { ...EMPTY }; page = 0; rerender(); });
  el.querySelector('#necaPrev').addEventListener('click', () => { page--; rerender(); });
  el.querySelector('#necaNext').addEventListener('click', () => { page++; rerender(); });
  el.querySelector('#necaMatchBtn').addEventListener('click', onMatch);
  el.querySelector('#necaAddBtn').addEventListener('click', onAdd);
  el.querySelectorAll('[data-open-neca]').forEach(r => r.addEventListener('click', () => onOpen(r.dataset.openNeca)));
}

// ─── Detail / edit modal ──────────────────────────────────────────────────
export function renderNecaLeadDetail(l, { linkedLead, suggestedLead, onSave, onDelete, onAddToPipeline, onOpenLead, onLink, onDismiss, onUnlink, onDraft }) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;
  const contact = i => (l.contacts || [])[i] || {};
  const site = l.website && /^https?:\/\//.test(l.website) ? l.website : (l.website ? 'https://' + l.website : '');
  const breakdown = (l.score_breakdown || []).map(f => ({ ...f }));

  const pipelinePanel = linkedLead ? `
    <div class="notes-display" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span>Linked to pipeline lead <b>${esc(linkedLead.company)}</b> · stage ${esc(linkedLead.stage)}</span>
      <span><button class="btn btn-sm" id="necaOpenLead">Open lead</button> <button class="btn btn-sm btn-ghost" id="necaUnlink">Unlink</button></span>
    </div>` : suggestedLead ? `
    <div class="notes-display" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span>Possible match in the pipeline: <b>${esc(suggestedLead.company)}</b> (${esc(suggestedLead.stage)}) — ${esc(l.suggested_reason)}</span>
      <span><button class="btn btn-sm btn-accent" id="necaConfirmLink">Link</button> <button class="btn btn-sm btn-ghost" id="necaDismiss">Not the same</button></span>
    </div>` : `
    <div style="font-size:12px;color:var(--text3)">Not in the sales pipeline. Use <b>Add to pipeline</b> when the team starts working this company directly — a copy is created and this record stays on the NECA list.</div>`;

  box.innerHTML = `
    <div class="modal-header"><h3>${esc(l.company)} <span style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-left:6px">${esc(l.source)}</span></h3>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-ghost" id="necaDraft">✉ Draft email</button>
        ${linkedLead ? '' : '<button class="btn btn-sm btn-accent" id="necaAddPipeline">＋ Add to pipeline</button>'}
        <button class="btn btn-sm btn-danger" id="necaDel">Delete</button><button class="btn btn-sm btn-ghost" id="necaClose">✕</button>
      </div></div>
    <div class="modal-body">
      <div class="detail-grid">
        <div class="detail-field"><div class="lbl">Address</div><div class="val">${esc([l.address, l.city, l.state, l.zip].filter(Boolean).join(', ')) || '—'}</div></div>
        <div class="detail-field"><div class="lbl">NECA chapter(s) · ${l.memberships_count} listing${l.memberships_count === 1 ? '' : 's'}</div><div class="val" style="font-size:12px">${esc(l.chapters || l.chapter || '—')}</div></div>
        <div class="detail-field"><div class="lbl">Website</div><div class="val">${site ? `<a href="${esc(site)}" target="_blank" rel="noopener" style="color:var(--blue)">${esc(l.website)}</a>` : '—'}</div></div>
        ${l.locations && l.memberships_count > 1 ? `<div class="detail-field" style="grid-column:span 3"><div class="lbl">Locations in the directory</div><div class="val" style="font-size:12px">${esc(l.locations)}</div></div>` : ''}
      </div>

      <div class="section-divider" style="margin:1rem 0 .6rem">Sales pipeline</div>
      ${pipelinePanel}

      <div class="section-divider" style="margin:1rem 0 .6rem">Score breakdown <span style="font-weight:400;text-transform:none;letter-spacing:0">— Tony's rubric; edit any factor to override</span></div>
      <div id="necaScoreSummary" style="font-size:13px;margin-bottom:8px"></div>
      <div id="necaFactors">
        ${breakdown.map((f, i) => `<div class="neca-factor" data-i="${i}" style="display:grid;grid-template-columns:minmax(0,1.5fr) 64px 38px 120px minmax(0,2fr);gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:12px">${esc(f.label)}</span>
          <input type="number" class="nf-earned" min="0" max="${f.max}" value="${f.earned}" style="width:100%">
          <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">/ ${f.max}</span>
          <select class="nf-status">${FACTOR_STATUS.map(s => opt(s.id, f.status, s.label)).join('')}</select>
          <input class="nf-note" value="${esc(f.note)}" style="width:100%;font-size:11px">
        </div>`).join('') || '<div style="font-size:12px;color:var(--text3)">No breakdown yet — run migration_neca_v2.sql.</div>'}
      </div>

      <div class="section-divider" style="margin:1rem 0 .6rem">Qualification</div>
      <div class="form-grid">
        <div class="form-row"><label>Source</label><select id="nl_source">${[...new Set([...LEAD_SOURCES, l.source])].filter(Boolean).map(s => opt(s, l.source, s)).join('')}</select></div>
        <div class="form-row"><label>Status</label><select id="nl_status">${QUAL_STATUS.map(o => opt(o.id, l.qualification_status, o.label)).join('')}</select></div>
        <div class="form-row"><label>Employee size</label><select id="nl_band"><option value="">—</option>${BANDS.map(b => opt(b, l.employee_band, b)).join('')}</select></div>
        <div class="form-row"><label>Employees (note)</label><input id="nl_emp" value="${esc(l.employee_estimate)}" placeholder="e.g. ~8,000 (company site)"></div>
        <div class="form-row"><label>Instagram</label><input id="nl_ig" value="${esc(l.instagram)}" placeholder="@handle or URL"></div>
      </div>
      <div class="form-row"><label>Why pursue (plain English)</label><textarea id="nl_why">${esc(l.score_rationale)}</textarea></div>
      <div class="form-row"><label>Buying signals / why now</label><textarea id="nl_signals" placeholder="Conferences, recruiting, anniversaries, branded apparel…">${esc(l.buying_signals)}</textarea></div>
      <div class="form-grid">
        <div class="form-row"><label>Suggested opening angle</label><input id="nl_angle" value="${esc(l.suggested_angle)}"></div>
        <div class="form-row"><label>Website</label><input id="nl_web" value="${esc(l.website)}"></div>
      </div>
      <div class="form-row"><label>Research sources</label><textarea id="nl_sources" style="min-height:44px" placeholder="URLs or notes on where the information came from">${esc(l.research_sources)}</textarea></div>

      <div class="section-divider" style="margin:1rem 0 .6rem">Top executive (CEO / President)</div>
      <div class="form-grid">
        <div class="form-row"><input id="nl_exec_name" placeholder="Name" value="${esc(l.top_executive_name)}"></div>
        <div class="form-row"><input id="nl_exec_title" placeholder="Title" value="${esc(l.top_executive_title)}"></div>
      </div>

      <div class="section-divider" style="margin:1rem 0 .6rem">Target contacts</div>
      ${CONTACT_ROLES.map((r, i) => `<div style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:4px">${r.label}</div>
        <div class="form-grid">
          <div class="form-row"><input data-c="${i}" data-k="name" placeholder="Name" value="${esc(contact(i).name)}"></div>
          <div class="form-row"><input data-c="${i}" data-k="title" placeholder="Title" value="${esc(contact(i).title)}"></div>
          <div class="form-row"><input data-c="${i}" data-k="email" placeholder="Email" value="${esc(contact(i).email)}"></div>
          <div class="form-row"><input data-c="${i}" data-k="phone" placeholder="Phone" value="${esc(contact(i).phone)}"></div>
          <div class="form-row"><input data-c="${i}" data-k="linkedin" placeholder="LinkedIn URL" value="${esc(contact(i).linkedin)}"></div>
          <div class="form-row"><input data-c="${i}" data-k="reason" placeholder="Why this person" value="${esc(contact(i).reason)}"></div>
        </div></div>`).join('')}

      <div class="section-divider" style="margin:1rem 0 .6rem">Outreach</div>
      <div class="form-grid">
        <div class="form-row"><label>Status</label><select id="nl_outreach">${NECA_OUTREACH.map(o => opt(o.id, l.outreach_status, o.label)).join('')}</select></div>
        <div class="form-row"><label>Last contacted</label><input id="nl_last" type="date" value="${esc(l.last_contacted_at)}"></div>
      </div>
      <div class="form-row"><label>Notes</label><textarea id="nl_notes">${esc(l.notes)}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn" id="necaCancel">Cancel</button><button class="btn btn-accent" id="necaSave">Save</button></div>`;
  overlay.classList.remove('hidden');

  const close = () => overlay.classList.add('hidden');
  const v = id => box.querySelector('#' + id).value.trim();
  const readBreakdown = () => breakdown.map((f, i) => {
    const row = box.querySelector(`.neca-factor[data-i="${i}"]`);
    return { ...f, earned: Math.min(f.max, Math.max(0, parseInt(row.querySelector('.nf-earned').value, 10) || 0)),
      status: row.querySelector('.nf-status').value, note: row.querySelector('.nf-note').value.trim() };
  });
  const refreshSummary = () => {
    const bd = readBreakdown(); const c = computeNecaScore(bd);
    const lost = bd.filter(f => f.status !== 'unverified' && f.earned < f.max);
    const pending = bd.filter(f => f.status === 'unverified');
    const pendPts = pending.reduce((a, f) => a + f.max, 0);
    box.querySelector('#necaScoreSummary').innerHTML = c.score == null
      ? '<span style="color:var(--text3)">No factor evaluated yet.</span>'
      : `<b style="font-size:15px">${c.score}/100</b> · Tier <b>${c.tier}</b> · based on ${c.evaluated} of ${bd.length} factors.
         ${lost.length ? `<div style="color:var(--text2);margin-top:4px">Points lost: ${lost.map(f => `<b>${esc(f.label)}</b> −${f.max - f.earned}`).join(' · ')}</div>` : '<div style="color:var(--green);margin-top:4px">No points lost on the evaluated factors.</div>'}
         ${pending.length ? `<div style="color:var(--text3);margin-top:2px">${pending.length} factors (${pendPts} pts of the rubric) are not researched yet and are not counted for or against this company.</div>` : ''}`;
  };
  box.querySelectorAll('#necaFactors input, #necaFactors select').forEach(e => e.addEventListener('input', refreshSummary));
  refreshSummary();

  box.querySelector('#necaClose').addEventListener('click', close);
  box.querySelector('#necaCancel').addEventListener('click', close);
  box.querySelector('#necaDel').addEventListener('click', () => onDelete(l.id));
  box.querySelector('#necaAddPipeline')?.addEventListener('click', () => onAddToPipeline(l));
  box.querySelector('#necaDraft').addEventListener('click', () => onDraft(l));
  box.querySelector('#necaOpenLead')?.addEventListener('click', () => onOpenLead(l.linked_lead_id));
  box.querySelector('#necaUnlink')?.addEventListener('click', () => onUnlink(l));
  box.querySelector('#necaConfirmLink')?.addEventListener('click', () => onLink(l));
  box.querySelector('#necaDismiss')?.addEventListener('click', () => onDismiss(l));
  box.querySelector('#necaSave').addEventListener('click', () => {
    const contacts = CONTACT_ROLES.map((r, i) => {
      const c = { role: r.id };
      box.querySelectorAll(`[data-c="${i}"]`).forEach(inp => { c[inp.dataset.k] = inp.value.trim(); });
      return c;
    }).filter(c => c.name || c.email || c.phone || c.linkedin || c.title);
    onSave(l.id, {
      source: v('nl_source'), qualification_status: v('nl_status'), score_breakdown: readBreakdown(), score: l.score, tier: l.tier,
      employee_band: v('nl_band'), employee_estimate: v('nl_emp'), score_rationale: v('nl_why'), buying_signals: v('nl_signals'),
      suggested_angle: v('nl_angle'), instagram: v('nl_ig'), website: v('nl_web'), research_sources: v('nl_sources'),
      top_executive_name: v('nl_exec_name'), top_executive_title: v('nl_exec_title'),
      contacts, outreach_status: v('nl_outreach'), last_contacted_at: v('nl_last'), notes: v('nl_notes'),
    });
  });
}

// ─── Add a potential lead by hand (any source) ────────────────────────────
export function renderAddPotentialLead({ onSave }) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <div class="modal-header"><h3>Add potential lead</h3><button class="btn btn-sm btn-ghost" id="apClose">✕</button></div>
    <div class="modal-body">
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">It joins the same list and is scored with the same rubric. Open it afterwards to rate the factors you know.</div>
      <div class="form-grid">
        <div class="form-row"><label>Company *</label><input id="ap_company"></div>
        <div class="form-row"><label>Source *</label><select id="ap_source">${LEAD_SOURCES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></div>
        <div class="form-row"><label>Website</label><input id="ap_web" placeholder="www.example.com"></div>
        <div class="form-row"><label>City</label><input id="ap_city"></div>
        <div class="form-row"><label>State</label><input id="ap_state" placeholder="CA"></div>
        <div class="form-row"><label>Contact name</label><input id="ap_cname"></div>
        <div class="form-row"><label>Contact title</label><input id="ap_ctitle"></div>
        <div class="form-row"><label>Contact email</label><input id="ap_cemail"></div>
        <div class="form-row"><label>Contact phone</label><input id="ap_cphone"></div>
      </div>
      <div class="form-row"><label>Notes</label><textarea id="ap_notes" placeholder="How you found them, what they need…"></textarea></div>
      <div class="login-error" id="apErr"></div>
    </div>
    <div class="modal-footer"><button class="btn" id="apCancel">Cancel</button><button class="btn btn-accent" id="apSave">Add lead</button></div>`;
  overlay.classList.remove('hidden');
  const v = id => box.querySelector('#' + id).value.trim();
  const close = () => overlay.classList.add('hidden');
  box.querySelector('#apClose').addEventListener('click', close);
  box.querySelector('#apCancel').addEventListener('click', close);
  box.querySelector('#apSave').addEventListener('click', async () => {
    if (!v('ap_company')) { box.querySelector('#apErr').textContent = 'Company is required.'; return; }
    await onSave({ company: v('ap_company'), source: v('ap_source'), website: v('ap_web'), city: v('ap_city'), state: v('ap_state'),
      contactName: v('ap_cname'), contactTitle: v('ap_ctitle'), contactEmail: v('ap_cemail'), contactPhone: v('ap_cphone'), notes: v('ap_notes') },
      msg => { box.querySelector('#apErr').textContent = msg; });
  });
}
