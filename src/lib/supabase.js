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

/* ---------------------------------------------------------
   THE SAME CHOKE POINT, FOR THE DATABASE FUNCTIONS

   shopFrom() covers the tables. It does not cover the seven functions that hand
   out a number or move a quantity, and those need the shop just as much.

   Each of them has two forms: one that takes the shop, and an older one that works
   it out with my_one_shop(). The older form is exactly right for the twenty-odd
   accounts that belong to one shop, and it RAISES rather than guesses for an
   account that belongs to two — which is every admin here, now that there is more
   than one shop. At the counter that reads:

     "No shop was given for this number, and this account belongs to more than one
      shop. Open the shop you meant and try again."

   — on a fifty-line paste that then saved nothing. The account WAS in the right
   shop; nobody had told the function which one, and it refused to guess. Refusing
   was correct. Not telling it was the bug, and it was ours.

   So the shop on the screen goes in, the same one shopFrom() reads with. If the
   p_shop form is not in the database yet (multishop/04 not pasted), the call is
   retried in the old form — which is the right answer on a database that still has
   one shop, and is the same fallback place_customer_order already uses.

   Listed by hand, like the five methods above, for the same reason: a function
   added later that quietly resolves its own shop is a bug nobody sees.
--------------------------------------------------------- */
const SHOP_ARG_FUNCTIONS = new Set([
  "next_inventory_serial",   // the serial inside a new part's code
  "next_quote_number",
  "next_receipt_number",
  "add_stock",
  "sell_item",
  "set_qty",
  "staff_activity_summary",  // per-shop overload; see multishop/11
]);

/* Not "function not found" in general — specifically PostgREST failing to resolve
   an overload by the argument names given. Kept here rather than imported from
   api.js because api.js imports this file, and a circle between the two would be
   a worse problem than a repeated three-line predicate. */
const overloadMissing = (e) =>
  e?.code === "PGRST202" ||
  /could not find the function|does not exist|no function matches/i.test(e?.message || "");

export async function shopRpc(fn, args = {}) {
  if (!SHOP_ARG_FUNCTIONS.has(fn) || !scopeActive()) return supabase.rpc(fn, args);
  const res = await supabase.rpc(fn, { ...args, p_shop: currentShopId() });
  if (res.error && overloadMissing(res.error)) return supabase.rpc(fn, args);
  return res;
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
