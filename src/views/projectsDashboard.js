import { PROJECT_STAGES, PHASES, stageStatus, daysAtStage } from '../controllers/projects.js';
import { avgDaysPerStage, avgCompletionDays, plannedVsActualByPhase } from '../controllers/projectTracking.js';
import { renderListDetail } from './modal.js';

function money(n) { return '$' + Math.round(n || 0).toLocaleString(); }

function kpiCard(key, label, val, sub, warn) {
  return `
    <div class="kpi-card" data-kpi="${key}" style="${warn ? 'border-color:rgba(224,85,85,.4)' : ''}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-val" style="${warn ? 'color:var(--red)' : ''}">${val}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`;
}

function projectRow(p) {
  return {
    id: p.id, type: 'project',
    primary: p.company || '—',
    secondary: p.contact || '',
    value: p.est_value ? '$' + Number(p.est_value).toLocaleString() : '',
  };
}

export function renderProjectsDashboard(projects, activity, stageDates = []) {
  const el = document.getElementById('projectsDashboardView');
  if (!el) return;

  const active     = projects.filter(p => p.stage < 14);
  const overdue    = projects.filter(p => stageStatus(p) === 'overdue');
  const atRisk     = projects.filter(p => stageStatus(p) === 'at-risk');
  const totalEst   = projects.reduce((a, p) => a + (p.est_value || 0), 0);
  const totalColl  = projects.reduce((a, p) => a + (p.collected || 0), 0);
  const payPending = projects.filter(p =>
    (p.stage >= 2 && !p.deposit_20_paid) ||
    (p.stage >= 6 && !p.payment_50_paid) ||
    (p.stage >= 11 && !p.final_paid)
  );

  const stageDurations = avgDaysPerStage(activity);
  const hasStageData = Object.keys(stageDurations).length > 0;
  const completion = avgCompletionDays(activity);
  const plannedVsActual = plannedVsActualByPhase(stageDates);

  // Bottleneck: stages currently holding the most active projects, tie-broken by
  // highest average days already spent there among the projects sitting in it.
  const bottlenecks = PROJECT_STAGES.map(s => {
    const here = projects.filter(p => p.stage === s.n);
    const avgDays = here.length ? here.reduce((a, p) => a + daysAtStage(p), 0) / here.length : 0;
    return { stage: s, count: here.length, avgDays };
  })
    .filter(b => b.count > 0)
    .sort((a, b) => (b.count - a.count) || (b.avgDays - a.avgDays))
    .slice(0, 3);

  const byPhase = PHASES.map(phase => ({
    phase,
    projects: projects.filter(p => {
      const s = PROJECT_STAGES.find(st => st.n === p.stage);
      return s && s.phase === phase.n && p.stage < 14;
    }),
  }));
  const maxPhaseCount = Math.max(1, ...byPhase.map(b => b.projects.length));

  el.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:2rem">
      ${kpiCard('active', 'Active projects', active.length, `${projects.length} total`)}
      ${kpiCard('overdue', 'Overdue stages', overdue.length, `${atRisk.length} at risk`, overdue.length > 0)}
      ${kpiCard('atRisk', 'At-risk stages', atRisk.length, 'approaching SLA')}
      ${kpiCard('payPending', 'Payments pending', payPending.length, 'across all projects', payPending.length > 0)}
      ${kpiCard('value', 'Est. / Collected value', money(totalEst), `${money(totalColl)} collected`)}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:2rem">
      <div>
        <div class="section-divider" style="margin-bottom:1rem">
          <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Avg completion time</span>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Agreement signed → Follow-up/Reorder</div>
          <div class="kpi-val">${completion != null ? Math.round(completion) + 'd' : '—'}</div>
          <div class="kpi-sub">${completion != null ? 'average across completed projects' : 'not enough stage-change history yet'}</div>
        </div>
      </div>
      <div>
        <div class="section-divider" style="margin-bottom:1rem">
          <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Bottleneck stages</span>
        </div>
        <div class="kpi-card">
          ${bottlenecks.length ? bottlenecks.map(b => `
            <div class="bottleneck-row" data-bottleneck="${b.stage.n}" style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer">
              <span style="font-size:12px;color:var(--text2)">${b.stage.n}. ${b.stage.label}</span>
              <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">${b.count} project${b.count === 1 ? '' : 's'} · avg ${Math.round(b.avgDays)}d here</span>
            </div>`).join('') : '<div style="color:var(--text3);font-size:12px">No active projects.</div>'}
        </div>
      </div>
    </div>

    <div class="section-divider" style="margin-bottom:1rem">
      <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Planned vs. actual, by phase</span>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:2rem">
      ${PHASES.map(phase => {
        const pva = plannedVsActual[phase.n];
        const onTime = pva && pva.avgVarianceDays <= 0;
        return `
        <div class="kpi-card">
          <div class="kpi-label" style="color:#${phase.color}">${phase.label}</div>
          <div class="kpi-val" style="${pva ? `color:${onTime ? 'var(--green)' : 'var(--red)'}` : ''}">${pva ? (onTime ? '' : '+') + Math.round(pva.avgVarianceDays) + 'd' : '—'}</div>
          <div class="kpi-sub">${pva ? `avg vs. plan · ${pva.compared} stage${pva.compared === 1 ? '' : 's'} compared` : 'not enough data yet'}</div>
        </div>`;
      }).join('')}
    </div>

    <div class="section-divider" style="margin-bottom:1rem">
      <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Projects by phase</span>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:2rem">
      ${byPhase.map(b => `
        <div class="kpi-card" data-phase="${b.phase.n}" style="cursor:pointer">
          <div class="kpi-label" style="color:#${b.phase.color}">${b.phase.label}</div>
          <div class="kpi-val">${b.projects.length}</div>
          <div style="height:3px;background:var(--bg4);border-radius:3px;margin-top:10px">
            <div style="height:100%;width:${Math.round((b.projects.length / maxPhaseCount) * 100)}%;background:#${b.phase.color};border-radius:3px"></div>
          </div>
        </div>`).join('')}
    </div>

    <div class="section-divider" style="margin-bottom:1rem">
      <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Avg time per stage</span>
    </div>
    ${hasStageData ? `
      <div class="timeline-list" style="max-height:none">
        ${PROJECT_STAGES.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid var(--border);font-size:12px">
            <span style="color:var(--text2)">${s.n}. ${s.label}</span>
            <span style="font-family:var(--mono);color:${stageDurations[s.n] != null ? 'var(--text)' : 'var(--text3)'}">${stageDurations[s.n] != null ? Math.round(stageDurations[s.n]) + 'd avg' : 'no data yet'}</span>
          </div>`).join('')}
      </div>` : `
      <div class="kpi-card">
        <div style="color:var(--text3);font-size:13px">Not enough data yet — this fills in automatically as projects move through stages from now on.</div>
      </div>`}
  `;

  // ── drilldowns ───────────────────────────────────────────────────────────
  const drilldowns = {
    active:     () => renderListDetail('Active Projects', `${projects.length} total`, active.map(projectRow)),
    overdue:    () => renderListDetail('Overdue Stages', 'Past SLA for current stage', overdue.map(projectRow)),
    atRisk:     () => renderListDetail('At-Risk Stages', 'Approaching SLA for current stage', atRisk.map(projectRow)),
    payPending: () => renderListDetail('Payments Pending', 'Across all projects', payPending.map(projectRow)),
    value:      () => renderListDetail('All Projects', `${money(totalEst)} est. / ${money(totalColl)} collected`, projects.map(projectRow)),
  };
  el.querySelectorAll('[data-kpi]').forEach(card => {
    const fn = drilldowns[card.dataset.kpi];
    if (!fn) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', fn);
  });
  el.querySelectorAll('[data-bottleneck]').forEach(row => {
    row.addEventListener('click', () => {
      const stageDef = PROJECT_STAGES.find(s => s.n === parseInt(row.dataset.bottleneck, 10));
      const here = projects.filter(p => p.stage === stageDef.n);
      renderListDetail(`${stageDef.n}. ${stageDef.label}`, `${here.length} project${here.length === 1 ? '' : 's'} currently here`, here.map(projectRow));
    });
  });
  el.querySelectorAll('[data-phase]').forEach(card => {
    card.addEventListener('click', () => {
      const phase = PHASES.find(p => p.n === parseInt(card.dataset.phase, 10));
      const inPhase = byPhase.find(b => b.phase.n === phase.n).projects;
      renderListDetail(phase.label, `${inPhase.length} active project${inPhase.length === 1 ? '' : 's'}`, inPhase.map(projectRow));
    });
  });
}
