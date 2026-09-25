import { renderListDetail } from './modal.js';
import { formatDate } from '../utils.js';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function iso(d) { return d.toISOString().slice(0, 10); }
function money(n) { return '$' + Math.round(n || 0).toLocaleString(); }

// ---------- period state (persists across re-renders, resets on page reload) ----------

let quarterOffset  = 0;     // 0 = current quarter
let weekOffset     = 0;     // 0 = current week
let customQuarter  = null;  // { start, end } | null — overrides quarterOffset when set
let customWeek     = null;  // { start, end } | null — overrides weekOffset when set
let quarterCustomOpen = false;
let weekCustomOpen    = false;

// ---------- period math ----------

function quarterBounds(offset) {
  const now = new Date();
  const totalQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) + offset;
  const year = Math.floor(totalQ / 4);
  const q = totalQ - year * 4;
  const start = new Date(year, q * 3, 1);
  const end   = new Date(year, q * 3 + 3, 0);
  return { start: iso(start), end: iso(end), label: `Q${q + 1} ${year}` };
}

function weekBounds(offset) {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { start: iso(mon), end: iso(sun), label: `${fmt(mon)} – ${fmt(sun)}` };
}

function getQuarterPeriod() {
  if (customQuarter) return { ...customQuarter, label: `${customQuarter.start} – ${customQuarter.end}`, isCurrent: false };
  const b = quarterBounds(quarterOffset);
  return { ...b, isCurrent: quarterOffset === 0 };
}

function getWeekPeriod() {
  if (customWeek) return { ...customWeek, label: `${customWeek.start} – ${customWeek.end}`, isCurrent: false };
  const b = weekBounds(weekOffset);
  return { ...b, isCurrent: weekOffset === 0 };
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  return dateStr >= start && dateStr <= end;
}

// ---------- UI: period control bar ----------

function periodControlHtml(key, period, customOpen) {
  return `
    <div class="period-bar">
      <div class="period-nav">
        <button class="btn btn-sm btn-ghost" data-period-action="prev" data-period-key="${key}">‹</button>
        <span class="period-label">${period.label}</span>
        <button class="btn btn-sm btn-ghost" data-period-action="next" data-period-key="${key}">›</button>
      </div>
      ${!period.isCurrent ? `<button class="btn btn-sm btn-accent" data-period-action="today" data-period-key="${key}">Today</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-period-action="toggle-custom" data-period-key="${key}">Custom range</button>
      ${customOpen ? `
        <span class="period-custom-inputs">
          <input type="date" class="period-custom-start" data-period-key="${key}">
          <span style="color:var(--text3);font-size:12px">to</span>
          <input type="date" class="period-custom-end" data-period-key="${key}">
          <button class="btn btn-sm btn-accent" data-period-action="apply-custom" data-period-key="${key}">Apply</button>
          <button class="btn btn-sm btn-ghost" data-period-action="clear-custom" data-period-key="${key}">Clear</button>
        </span>` : ''}
    </div>`;
}

function wireperiodControls(el, onChange) {
  el.querySelectorAll('[data-period-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key    = btn.dataset.periodKey;
      const action = btn.dataset.periodAction;
      if (key === 'quarter') {
        if (action === 'prev')  quarterOffset -= 1;
        if (action === 'next')  quarterOffset += 1;
        if (action === 'today') { quarterOffset = 0; customQuarter = null; quarterCustomOpen = false; }
        if (action === 'toggle-custom') quarterCustomOpen = !quarterCustomOpen;
        if (action === 'apply-custom') {
          const s = el.querySelector('.period-custom-start[data-period-key="quarter"]').value;
          const e = el.querySelector('.period-custom-end[data-period-key="quarter"]').value;
          if (s && e) { customQuarter = { start: s, end: e }; quarterCustomOpen = false; }
        }
        if (action === 'clear-custom') { customQuarter = null; }
      } else {
        if (action === 'prev')  weekOffset -= 1;
        if (action === 'next')  weekOffset += 1;
        if (action === 'today') { weekOffset = 0; customWeek = null; weekCustomOpen = false; }
        if (action === 'toggle-custom') weekCustomOpen = !weekCustomOpen;
        if (action === 'apply-custom') {
          const s = el.querySelector('.period-custom-start[data-period-key="week"]').value;
          const e = el.querySelector('.period-custom-end[data-period-key="week"]').value;
          if (s && e) { customWeek = { start: s, end: e }; weekCustomOpen = false; }
        }
        if (action === 'clear-custom') { customWeek = null; }
      }
      onChange();
    });
  });
}

// ---------- row mappers for drilldown modals ----------

function leadRow(l, valueFn) {
  return {
    id: l.id, type: 'lead',
    primary: l.company || l.contact || '—',
    secondary: [l.contact, l.stage].filter(Boolean).join(' · '),
    value: valueFn ? valueFn(l) : '',
  };
}

function projectRow(p, valueFn) {
  return {
    id: p.id, type: 'project',
    primary: p.company || '—',
    secondary: p.contact || '',
    value: valueFn ? valueFn(p) : '',
  };
}

// ---------- KPI card ----------

function kpiCard(key, label, val, sub, opts = {}) {
  const border = opts.ok === true ? 'border-color:rgba(76,175,125,.35)' : opts.ok === false ? 'border-color:rgba(224,85,85,.35)' : '';
  const badge = opts.ok != null
    ? `<div style="font-size:10px;font-family:var(--mono);padding:2px 7px;border-radius:3px;background:${opts.ok ? 'rgba(76,175,125,.15)' : 'rgba(224,85,85,.15)'};color:${opts.ok ? 'var(--green)' : 'var(--red)'}">${opts.ok ? '✓ ON TRACK' : '✗ BEHIND'}</div>`
    : '';
  const bar = opts.target
    ? (() => {
        const pct = Math.min(100, Math.round((opts.value / opts.target) * 100));
        const barColor = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : 'var(--red)';
        return `<div style="margin-top:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">${pct}% of target</span>
            <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">${money(opts.target)}</span>
          </div>
          <div style="height:3px;background:var(--bg4);border-radius:3px">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div>
          </div>
        </div>`;
      })()
    : '';
  return `
    <div class="kpi-card" data-kpi="${key}" style="${border}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="kpi-label">${label}</div>
        ${badge}
      </div>
      <div class="kpi-val">${val}</div>
      <div class="kpi-sub">${sub}</div>
      ${bar}
    </div>`;
}

// ---------- main render ----------

export function renderDashboard(leads, projects) {
  const el = document.getElementById('leadDashboardView');
  if (!el) return;

  const qPeriod = getQuarterPeriod();
  const wPeriod = getWeekPeriod();
  const qRef = qPeriod.isCurrent ? todayStr() : qPeriod.end;
  const wRef = wPeriod.isCurrent ? todayStr() : wPeriod.end;

  // ── Quarter-scoped data ──────────────────────────────────────────────────
  const wonQ       = leads.filter(l => l.stage === 'Closed Won' && inRange(l.lastActivity, qPeriod.start, qRef));
  const revClosedQ = wonQ.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const biggestDeal = wonQ.length ? Math.max(...wonQ.map(l => parseFloat(l.est) || 0)) : 0;
  const proposalsQ = leads.filter(l => inRange(l.proposalDate, qPeriod.start, qRef));
  const proposalValQ = proposalsQ.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const closeRate  = proposalsQ.length ? Math.round((wonQ.length / proposalsQ.length) * 100) : 0;
  const avgDeal    = wonQ.length ? Math.round(revClosedQ / wonQ.length) : 0;
  // Collected has no per-payment date field anywhere in the data model — it's a running
  // cumulative total, not something we can honestly scope to a quarter/week window.
  const totalCollected = leads.reduce((a, l) => a + (parseFloat(l.collected) || 0), 0)
                        + projects.reduce((a, p) => a + (p.collected || 0), 0);

  // ── Week-scoped data ──────────────────────────────────────────────────────
  const wonW       = leads.filter(l => l.stage === 'Closed Won' && inRange(l.lastActivity, wPeriod.start, wRef));
  const revClosedW = wonW.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  const revCollW   = leads.filter(l => inRange(l.lastActivity, wPeriod.start, wRef))
                          .reduce((a, l) => a + (parseFloat(l.collected) || 0), 0);
  const proposalsW = leads.filter(l => inRange(l.proposalDate, wPeriod.start, wRef));
  const proposalValW = proposalsW.reduce((a, l) => a + (parseFloat(l.est) || 0), 0);
  // "as of" refDate — current stage is all we know (no per-lead stage history), so this
  // approximates "who's active/at-risk as of that date" rather than a true time-travel snapshot.
  const active = leads.filter(l => !['Closed Won', 'Closed Lost', 'Not Qualified'].includes(l.stage) && (!l.created_at || l.created_at.slice(0,10) <= wRef));
  const stalled = leads.filter(l => {
    if (!l.lastActivity) return false;
    if (['Closed Won', 'Closed Lost', 'Not Qualified'].includes(l.stage)) return false;
    const days = Math.floor((new Date(wRef) - new Date(l.lastActivity)) / 86400000);
    return days >= 14;
  });
  const fuOverdue = leads.filter(l => {
    if (!l.followupDate) return false;
    if (['Closed Won', 'Closed Lost', 'Not Qualified'].includes(l.stage)) return false;
    return l.followupDate < wRef;
  });

  // ── HTML ─────────────────────────────────────────────────────────────────

  el.innerHTML = `
  <!-- QUARTER PERFORMANCE -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Quarter Performance</span>
  </div>
  <div id="quarterPeriodBar"></div>
  <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:2rem">
    ${kpiCard('revClosedQ', 'Revenue Closed', money(revClosedQ), `of $275,000 target`, { value: revClosedQ, target: 275000 })}
    ${kpiCard('totalCollected', 'Total Collected', money(totalCollected), 'cumulative to date · not period-scoped', {})}
    ${kpiCard('biggestDealQ', 'Biggest deal closed', biggestDeal ? money(biggestDeal) : '—', biggestDeal >= 100000 ? '✓ $100K+ target hit' : 'Target: $100,000+', { ok: biggestDeal >= 100000 ? true : null })}
    ${kpiCard('proposalsQ', 'Proposals this period', proposalsQ.length, `${money(proposalValQ)} proposed value`, { value: proposalsQ.length, target: 65 })}
    ${kpiCard('closeRateQ', 'Close rate', closeRate + '%', `${wonQ.length} won / ${proposalsQ.length} proposals in period`, {})}
    ${kpiCard('avgDealQ', 'Avg deal size', avgDeal ? money(avgDeal) : '—', avgDeal >= 20000 ? '✓ Trending toward $20K+ target' : 'Target: $20,000+ AOV', { ok: avgDeal >= 20000 ? true : null })}
  </div>

  <!-- WEEK PERFORMANCE + PIPELINE HEALTH -->
  <div class="section-divider" style="margin-bottom:1rem">
    <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Week Performance &amp; Pipeline Health</span>
  </div>
  <div id="weekPeriodBar"></div>
  <div style="font-size:11px;color:var(--text3);margin:8px 0 12px">
    ${wPeriod.isCurrent ? 'Showing current, real-time risk.' : `Showing risk as of ${wPeriod.end} — based on each lead's current stage (no historical stage snapshots are kept).`}
  </div>
  <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:14px">
    ${kpiCard('revClosedW', 'Revenue closed this week', money(revClosedW), 'vs $21,500 target', { value: revClosedW, target: 21500 })}
    ${kpiCard('revCollW', 'Revenue collected this week', money(revCollW), 'vs $21,500 target', { value: revCollW, target: 21500 })}
    ${kpiCard('proposalsW', 'Proposals sent', proposalsW.length, `${money(proposalValW)} proposed value`, { ok: proposalsW.length >= 5, value: proposalsW.length, target: 5 })}
    ${kpiCard('active', 'Active deals', active.length, 'in pipeline as of this period', {})}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:2rem">
    <div class="kpi-card" data-kpi="stalled" style="${stalled.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div class="kpi-label">Stalled deals</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">No activity in 14+ days</div>
        </div>
        <div style="font-size:28px;font-weight:500;color:${stalled.length ? 'var(--red)' : 'var(--text3)'}">${stalled.length}</div>
      </div>
      ${stalled.length ? `<div class="kpi-scroll-list">${[...stalled]
          .sort((a, b) => a.lastActivity.localeCompare(b.lastActivity))
          .map(l => `<div class="kpi-scroll-row" data-open-lead="${l.id}"><span>${l.company || l.contact}</span><span style="color:var(--red);font-family:var(--mono);font-size:11px">${Math.floor((new Date(wRef) - new Date(l.lastActivity)) / 86400000)}d</span></div>`)
          .join('')}</div>` : ''}
    </div>
    <div class="kpi-card" data-kpi="fuOverdue" style="${fuOverdue.length ? 'border-color:rgba(224,85,85,.4)' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div class="kpi-label">Follow-ups overdue</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Past agreed follow-up date</div>
        </div>
        <div style="font-size:28px;font-weight:500;color:${fuOverdue.length ? 'var(--red)' : 'var(--text3)'}">${fuOverdue.length}</div>
      </div>
      ${fuOverdue.length ? `<div class="kpi-scroll-list">${[...fuOverdue]
          .sort((a, b) => a.followupDate.localeCompare(b.followupDate))
          .map(l => `<div class="kpi-scroll-row" data-open-lead="${l.id}"><span>${l.company || l.contact}</span><span style="color:var(--red);font-family:var(--mono);font-size:11px">${formatDate(l.followupDate)}</span></div>`)
          .join('')}</div>` : ''}
    </div>
  </div>`;

  // ── period control bars ────────────────────────────────────────────────
  document.getElementById('quarterPeriodBar').innerHTML = periodControlHtml('quarter', qPeriod, quarterCustomOpen);
  document.getElementById('weekPeriodBar').innerHTML    = periodControlHtml('week', wPeriod, weekCustomOpen);
  wireperiodControls(document.getElementById('quarterPeriodBar'), () => renderDashboard(leads, projects));
  wireperiodControls(document.getElementById('weekPeriodBar'), () => renderDashboard(leads, projects));

  // ── drilldowns ───────────────────────────────────────────────────────────
  const money2 = v => money(parseFloat(v) || 0);
  const drilldowns = {
    revClosedQ:     () => renderListDetail('Revenue Closed', qPeriod.label, wonQ.map(l => leadRow(l, x => money2(x.est)))),
    totalCollected: () => renderListDetail('Total Collected to Date', 'Cumulative across all leads & projects', [
      ...leads.filter(l => parseFloat(l.collected) > 0).map(l => leadRow(l, x => money2(x.collected))),
      ...projects.filter(p => p.collected > 0).map(p => projectRow(p, x => money2(x.collected))),
    ]),
    biggestDealQ:   () => renderListDetail('Deals Closed', qPeriod.label, [...wonQ].sort((a,b) => (parseFloat(b.est)||0)-(parseFloat(a.est)||0)).map(l => leadRow(l, x => money2(x.est)))),
    proposalsQ:     () => renderListDetail('Proposals Sent', qPeriod.label, proposalsQ.map(l => leadRow(l, x => money2(x.est)))),
    closeRateQ:     () => renderListDetail('Won Deals (of proposals in period)', qPeriod.label, wonQ.map(l => leadRow(l, x => money2(x.est)))),
    avgDealQ:       () => renderListDetail('Deals Closed', qPeriod.label, wonQ.map(l => leadRow(l, x => money2(x.est)))),
    revClosedW:     () => renderListDetail('Revenue Closed This Week', wPeriod.label, wonW.map(l => leadRow(l, x => money2(x.est)))),
    revCollW:       () => renderListDetail('Revenue Collected This Week', wPeriod.label, leads.filter(l => inRange(l.lastActivity, wPeriod.start, wRef) && parseFloat(l.collected) > 0).map(l => leadRow(l, x => money2(x.collected)))),
    proposalsW:     () => renderListDetail('Proposals Sent This Week', wPeriod.label, proposalsW.map(l => leadRow(l, x => money2(x.est)))),
    active:         () => renderListDetail('Active Deals', wPeriod.label, active.map(l => leadRow(l, x => x.est ? money2(x.est) : ''))),
    stalled:        () => renderListDetail('Stalled Deals', 'No activity in 14+ days · ' + wPeriod.label, stalled.map(l => leadRow(l, x => Math.floor((new Date(wRef) - new Date(x.lastActivity)) / 86400000) + 'd stale'))),
    fuOverdue:      () => renderListDetail('Follow-ups Overdue', wPeriod.label, fuOverdue.map(l => leadRow(l, x => formatDate(x.followupDate)))),
  };
  el.querySelectorAll('[data-kpi]').forEach(card => {
    const fn = drilldowns[card.dataset.kpi];
    if (!fn) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', e => {
      if (e.target.closest('[data-open-lead]')) return; // let scroll-row clicks pass through
      fn();
    });
  });
}
