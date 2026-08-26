import { supabase } from '../supabase.js';
import { PROJECT_STAGES } from './projects.js';

// ---------- field mapping ----------

function rowToStageDate(r) {
  return {
    id:               r.id,
    project_id:       r.project_id,
    stage:            r.stage,
    start_date:       r.start_date       || '',
    planned_end_date: r.planned_end_date || '',
    actual_end_date:  r.actual_end_date  || '',
    status:           r.status           || 'To be Started',
    assignee:         r.assignee         || '',
    updated_at:       r.updated_at       || '',
  };
}

function rowToActivity(r) {
  return {
    id:         r.id,
    project_id: r.project_id,
    stage:      r.stage,
    event_type: r.event_type || 'comment',
    comment:    r.comment || '',
    date_value: r.date_value || '',
    created_at: r.created_at,
    created_by: r.created_by || '',
  };
}

// ---------- stage dates ----------

export async function fetchStageDates() {
  const { data, error } = await supabase.from('project_stage_dates').select('*');
  if (error) throw error;
  return (data || []).map(rowToStageDate);
}

export function stageDatesForProject(allStageDates, projectId) {
  return allStageDates.filter(d => d.project_id === projectId);
}

// rows: [{ stage, start_date, planned_end_date, actual_end_date, status, assignee }]
export async function saveStageDates(projectId, rows) {
  const payload = rows.map(r => ({
    project_id:       projectId,
    stage:            r.stage,
    start_date:       r.start_date       || null,
    planned_end_date: r.planned_end_date || null,
    actual_end_date:  r.actual_end_date  || null,
    status:           r.status           || 'To be Started',
    assignee:         r.assignee         || null,
    updated_at:       new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('project_stage_dates')
    .upsert(payload, { onConflict: 'project_id,stage' });
  if (error) throw error;
}

export function subscribeToStageDates(onChange) {
  return supabase
    .channel('project-stage-dates-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_stage_dates' }, onChange)
    .subscribe();
}

// ---------- activity log ----------

export async function fetchActivity() {
  const { data, error } = await supabase
    .from('project_activity')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToActivity);
}

export function activityForProject(allActivity, projectId) {
  return allActivity.filter(a => a.project_id === projectId);
}

export async function addActivity(projectId, { stage = null, comment, date_value = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('project_activity').insert({
    project_id: projectId,
    stage,
    event_type: 'comment',
    comment,
    date_value,
    created_by: user?.email || null,
  });
  if (error) throw error;
}

export async function logStageChange(projectId, stage) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('project_activity').insert({
    project_id: projectId,
    stage,
    event_type: 'stage_change',
    comment: `Moved to stage ${stage}`,
    created_by: user?.email || null,
  });
  if (error) throw error;
}

export function subscribeToActivity(onChange) {
  return supabase
    .channel('project-activity-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_activity' }, onChange)
    .subscribe();
}

// ---------- analytics helpers (used by the B2B Projects dashboard) ----------

// Average days spent in each stage, derived from consecutive stage_change timestamps
// per project. Returns { [stageNumber]: avgDays } — only stages with data are included.
export function avgDaysPerStage(activity) {
  const byProject = {};
  activity
    .filter(a => a.event_type === 'stage_change')
    .forEach(a => {
      (byProject[a.project_id] ||= []).push(a);
    });

  const durations = {}; // stage -> [days...]
  Object.values(byProject).forEach(entries => {
    entries.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < entries.length; i++) {
      const prevStage = entries[i - 1].stage;
      const days = (new Date(entries[i].created_at) - new Date(entries[i - 1].created_at)) / 86400000;
      (durations[prevStage] ||= []).push(days);
    }
  });

  const avg = {};
  Object.entries(durations).forEach(([stage, days]) => {
    avg[stage] = days.reduce((a, b) => a + b, 0) / days.length;
  });
  return avg;
}

// Average total days from first recorded stage_change to reaching stage 14, across
// projects that have a logged transition into stage 14.
export function avgCompletionDays(activity) {
  const byProject = {};
  activity
    .filter(a => a.event_type === 'stage_change')
    .forEach(a => {
      (byProject[a.project_id] ||= []).push(a);
    });

  const totals = [];
  Object.values(byProject).forEach(entries => {
    entries.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const last = entries[entries.length - 1];
    if (last.stage === 14) {
      const days = (new Date(last.created_at) - new Date(entries[0].created_at)) / 86400000;
      totals.push(days);
    }
  });

  return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
}

// Planned vs. actual variance in days (actual_end_date − planned_end_date), averaged per phase.
// Only stages with both dates set are counted. Returns { [phaseNumber]: { compared, avgVarianceDays } }.
export function plannedVsActualByPhase(stageDates) {
  const byPhase = {};
  stageDates.forEach(d => {
    if (!d.planned_end_date || !d.actual_end_date) return;
    const stageDef = PROJECT_STAGES.find(s => s.n === d.stage);
    if (!stageDef) return;
    const varianceDays = (new Date(d.actual_end_date) - new Date(d.planned_end_date)) / 86400000;
    const p = (byPhase[stageDef.phase] ||= { compared: 0, totalVarianceDays: 0 });
    p.compared += 1;
    p.totalVarianceDays += varianceDays;
  });
  const result = {};
  Object.entries(byPhase).forEach(([phase, p]) => {
    result[phase] = { compared: p.compared, avgVarianceDays: p.totalVarianceDays / p.compared };
  });
  return result;
}
