/* ---------------------------------------------------------
   THE ONLY FILE ALLOWED TO LOOK ACROSS THE SHOPS

   Everything else that reads shop data goes through `shopFrom` in supabase.js, which
   narrows every query to the one shop the screen is showing. That is the fence, and
   this file is the gate in it — separate from api.js on purpose, so that "which code
   can see all four shops?" is answered by a filename rather than by reading two
   thousand lines looking for the query that forgot.

   It touches no tables. Every call is one of the `owner_*` functions in
   supabase/owner_console.sql, each of which asks is_cross_shop_owner() before it
   does anything. So the real fence is in the database, where it holds even if this
   file is wrong, and the worst a mistake here can do is show the owner an error.

   SIGNING IN HERE SIGNS THE TILL OUT. One browser holds one session, so opening the
   console on a counter phone replaces whoever was serving with the owner — and their
   half-finished sale with it. The screen says so before the password box. On the
   owner's own phone it does not matter; on a shared phone it is the whole warning.
--------------------------------------------------------- */
import { supabase } from "./supabase.js";
import { toLoginEmail } from "./auth.js";
import { askWords } from "./askStock.js";

/* Deliberately NOT shopRpc. shopRpc appends p_shop to the functions that take one,
   and none of these do — the point of them is that they are not about one shop. It
   would pass them through untouched today; naming supabase.rpc directly means it
   still will after somebody adds a shop argument somewhere else. */
const call = async (fn, args = {}) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || `${fn} failed`);
  return data;
};

/* ---- getting in ---- */

/* The console's own sign-in. `ceejay` becomes ceejay@bypassshop.co the same way every
   other login in this app does, so the owner types a name and not an address.

   The password is checked by Supabase and the reach is checked by the database. This
   function does neither: it signs in, then asks the database whether the account that
   just signed in is an owner, and signs straight back out if it is not. That order
   matters — a right password on the wrong account must not leave a session behind. */
export async function signInOwner(name, password) {
  const email = toLoginEmail(name);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: String(password || ""),
  });
  if (error) throw new Error("That name and password don't open this.");

  let ok = false;
  try {
    ok = await call("is_cross_shop_owner");
  } catch {
    /* The function is missing, which means supabase/owner_console.sql has not been
       run. Not the owner's fault and not something a password can fix, so it is worth
       saying plainly rather than as "wrong password". */
    await supabase.auth.signOut();
    throw new Error("This console isn't set up on the database yet (owner_console.sql has not been run).");
  }
  if (!ok) {
    await supabase.auth.signOut();
    throw new Error("That account can sign in, but it isn't an owner. This screen is not for it.");
  }
  return data.user;
}

export async function amOwner() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return false;
  try {
    return (await call("is_cross_shop_owner")) === true;
  } catch {
    return false;
  }
}

export const signOutOwner = () => supabase.auth.signOut();

/* ---- looking ---- */

export async function fetchShopTotals() {
  const rows = (await call("owner_shop_totals")) || [];
  return rows.map((r) => ({
    slug: r.shop_slug,
    name: r.shop_name,
    parts: Number(r.parts || 0),
    units: Number(r.units || 0),
    value: Number(r.value || 0),
    sections: Number(r.sections || 0),
    outOfStock: Number(r.out_of_stock || 0),
    low: Number(r.low || 0),
    lastAdded: r.last_added || null,
  }));
}

/* One row per part, anywhere. `notes` and `supplier` come back with it because the
   owner asked for exactly that: the extra details somebody typed are part of the
   answer, not a footnote to it. */
const toFound = (r) => ({
  slug: r.shop_slug,
  shopName: r.shop_name,
  code: r.code,
  cat: r.cat,
  section: r.section,
  name: r.name,
  brand: r.brand,
  model: r.model,
  series: r.series,
  yearFrom: r.year_from,
  yearTo: r.year_to,
  condition: r.condition,
  side: r.side,
  variant: r.variant,
  color: r.color,
  qty: Number(r.qty || 0),
  price: Number(r.price || 0),
  location: r.location || "",
  supplier: r.supplier || "",
  notes: r.notes || "",
});

/* Takes the question as typed. The words are worked out here rather than by the
   caller so that every route into this — the search box, the ask box, a tapped
   suggestion — strips question words the same way. */
export async function findPartEverywhere(question) {
  const words = askWords(question);
  if (!words.length) return { words, rows: [] };
  const rows = (await call("owner_find_part", { p_words: words })) || [];
  return { words, rows: rows.map(toFound) };
}

/* Every kind of part, with what each shop holds of it. One read answers both halves
   of the comparison — see the long note in owner_console.sql about why the comparison
   is by kind and not by part code. */
export async function fetchPartKinds() {
  const rows = (await call("owner_part_kinds")) || [];
  return rows.map((r) => ({
    key: [r.cat, r.brand, r.model, r.side, r.variant].join("|"),
    cat: r.cat,
    section: r.section,
    brand: r.brand || "",
    model: r.model || "",
    side: r.side || "",
    variant: r.variant || "",
    exampleName: r.example_name || "",
    shops: r.shops || {},
    shopCount: Number(r.shop_count || 0),
    totalQty: Number(r.total_qty || 0),
    totalParts: Number(r.total_parts || 0),
  }));
}

/* ---- who can get in ---- */

/* One row per membership, which means an account in more than one shop arrives more
   than once. Folded into one entry per person here, because "who can sign in where"
   is a question about people and a list that says addamsjmk four times looks like a
   mistake rather than like the exception it is. */
export async function fetchAccounts() {
  const rows = (await call("owner_accounts")) || [];
  const byEmail = new Map();
  for (const r of rows) {
    const email = String(r.email || "").toLowerCase();
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        name: r.full_name || "",
        approved: r.approved !== false,
        permissions: r.permissions || [],
        shops: [],
        shopCount: Number(r.shops || 0),
        lastSignIn: r.last_sign_in || null,
        created: r.created || null,
        forcedOut: r.forced_out || null,
      });
    }
    if (r.shop_slug) {
      byEmail.get(email).shops.push({ slug: r.shop_slug, name: r.shop_name, role: r.role || "staff" });
    }
  }
  return [...byEmail.values()];
}

export const moveAccount = (email, slug, role) =>
  call("owner_move_account", { p_email: email, p_slug: slug, p_role: role || "staff" });
export const revokeAccount = (email) => call("owner_revoke_account", { p_email: email });
export const logOutAccount = (email) => call("owner_log_out", { p_email: email });
export const setAccountApproved = (email, ok) =>
  call("owner_set_approved", { p_email: email, p_ok: !!ok });
export const setAccountPermissions = (email, perms) =>
  call("owner_set_permissions", { p_email: email, p_perms: perms || [] });
