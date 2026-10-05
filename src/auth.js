import { supabase } from './supabase.js';
import { fetchMyAccess, acceptInvite, getPendingInviteToken, clearPendingInviteToken } from './controllers/users.js';

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN;

// ---------- helpers ----------

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Domain check + invitation/allowlist check. Returns { user, access } or { error }.
export async function authorizeSignedInUser() {
  const user = await getCurrentUser();
  if (!user || !user.email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN.toLowerCase())) {
    return { error: 'Please sign in with your HVI Google account.' };
  }
  const token = getPendingInviteToken();
  if (token) {
    let result;
    try { result = await acceptInvite(token); } catch { result = 'error'; }
    if (result !== 'error') clearPendingInviteToken();
    if (result === 'wrong_account') return { error: 'This invitation was sent to a different email address. Sign in with the Google account the invite was sent to.' };
    if (result === 'invalid')       return { error: 'This invitation link is invalid or no longer exists. Ask an admin for a new one.' };
    if (result === 'disabled')      return { error: 'Your access has been disabled. Contact an administrator.' };
  }
  let access = null;
  try { access = await fetchMyAccess(); } catch { return { error: 'Could not verify your access. Please try again.' }; }
  if (!access)                      return { error: 'Your account has not been invited to this system. Ask an administrator for an invite.' };
  if (access.status === 'invited')  return { error: 'Open the invitation link you were sent to confirm your access.' };
  if (access.status === 'disabled') return { error: 'Your access has been disabled. Contact an administrator.' };
  return { user, access };
}

// ---------- actions ----------

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' },
    },
  });
  return error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ---------- session listener ----------
// Calls onSignIn(user) or onSignOut() as auth state changes.

export function onAuthChange(onSignIn, onSignOut) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { onSignOut(); return; }
    if (event === 'SIGNED_IN') {
      // Deferred: awaiting supabase calls inside this callback can deadlock the auth client.
      setTimeout(async () => {
        const result = await authorizeSignedInUser();
        if (result.error) { await signOut(); onSignOut(result.error); }
        else onSignIn(result.user, result.access);
      }, 0);
    }
  });
}
