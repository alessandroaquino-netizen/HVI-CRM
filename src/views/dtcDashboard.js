import { DTC_PHASES, PRODUCT_TYPES, calcDropRisk, weeksUntilDrop } from '../dtc_constants.js';

function todayStr() { return new Date().toISOString().slice(0, 10); }

function weekRange() {
  const now = new Date(); const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [mon.toISOString().slice(0,10), sun.toISOString().slice(0,10)];
}

export function renderDtcDashboard(products, financials) {
  const el = document.getElementById('dtcDashboardView');
  if (!el) return;

  const today = todayStr();
  const [wStart, wEnd] = weekRange();

  // ── derived metrics ──────────────────────────────────────────────────────
  const active      = products.filter(p => p.phase !== 'warehouse');
  const overdue     = products.filter(p => calcDropRisk(p) === 'overdue');
  const atRisk      = products.filter(p => calcDropRisk(p) === 'at-risk');

  // Drops by horizon
  const drops4w     = products.filter(p => { const w = weeksUntilDrop(p); return w !== null && w >= 0 && w <= 4; });
  const drops8w     = products.filter(p => { const w = weeksUntilDrop(p); return w !== null && w >= 0 && w <= 8; });
  const drops12w    = products.filter(p => { const w = weeksUntilDrop(p); return w !== null && w >= 0 && w <= 12; });

  // Drops executed this week (drop_date in current week, phase = warehouse)
  const dropsThisWeek = products.filter(p =>
    p.drop_date >= wStart && p.drop_date <= wEnd && p.phase === 'warehouse'
  ).length;

  // Phases count
  const byPhase = Object.fromEntries(DTC_PHASES.map(ph => [ph.id, products.filter(p => p.phase === ph.id).length]));

  // Manufacturers
  const byMfr = {};
  products.forEach(p => {
    if (!p.manufacturer) return;
    byMfr[p.manufacturer] = (byMfr[p.manufacturer] || 0) + 1;
  });

  // Financials
  const totalDeposit   = financials.reduce((a, f) => a + (f.deposit_amount || 0), 0);
  const totalFinal     = financials.reduce((a, f) => a + (f.final_amount   || 0), 0);
  const depositPending = financials.filter(f => !f.deposit_paid_date).reduce((a, f) => a + (f.deposit_amount || 0), 0);
  const finalPending   = financials.filter(f => !f.final_paid_date).reduce((a, f) => a + (f.final_amount   || 0), 0);

  // Upcoming drops list
  const upcoming = products
    .filter(p => p.drop_date && p.drop_date >= today)
    .sort((a, b) => a.drop_date.localeCompare(b.drop_date))
    .slice(0, 8);

  el.innerHTML = `

  <!-- PIPELINE OVERVIEW -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Pipeline Overview</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:2rem">
    ${DTC_PHASES.map(ph => `
      <div class="kpi-card" style="border-top:2px solid #${ph.color}">
        <div class="kpi-label">${ph.label}</div>
        <div class="kpi-val" style="font-size:26px">${byPhase[ph.id] || 0}</div>
        <div class="kpi-sub">products</div>
      </div>`).join('')}
  </div>

  <!-- RISK & DROPS -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:2rem">

    <div>
      <div class="section-divider" style="margin-bottom:1rem">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Risk Status</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="kpi-card" style="${overdue.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">Overdue — past drop date</div>
            <div style="font-size:11px;color:var(--text3)">Lead time already exceeded</div></div>
            <div style="font-size:32px;font-weight:500;color:${overdue.length ? 'var(--red)' : 'var(--text3)'}">${overdue.length}</div>
          </div>
          ${overdue.length ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">
            ${overdue.slice(0,3).map(p => `<div style="font-size:11px;color:var(--text2);display:flex;justify-content:space-between">
              <span>${p.name}</span><span style="color:var(--red);font-family:var(--mono)">${p.drop_date}</span></div>`).join('')}
          </div>` : ''}
        </div>
        <div class="kpi-card" style="${atRisk.length ? 'border-color:rgba(240,192,64,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">At risk</div>
            <div style="font-size:11px;color:var(--text3)">Tight on lead time</div></div>
            <div style="font-size:32px;font-weight:500;color:${atRisk.length ? 'var(--accent)' : 'var(--text3)'}">${atRisk.length}</div>
          </div>
          ${atRisk.length ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">
            ${atRisk.slice(0,3).map(p => `<div style="font-size:11px;color:var(--text2);display:flex;justify-content:space-between">
              <span>${p.name}</span><span style="color:var(--accent);font-family:var(--mono)">${weeksUntilDrop(p)}w left</span></div>`).join('')}
          </div>` : ''}
        </div>
      </div>
    </div>

    <div>
      <div class="section-divider" style="margin-bottom:1rem">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Drop Horizon</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="kpi-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">Drops this week</div>
            <div style="font-size:11px;color:var(--text3)">Target: 1 per week</div></div>
            <div style="font-size:32px;font-weight:500;color:${dropsThisWeek >= 1 ? 'var(--green)' : 'var(--text3)'}">${dropsThisWeek}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Drops confirmed by horizon</div>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
            ${[['4 weeks', drops4w.length], ['8 weeks', drops8w.length], ['12 weeks', drops12w.length]].map(([label, count]) => `
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:12px;color:var(--text2)">${label}</span>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:100px;height:4px;background:var(--bg4);border-radius:2px">
                    <div style="width:${Math.min(100, count * 25)}%;height:100%;background:var(--accent);border-radius:2px"></div>
                  </div>
                  <span style="font-size:12px;font-family:var(--mono);color:var(--text);width:20px;text-align:right">${count}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- UPCOMING DROPS + FINANCIALS -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:2rem">

    <div>
      <div class="section-divider" style="margin-bottom:1rem">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Upcoming Drops</span>
      </div>
      <div class="followup-banner">
        ${upcoming.length ? upcoming.map(p => {
          const weeks = weeksUntilDrop(p);
          const risk  = calcDropRisk(p);
          const color = risk === 'overdue' ? 'var(--red)' : risk === 'at-risk' ? 'var(--accent)' : 'var(--text3)';
          return `<div class="followup-row" data-open-dtc="${p.id}">
            <div>
              <div class="followup-name">${p.name}</div>
              <div class="followup-co">${p.phase} · ${p.product_type || '—'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;font-family:var(--mono);color:var(--accent)">${p.drop_date}</div>
              <div style="font-size:10px;color:${color}">${weeks !== null ? weeks + 'w away' : ''}</div>
            </div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--text3);padding:8px 0">No drops scheduled</div>'}
      </div>
    </div>

    <div>
      <div class="section-divider" style="margin-bottom:1rem">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Financial Summary</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="kpi-card" style="${depositPending > 0 ? 'border-color:rgba(240,192,64,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">Deposits pending</div>
            <div style="font-size:11px;color:var(--text3)">50% upfront — Bing Bing</div></div>
            <div style="font-size:22px;font-weight:500;color:${depositPending > 0 ? 'var(--accent)' : 'var(--text3)'}">$${depositPending.toLocaleString()}</div>
          </div>
        </div>
        <div class="kpi-card" style="${finalPending > 0 ? 'border-color:rgba(224,85,85,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">Final payments pending</div>
            <div style="font-size:11px;color:var(--text3)">50% on shipment</div></div>
            <div style="font-size:22px;font-weight:500;color:${finalPending > 0 ? 'var(--red)' : 'var(--text3)'}">$${finalPending.toLocaleString()}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total paid to date</div>
          <div class="kpi-val" style="color:var(--green)">$${(totalDeposit + totalFinal - depositPending - finalPending).toLocaleString()}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- BY MANUFACTURER -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Products by Manufacturer</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:6px">
    ${Object.entries(byMfr).sort((a,b) => b[1]-a[1]).map(([mfrId, count]) => `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:12px;color:var(--text2);width:220px;flex-shrink:0">${mfrId.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
        <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px">
          <div style="width:${Math.min(100, (count / products.length) * 100)}%;height:100%;background:var(--accent);border-radius:3px;opacity:.7"></div>
        </div>
        <span style="font-size:12px;font-family:var(--mono);color:var(--text3);width:20px;text-align:right">${count}</span>
      </div>`).join('')}
  </div>`;
}
