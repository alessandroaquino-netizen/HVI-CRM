import { supabase } from '../supabase.js';
import { getMyEmailAddr } from '../access.js';

export async function fetchCalendarEvents() {
  const { data, error } = await supabase.from('dtc_calendar_events').select('*').order('start_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveCalendarEvent(ev, id = null) {
  const row = { label: ev.label.trim(), start_date: ev.start_date, end_date: ev.end_date || null, color: (ev.color || 'FFB500').replace('#', ''), kind: ev.kind || 'promo', show_band: !!ev.show_band };
  if (id) { const { error } = await supabase.from('dtc_calendar_events').update(row).eq('id', id); if (error) throw error; return id; }
  const { data, error } = await supabase.from('dtc_calendar_events').insert({ ...row, created_by: getMyEmailAddr() }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteCalendarEvent(id) {
  const { error } = await supabase.from('dtc_calendar_events').delete().eq('id', id);
  if (error) throw error;
}
