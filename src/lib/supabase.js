/* ---------------------------------------------------------
   Supabase client — the single connection to the cloud.
   Reads keys from .env (Vite exposes VITE_* to the browser).
--------------------------------------------------------- */
import { createClient } from "@supabase/supabase-js";
import {
  isScopedTable,
  scopeActive,
  currentShopId,
  stampShop,
} from "./shopScope.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Helpful, explicit error instead of a cryptic crash if keys are missing.
export const isConfigured = Boolean(url && anonKey);

/* The project's own address, for the one screen that needs to send somebody to
   the Supabase dashboard — see setupNeeded.js. Not the key, just the URL, which
   is in every request the app makes anyway. */
export const projectUrl = url || "";
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

/* ---------------------------------------------------------
   THE CHOKE POINT — every table read and write narrowed to one shop

   `supabase.from("inventory")` reads every shop the signed-in account belongs to.
   `shopFrom("inventory")` reads the one on the screen. Row level security is what
   stops an account touching a shop it does not work at; this is what stops a
   person who works at both from seeing them mixed together. Those are two
   different promises and the database can only make the first one.

   Everything in api.js that touches a table in SCOPED_TABLES goes through here, so
   there is one line to audit rather than fifty to remember. Anything not scoped —
   profiles, trusted devices, login codes — keeps calling supabase.from directly,
   and that difference is deliberate: a phone is trusted by a person, not by a shop.

   Five methods, listed by hand rather than proxied, because a Proxy over a query
   builder silently forwards a method it has never been tested with. These five are
   the only ones the app uses; a sixth would fail loudly here, which is the right
   place to find out.
--------------------------------------------------------- */
export function shopFrom(table) {
  const q = supabase.from(table);
  if (!isScopedTable(table) || !scopeActive()) return q;
  const id = currentShopId();
  return {
    select: (...a) => q.select(...a).eq("shop_id", id),
    /* No .eq on the way in — the row carries the shop instead, and RLS checks it
       against membership. A filter on an insert would do nothing anyway. */
    insert: (rows, ...a) => q.insert(stampShop(rows, id), ...a),
    upsert: (rows, ...a) => q.upsert(stampShop(rows, id), ...a),
    update: (patch, ...a) => q.update(patch, ...a).eq("shop_id", id),
    delete: (...a) => q.delete(...a).eq("shop_id", id),
  };
}

/* A throwaway client that never persists its session. Used when an admin
   creates a staff account so signing the new user up doesn't replace the
   admin's own session in this browser. */
export function createIsolatedClient() {
  if (!isConfigured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
