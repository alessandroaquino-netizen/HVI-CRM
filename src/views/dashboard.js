import { stageStatus, daysAtStage, PROJECT_STAGES } from '../controllers/projects.js';

function todayStr() { return new Date().toISOString().slice(0, 10); }

function weekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [mon.toISOString().slice(0,10), sun.toISOString().slice(0,10)];
}

function quarterRange() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0,10);
  const end   = new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0,10);
  return [start, end];
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  return dateStr >= start && dateStr <= end;
}

function progressBar(value, target, color) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  const barColor = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : 'var(--red)';
  return `
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">${pct}% of target</span>
        <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">$${Number(target).toLocaleString()}</span>
      </div>
      <div style="height:3px;background:var(--bg4);border-radius:3px">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .4s"></div>
      </div>
    </div>`;
}

function scorecardCard(label, value, target, format, subtitle) {
  const num = typeof value === 'number' ? value : 0;
  const tgt = typeof target === 'number' ? target : 0;
  const ok = num >= tgt;
  const displayVal = format === 'currency' ? '$' + Number(num).toLocaleString()
    : format === 'count' ? num
    : num;
  return `
    <div class="kpi-card" style="border-color:${ok ? 'rgba(76,175,125,.35)' : 'rgba(224,85,85,.35)'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="kpi-label">${label}</div>
        <div style="font-size:10px;font-family:var(--mono);padding:2px 7px;border-radius:3px;background:${ok ? 'rgba(76,175,125,.15)' : 'rgba(224,85,85,.15)'};color:${ok ? 'var(--green)' : 'var(--red)'}">${ok ? '✓ ON TRACK' : '✗ BEHIND'}</div>
      </div>
      <div class="kpi-val">${displayVal}</div>
      <div class="kpi-sub">${subtitle}</div>
      ${progressBar(num, tgt, ok ? 'var(--green)' : 'var(--red)')}
    </div>`;
}

export function renderDashboard(leads, projects) {
  const el = document.getElementById('dashboardView');
  if (!el) return;

  const [wStart, wEnd] = weekRange();
  const [qStart, qEnd] = quarterRange();
  const today = todayStr();

  // ── Derived metrics ──────────────────────────────────────────────────────

  // Quarterly
  const wonQ        = leads.filter(l => l.stage === 'Closed Won' && inRange(l.lastActivity, qStart, qEnd));
  const revClosedQ  = wonQ.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const revCollQ    = leads.reduce((a, l) => a + (parseFloat(l.collected) || 0), 0)
                    + projects.reduce((a, p) => a + (p.collected || 0), 0);
  const biggestDeal = wonQ.length ? Math.max(...wonQ.map(l => parseFloat(l.est) || 0)) : 0;
  const proposalsQ  = leads.filter(l => inRange(l.proposalDate, qStart, qEnd));

  // Weekly
  const wonW        = leads.filter(l => l.stage === 'Closed Won' && inRange(l.lastActivity, wStart, wEnd));
  const revClosedW  = wonW.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const revCollW    = leads.filter(l => inRange(l.lastActivity, wStart, wEnd))
                          .reduce((a, l) => a + (parseFloat(l.collected) || 0), 0);
  const proposalsW  = leads.filter(l => inRange(l.proposalDate, wStart, wEnd));
  const proposalValW = proposalsW.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const active      = leads.filter(l => !['Closed Won','Closed Lost','Not Qualified'].includes(l.stage));

  // Pipeline health
  const stalled     = leads.filter(l => {
    if (!l.lastActivity) return false;
    if (['Closed Won','Closed Lost','Not Qualified'].includes(l.stage)) return false;
    const days = Math.floor((new Date() - new Date(l.lastActivity)) / 86400000);
    return days >= 14;
  });
  const fuOverdue   = leads.filter(l => {
    if (!l.followupDate) return false;
    if (['Closed Won','Closed Lost','Not Qualified'].includes(l.stage)) return false;
    return l.followupDate < today;
  });

  // Close rate (all time)
  const allProposals = leads.filter(l => ['Proposal Sent','Negotiation','Closed Won'].includes(l.stage) || l.proposalDate);
  const allWon       = leads.filter(l => l.stage === 'Closed Won');
  const closeRate    = allProposals.length ? Math.round((allWon.length / allProposals.length) * 100) : 0;
  const avgDeal      = allWon.length ? Math.round(allWon.reduce((a, l) => a + (parseFloat(l.est) || 0), 0) / allWon.length) : 0;

  // Project health
  const projOverdue  = projects.filter(p => stageStatus(p) === 'overdue');
  const projAtRisk   = projects.filter(p => stageStatus(p) === 'at-risk');
  const payPending   = projects.filter(p =>
    (p.stage >= 2 && !p.deposit_20_paid) ||
    (p.stage >= 6 && !p.payment_50_paid) ||
    (p.stage >= 11 && !p.final_paid)
  );
  const totalEstProj = projects.reduce((a, p) => a + (p.est_value || 0), 0);
  const totalCollProj = projects.reduce((a, p) => a + (p.collected || 0), 0);

  // ── HTML ─────────────────────────────────────────────────────────────────

  el.innerHTML = `

  <!-- QUARTERLY TARGETS -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">
      Q${Math.floor(new Date().getMonth()/3)+1} Quarterly Targets · ends ${qEnd}
    </span>
  </div>
  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:2rem">
    <div class="kpi-card">
      <div class="kpi-label">Revenue Closed</div>
      <div class="kpi-val">$${revClosedQ.toLocaleString()}</div>
      <div class="kpi-sub">of $275,000 target</div>
      ${progressBar(revClosedQ, 275000)}
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Revenue Collected</div>
      <div class="kpi-val">$${revCollQ.toLocaleString()}</div>
      <div class="kpi-sub">of $275,000 target</div>
      ${progressBar(revCollQ, 275000)}
    </div>
    <div class="kpi-card" style="${biggestDeal >= 100000 ? 'border-color:rgba(76,175,125,.4)' : ''}">
      <div class="kpi-label">Biggest deal closed</div>
      <div class="kpi-val" style="color:${biggestDeal >= 100000 ? 'var(--green)' : 'var(--text)'}">${biggestDeal ? '$' + biggestDeal.toLocaleString() : '—'}</div>
      <div class="kpi-sub">${biggestDeal >= 100000 ? '✓ $100K+ target hit' : 'Target: $100,000+'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Proposals this quarter</div>
      <div class="kpi-val">${proposalsQ.length}</div>
      <div class="kpi-sub">5+ per week target</div>
      ${progressBar(proposalsQ.length, 65)}
    </div>
  </div>

  <!-- WEEKLY SCORECARD -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">
      Weekly Scorecard · ${wStart} – ${wEnd}
    </span>
  </div>
  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:2rem">
    ${scorecardCard('Revenue closed this week', revClosedW, 21500, 'currency', `vs $21,500 target`)}
    ${scorecardCard('Revenue collected this week', revCollW, 21500, 'currency', `vs $21,500 target`)}
    <div class="kpi-card" style="border-color:${proposalsW.length >= 5 && proposalValW >= 50000 ? 'rgba(76,175,125,.35)' : 'rgba(224,85,85,.35)'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="kpi-label">Proposals sent</div>
        <div style="font-size:10px;font-family:var(--mono);padding:2px 7px;border-radius:3px;background:${proposalsW.length >= 5 ? 'rgba(76,175,125,.15)' : 'rgba(224,85,85,.15)'};color:${proposalsW.length >= 5 ? 'var(--green)' : 'var(--red)'}">${proposalsW.length >= 5 ? '✓ ON TRACK' : '✗ BEHIND'}</div>
      </div>
      <div class="kpi-val">${proposalsW.length}</div>
      <div class="kpi-sub">$${proposalValW.toLocaleString()} proposed value</div>
      ${progressBar(proposalsW.length, 5)}
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Active deals</div>
      <div class="kpi-val">${active.length}</div>
      <div class="kpi-sub">in pipeline right now</div>
    </div>
  </div>

  <!-- PIPELINE HEALTH + MONTHLY -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:2rem">

    <div>
      <div class="section-divider" style="margin-bottom:1rem">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Pipeline Health</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="kpi-card" style="${stalled.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div class="kpi-label">Stalled deals</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">No activity in 14+ days</div>
            </div>
            <div style="font-size:28px;font-weight:500;color:${stalled.length ? 'var(--red)' : 'var(--text3)'}">${stalled.length}</div>
          </div>
          ${stalled.length ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">${stalled.slice(0,3).map(l => `<div style="font-size:11px;color:var(--text2);display:flex;justify-content:space-between"><span>${l.company}</span><span style="color:var(--red);font-family:var(--mono)">${Math.floor((new Date()-new Date(l.lastActivity))/86400000)}d</span></div>`).join('')}${stalled.length > 3 ? `<div style="font-size:10px;color:var(--text3)">+${stalled.length-3} more</div>` : ''}</div>` : ''}
        </div>
        <div class="kpi-card" style="${fuOverdue.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div class="kpi-label">Follow-ups overdue</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Past agreed follow-up date</div>
            </div>
            <div style="font-size:28px;font-weight:500;color:${fuOverdue.length ? 'var(--red)' : 'var(--text3)'}">${fuOverdue.length}</div>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="section-divider" style="margin-bottom:1rem">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Monthly Metrics</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="kpi-card">
          <div class="kpi-label">Close rate (all time)</div>
          <div class="kpi-val">${closeRate}%</div>
          <div class="kpi-sub">${allWon.length} won / ${allProposals.length} proposals sent</div>
          <div style="height:3px;background:var(--bg4);border-radius:3px;margin-top:10px">
            <div style="height:100%;width:${Math.min(100,closeRate)}%;background:var(--accent);border-radius:3px"></div>
          </div>
        </div>
        <div class="kpi-card" style="${avgDeal >= 20000 ? 'border-color:rgba(76,175,125,.4)' : ''}">
          <div class="kpi-label">Avg deal size</div>
          <div class="kpi-val" style="color:${avgDeal >= 20000 ? 'var(--green)' : 'var(--text)'}">${avgDeal ? '$' + avgDeal.toLocaleString() : '—'}</div>
          <div class="kpi-sub">${avgDeal >= 20000 ? '✓ Trending toward $20K+ target' : 'Target: $20,000+ AOV'}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PROJECT TRACKING SUMMARY -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">B2B Project Tracking Summary</span>
  </div>
  <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">
    <div class="kpi-card">
      <div class="kpi-label">Active projects</div>
      <div class="kpi-val">${projects.filter(p => p.stage < 14).length}</div>
      <div class="kpi-sub">${projects.length} total</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Est. project value</div>
      <div class="kpi-val">$${totalEstProj.toLocaleString()}</div>
      <div class="kpi-sub">across all projects</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total collected</div>
      <div class="kpi-val" style="color:var(--green)">$${totalCollProj.toLocaleString()}</div>
      <div class="kpi-sub">of $${totalEstProj.toLocaleString()} est.</div>
    </div>
    <div class="kpi-card" style="${projOverdue.length || projAtRisk.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
      <div class="kpi-label">Overdue stages</div>
      <div class="kpi-val" style="color:${projOverdue.length ? 'var(--red)' : 'var(--text3)'}">${projOverdue.length}</div>
      <div class="kpi-sub">${projAtRisk.length} at risk</div>
    </div>
    <div class="kpi-card" style="${payPending.length ? 'border-color:rgba(240,192,64,.4)' : ''}">
      <div class="kpi-label">Payments pending</div>
      <div class="kpi-val" style="color:${payPending.length ? 'var(--accent)' : 'var(--text3)'}">${payPending.length}</div>
      <div class="kpi-sub">across all projects</div>
    </div>
  </div>`;
}
