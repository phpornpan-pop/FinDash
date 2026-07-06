// Thin wrapper around Supabase Auth. Every function is a no-op / safe default
// if Supabase isn't configured, so the rest of the app doesn't need to check
// hasSupabase() everywhere.

import { supabase } from "./supabaseClient.js";

export async function signUp(email, password) {
  if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email, password) {
  if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return { error: null };
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// returns an unsubscribe function
export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => listener.subscription.unsubscribe();
}
