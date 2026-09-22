import { DTC_PHASES, PRODUCT_TYPES, calcDropRisk, weeksUntilDrop } from '../dtc_constants.js';
import { formatDate } from '../utils.js';
import { renderListDetail } from './modal.js';

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
  const dropsThisWeekList = products.filter(p =>
    p.drop_date >= wStart && p.drop_date <= wEnd && p.phase === 'warehouse'
  );
  const dropsThisWeek = dropsThisWeekList.length;

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

  // Payments by horizon — bucket each record's outstanding balance by expected_next_payment_date
  function outstanding(f) {
    let sum = 0;
    if (f.deposit_amount && !f.deposit_paid_date) sum += f.deposit_amount;
    if (f.final_amount && !f.final_paid_date && !f.paid_in_full) sum += f.final_amount;
    if (f.photographer_fee && !f.photographer_paid_date) sum += f.photographer_fee;
    if (f.additional_payment_amount && !f.additional_payment_date) sum += f.additional_payment_amount;
    return sum;
  }
  const horizons = { w1: [], w4: [], w8: [], remainder: [], unscheduled: [] };
  financials.forEach(f => {
    const amt = outstanding(f);
    if (amt <= 0) return;
    if (!f.expected_next_payment_date) { horizons.unscheduled.push(f); return; }
    const days = Math.round((new Date(f.expected_next_payment_date) - new Date(today)) / 86400000);
    if (days <= 7) horizons.w1.push(f);
    else if (days <= 28) horizons.w4.push(f);
    else if (days <= 56) horizons.w8.push(f);
    else horizons.remainder.push(f);
  });
  const horizonSum = list => list.reduce((a, f) => a + outstanding(f), 0);

  // Total paid this calendar year + total still pending, across every payment type
  const currentYear = new Date().getFullYear();
  const paidThisYear = f => {
    let sum = 0;
    if (f.deposit_paid_date?.slice(0,4) === String(currentYear)) sum += f.deposit_amount || 0;
    if ((f.final_paid_date?.slice(0,4) === String(currentYear)) || (f.paid_in_full && f.full_payment_date?.slice(0,4) === String(currentYear))) sum += f.final_amount || 0;
    if (f.photographer_paid_date?.slice(0,4) === String(currentYear)) sum += f.photographer_fee || 0;
    if (f.additional_payment_date?.slice(0,4) === String(currentYear)) sum += f.additional_payment_amount || 0;
    return sum;
  };
  const totalPaidYear = financials.reduce((a, f) => a + paidThisYear(f), 0);
  const totalPending  = financials.reduce((a, f) => a + outstanding(f), 0);

  // Upcoming drops list
  const allUpcoming = products
    .filter(p => p.drop_date && p.drop_date >= today)
    .sort((a, b) => a.drop_date.localeCompare(b.drop_date));
  const upcoming = allUpcoming.slice(0, 8);

  el.innerHTML = `

  <!-- PIPELINE OVERVIEW -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Pipeline Overview</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:2rem">
    ${DTC_PHASES.map(ph => `
      <div class="kpi-card" data-kpi="phase-${ph.id}" style="border-top:2px solid #${ph.color}">
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
        <div class="kpi-card" data-kpi="overdue" style="${overdue.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">Overdue — past drop date</div>
            <div style="font-size:11px;color:var(--text3)">Lead time already exceeded</div></div>
            <div style="font-size:32px;font-weight:500;color:${overdue.length ? 'var(--red)' : 'var(--text3)'}">${overdue.length}</div>
          </div>
          ${overdue.length ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">
            ${overdue.slice(0,3).map(p => `<div style="font-size:11px;color:var(--text2);display:flex;justify-content:space-between">
              <span>${p.name}</span><span style="color:var(--red);font-family:var(--mono)">${formatDate(p.drop_date)}</span></div>`).join('')}
          </div>` : ''}
        </div>
        <div class="kpi-card" data-kpi="atRisk" style="${atRisk.length ? 'border-color:rgba(240,192,64,.4)' : ''}">
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
        <div class="kpi-card" data-kpi="dropsThisWeek">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">Drops this week</div>
            <div style="font-size:11px;color:var(--text3)">Target: 1 per week</div></div>
            <div style="font-size:32px;font-weight:500;color:${dropsThisWeek >= 1 ? 'var(--green)' : 'var(--text3)'}">${dropsThisWeek}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Drops confirmed by horizon</div>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
            ${[['4 weeks', 'drops4w', drops4w.length], ['8 weeks', 'drops8w', drops8w.length], ['12 weeks', 'drops12w', drops12w.length]].map(([label, key, count]) => `
              <div class="dtc-horizon-row" data-kpi="${key}" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
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
      <div class="section-divider" style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Upcoming Drops</span>
        ${allUpcoming.length > 8 ? `<button class="btn btn-sm btn-ghost" id="dtcSeeAllDrops" style="font-size:10px">See all (${allUpcoming.length})</button>` : ''}
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
              <div style="font-size:11px;font-family:var(--mono);color:var(--accent)">${formatDate(p.drop_date)}</div>
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
        <div class="kpi-card" data-kpi="depositPending" style="${depositPending > 0 ? 'border-color:rgba(240,192,64,.4)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="kpi-label">Deposits pending</div>
            <div style="font-size:11px;color:var(--text3)">50% upfront — Bing Bing</div></div>
            <div style="font-size:22px;font-weight:500;color:${depositPending > 0 ? 'var(--accent)' : 'var(--text3)'}">$${depositPending.toLocaleString()}</div>
          </div>
        </div>
        <div class="kpi-card" data-kpi="finalPending" style="${finalPending > 0 ? 'border-color:rgba(224,85,85,.4)' : ''}">
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
        <div class="kpi-card" data-kpi="paidYear">
          <div class="kpi-label">Total paid — ${currentYear}</div>
          <div class="kpi-val" style="color:var(--green)">$${totalPaidYear.toLocaleString()}</div>
        </div>
        <div class="kpi-card" data-kpi="totalPending" style="${totalPending > 0 ? 'border-color:rgba(224,85,85,.35)' : ''}">
          <div class="kpi-label">Total pending</div>
          <div class="kpi-val" style="color:${totalPending > 0 ? 'var(--red)' : 'var(--text3)'}">$${totalPending.toLocaleString()}</div>
          <div class="kpi-sub">across deposits, finals, photographer & extras</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PAYMENTS BY HORIZON -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Payments by Horizon</span>
  </div>
  <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:2rem">
    ${[
      ['≤ 1 week', 'w1', horizons.w1],
      ['≤ 4 weeks', 'w4', horizons.w4],
      ['≤ 8 weeks', 'w8', horizons.w8],
      ['Remainder', 'remainder', horizons.remainder],
      ['Unscheduled', 'unscheduled', horizons.unscheduled],
    ].map(([label, key, list]) => `
      <div class="kpi-card" data-kpi="horizon-${key}" style="${horizonSum(list) > 0 && key !== 'remainder' && key !== 'unscheduled' ? 'border-color:rgba(240,192,64,.35)' : ''}">
        <div class="kpi-label">${label}</div>
        <div class="kpi-val" style="font-size:20px">$${horizonSum(list).toLocaleString()}</div>
        <div class="kpi-sub">${list.length} transaction${list.length === 1 ? '' : 's'}</div>
      </div>`).join('')}
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

  const dtcRow = p => ({ id: p.id, type: 'dtc', primary: p.name, secondary: [p.phase, p.manufacturer].filter(Boolean).join(' · '), value: p.drop_date ? formatDate(p.drop_date) : '' });
  const finRow = f => ({ id: f.dtc_product_id || null, type: 'dtc', primary: f.product_name || '—', secondary: [f.manufacturer, f.invoice_number].filter(Boolean).join(' · '), value: '' });
  const drilldowns = {
    overdue:       () => renderListDetail('Overdue Products', 'Past achievable lead time for the drop date', overdue.map(dtcRow)),
    atRisk:        () => renderListDetail('At-Risk Products', 'Tight on lead time', atRisk.map(dtcRow)),
    dropsThisWeek: () => renderListDetail('Drops This Week', `${wStart} – ${wEnd}`, dropsThisWeekList.map(dtcRow)),
    drops4w:       () => renderListDetail('Drops — Next 4 Weeks', null, drops4w.map(dtcRow)),
    drops8w:       () => renderListDetail('Drops — Next 8 Weeks', null, drops8w.map(dtcRow)),
    drops12w:      () => renderListDetail('Drops — Next 12 Weeks', null, drops12w.map(dtcRow)),
    depositPending: () => renderListDetail('Deposits Pending', `$${depositPending.toLocaleString()} outstanding`, financials.filter(f => f.deposit_amount && !f.deposit_paid_date).map(finRow)),
    finalPending:   () => renderListDetail('Final Payments Pending', `$${finalPending.toLocaleString()} outstanding`, financials.filter(f => f.final_amount && !f.final_paid_date && !f.paid_in_full).map(finRow)),
    paidYear:       () => renderListDetail(`Paid — ${currentYear}`, `$${totalPaidYear.toLocaleString()} paid this year`, financials.filter(f => paidThisYear(f) > 0).map(finRow)),
    totalPending:   () => renderListDetail('Total Pending', `$${totalPending.toLocaleString()} outstanding across all payment types`, financials.filter(f => outstanding(f) > 0).map(finRow)),
    'horizon-w1':          () => renderListDetail('Payments Due — ≤ 1 Week', `$${horizonSum(horizons.w1).toLocaleString()}`, horizons.w1.map(finRow)),
    'horizon-w4':          () => renderListDetail('Payments Due — ≤ 4 Weeks', `$${horizonSum(horizons.w4).toLocaleString()}`, horizons.w4.map(finRow)),
    'horizon-w8':          () => renderListDetail('Payments Due — ≤ 8 Weeks', `$${horizonSum(horizons.w8).toLocaleString()}`, horizons.w8.map(finRow)),
    'horizon-remainder':   () => renderListDetail('Payments Due — Remainder', `$${horizonSum(horizons.remainder).toLocaleString()}`, horizons.remainder.map(finRow)),
    'horizon-unscheduled': () => renderListDetail('Payments Due — Unscheduled', `$${horizonSum(horizons.unscheduled).toLocaleString()}`, horizons.unscheduled.map(finRow)),
  };
  DTC_PHASES.forEach(ph => {
    drilldowns[`phase-${ph.id}`] = () => renderListDetail(ph.label, `${byPhase[ph.id] || 0} products`, products.filter(p => p.phase === ph.id).map(dtcRow));
  });
  el.querySelectorAll('[data-kpi]').forEach(card => {
    const fn = drilldowns[card.dataset.kpi];
    if (!fn) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', fn);
  });
  const seeAllBtn = el.querySelector('#dtcSeeAllDrops');
  if (seeAllBtn) seeAllBtn.addEventListener('click', () => renderListDetail('All Upcoming Drops', `${allUpcoming.length} scheduled`, allUpcoming.map(dtcRow)));
}
