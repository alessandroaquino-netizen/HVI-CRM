import { PROJECT_STAGES, PHASES, stageStatus, daysAtStage } from '../controllers/projects.js';
import { avgDaysPerStage, avgCompletionDays } from '../controllers/projectTracking.js';

function money(n) { return '$' + Math.round(n || 0).toLocaleString(); }

function kpiCard(label, val, sub, warn) {
  return `
    <div class="kpi-card" style="${warn ? 'border-color:rgba(224,85,85,.4)' : ''}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-val" style="${warn ? 'color:var(--red)' : ''}">${val}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`;
}

export function renderProjectsDashboard(projects, activity) {
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
    count: projects.filter(p => {
      const s = PROJECT_STAGES.find(st => st.n === p.stage);
      return s && s.phase === phase.n && p.stage < 14;
    }).length,
  }));
  const maxPhaseCount = Math.max(1, ...byPhase.map(b => b.count));

  el.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:2rem">
      ${kpiCard('Active projects', active.length, `${projects.length} total`)}
      ${kpiCard('Overdue stages', overdue.length, `${atRisk.length} at risk`, overdue.length > 0)}
      ${kpiCard('At-risk stages', atRisk.length, 'approaching SLA')}
      ${kpiCard('Payments pending', payPending.length, 'across all projects', payPending.length > 0)}
      ${kpiCard('Est. / Collected value', money(totalEst), `${money(totalColl)} collected`)}
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
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:12px;color:var(--text2)">${b.stage.n}. ${b.stage.label}</span>
              <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">${b.count} project${b.count === 1 ? '' : 's'} · avg ${Math.round(b.avgDays)}d here</span>
            </div>`).join('') : '<div style="color:var(--text3);font-size:12px">No active projects.</div>'}
        </div>
      </div>
    </div>

    <div class="section-divider" style="margin-bottom:1rem">
      <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Projects by phase</span>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:2rem">
      ${byPhase.map(b => `
        <div class="kpi-card">
          <div class="kpi-label" style="color:#${b.phase.color}">${b.phase.label}</div>
          <div class="kpi-val">${b.count}</div>
          <div style="height:3px;background:var(--bg4);border-radius:3px;margin-top:10px">
            <div style="height:100%;width:${Math.round((b.count / maxPhaseCount) * 100)}%;background:#${b.phase.color};border-radius:3px"></div>
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
}
