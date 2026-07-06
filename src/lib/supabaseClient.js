// Supabase client setup.
//
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from `.env` (see
// .env.example). If either is missing, `supabase` is null and the rest of
// the app falls back to browser-only localStorage - so the project still
// works before you've set up a Supabase project.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export function hasSupabase() {
  return Boolean(supabase);
}
