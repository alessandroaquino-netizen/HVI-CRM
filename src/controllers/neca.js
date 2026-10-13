import { supabase } from '../supabase.js';

const PAGE = 1000; // Supabase returns at most 1000 rows per request

export function rowToNecaLead(r) {
  return {
    id: r.id,
    neca_member_id: r.neca_member_id || '',
    company: r.company || '',
    address: r.address || '',
    city: r.city || '',
    state: r.state || '',
    zip: r.zip || '',
    website: r.website || '',
    chapter: r.chapter || '',
    division: r.division || '',
    qualification_status: r.qualification_status || 'unqualified',
    tier: r.tier || '',
    score: r.score != null ? Number(r.score) : null,
    score_rationale: r.score_rationale || '',
    buying_signals: r.buying_signals || '',
    suggested_angle: r.suggested_angle || '',
    instagram: r.instagram || '',
    employee_estimate: r.employee_estimate || '',
    contacts: Array.isArray(r.contacts) ? r.contacts : [],
    outreach_status: r.outreach_status || 'not_contacted',
    last_contacted_at: r.last_contacted_at || '',
    notes: r.notes || '',
  };
}

export async function fetchNecaLeads() {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('neca_leads').select('*')
      .order('company', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all.map(rowToNecaLead);
}

export async function updateNecaLead(id, p) {
  const row = {
    qualification_status: p.qualification_status || 'unqualified',
    tier: p.tier || null,
    score: p.score !== '' && p.score != null ? parseInt(p.score, 10) : null,
    score_rationale: p.score_rationale || null,
    buying_signals: p.buying_signals || null,
    suggested_angle: p.suggested_angle || null,
    instagram: p.instagram || null,
    employee_estimate: p.employee_estimate || null,
    website: p.website || null,
    contacts: p.contacts || [],
    outreach_status: p.outreach_status || 'not_contacted',
    last_contacted_at: p.last_contacted_at || null,
    notes: p.notes || null,
  };
  const { error } = await supabase.from('neca_leads').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteNecaLead(id) {
  const { error } = await supabase.from('neca_leads').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeToNecaLeads(client, onChange) {
  return client.channel('neca-leads-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'neca_leads' }, onChange)
    .subscribe();
}
