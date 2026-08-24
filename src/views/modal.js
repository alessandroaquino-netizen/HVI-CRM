import { STAGES, SEGMENTS, DISC } from '../constants.js';
import { followupStatus } from '../controllers/leads.js';

const overlay = () => document.getElementById('modalOverlay');
const box     = () => document.getElementById('modalBox');

export function closeModal() {
  overlay().classList.add('hidden');
}

export function openModal(html) {
  box().innerHTML = html;
  overlay().classList.remove('hidden');
}

// ---------- generic drilldown list ----------
// rows: [{ id, type: 'lead'|'project', primary, secondary, value }]
// Reuses the delegated data-open-lead / data-open-project click handler in main.js —
// clicking a row just opens the real record, no extra wiring needed here.

export function renderListDetail(title, subtitle, rows) {
  const rowHtml = r => `
    <div class="drilldown-row" ${r.type === 'project' ? `data-open-project="${r.id}"` : `data-open-lead="${r.id}"`}>
      <div>
        <div class="drilldown-primary">${r.primary || '—'}</div>
        ${r.secondary ? `<div class="drilldown-secondary">${r.secondary}</div>` : ''}
      </div>
      ${r.value ? `<div class="drilldown-value">${r.value}</div>` : ''}
    </div>`;

  openModal(`
    <div class="modal-header">
      <h3>${title}</h3>
      <button class="btn btn-sm btn-ghost" id="ldCloseBtn">✕</button>
    </div>
    <div class="modal-body">
      ${subtitle ? `<div style="font-size:12px;color:var(--text3);margin-bottom:12px">${subtitle}</div>` : ''}
      ${rows.length
        ? `<div class="drilldown-list">${rows.map(rowHtml).join('')}</div>`
        : '<div style="color:var(--text3);font-size:13px;padding:1rem 0">No records for this selection.</div>'}
    </div>`);

  document.getElementById('ldCloseBtn').addEventListener('click', closeModal);
}

// ---------- detail ----------

export function renderDetail(lead, { onEdit, onDelete, onStageChange }) {
  const disc = lead.disc ? DISC[lead.disc] : null;

  const stagePills = STAGES.map(s =>
    `<button class="stage-pill${lead.stage === s ? ' active' : ''}" data-stage="${s}">${s}</button>`
  ).join('');

  const discBlock = disc ? `
    <div style="margin-top:1.5rem">
      <div class="section-divider">DISC cheat sheet</div>
      <div class="disc-inline">
        <div class="disc-inline-header">
          <span class="disc-inline-badge" style="background:${disc.bg};color:${disc.color}">${lead.disc} — ${disc.label}</span>
        </div>
        <div class="disc-section-label">How to close</div>
        <div class="disc-body" style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:8px">${disc.close}</div>
        <div class="disc-section-label">Avoid</div>
        <div class="disc-avoid" style="font-size:13px;line-height:1.6">${disc.avoid}</div>
      </div>
    </div>` : '';

  const fuStatus = followupStatus(lead);
  const fuColor  = fuStatus === 'overdue' ? 'var(--red)' : fuStatus === 'today' ? 'var(--accent)' : 'var(--text)';

  openModal(`
    <div class="modal-header">
      <h3>${lead.contact || 'Lead'}</h3>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" id="mdEditBtn">Edit</button>
        <button class="btn btn-sm btn-danger" id="mdDeleteBtn">Delete</button>
        <button class="btn btn-sm btn-ghost" id="mdCloseBtn">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="detail-header">
        <div>
          <div class="detail-name">${lead.contact || '—'}</div>
          <div class="detail-sub">${[lead.title, lead.company].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div class="section-divider">Stage</div>
      <div class="stage-selector" style="margin-bottom:1.5rem">${stagePills}</div>
      <div class="section-divider">Details</div>
      <div class="detail-grid" style="margin-top:10px">
        <div class="detail-field"><div class="lbl">Phone</div><div class="val">${lead.phone || '—'}</div></div>
        <div class="detail-field"><div class="lbl">Email</div><div class="val" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${lead.email || '—'}</div></div>
        <div class="detail-field"><div class="lbl">Segment</div><div class="val">${lead.segment || '—'}</div></div>
        <div class="detail-field"><div class="lbl">DISC</div><div class="val">${lead.disc ? `<span class="badge badge-${lead.disc}">${lead.disc}</span>` : '—'}</div></div>
        <div class="detail-field"><div class="lbl">Est. value</div><div class="val">${lead.est ? '$' + parseFloat(lead.est).toLocaleString() : '—'}</div></div>
        <div class="detail-field"><div class="lbl">Est. units</div><div class="val">${lead.units || '—'}</div></div>
        <div class="detail-field"><div class="lbl">Last activity</div><div class="val">${lead.lastActivity || '—'}</div></div>
        <div class="detail-field"><div class="lbl">Proposal date</div><div class="val">${lead.proposalDate || '—'}</div></div>
        <div class="detail-field"><div class="lbl">Follow-up date</div><div class="val" style="color:${fuColor}">${lead.followupDate || '—'}</div></div>
        <div class="detail-field"><div class="lbl">Follow-up note</div><div class="val">${lead.followupNote || '—'}</div></div>
      </div>
      ${lead.notes ? `<div style="margin-top:1rem"><div class="section-divider">Notes</div><div class="notes-display" style="margin-top:8px">${lead.notes}</div></div>` : ''}
      ${discBlock}
    </div>`);

  // Wire up buttons
  document.getElementById('mdCloseBtn').addEventListener('click', closeModal);
  document.getElementById('mdEditBtn').addEventListener('click', () => onEdit(lead.id));
  document.getElementById('mdDeleteBtn').addEventListener('click', () => onDelete(lead.id));
  document.querySelectorAll('.stage-pill').forEach(btn => {
    btn.addEventListener('click', () => onStageChange(lead.id, btn.dataset.stage));
  });
}

// ---------- form ----------

export function renderForm(lead = {}, editingId, { onSave }) {
  const opt  = (val, cur) => `<option value="${val}"${cur === val ? ' selected' : ''}>${val}</option>`;

  openModal(`
    <div class="modal-header">
      <h3>${editingId ? 'Edit lead' : 'New lead'}</h3>
      <button class="btn btn-sm btn-ghost" id="fmCloseBtn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-row"><label>Company</label><input id="f_company" value="${lead.company || ''}" placeholder="Acme Electric"></div>
        <div class="form-row"><label>Contact name</label><input id="f_contact" value="${lead.contact || ''}" placeholder="First Last"></div>
        <div class="form-row"><label>Title</label><input id="f_title" value="${lead.title || ''}" placeholder="Operations Manager"></div>
        <div class="form-row"><label>Phone</label><input id="f_phone" value="${lead.phone || ''}" placeholder="555-000-0000"></div>
      </div>
      <div class="form-row"><label>Email</label><input id="f_email" value="${lead.email || ''}" placeholder="name@company.com"></div>
      <div class="form-grid">
        <div class="form-row"><label>Segment</label>
          <select id="f_segment"><option value="">—</option>${SEGMENTS.map(s => opt(s, lead.segment)).join('')}</select>
        </div>
        <div class="form-row"><label>Stage</label>
          <select id="f_stage">${STAGES.map(s => opt(s, lead.stage || 'Prospect')).join('')}</select>
        </div>
        <div class="form-row"><label>DISC profile</label>
          <select id="f_disc"><option value="">—</option>${['D','I','S','C'].map(d => opt(d, lead.disc)).join('')}</select>
        </div>
        <div class="form-row"><label>Est. order value ($)</label><input id="f_est" type="number" value="${lead.est || ''}" placeholder="15000"></div>
        <div class="form-row"><label>Est. units</label><input id="f_units" type="number" value="${lead.units || ''}" placeholder="300"></div>
        <div class="form-row"><label>Proposal date</label><input id="f_proposalDate" type="date" value="${lead.proposalDate || ''}"></div>
        <div class="form-row"><label>Follow-up date</label><input id="f_followupDate" type="date" value="${lead.followupDate || ''}"></div>
        <div class="form-row"><label>Follow-up note</label><input id="f_followupNote" value="${lead.followupNote || ''}" placeholder="e.g. check in on budget approval"></div>
      </div>
      <div class="form-row"><label>Notes</label><textarea id="f_notes">${lead.notes || ''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="fmCancelBtn">Cancel</button>
      <button class="btn btn-accent" id="fmSaveBtn">Save lead</button>
    </div>`);

  document.getElementById('fmCloseBtn').addEventListener('click', closeModal);
  document.getElementById('fmCancelBtn').addEventListener('click', closeModal);
  document.getElementById('fmSaveBtn').addEventListener('click', () => {
    const g = id => document.getElementById(id).value.trim();
    onSave({
      company:     g('f_company'),
      contact:     g('f_contact'),
      title:       g('f_title'),
      phone:       g('f_phone'),
      email:       g('f_email'),
      segment:     g('f_segment'),
      stage:       g('f_stage'),
      disc:        g('f_disc'),
      est:         g('f_est'),
      units:       g('f_units'),
      proposalDate: g('f_proposalDate'),
      followupDate: g('f_followupDate'),
      followupNote: g('f_followupNote'),
      notes:       g('f_notes'),
    });
  });
}
