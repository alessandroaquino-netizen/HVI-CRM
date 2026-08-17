import { PROJECT_STAGES, PHASES, daysAtStage, stageStatus } from '../controllers/projects.js';

// ─── helpers ──────────────────────────────────────────────────────────────

function typeIcon(type) {
  if (type === 'milestone') return '<span title="Milestone" style="color:var(--yellow)">🏆</span>';
  if (type === 'payment')   return '<span title="Payment" style="color:var(--green)">💰</span>';
  return '';
}

function statusBorder(status) {
  if (status === 'overdue')  return 'border-color:rgba(224,85,85,.6)';
  if (status === 'at-risk')  return 'border-color:rgba(240,192,64,.5)';
  return '';
}

function daysBadge(project, stage) {
  if (!stage.sla) return '';
  const days = daysAtStage(project);
  const status = stageStatus(project);
  const color = status === 'overdue' ? 'var(--red)' : status === 'at-risk' ? 'var(--accent)' : 'var(--text3)';
  return `<span style="font-size:9px;font-family:var(--mono);color:${color}">${days}d</span>`;
}

function paymentBadges(project) {
  const badges = [];
  if (project.stage >= 2)  badges.push(`<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${project.deposit_20_paid ? 'rgba(76,175,125,.2)' : 'rgba(224,85,85,.15)'};color:${project.deposit_20_paid ? 'var(--green)' : 'var(--red)'}">20%</span>`);
  if (project.stage >= 6)  badges.push(`<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${project.payment_50_paid ? 'rgba(76,175,125,.2)' : 'rgba(224,85,85,.15)'};color:${project.payment_50_paid ? 'var(--green)' : 'var(--red)'}">50%</span>`);
  if (project.stage >= 11) badges.push(`<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${project.final_paid ? 'rgba(76,175,125,.2)' : 'rgba(224,85,85,.15)'};color:${project.final_paid ? 'var(--green)' : 'var(--red)'}">Final</span>`);
  return badges.join(' ');
}

function projectCard(project) {
  const stage   = PROJECT_STAGES.find(s => s.n === project.stage);
  const status  = stageStatus(project);
  const val     = project.est_value ? `$${Number(project.est_value).toLocaleString()}` : '';
  const coll    = project.collected ? `$${Number(project.collected).toLocaleString()} collected` : '';

  return `<div class="proj-card" data-open-project="${project.id}" style="${statusBorder(status)}">
    <div class="proj-card-company">${project.company}</div>
    <div class="proj-card-contact">${project.contact || '—'}</div>
    <div class="proj-card-meta">
      ${val ? `<span class="est-tag">${val}</span>` : ''}
      ${typeIcon(stage?.type)}
      ${daysBadge(project, stage || {})}
    </div>
    ${paymentBadges(project) ? `<div class="proj-card-payments" style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">${paymentBadges(project)}</div>` : ''}
  </div>`;
}

// ─── main render ──────────────────────────────────────────────────────────

export function renderProjects(projects) {
  const container = document.getElementById('projectsView');
  if (!container) return;

  // Summary bar
  const active   = projects.filter(p => p.stage < 14);
  const overdue  = projects.filter(p => stageStatus(p) === 'overdue');
  const atRisk   = projects.filter(p => stageStatus(p) === 'at-risk');
  const totalEst = projects.reduce((a, p) => a + (p.est_value || 0), 0);
  const totalCol = projects.reduce((a, p) => a + (p.collected || 0), 0);

  let html = `
    <div class="proj-summary">
      <div class="kpi-card" style="padding:.9rem 1.1rem">
        <div class="kpi-label">Active projects</div>
        <div class="kpi-val" style="font-size:22px">${active.length}</div>
      </div>
      <div class="kpi-card" style="padding:.9rem 1.1rem">
        <div class="kpi-label">Total est. value</div>
        <div class="kpi-val" style="font-size:22px">$${totalEst.toLocaleString()}</div>
      </div>
      <div class="kpi-card" style="padding:.9rem 1.1rem">
        <div class="kpi-label">Total collected</div>
        <div class="kpi-val" style="font-size:22px;color:var(--green)">$${totalCol.toLocaleString()}</div>
      </div>
      <div class="kpi-card" style="padding:.9rem 1.1rem;${overdue.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
        <div class="kpi-label">Overdue stages</div>
        <div class="kpi-val" style="font-size:22px;color:${overdue.length ? 'var(--red)' : 'var(--text3)'}">${overdue.length}</div>
      </div>
      <div class="kpi-card" style="padding:.9rem 1.1rem;${atRisk.length ? 'border-color:rgba(240,192,64,.4)' : ''}">
        <div class="kpi-label">At risk</div>
        <div class="kpi-val" style="font-size:22px;color:${atRisk.length ? 'var(--accent)' : 'var(--text3)'}">${atRisk.length}</div>
      </div>
    </div>`;

  // Kanban grouped by phase
  html += '<div class="proj-board">';
  PHASES.forEach(phase => {
    const phaseStages = PROJECT_STAGES.filter(s => s.phase === phase.n);
    html += `
      <div class="proj-phase">
        <div class="proj-phase-header" style="border-color:#${phase.color};color:#${phase.color}">
          ${phase.label}
        </div>
        <div class="proj-phase-cols">
          ${phaseStages.map(stage => {
            const stageProjects = projects.filter(p => p.stage === stage.n);
            return `
              <div class="proj-stage-col">
                <div class="proj-stage-header">
                  ${typeIcon(stage.type)}
                  <span>${stage.n}. ${stage.label}</span>
                  <span class="stage-count">${stageProjects.length || ''}</span>
                  ${stage.sla ? `<span style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-left:auto">SLA ${stage.sla}d</span>` : ''}
                </div>
                <div class="proj-cards">
                  ${stageProjects.length
                    ? stageProjects.map(projectCard).join('')
                    : '<div class="empty-col">—</div>'}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  });
  html += '</div>';

  container.innerHTML = html;
}

// ─── Project detail modal ─────────────────────────────────────────────────

export function renderProjectDetail(project, leads, { onEdit, onDelete, onStageChange }) {
  const stage = PROJECT_STAGES.find(s => s.n === project.stage);
  const status = stageStatus(project);
  const days = daysAtStage(project);
  const statusColor = status === 'overdue' ? 'var(--red)' : status === 'at-risk' ? 'var(--accent)' : 'var(--green)';

  const stagePills = PROJECT_STAGES.map(s =>
    `<button class="stage-pill${project.stage === s.n ? ' active' : ''}" data-proj-stage="${s.n}" style="font-size:10px;padding:4px 8px">
      ${s.n}. ${s.label} ${typeIcon(s.type)}
    </button>`
  ).join('');

  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <div class="modal-header">
      <h3>${project.company}</h3>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" id="pdEditBtn">Edit</button>
        <button class="btn btn-sm btn-danger" id="pdDeleteBtn">Delete</button>
        <button class="btn btn-sm btn-ghost" id="pdCloseBtn">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="detail-header">
        <div>
          <div class="detail-name">${project.company}</div>
          <div class="detail-sub">${project.contact || ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">Current stage</div>
          <div style="font-size:13px;font-weight:500;color:var(--text)">${stage?.n}. ${stage?.label}</div>
          <div style="font-size:11px;color:${statusColor};font-family:var(--mono);margin-top:2px">${days} days in this stage${stage?.sla ? ' / SLA ' + stage.sla + 'd' : ''}</div>
        </div>
      </div>

      <div class="section-divider" style="margin-top:1.2rem">Move to stage</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 1.5rem">${stagePills}</div>

      <div class="section-divider">Financials</div>
      <div class="detail-grid" style="margin-top:10px">
        <div class="detail-field"><div class="lbl">Est. value</div><div class="val">${project.est_value ? '$' + Number(project.est_value).toLocaleString() : '—'}</div></div>
        <div class="detail-field"><div class="lbl">Collected</div><div class="val" style="color:var(--green)">${project.collected ? '$' + Number(project.collected).toLocaleString() : '$0'}</div></div>
        <div class="detail-field"><div class="lbl">20% Deposit</div><div class="val" style="color:${project.deposit_20_paid ? 'var(--green)' : 'var(--red)'}">${project.deposit_20_paid ? '✓ Paid' : '✗ Pending'}</div></div>
        <div class="detail-field"><div class="lbl">50% Midpoint</div><div class="val" style="color:${project.payment_50_paid ? 'var(--green)' : 'var(--red)'}">${project.payment_50_paid ? '✓ Paid' : '✗ Pending'}</div></div>
        <div class="detail-field"><div class="lbl">Final Payment</div><div class="val" style="color:${project.final_paid ? 'var(--green)' : 'var(--red)'}">${project.final_paid ? '✓ Paid' : '✗ Pending'}</div></div>
        <div class="detail-field"><div class="lbl">Last activity</div><div class="val">${project.last_activity || '—'}</div></div>
      </div>
      ${project.notes ? `<div style="margin-top:1rem"><div class="section-divider">Notes</div><div class="notes-display" style="margin-top:8px">${project.notes}</div></div>` : ''}
    </div>`;

  overlay.classList.remove('hidden');

  document.getElementById('pdCloseBtn').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('pdEditBtn').addEventListener('click', () => onEdit(project.id));
  document.getElementById('pdDeleteBtn').addEventListener('click', () => onDelete(project.id));
  document.querySelectorAll('[data-proj-stage]').forEach(btn => {
    btn.addEventListener('click', () => onStageChange(project.id, parseInt(btn.dataset.projStage)));
  });
}

// ─── Project form modal ───────────────────────────────────────────────────

export function renderProjectForm(project = {}, editingId, leads, { onSave }) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');

  const stageOpts = PROJECT_STAGES.map(s =>
    `<option value="${s.n}" ${project.stage === s.n ? 'selected' : ''}>${s.n}. ${s.label}</option>`
  ).join('');

  const leadOpts = `<option value="">— None —</option>` +
    leads.map(l =>
      `<option value="${l.id}" ${project.lead_id === l.id ? 'selected' : ''}>${l.company}${l.contact ? ' · ' + l.contact : ''}</option>`
    ).join('');

  box.innerHTML = `
    <div class="modal-header">
      <h3>${editingId ? 'Edit project' : 'New project'}</h3>
      <button class="btn btn-sm btn-ghost" id="pfCloseBtn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-row"><label>Company</label><input id="pf_company" value="${project.company || ''}" placeholder="Acme Electric"></div>
        <div class="form-row"><label>Contact</label><input id="pf_contact" value="${project.contact || ''}" placeholder="First Last"></div>
      </div>
      <div class="form-row"><label>Linked lead (optional)</label><select id="pf_lead_id">${leadOpts}</select></div>
      <div class="form-grid">
        <div class="form-row"><label>Current stage</label><select id="pf_stage">${stageOpts}</select></div>
        <div class="form-row"><label>Est. value ($)</label><input id="pf_est_value" type="number" value="${project.est_value || ''}" placeholder="25000"></div>
        <div class="form-row"><label>Amount collected ($)</label><input id="pf_collected" type="number" value="${project.collected || ''}" placeholder="5000"></div>
        <div class="form-row"><label>Stage start date</label><input id="pf_stage_changed_at" type="date" value="${project.stage_changed_at || ''}"></div>
      </div>
      <div style="margin:1rem 0;display:flex;gap:1.5rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="pf_dep20" ${project.deposit_20_paid ? 'checked' : ''}> 20% deposit paid
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="pf_pay50" ${project.payment_50_paid ? 'checked' : ''}> 50% midpoint paid
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="pf_final" ${project.final_paid ? 'checked' : ''}> Final payment paid
        </label>
      </div>
      <div class="form-row"><label>Notes</label><textarea id="pf_notes">${project.notes || ''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="pfCancelBtn">Cancel</button>
      <button class="btn btn-accent" id="pfSaveBtn">Save project</button>
    </div>`;

  overlay.classList.remove('hidden');

  const g = id => document.getElementById(id).value.trim();
  document.getElementById('pfCloseBtn').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('pfCancelBtn').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('pfSaveBtn').addEventListener('click', () => {
    onSave({
      company:          g('pf_company'),
      contact:          g('pf_contact'),
      lead_id:          g('pf_lead_id') || null,
      stage:            parseInt(g('pf_stage')),
      est_value:        g('pf_est_value'),
      collected:        g('pf_collected'),
      deposit_20_paid:  document.getElementById('pf_dep20').checked,
      payment_50_paid:  document.getElementById('pf_pay50').checked,
      final_paid:       document.getElementById('pf_final').checked,
      stage_changed_at: g('pf_stage_changed_at'),
      notes:            g('pf_notes'),
    });
  });
}
