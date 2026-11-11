// Team Scorecard (weekly KPI grid) and Rocks (quarterly priorities). Everyone reads; only administrators edit.
import { quarterWeeks, currentQuarter, nextQuarter, evaluateKpi, summarize, weekStatus, weeklyTarget, qtdTarget, STATUS_LABEL, fmtValue, fmtTarget, mondayOf } from '../kpi/status.js';
import { saveKpiValue, saveKpi, deleteKpi, saveRock, setRockStatus, deleteRock, startNextQuarter } from '../controllers/kpi.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = d => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
const ROCK_STATUS = { not_started: 'Not started', in_progress: 'In progress', at_risk: 'At risk', done: 'Done' };
const CSS_STATUS = { on_track: 'on', at_risk: 'risk', off_track: 'off', no_data: 'none' };

let ctx = null;
const st = { tab: 'scorecard', quarter: null, owner: 'all', status: 'all', q: '' };
export function initTeam(c) { ctx = c; }

function model() {
  const { kpis, values, rocks, rockKpis } = ctx.get();
  const quarters = [...new Set([...kpis.map(k => k.quarter), ...rocks.map(r => r.quarter)])].sort().reverse();
  if (!st.quarter || !quarters.includes(st.quarter)) st.quarter = quarters.includes(currentQuarter()) ? currentQuarter() : (quarters[0] || currentQuarter());
  const weeks = quarterWeeks(st.quarter);
  const qk = kpis.filter(k => k.quarter === st.quarter && k.active);
  const byKpi = new Map(); values.forEach(v => { (byKpi.get(v.kpi_id) || byKpi.set(v.kpi_id, []).get(v.kpi_id)).push(v); });
  const evals = new Map(qk.map(k => [k.id, evaluateKpi(k, byKpi.get(k.id) || [], weeks)]));
  return { kpis, values, rocks, rockKpis, quarters, weeks, qk, evals, rocksQ: rocks.filter(r => r.quarter === st.quarter) };
}

export function renderTeamScorecard() {
  const el = document.getElementById('teamScorecardView'); if (!el || !ctx) return;
  const m = model(); const admin = ctx.isAdmin();
  const quarterOpts = (m.quarters.length ? m.quarters : [st.quarter]).map(q => `<option value="${q}"${q === st.quarter ? ' selected' : ''}>${q.replace('-', ' ')}</option>`).join('');
  el.innerHTML = `
    <div class="sc-head">
      <div class="mo-tabs" role="tablist"><button class="mo-tab${st.tab === 'scorecard' ? ' active' : ''}" data-sc-tab="scorecard">Scorecard</button><button class="mo-tab${st.tab === 'rocks' ? ' active' : ''}" data-sc-tab="rocks">Rocks</button></div>
      <select id="scQuarter" aria-label="Quarter">${quarterOpts}</select>
      <div class="sc-head-actions">
        ${admin ? `<button class="btn btn-accent" id="scAdd">${st.tab === 'rocks' ? 'Add rock' : 'Add KPI'}</button><button class="btn" id="scNextQ">Start ${nextQuarter(st.quarter).replace('-', ' ')}</button>` : '<span class="sc-ro">View only — administrators update the numbers</span>'}
      </div>
    </div>
    ${st.tab === 'rocks' ? rocksHtml(m, admin) : scorecardHtml(m, admin)}`;
  wire(el, m, admin);
}

// ─── Scorecard ───────────────────────────────────────────────────────────
function scorecardHtml(m, admin) {
  const owners = [...new Set(m.qk.map(k => k.owner_name))];
  const q = st.q.toLowerCase();
  const list = m.qk.filter(k => (st.owner === 'all' || k.owner_name === st.owner) && (st.status === 'all' || m.evals.get(k.id).status === st.status) && (!q || k.name.toLowerCase().includes(q) || (k.group_name || '').toLowerCase().includes(q)));
  const tracked = m.qk.filter(k => k.target_value != null);
  const sum = summarize(tracked.map(k => m.evals.get(k.id)));
  const card = (label, n, cls, key) => `<button class="kpi-card sc-card ${cls}${st.status === key ? ' sel' : ''}" data-sc-status="${key}"><div class="kpi-label">${label}</div><div class="kpi-val">${n}</div><div class="kpi-sub">of ${tracked.length} KPIs with a target</div></button>`;
  const today = mondayOf(new Date().toISOString().slice(0, 10));
  let rows = ''; let lastOwner = null; let lastGroup = null;
  list.forEach(k => {
    if (k.owner_name !== lastOwner) { rows += `<tr class="sc-owner"><td colspan="${5 + m.weeks.length}">${esc(k.owner_name)}</td></tr>`; lastOwner = k.owner_name; lastGroup = null; }
    if (k.group_name && k.group_name !== lastGroup) { rows += `<tr class="sc-group"><td colspan="${5 + m.weeks.length}">${esc(k.group_name)}</td></tr>`; }
    lastGroup = k.group_name || null;
    const e = m.evals.get(k.id);
    const cells = m.weeks.map(w => {
      const v = e.byWeek.get(w); const has = v && v.value != null;
      const cls = has && k.target_value != null ? CSS_STATUS[weekStatus(k, v.value)] : (has ? 'plain' : 'empty');
      const future = w > today && !has;
      return `<td class="sc-cell ${cls}${future ? ' future' : ''}${admin ? ' edit' : ''}" data-cell="${k.id}" data-week="${w}" ${v?.note ? `title="${esc(v.note)}"` : ''}>${has ? esc(fmtValue(k.unit, v.value)) : '·'}${v?.note ? '<i class="sc-note" aria-hidden="true"></i>' : ''}</td>`;
    }).join('');
    const latest = e.lastWeek ? `<b>${esc(fmtValue(k.unit, e.last))}</b><small>${short(e.lastWeek)}</small>` : '—';
    const qtd = e.qtd != null ? `<span class="sc-qtd ${CSS_STATUS[k.target_value != null ? e.qtdStatus : 'no_data']}">${esc(fmtValue(k.unit, e.qtd))}</span>` : '—';
    rows += `<tr><td class="sc-name"><button class="sc-link" data-kpi-open="${k.id}">${esc(k.name)}</button></td>
      <td class="sc-target">${esc(fmtTarget(k))}</td>
      <td><span class="sc-pill ${CSS_STATUS[e.status]}">${k.target_value == null ? 'Tracked' : STATUS_LABEL[e.status]}</span></td>
      <td class="sc-latest">${latest}</td><td class="sc-qtdcell">${qtd}</td>${cells}</tr>`;
  });
  return `
    <div class="proj-summary sc-summary">${card('On track', sum.on_track, 'on', 'on_track')}${card('At risk', sum.at_risk, 'risk', 'at_risk')}${card('Off track', sum.off_track, 'off', 'off_track')}${card('No data yet', sum.no_data, 'none', 'no_data')}</div>
    <div class="mo-filter"><input type="search" id="scQ" placeholder="Search KPI" value="${esc(st.q)}">
      <select id="scOwner"><option value="all">All owners</option>${owners.map(o => `<option${o === st.owner ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>
      <select id="scStatus"><option value="all">All statuses</option>${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}"${k === st.status ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="mo-note">Status compares the latest reported week with its target: <b>On track</b> ≥ 100%, <b>At risk</b> 90–99%, <b>Off track</b> below 90%. For “lower is better” KPIs (like ad spend) the comparison is reversed. Quarter-to-date uses the figure from the source tool when it was entered, otherwise the running total of summed KPIs. Column dates are the Mondays the numbers were reported.${admin ? ' Click any week to enter or correct a number.' : ''}</div>
    ${list.length ? `<div class="sc-wrap"><table class="sc-table"><thead><tr><th class="sc-name">KPI</th><th>Target</th><th>Status</th><th>Latest</th><th>QTD</th>${m.weeks.map(w => `<th class="sc-wk">${short(w)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div style="color:var(--text3)">No KPIs match these filters.</div>'}`;
}

// ─── Rocks ───────────────────────────────────────────────────────────────
function rocksHtml(m, admin) {
  if (!m.rocksQ.length) return `<div style="color:var(--text3)">No rocks for this quarter yet.${admin ? ' Use “Add rock”.' : ''}</div>`;
  const owners = [...new Set(m.rocksQ.map(r => r.owner_name))];
  const kpiById = new Map(m.kpis.map(k => [k.id, k]));
  return `<div class="mo-note">Rocks are the 2–3 big priorities each person owns for the quarter. The KPIs under each rock are the numbers it should move.</div>
    <div class="rk-grid">${owners.map(o => `<section class="rk-col"><h3>${esc(o)}</h3>${m.rocksQ.filter(r => r.owner_name === o).sort((a, b) => a.position - b.position).map(r => {
      const linked = m.rockKpis.filter(l => l.rock_id === r.id).map(l => kpiById.get(l.kpi_id)).filter(Boolean);
      return `<article class="rk-card"><div class="rk-top"><span class="rk-n">Rock ${r.position}</span>${admin ? `<select data-rock-status="${r.id}" class="rk-status ${r.status}">${Object.entries(ROCK_STATUS).map(([k, l]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="rk-status ${r.status}">${ROCK_STATUS[r.status]}</span>`}</div>
        <h4>${esc(r.title)}</h4><p>${esc(r.tactics || '')}</p>
        ${linked.length ? `<div class="rk-kpis">${linked.map(k => { const e = m.evals.get(k.id); return `<button class="rk-chip ${e ? CSS_STATUS[k.target_value != null ? e.status : 'no_data'] : 'none'}" data-kpi-open="${k.id}">${esc(k.name)}${e?.lastWeek ? ` · ${esc(fmtValue(k.unit, e.last))}` : ''}</button>`; }).join('')}</div>` : ''}
        ${admin ? `<button class="btn btn-sm" data-rock-edit="${r.id}">Edit</button>` : ''}</article>`; }).join('')}</section>`).join('')}</div>`;
}

// ─── Wiring ──────────────────────────────────────────────────────────────
function wire(el, m, admin) {
  el.querySelectorAll('[data-sc-tab]').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.scTab; renderTeamScorecard(); }));
  el.querySelector('#scQuarter')?.addEventListener('change', e => { st.quarter = e.target.value; st.owner = 'all'; renderTeamScorecard(); });
  el.querySelector('#scQ')?.addEventListener('input', e => { st.q = e.target.value; const p = e.target.selectionStart; renderTeamScorecard(); const n = document.getElementById('scQ'); n?.focus(); try { n?.setSelectionRange(p, p); } catch { /* ignore */ } });
  el.querySelector('#scOwner')?.addEventListener('change', e => { st.owner = e.target.value; renderTeamScorecard(); });
  el.querySelector('#scStatus')?.addEventListener('change', e => { st.status = e.target.value; renderTeamScorecard(); });
  el.querySelectorAll('[data-sc-status]').forEach(b => b.addEventListener('click', () => { st.status = st.status === b.dataset.scStatus ? 'all' : b.dataset.scStatus; renderTeamScorecard(); }));
  el.querySelectorAll('[data-kpi-open]').forEach(b => b.addEventListener('click', () => openKpiDetail(b.dataset.kpiOpen)));
  if (!admin) return;
  el.querySelectorAll('[data-cell]').forEach(td => td.addEventListener('click', () => openCellModal(td.dataset.cell, td.dataset.week)));
  el.querySelector('#scAdd')?.addEventListener('click', () => (st.tab === 'rocks' ? openRockModal(null) : openKpiModal(null)));
  el.querySelector('#scNextQ')?.addEventListener('click', async () => {
    const target = nextQuarter(st.quarter);
    if (!confirm(`Start ${target.replace('-', ' ')}? This copies this quarter's KPIs and Rocks (no numbers, Rocks reset to "Not started").`)) return;
    try { const { kpis, rocks, rockKpis } = ctx.get(); st.quarter = await startNextQuarter(st.quarter, kpis, rocks, rockKpis); await ctx.refresh(); }
    catch (e) { alert('Could not start the quarter: ' + (e.message || e)); }
  });
  el.querySelectorAll('[data-rock-status]').forEach(s => s.addEventListener('change', async () => { try { await setRockStatus(s.dataset.rockStatus, s.value); await ctx.refresh(); } catch (e) { alert('Could not save: ' + (e.message || e)); } }));
  el.querySelectorAll('[data-rock-edit]').forEach(b => b.addEventListener('click', () => openRockModal(b.dataset.rockEdit)));
}

// ─── Modals ──────────────────────────────────────────────────────────────
function openBox(html) {
  const box = document.getElementById('modalBox'); const overlay = document.getElementById('modalOverlay'); box.removeAttribute('data-drop-modal');
  box.innerHTML = html; overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');
  box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { box, close, q: s => box.querySelector(s) };
}

function openCellModal(kpiId, week) {
  const m = model(); const k = m.qk.find(x => x.id === kpiId); if (!k) return;
  const v = m.values.find(x => x.kpi_id === kpiId && x.period_start === week) || {};
  const { box, close, q } = openBox(`<div class="modal-header"><h3>${esc(k.name)}</h3><button class="btn btn-sm btn-ghost" data-close>✕</button></div>
    <div class="modal-body">
      <p class="sc-modal-sub">Week reported ${esc(short(week))} · ${esc(fmtTarget(k))}</p>
      <div class="form-grid"><div class="form-row"><label>Value (${k.unit === 'usd' ? '$' : k.unit === 'pct' ? '%' : k.unit === 'ratio' ? 'x' : 'number'})</label><input id="cvVal" type="number" step="any" inputmode="decimal" value="${v.value ?? ''}"></div>
        <div class="form-row"><label>Quarter-to-date (optional)</label><input id="cvQtd" type="number" step="any" inputmode="decimal" value="${v.qtd_value ?? ''}"></div></div>
      <div class="form-row"><label>Note (optional)</label><input id="cvNote" value="${esc(v.note || '')}" placeholder="Where the number came from, or why it moved"></div>
      <div class="sc-preview" id="cvPrev"></div>
      <div class="mo-note">Leave all three fields empty and save to clear this week.</div>
    </div>
    <div class="modal-footer"><button class="btn" data-close>Cancel</button><button class="btn btn-accent" id="cvSave">Save</button></div>`);
  const prev = () => { const val = q('#cvVal').value; const s = val === '' ? 'no_data' : weekStatus(k, Number(val)); q('#cvPrev').innerHTML = k.target_value == null ? '' : `<span class="sc-pill ${CSS_STATUS[s]}">${STATUS_LABEL[s]}</span> against ${esc(fmtValue(k.unit, weeklyTarget(k)))} for the week`; };
  q('#cvVal').addEventListener('input', prev); prev(); q('#cvVal').focus();
  q('#cvSave').addEventListener('click', async () => {
    try { await saveKpiValue(kpiId, week, { value: q('#cvVal').value, qtd_value: q('#cvQtd').value, note: q('#cvNote').value }); close(); await ctx.refresh(); }
    catch (e) { alert('Could not save: ' + (e.message || e)); }
  });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') q('#cvSave').click(); });
}

function chartSvg(k, weeks, byWeek) {
  const pts = weeks.map(w => ({ w, v: byWeek.get(w)?.value })); const nums = pts.filter(p => p.v != null).map(p => Number(p.v));
  if (!nums.length) return '<div style="color:var(--text3);font-size:13px">No numbers yet.</div>';
  const t = weeklyTarget(k); const max = Math.max(...nums, t ?? 0) * 1.12 || 1; const W = 560, H = 150, pad = 22, bw = (W - pad) / weeks.length;
  const y = v => H - 18 - (v / max) * (H - 30);
  const bars = pts.map((p, i) => p.v == null ? '' : `<rect x="${pad + i * bw + 3}" y="${y(Number(p.v))}" width="${bw - 6}" height="${H - 18 - y(Number(p.v))}" rx="3" class="ch-${k.target_value != null ? CSS_STATUS[weekStatus(k, p.v)] : 'plain'}"/>`).join('');
  const labels = pts.map((p, i) => i % 2 === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${short(p.w)}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="sc-chart" role="img" aria-label="Weekly values for ${esc(k.name)}">${bars}${t != null ? `<line x1="${pad}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="ch-target"/><text x="${pad}" y="${y(t) - 4}" class="ch-tl">target ${esc(fmtValue(k.unit, t))}</text>` : ''}${labels}</svg>`;
}

function openKpiDetail(id) {
  const m = model(); const k = m.kpis.find(x => x.id === id); if (!k) return;
  const e = m.evals.get(id) || evaluateKpi(k, m.values.filter(v => v.kpi_id === id), quarterWeeks(k.quarter));
  const weeks = quarterWeeks(k.quarter);
  const rowsH = weeks.filter(w => e.byWeek.get(w)).map(w => { const v = e.byWeek.get(w); const s = v.value != null && k.target_value != null ? weekStatus(k, v.value) : 'no_data';
    return `<tr><td>${short(w)}</td><td><span class="sc-pill ${CSS_STATUS[s]}">${esc(fmtValue(k.unit, v.value))}</span></td><td>${esc(fmtValue(k.unit, v.qtd_value ?? null))}</td><td>${esc(v.note || '')}</td></tr>`; }).join('');
  const { q } = openBox(`<div class="modal-header"><h3>${esc(k.name)}</h3><button class="btn btn-sm btn-ghost" data-close>✕</button></div>
    <div class="modal-body">
      <p class="sc-modal-sub">${esc(k.owner_name)}${k.group_name ? ' · ' + esc(k.group_name) : ''} · ${esc(fmtTarget(k))}${k.source && k.source !== 'manual' ? ` · source: ${esc(k.source)} (entered by hand for now)` : ''}</p>
      <div class="sc-detail-kpis"><div><small>Latest</small><b>${esc(fmtValue(k.unit, e.last))}</b></div><div><small>Status</small><span class="sc-pill ${CSS_STATUS[e.status]}">${k.target_value == null ? 'Tracked' : STATUS_LABEL[e.status]}</span></div><div><small>Quarter to date</small><b>${esc(fmtValue(k.unit, e.qtd))}</b></div></div>
      ${chartSvg(k, weeks, e.byWeek)}
      ${rowsH ? `<table class="sc-detail-table"><thead><tr><th>Week</th><th>Value</th><th>QTD</th><th>Note</th></tr></thead><tbody>${rowsH}</tbody></table>` : ''}
      ${k.note ? `<div class="mo-note">${esc(k.note)}</div>` : ''}
    </div>
    <div class="modal-footer">${ctx.isAdmin() ? '<button class="btn" id="kdEdit" style="margin-right:auto">Edit KPI</button>' : ''}<button class="btn btn-accent" data-close>Close</button></div>`);
  q('#kdEdit')?.addEventListener('click', () => openKpiModal(id));
}

function openKpiModal(id) {
  const m = model(); const k = id ? m.kpis.find(x => x.id === id) : { quarter: st.quarter, name: '', owner_name: m.qk[0]?.owner_name || '', group_name: '', unit: 'count', target_value: '', target_scope: 'week', direction: 'higher', aggregation: 'none', source: 'manual', note: '' };
  const owners = [...new Set(m.kpis.map(x => x.owner_name))];
  const sel = (idn, opts, cur) => `<select id="${idn}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const { close, q } = openBox(`<div class="modal-header"><h3>${id ? 'Edit KPI' : 'Add KPI'} · ${esc(k.quarter.replace('-', ' '))}</h3><button class="btn btn-sm btn-ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="form-row"><label>Name</label><input id="kName" value="${esc(k.name)}" placeholder="e.g. Weekly DTC revenue"></div>
      <div class="form-grid"><div class="form-row"><label>Owner</label><input id="kOwner" list="kOwners" value="${esc(k.owner_name)}"><datalist id="kOwners">${owners.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div>
        <div class="form-row"><label>Group (optional)</label><input id="kGroup" value="${esc(k.group_name || '')}"></div>
        <div class="form-row"><label>Unit</label>${sel('kUnit', [['usd', 'Dollars ($)'], ['pct', 'Percent (%)'], ['ratio', 'Ratio (x)'], ['count', 'Number']], k.unit)}</div>
        <div class="form-row"><label>Target (leave empty to just track)</label><input id="kTarget" type="number" step="any" value="${k.target_value ?? ''}"></div>
        <div class="form-row"><label>Target applies to</label>${sel('kScope', [['week', 'Each week'], ['quarter', 'The whole quarter (paced over 13 weeks)'], ['point', 'A level to reach (e.g. members)']], k.target_scope)}</div>
        <div class="form-row"><label>Better when</label>${sel('kDir', [['higher', 'Higher'], ['lower', 'Lower']], k.direction)}</div>
        <div class="form-row"><label>Quarter-to-date is</label>${sel('kAgg', [['none', 'Typed from the source tool'], ['sum', 'Sum of the weeks'], ['latest', 'Latest value'], ['avg', 'Average']], k.aggregation)}</div>
        <div class="form-row"><label>Data source</label>${sel('kSrc', [['manual', 'Manual'], ['shopify', 'Shopify'], ['klaviyo', 'Klaviyo'], ['meta', 'Meta Ads'], ['google', 'Google Ads'], ['ga4', 'GA4']], k.source || 'manual')}</div></div>
      <div class="form-row"><label>Note (optional)</label><input id="kNote" value="${esc(k.note || '')}"></div>
    </div>
    <div class="modal-footer">${id ? '<button class="btn btn-danger" id="kDel" style="margin-right:auto">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn btn-accent" id="kSave">Save</button></div>`);
  q('#kDel')?.addEventListener('click', async () => { if (confirm('Delete this KPI and all its weekly numbers? This cannot be undone.')) { try { await deleteKpi(id); close(); await ctx.refresh(); } catch (e) { alert('Could not delete: ' + (e.message || e)); } } });
  q('#kSave').addEventListener('click', async () => {
    const row = { quarter: k.quarter, name: q('#kName').value, owner_name: q('#kOwner').value, group_name: q('#kGroup').value, unit: q('#kUnit').value, target_value: q('#kTarget').value, target_scope: q('#kScope').value, direction: q('#kDir').value, aggregation: q('#kAgg').value, source: q('#kSrc').value, note: q('#kNote').value, sort_order: id ? undefined : (Math.max(0, ...m.kpis.map(x => x.sort_order || 0)) + 10) };
    if (!row.name.trim() || !row.owner_name.trim()) return alert('Add a name and an owner.');
    try { await saveKpi(row, id); close(); await ctx.refresh(); } catch (e) { alert('Could not save: ' + (e.message || e)); }
  });
}

function openRockModal(id) {
  const m = model(); const r = id ? m.rocks.find(x => x.id === id) : { quarter: st.quarter, owner_name: '', position: 1, title: '', tactics: '', status: 'not_started' };
  const owners = [...new Set(m.rocks.map(x => x.owner_name))]; const linked = new Set(m.rockKpis.filter(l => l.rock_id === id).map(l => l.kpi_id));
  const { close, q, box } = openBox(`<div class="modal-header"><h3>${id ? 'Edit rock' : 'Add rock'} · ${esc(r.quarter.replace('-', ' '))}</h3><button class="btn btn-sm btn-ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="form-grid"><div class="form-row"><label>Owner</label><input id="rOwner" list="rOwners" value="${esc(r.owner_name)}"><datalist id="rOwners">${owners.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div>
        <div class="form-row"><label>Rock number</label><select id="rPos">${[1, 2, 3, 4].map(n => `<option${n === r.position ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="form-row"><label>Status</label><select id="rStatus">${Object.entries(ROCK_STATUS).map(([k, l]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="form-row"><label>Title</label><input id="rTitle" value="${esc(r.title)}"></div>
      <div class="form-row"><label>Tactics / notes</label><textarea id="rTactics" rows="5">${esc(r.tactics || '')}</textarea></div>
      <div class="form-row"><label>KPIs this rock should move</label><div class="rk-pick">${m.qk.map(k => `<label><input type="checkbox" value="${k.id}"${linked.has(k.id) ? ' checked' : ''}> ${esc(k.name)} <small>${esc(k.owner_name)}</small></label>`).join('')}</div></div>
    </div>
    <div class="modal-footer">${id ? '<button class="btn btn-danger" id="rDel" style="margin-right:auto">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn btn-accent" id="rSave">Save</button></div>`);
  q('#rDel')?.addEventListener('click', async () => { if (confirm('Delete this rock?')) { try { await deleteRock(id); close(); await ctx.refresh(); } catch (e) { alert('Could not delete: ' + (e.message || e)); } } });
  q('#rSave').addEventListener('click', async () => {
    const row = { quarter: r.quarter, owner_name: q('#rOwner').value, position: +q('#rPos').value, title: q('#rTitle').value, tactics: q('#rTactics').value, status: q('#rStatus').value };
    if (!row.title.trim() || !row.owner_name.trim()) return alert('Add an owner and a title.');
    const ids = [...box.querySelectorAll('.rk-pick input:checked')].map(i => i.value);
    try { await saveRock(row, ids, id); close(); await ctx.refresh(); } catch (e) { alert('Could not save: ' + (e.message || e)); }
  });
}
