// ─── Stage definitions ────────────────────────────────────────────────────

export const PROJECT_STAGES = [
  { n: 1,  label: 'Agreement Signed',         type: 'milestone', phase: 1, sla: null },
  { n: 2,  label: '20% Deposit Collected',    type: 'payment',   phase: 1, sla: 3   },
  { n: 3,  label: 'Design Call',              type: 'step',      phase: 2, sla: 7   },
  { n: 4,  label: 'Design Draft Delivered',   type: 'step',      phase: 2, sla: 21  },
  { n: 5,  label: 'Design Approved',          type: 'milestone', phase: 2, sla: 7   },
  { n: 6,  label: '50% Midpoint Payment',     type: 'payment',   phase: 2, sla: 3   },
  { n: 7,  label: 'Sample Production Begins', type: 'step',      phase: 3, sla: 21  },
  { n: 8,  label: 'Sample Delivered',         type: 'step',      phase: 3, sla: 3   },
  { n: 9,  label: 'Sample Revision',          type: 'step',      phase: 3, sla: 7   },
  { n: 10, label: 'Sample Approved',          type: 'milestone', phase: 3, sla: 3   },
  { n: 11, label: 'Final Payment Collected',  type: 'payment',   phase: 3, sla: 3   },
  { n: 12, label: 'Full Production Run',      type: 'step',      phase: 4, sla: 42  },
  { n: 13, label: 'Order Ships',              type: 'step',      phase: 4, sla: 3   },
  { n: 14, label: 'Follow-up / Reorder',      type: 'step',      phase: 4, sla: null },
];

export const PHASES = [
  { n: 1, label: 'Contract & Deposit', color: 'F0C040' },
  { n: 2, label: 'Design',             color: '5B9CF6' },
  { n: 3, label: 'Sample',             color: '9B7FE8' },
  { n: 4, label: 'Production',         color: '4CAF7D' },
];

// Days a project has been sitting at current stage
export function daysAtStage(project) {
  if (!project.stage_changed_at) return 0;
  const changed = new Date(project.stage_changed_at);
  const now = new Date();
  return Math.floor((now - changed) / 86400000);
}

export function stageStatus(project) {
  const stage = PROJECT_STAGES.find(s => s.n === project.stage);
  if (!stage || !stage.sla) return 'ok';
  const days = daysAtStage(project);
  if (days > stage.sla) return 'overdue';
  if (days > stage.sla * 0.75) return 'at-risk';
  return 'ok';
}

// ─── DB mapping ───────────────────────────────────────────────────────────

export function rowToProject(r) {
  return {
    id:              r.id,
    lead_id:         r.lead_id          || null,
    company:         r.company          || '',
    contact:         r.contact          || '',
    stage:           r.stage            || 1,
    est_value:       r.est_value   != null ? Number(r.est_value)   : null,
    collected:       r.collected   != null ? Number(r.collected)   : 0,
    deposit_20_paid: r.deposit_20_paid  || false,
    payment_50_paid: r.payment_50_paid  || false,
    final_paid:      r.final_paid       || false,
    notes:           r.notes            || '',
    stage_changed_at: r.stage_changed_at || '',
    last_activity:   r.last_activity    || '',
    created_at:      r.created_at       || '',
  };
}

function projectToRow(p) {
  return {
    lead_id:         p.lead_id         || null,
    company:         p.company         || null,
    contact:         p.contact         || null,
    stage:           p.stage           || 1,
    est_value:       p.est_value != null && p.est_value !== '' ? parseFloat(p.est_value) : null,
    collected:       p.collected != null && p.collected !== '' ? parseFloat(p.collected) : 0,
    deposit_20_paid: !!p.deposit_20_paid,
    payment_50_paid: !!p.payment_50_paid,
    final_paid:      !!p.final_paid,
    notes:           p.notes           || null,
    stage_changed_at: p.stage_changed_at || new Date().toISOString().slice(0,10),
    last_activity:   new Date().toISOString().slice(0,10),
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

import { supabase } from '../supabase.js';

export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToProject);
}

export async function saveProject(project, editingId = null) {
  const row = projectToRow(project);
  if (editingId) {
    const { error } = await supabase.from('projects').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('projects').insert(row);
    if (error) throw error;
  }
}

export async function updateProjectStage(id, stage) {
  const { error } = await supabase.from('projects').update({
    stage,
    stage_changed_at: new Date().toISOString().slice(0,10),
    last_activity:    new Date().toISOString().slice(0,10),
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeToProjects(onChange) {
  return supabase
    .channel('projects-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, onChange)
    .subscribe();
}
