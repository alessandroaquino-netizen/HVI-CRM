export function renderKPIs(leads) {
  const won       = leads.filter(l => l.stage === 'Closed Won');
  const wonRev    = won.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const active    = leads.filter(l => !['Closed Won', 'Closed Lost', 'Not Qualified'].includes(l.stage));
  const proposals = leads.filter(l => ['Proposal Sent', 'Negotiation', 'Closed Won'].includes(l.stage));
  const pipeVal   = active.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const revPct    = Math.min(100, Math.round(wonRev / 150000 * 100));
  const propPct   = Math.min(100, Math.round(proposals.length / 65 * 100));

  document.getElementById('kpiRow').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Closed revenue</div>
      <div class="kpi-val">$${wonRev.toLocaleString()}</div>
      <div class="kpi-sub">of $150,000 target</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${revPct}%"></div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Active leads</div>
      <div class="kpi-val">${active.length}</div>
      <div class="kpi-sub">${leads.length} total in CRM</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Proposals sent</div>
      <div class="kpi-val">${proposals.length}</div>
      <div class="kpi-sub">of 65 quarterly target</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${propPct}%"></div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Pipeline value</div>
      <div class="kpi-val">$${pipeVal.toLocaleString()}</div>
      <div class="kpi-sub">est. open deals</div>
    </div>`;
}
