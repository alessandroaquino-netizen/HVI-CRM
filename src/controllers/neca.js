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
    source: r.source || 'NECA',
    memberships_count: r.memberships_count || 1,
    locations: r.locations || '',
    chapters: r.chapters || '',
    score_breakdown: Array.isArray(r.score_breakdown) ? r.score_breakdown : [],
    factors_evaluated: r.factors_evaluated != null ? Number(r.factors_evaluated) : 0,
    employee_band: r.employee_band || '',
    top_executive_name: r.top_executive_name || '',
    top_executive_title: r.top_executive_title || '',
    research_sources: r.research_sources || '',
    linked_lead_id: r.linked_lead_id || null,
    suggested_lead_id: r.suggested_lead_id || null,
    suggested_reason: r.suggested_reason || '',
  };
}

// Mirrors neca_recompute() in migration_neca_v2.sql — keep the two in sync.
export function computeNecaScore(breakdown) {
  const evald = breakdown.filter(f => f.status !== 'unverified');
  const max = evald.reduce((a, f) => a + Number(f.max || 0), 0);
  const earned = evald.reduce((a, f) => a + Number(f.earned || 0), 0);
  if (!max) return { score: null, tier: '', evaluated: 0 };
  const score = Math.round(100 * earned / max);
  let tier = score >= 75 ? 'A' : score >= 50 ? 'B' : 'C';
  if (tier === 'A' && !evald.some(f => f.key === 'employees')) tier = 'B'; // A needs size evidence
  return { score, tier, evaluated: evald.length };
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
  const calc = p.score_breakdown?.length ? computeNecaScore(p.score_breakdown) : null;
  const row = {
    qualification_status: p.qualification_status || 'unqualified',
    tier: calc ? (calc.tier || null) : (p.tier || null),
    score: calc ? calc.score : (p.score !== '' && p.score != null ? parseInt(p.score, 10) : null),
    ...(calc ? { score_breakdown: p.score_breakdown, factors_evaluated: calc.evaluated } : {}),
    employee_band: p.employee_band || null,
    top_executive_name: p.top_executive_name || null,
    top_executive_title: p.top_executive_title || null,
    research_sources: p.research_sources || null,
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

// ─── Link with the sales pipeline (nothing is ever moved or removed from the NECA list) ───
export async function linkNecaToLead(necaId, leadId) {
  const a = await supabase.from('neca_leads')
    .update({ linked_lead_id: leadId, suggested_lead_id: null, suggested_reason: null }).eq('id', necaId);
  if (a.error) throw a.error;
  const b = await supabase.from('leads').update({ neca_lead_id: necaId }).eq('id', leadId);
  if (b.error) throw b.error;
  await supabase.rpc('neca_recompute', { p_id: necaId });
}

export async function unlinkNecaFromLead(necaId, leadId) {
  const a = await supabase.from('neca_leads').update({ linked_lead_id: null }).eq('id', necaId);
  if (a.error) throw a.error;
  if (leadId) await supabase.from('leads').update({ neca_lead_id: null }).eq('id', leadId);
  await supabase.rpc('neca_recompute', { p_id: necaId });
}

export async function dismissNecaSuggestion(necaId) {
  const { error } = await supabase.from('neca_leads').update({ suggested_lead_id: null, suggested_reason: null }).eq('id', necaId);
  if (error) throw error;
}

export async function runNecaCrosslink() {
  const { data, error } = await supabase.rpc('neca_crosslink');
  if (error) throw error;
  return (data && data[0]) || { auto_linked: 0, suggestions: 0 };
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
