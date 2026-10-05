import { supabase } from '../supabase.js';

export async function fetchMyAccess() {
  const { data, error } = await supabase.rpc('get_my_access');
  if (error) throw error;
  return (data && data[0]) || null;
}

export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error) throw error;
  return data;
}

export async function fetchAppUsers() {
  const { data, error } = await supabase.from('app_users').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function inviteUser({ email, full_name, role, pages }, invitedBy) {
  const { error } = await supabase.from('app_users').insert({
    email: email.trim().toLowerCase(),
    full_name: full_name?.trim() || null,
    role,
    pages: role === 'admin' ? [] : pages,
    status: 'invited',
    invited_by: invitedBy,
  });
  if (error) throw error;
}

export async function updateAppUser(id, { full_name, role, pages }) {
  const { error } = await supabase.from('app_users')
    .update({ full_name: full_name?.trim() || null, role, pages: role === 'admin' ? [] : pages })
    .eq('id', id);
  if (error) throw error;
}

export async function setAppUserStatus(id, status) {
  const { error } = await supabase.from('app_users').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteAppUser(id) {
  const { error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) throw error;
}

// ─── Invite token handoff across the Google OAuth redirect ────────────────
const TOKEN_KEY = 'hvi_invite_token';

export function captureInviteTokenFromUrl() {
  const token = new URLSearchParams(window.location.search).get('invite');
  if (!token) return null;
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  window.history.replaceState({}, '', window.location.pathname);
  return token;
}
export function getPendingInviteToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function clearPendingInviteToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function inviteLink(token) {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

export function inviteMailto(user) {
  const link = inviteLink(user.invite_token);
  const subject = 'You have been invited to the HVI CRM';
  const body = `Hi${user.full_name ? ' ' + user.full_name.split(' ')[0] : ''},\n\nYou have been invited to the High Voltage Industries CRM. ` +
    `Open the link below and sign in with your @highvoltageindustries.com Google account to confirm your access:\n\n${link}\n`;
  return `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
