// Scorecard maths: weeks of a quarter, targets, status, quarter-to-date. Pure functions (tested in scripts/test-kpi.mjs).

export const ON_TRACK = 1.0;   // at or above 100% of the target
export const AT_RISK  = 0.9;   // 90–99% = at risk, below = off track

const MS_DAY = 86400000;
const iso = d => d.toISOString().slice(0, 10);
const utc = s => new Date(s + 'T00:00:00Z');
export const addDays = (s, n) => iso(new Date(utc(s).getTime() + n * MS_DAY));

/** '2026-Q4' → ISO start date of the quarter ('2026-10-01') */
export function quarterStart(q) {
  const m = /^(\d{4})-Q([1-4])$/.exec(q); if (!m) throw new Error('Bad quarter: ' + q);
  return `${m[1]}-${String((+m[2] - 1) * 3 + 1).padStart(2, '0')}-01`;
}
export const nextQuarter = q => { const [y, n] = [+q.slice(0, 4), +q.slice(-1)]; return n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`; };
export const currentQuarter = (today = iso(new Date())) => `${today.slice(0, 4)}-Q${Math.floor((+today.slice(5, 7) - 1) / 3) + 1}`;

/** The 13 Mondays a quarter is tracked in: the first Monday on/after the quarter start, then every 7 days. */
export function quarterWeeks(q) {
  const s = quarterStart(q); const dow = utc(s).getUTCDay();           // 0 = Sunday
  const first = addDays(s, (8 - dow) % 7);
  return Array.from({ length: 13 }, (_, i) => addDays(first, i * 7));
}
export const mondayOf = d => { const dow = utc(d).getUTCDay(); return addDays(d, -((dow + 6) % 7)); };

/** Goal for one week. Quarter goals are paced evenly over the 13 weeks. */
export function weeklyTarget(k) {
  if (k.target_value == null) return null;
  return k.target_scope === 'quarter' ? k.target_value / 13 : Number(k.target_value);
}

/** Goal for the quarter-to-date after `weeksElapsed` weeks (only meaningful for summed KPIs). */
export function qtdTarget(k, weeksElapsed) {
  if (k.target_value == null) return null;
  if (k.aggregation === 'sum') return k.target_scope === 'quarter' ? k.target_value * weeksElapsed / 13 : k.target_value * weeksElapsed;
  return Number(k.target_value);
}

/** ratio > 1 means "better than target", whichever direction is good. */
export function ratio(k, value, target) {
  if (value == null || target == null || value === '' || target === '') return null;
  const v = Number(value), t = Number(target);
  if (k.direction === 'lower') return v <= 0 ? Infinity : t / v;
  return t === 0 ? Infinity : v / t;
}
export function statusOf(r) {
  if (r == null) return 'no_data';
  return r >= ON_TRACK ? 'on_track' : r >= AT_RISK ? 'at_risk' : 'off_track';
}
export const STATUS_LABEL = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track', no_data: 'No data' };

/** Week status of one KPI value. */
export const weekStatus = (k, value) => statusOf(ratio(k, value, weeklyTarget(k)));

/** Quarter-to-date number as of a week. Summed KPIs add up the weeks that were entered (nobody types the total), averaged KPIs
 *  average them, "latest" KPIs (levels like members or LTV) use the newest value. Only the remaining kind uses the figure typed
 *  from the source tool. */
export function qtdValue(k, valuesByWeek, week) {
  const upTo = [...valuesByWeek].filter(([w, row]) => w <= week && row.value != null).sort((a, b) => a[0].localeCompare(b[0]));
  if (k.aggregation === 'sum') return upTo.length ? upTo.reduce((a, [, r]) => a + Number(r.value), 0) : null;
  if (k.aggregation === 'avg') return upTo.length ? upTo.reduce((a, [, r]) => a + Number(r.value), 0) / upTo.length : null;
  if (k.aggregation === 'latest') return upTo.length ? Number(upTo[upTo.length - 1][1].value) : null;
  const v = valuesByWeek.get(week);
  return v && v.qtd_value != null ? Number(v.qtd_value) : null;
}

/** Everything the scorecard shows for one KPI.
 *  `status` is the overall status: quarter-to-date against the quarter-to-date target (so one low week does not turn a
 *  good quarter red). KPIs that are a level, or have no quarter-to-date figure, use their latest week. `lastStatus` is the latest week alone. */
export function evaluateKpi(k, values, weeks) {
  const byWeek = new Map(values.map(v => [v.period_start, v]));
  let lastWeek = null;
  for (const w of weeks) if (byWeek.get(w)?.value != null) lastWeek = w;
  const last = lastWeek ? Number(byWeek.get(lastWeek).value) : null;
  const lastStatus = lastWeek ? weekStatus(k, last) : 'no_data';
  let qtd = null, qtdStatus = 'no_data';
  if (lastWeek) {
    qtd = qtdValue(k, byWeek, lastWeek);
    const elapsed = weeks.indexOf(lastWeek) + 1;
    if (qtd != null) qtdStatus = statusOf(ratio(k, qtd, qtdTarget(k, elapsed)));
  }
  const usesQtd = qtd != null && k.aggregation !== 'latest';
  return { byWeek, lastWeek, last, lastStatus, status: usesQtd ? qtdStatus : lastStatus, basis: usesQtd ? 'qtd' : 'latest', qtd, qtdStatus, weeklyTarget: weeklyTarget(k) };
}

export function summarize(evals) {
  const out = { on_track: 0, at_risk: 0, off_track: 0, no_data: 0 };
  evals.forEach(e => { out[e.status]++; });
  return out;
}

// ─── Formatting ───────────────────────────────────────────────────────────
export function fmtValue(unit, v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (unit === 'usd') return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
  if (unit === 'pct') return n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
  if (unit === 'ratio') return n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'x';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
export function fmtTarget(k) {
  if (k.target_value == null) return 'No target';
  const sign = k.direction === 'lower' ? '≤ ' : '≥ ';
  const per = k.target_scope === 'week' ? ' / week' : k.target_scope === 'quarter' ? ' / quarter' : '';
  return sign + fmtValue(k.unit, k.target_value) + per;
}
