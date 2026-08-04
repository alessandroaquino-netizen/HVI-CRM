import { supabase } from './supabase.js';

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN;

// ---------- helpers ----------

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function isAllowedUser() {
  const user = await getCurrentUser();
  return !!user && user.email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN.toLowerCase());
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
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      onSignOut();
      return;
    }
    if (event === 'SIGNED_IN') {
      if (await isAllowedUser()) {
        const user = await getCurrentUser();
        onSignIn(user);
      } else {
        await signOut();
        onSignOut('Please sign in with your HVI Google account.');
      }
    }
  });
}
