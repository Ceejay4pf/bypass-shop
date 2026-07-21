/* ---------------------------------------------------------
   Supabase client — the single connection to the cloud.
   Reads keys from .env (Vite exposes VITE_* to the browser).
--------------------------------------------------------- */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Helpful, explicit error instead of a cryptic crash if keys are missing.
export const isConfigured = Boolean(url && anonKey);
if (!isConfigured) {
  console.warn(
    "[Bypass Shop] Supabase keys missing. Create a .env file from .env.example."
  );
}

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;
