import { supabase } from '../supabase.js';
import { getMyEmailAddr } from '../access.js';
import { nextQuarter } from '../kpi/status.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

export async function fetchKpiData() {
  const [kpis, values, rocks, links] = await Promise.all([
    supabase.from('kpis').select('*').order('sort_order', { ascending: true }).then(must),
    supabase.from('kpi_values').select('*').then(must),
    supabase.from('rocks').select('*').order('position', { ascending: true }).then(must),
    supabase.from('rock_kpis').select('*').then(must),
  ]);
  return { kpis: kpis || [], values: values || [], rocks: rocks || [], rockKpis: links || [] };
}

const numOrNull = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

/** Saves one week of one KPI; clearing both numbers and the note removes the row. */
export async function saveKpiValue(kpiId, weekStart, { value, qtd_value, note }) {
  const row = { value: numOrNull(value), qtd_value: numOrNull(qtd_value), note: (note || '').trim() || null };
  if (row.value == null && row.qtd_value == null && !row.note) {
    return must(await supabase.from('kpi_values').delete().eq('kpi_id', kpiId).eq('period_start', weekStart));
  }
  must(await supabase.from('kpi_values').upsert({ kpi_id: kpiId, period_start: weekStart, ...row, updated_by: getMyEmailAddr(), updated_at: new Date().toISOString() }, { onConflict: 'kpi_id,period_start' }));
}

export async function saveKpi(k, id = null) {
  const row = {
    quarter: k.quarter, name: k.name.trim(), owner_name: k.owner_name.trim(), group_name: (k.group_name || '').trim() || null,
    unit: k.unit, target_value: numOrNull(k.target_value), target_scope: k.target_scope, direction: k.direction, aggregation: k.aggregation,
    source: k.source || 'manual', note: (k.note || '').trim() || null, active: k.active !== false,
  };
  if (id) { must(await supabase.from('kpis').update(row).eq('id', id)); return id; }
  const data = must(await supabase.from('kpis').insert({ ...row, sort_order: (k.sort_order ?? 9999) }).select('id').single());
  return data.id;
}
export async function deleteKpi(id) { must(await supabase.from('kpis').delete().eq('id', id)); }

export async function saveRock(r, kpiIds, id = null) {
  const row = { quarter: r.quarter, owner_name: r.owner_name.trim(), position: r.position || 1, title: r.title.trim(), tactics: (r.tactics || '').trim() || null, status: r.status, updated_by: getMyEmailAddr(), updated_at: new Date().toISOString() };
  let rockId = id;
  if (id) must(await supabase.from('rocks').update(row).eq('id', id));
  else rockId = must(await supabase.from('rocks').insert(row).select('id').single()).id;
  if (kpiIds) {
    must(await supabase.from('rock_kpis').delete().eq('rock_id', rockId));
    if (kpiIds.length) must(await supabase.from('rock_kpis').insert(kpiIds.map(kpi_id => ({ rock_id: rockId, kpi_id }))));
  }
  return rockId;
}
export async function setRockStatus(id, status) {
  must(await supabase.from('rocks').update({ status, updated_by: getMyEmailAddr(), updated_at: new Date().toISOString() }).eq('id', id));
}
export async function deleteRock(id) { must(await supabase.from('rocks').delete().eq('id', id)); }

/** Starts the next quarter with the same KPI definitions and Rocks (no values, Rocks reset to "not started"). */
export async function startNextQuarter(quarter, kpis, rocks, rockKpis) {
  const target = nextQuarter(quarter);
  const src = kpis.filter(k => k.quarter === quarter && k.active);
  if (!src.length) throw new Error('Nothing to copy.');
  const inserted = must(await supabase.from('kpis').insert(src.map(({ id, seed_key, created_at, ...rest }) => ({ ...rest, quarter: target }))).select('id,name,owner_name,group_name,sort_order'));
  const newKpi = new Map(); // old id → new id, matched on name + owner
  src.forEach(k => { const m = inserted.find(x => x.name === k.name && x.owner_name === k.owner_name); if (m) newKpi.set(k.id, m.id); });
  const rsrc = rocks.filter(r => r.quarter === quarter);
  if (rsrc.length) {
    const ins = must(await supabase.from('rocks').insert(rsrc.map(({ id, seed_key, created_at, updated_at, updated_by, ...rest }) => ({ ...rest, quarter: target, status: 'not_started' }))).select('id,owner_name,position,title'));
    const links = [];
    rsrc.forEach(r => { const n = ins.find(x => x.title === r.title && x.owner_name === r.owner_name); if (n) rockKpis.filter(l => l.rock_id === r.id && newKpi.has(l.kpi_id)).forEach(l => links.push({ rock_id: n.id, kpi_id: newKpi.get(l.kpi_id) })); });
    if (links.length) must(await supabase.from('rock_kpis').insert(links));
  }
  return target;
}
