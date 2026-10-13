
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
const CONTACT_ROLES = [
  { id: 'buyer',     label: 'Contact #1 — Likely buyer' },
  { id: 'champion',  label: 'Contact #2 — Influencer / champion' },
  { id: 'executive', label: 'Contact #3 — Executive / escalation' },
];
const TIER_STYLE = {
  A: 'background:rgba(76,175,125,.2);color:var(--green)',
  B: 'background:rgba(240,192,64,.2);color:var(--accent)',
  C: 'background:rgba(138,143,152,.2);color:var(--text3)',
};

let filters = { q: '', tier: '', state: '', outreach: '', status: '' };
let page = 0;

function matches(l) {
  if (filters.tier === 'none' ? l.tier : (filters.tier && l.tier !== filters.tier)) return false;
  if (filters.state && l.state !== filters.state) return false;
  if (filters.outreach && l.outreach_status !== filters.outreach) return false;
  if (filters.status && l.qualification_status !== filters.status) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const hay = `${l.company} ${l.city} ${l.state} ${l.chapter} ${(l.contacts || []).map(c => c.name).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const TIER_ORDER = { A: 0, B: 1, C: 2, '': 3 };
function sorted(list) {
  return [...list].sort((a, b) =>
    (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) || ((b.score ?? -1) - (a.score ?? -1)) || a.company.localeCompare(b.company));
}

export function renderNecaLeads(leads, { onOpen }) {
  const el = document.getElementById('necaLeadsView');
  if (!el) return;
  const count = t => leads.filter(l => l.tier === t).length;
  const contacted = leads.filter(l => l.outreach_status !== 'not_contacted').length;
  const states = [...new Set(leads.map(l => l.state).filter(Boolean))].sort();
  const filtered = sorted(leads.filter(matches));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page >= pages) page = pages - 1;
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const sel = (id, cur, opts, all) => `<select class="neca-filter" data-f="${id}" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:4px 8px">
    <option value="">${all}</option>${opts.map(o => `<option value="${esc(o.id)}" ${cur === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;

  const kpi = (label, val, color) => `<div class="kpi-card" style="padding:.9rem 1.1rem"><div class="kpi-label">${label}</div><div class="kpi-val" style="font-size:22px;${color ? 'color:' + color : ''}">${val}</div></div>`;

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:1rem">
      Prospect list from the NECA member directory. Kept separate from the main Leads. Scores marked <b>Preliminary</b> use directory data only — employee count, events and apparel signals still need research.
    </div>
    <div class="proj-summary" style="grid-template-columns:repeat(5,1fr);margin-bottom:1.2rem">
      ${kpi('Total companies', leads.length)}
      ${kpi('A leads', count('A'), 'var(--green)')}
      ${kpi('B leads', count('B'), 'var(--accent)')}
      ${kpi('C leads', count('C'))}
      ${kpi('Contacted', contacted, 'var(--blue)')}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
      <input id="necaSearch" placeholder="Search company, city, chapter, contact…" value="${esc(filters.q)}" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:5px 9px;min-width:260px">
      ${sel('tier', filters.tier, [{ id: 'A', label: 'Tier A' }, { id: 'B', label: 'Tier B' }, { id: 'C', label: 'Tier C' }, { id: 'none', label: 'No tier' }], 'All tiers')}
      ${sel('state', filters.state, states.map(s => ({ id: s, label: s })), 'All states')}
      ${sel('outreach', filters.outreach, NECA_OUTREACH, 'All outreach')}
      ${sel('status', filters.status, QUAL_STATUS, 'All qualification')}
      ${Object.values(filters).some(Boolean) ? '<button class="btn btn-ghost btn-sm" id="necaClear">✕ Clear</button>' : ''}
      <span style="margin-left:auto;font-size:11px;color:var(--text3)">${filtered.length} of ${leads.length}</span>
    </div>
    <table class="list-table">
      <thead><tr><th>Company</th><th>Location</th><th>Chapter</th><th>Tier</th><th>Score</th><th>Contacts</th><th>Outreach</th></tr></thead>
      <tbody>${slice.map(l => `<tr data-open-neca="${l.id}" style="cursor:pointer">
        <td><div style="font-weight:500">${esc(l.company)}</div>${l.website ? `<div style="font-size:11px;color:var(--text3)">${esc(l.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</div>` : ''}</td>
        <td style="font-size:12px;color:var(--text2)">${esc([l.city, l.state].filter(Boolean).join(', '))}</td>
        <td style="font-size:12px;color:var(--text2)">${esc(l.chapter.replace(/ Chapter NECA$/, ''))}</td>
        <td>${l.tier ? `<span class="badge" style="${TIER_STYLE[l.tier]}">${l.tier}</span>` : '<span style="color:var(--text3)">—</span>'}${l.tier && l.qualification_status === 'preliminary' ? '<span style="font-size:9px;color:var(--text3);margin-left:4px">prelim</span>' : ''}</td>
        <td style="font-family:var(--mono);font-size:12px">${l.score ?? '—'}</td>
        <td style="font-size:12px;color:var(--text2)">${(l.contacts || []).filter(c => c.name).length || '—'}</td>
        <td style="font-size:12px;color:${l.outreach_status === 'not_contacted' ? 'var(--text3)' : 'var(--blue)'}">${esc(NECA_OUTREACH.find(o => o.id === l.outreach_status)?.label || '')}</td>
      </tr>`).join('') || '<tr><td colspan="7" style="color:var(--text3)">No companies match.</td></tr>'}</tbody>
    </table>
    <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:1rem;font-size:12px;color:var(--text3)">
      <button class="btn btn-sm btn-ghost" id="necaPrev" ${page === 0 ? 'disabled' : ''}>← Prev</button>
      Page ${page + 1} of ${pages}
      <button class="btn btn-sm btn-ghost" id="necaNext" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>
    </div>`;

  const rerender = () => renderNecaLeads(leads, { onOpen });
  const search = el.querySelector('#necaSearch');
  search.addEventListener('change', () => { filters.q = search.value.trim(); page = 0; rerender(); });
  el.querySelectorAll('.neca-filter').forEach(s => s.addEventListener('change', () => { filters[s.dataset.f] = s.value; page = 0; rerender(); }));
  el.querySelector('#necaClear')?.addEventListener('click', () => { filters = { q: '', tier: '', state: '', outreach: '', status: '' }; page = 0; rerender(); });
  el.querySelector('#necaPrev').addEventListener('click', () => { page--; rerender(); });
  el.querySelector('#necaNext').addEventListener('click', () => { page++; rerender(); });
  el.querySelectorAll('[data-open-neca]').forEach(r => r.addEventListener('click', () => onOpen(r.dataset.openNeca)));
}

// ─── Detail / edit modal ──────────────────────────────────────────────────
export function renderNecaLeadDetail(l, { onSave, onDelete }) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;
  const contact = (i) => (l.contacts || [])[i] || {};
  const site = l.website && /^https?:\/\//.test(l.website) ? l.website : (l.website ? 'https://' + l.website : '');

  box.innerHTML = `
    <div class="modal-header"><h3>${esc(l.company)}</h3>
      <div style="display:flex;gap:6px"><button class="btn btn-sm btn-danger" id="necaDel">Delete</button><button class="btn btn-sm btn-ghost" id="necaClose">✕</button></div></div>
    <div class="modal-body">
      <div class="detail-grid">
        <div class="detail-field"><div class="lbl">Address</div><div class="val">${esc([l.address, l.city, l.state, l.zip].filter(Boolean).join(', ')) || '—'}</div></div>
        <div class="detail-field"><div class="lbl">NECA chapter</div><div class="val">${esc(l.chapter || '—')}${l.division ? '<br><span style="color:var(--text3);font-size:11px">' + esc(l.division) + '</span>' : ''}</div></div>
        <div class="detail-field"><div class="lbl">Website</div><div class="val">${site ? `<a href="${esc(site)}" target="_blank" rel="noopener" style="color:var(--blue)">${esc(l.website)}</a>` : '—'}</div></div>
      </div>

      <div class="section-divider" style="margin:1rem 0 .6rem">Qualification</div>
      <div class="form-grid">
        <div class="form-row"><label>Status</label><select id="nl_status">${QUAL_STATUS.map(o => opt(o.id, l.qualification_status, o.label)).join('')}</select></div>
        <div class="form-row"><label>Tier</label><select id="nl_tier"><option value="">—</option>${['A', 'B', 'C'].map(t => opt(t, l.tier, t === 'A' ? 'A (75–100)' : t === 'B' ? 'B (50–74)' : 'C (< 50)')).join('')}</select></div>
        <div class="form-row"><label>Score (0–100)</label><input id="nl_score" type="number" min="0" max="100" value="${l.score ?? ''}"></div>
        <div class="form-row"><label>Employees (estimate)</label><input id="nl_emp" value="${esc(l.employee_estimate)}" placeholder="e.g. 250–500"></div>
      </div>
      <div class="form-row"><label>Why pursue (plain English)</label><textarea id="nl_why">${esc(l.score_rationale)}</textarea></div>
      <div class="form-row"><label>Buying signals / why now</label><textarea id="nl_signals" placeholder="Conferences, recruiting, anniversaries, branded apparel…">${esc(l.buying_signals)}</textarea></div>
      <div class="form-grid">
        <div class="form-row"><label>Suggested opening angle</label><input id="nl_angle" value="${esc(l.suggested_angle)}"></div>
        <div class="form-row"><label>Instagram</label><input id="nl_ig" value="${esc(l.instagram)}" placeholder="@handle or URL"></div>
        <div class="form-row"><label>Website</label><input id="nl_web" value="${esc(l.website)}"></div>
      </div>

      <div class="section-divider" style="margin:1rem 0 .6rem">Contacts</div>
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
  box.querySelector('#necaClose').addEventListener('click', close);
  box.querySelector('#necaCancel').addEventListener('click', close);
  box.querySelector('#necaDel').addEventListener('click', () => onDelete(l.id));
  const v = id => box.querySelector('#' + id).value.trim();
  box.querySelector('#necaSave').addEventListener('click', () => {
    const contacts = CONTACT_ROLES.map((r, i) => {
      const c = { role: r.id };
      box.querySelectorAll(`[data-c="${i}"]`).forEach(inp => { c[inp.dataset.k] = inp.value.trim(); });
      return c;
    }).filter(c => c.name || c.email || c.phone || c.linkedin || c.title);
    onSave(l.id, {
      qualification_status: v('nl_status'), tier: v('nl_tier'), score: v('nl_score'),
      employee_estimate: v('nl_emp'), score_rationale: v('nl_why'), buying_signals: v('nl_signals'),
      suggested_angle: v('nl_angle'), instagram: v('nl_ig'), website: v('nl_web'),
      contacts, outreach_status: v('nl_outreach'), last_contacted_at: v('nl_last'), notes: v('nl_notes'),
    });
  });
}
