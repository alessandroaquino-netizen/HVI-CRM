import { supabase } from '../supabase.js';

// ---------- field mapping ----------

function rowToActivity(r) {
  return {
    id:           r.id,
    lead_id:      r.lead_id,
    event_type:   r.event_type || 'comment',
    comment:      r.comment || '',
    touch_number: r.touch_number,
    created_at:   r.created_at,
    created_by:   r.created_by || '',
  };
}

// ---------- activity log ----------

export async function fetchActivity() {
  const { data, error } = await supabase
    .from('lead_activity')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToActivity);
}

export function activityForLead(allActivity, leadId) {
  return allActivity.filter(a => a.lead_id === leadId);
}

export async function addActivity(leadId, { comment, touch_number = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('lead_activity').insert({
    lead_id: leadId,
    event_type: 'comment',
    comment,
    touch_number,
    created_by: user?.email || null,
  });
  if (error) throw error;
}

export async function logStageChange(leadId, stage) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('lead_activity').insert({
    lead_id: leadId,
    event_type: 'stage_change',
    comment: `Moved to ${stage}`,
    created_by: user?.email || null,
  });
  if (error) throw error;
}

export function subscribeToActivity(onChange) {
  return supabase
    .channel('lead-activity-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_activity' }, onChange)
    .subscribe();
}
