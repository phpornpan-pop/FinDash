// Persistence layer for the net worth ledger.
//
// Primary store: a Supabase Postgres table ("ledger_data"), one JSON row per
// signed-in user (see ../../supabase/schema.sql for the table + security
// setup). Fallback / offline cache: the browser's localStorage, so the app
// still works before Supabase is configured, or if a request fails.
//
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in a `.env` file
// (see .env.example) to enable the Supabase backend.

import { supabase, hasSupabase } from "./supabaseClient.js";

const LOCAL_KEY = "networth-ledger:data";

export { hasSupabase };

// userId is null when Supabase isn't configured or nobody is signed in yet -
// in that case we just use the local browser cache.
export async function loadData(userId) {
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ledger_data")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (data && data.data) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data.data));
        return { data: data.data, source: "supabase" };
      }
      // signed in, but no saved row yet - genuinely fresh, not an error
      return { data: null, source: "supabase" };
    } catch (e) {
      // network / RLS / config issue - fall back to local cache below
    }
  }

  const raw = localStorage.getItem(LOCAL_KEY);
  if (raw) {
    try {
      return { data: JSON.parse(raw), source: userId ? "local-fallback" : "local" };
    } catch (e) {
      // corrupted cache, ignore
    }
  }

  return { data: null, source: "none" };
}

export async function saveData(userId, data) {
  // always keep a local copy so nothing is lost even if the remote call fails
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage full or unavailable - remote save below is still attempted
  }

  if (!supabase || !userId) {
    return { ok: true, source: "local-only" };
  }

  try {
    const { error } = await supabase
      .from("ledger_data")
      .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true, source: "supabase" };
  } catch (e) {
    return { ok: false, source: "local-only", error: e };
  }
}
