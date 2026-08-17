import { supabase } from '../supabase.js';

// ---------- field mapping ----------

export function rowToLead(r) {
  return {
    id:           r.id,
    company:      r.company      || '',
    contact:      r.contact      || '',
    title:        r.title        || '',
    phone:        r.phone        || '',
    email:        r.email        || '',
    segment:      r.segment      || '',
    stage:        r.stage        || 'Prospect',
    disc:         r.disc         || '',
    est:          r.est    != null ? String(r.est)   : '',
    units:        r.units  != null ? String(r.units) : '',
    proposalDate: r.proposal_date  || '',
    followupDate: r.followup_date  || '',
    followupNote: r.followup_note  || '',
    lastActivity: r.last_activity  || '',
    notes:        r.notes          || '',
    collected:    r.collected != null ? String(r.collected) : '',
    stage_changed_at: r.stage_changed_at || '',
  };
}

function leadToRow(l) {
  return {
    company:       l.company      || null,
    contact:       l.contact      || null,
    title:         l.title        || null,
    phone:         l.phone        || null,
    email:         l.email        || null,
    segment:       l.segment      || null,
    stage:         l.stage        || 'Prospect',
    disc:          l.disc         || null,
    est:           l.est   !== '' && l.est   != null ? parseFloat(l.est)    : null,
    units:         l.units !== '' && l.units != null ? parseInt(l.units, 10): null,
    proposal_date: l.proposalDate || null,
    followup_date: l.followupDate || null,
    followup_note: l.followupNote || null,
    last_activity:    l.lastActivity || todayStr(),
    notes:            l.notes        || null,
    collected:        l.collected !== '' && l.collected != null ? parseFloat(l.collected) : null,
    stage_changed_at: l.stage_changed_at || null,
  };
}

// ---------- utilities ----------

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function followupStatus(lead) {
  if (!lead.followupDate) return null;
  if (['Closed Won', 'Closed Lost', 'Not Qualified'].includes(lead.stage)) return null;
  const today = todayStr();
  if (lead.followupDate < today)  return 'overdue';
  if (lead.followupDate === today) return 'today';
  return 'upcoming';
}

// ---------- CRUD ----------

export async function fetchLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(rowToLead);
}

export async function saveLead(lead, editingId = null) {
  const row = leadToRow({ ...lead, lastActivity: todayStr() });

  if (editingId) {
    const { error } = await supabase.from('leads').update(row).eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('leads').insert(row);
    if (error) throw error;
  }
}

export async function updateStage(id, stage) {
  const { error } = await supabase
    .from('leads')
    .update({ stage, last_activity: todayStr() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLead(id) {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// ---------- realtime ----------

export function subscribeToLeads(supabaseClient, onChange) {
  return supabaseClient
    .channel('leads-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, onChange)
    .subscribe();
}
