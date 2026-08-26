/* ---------------------------------------------------------
   THE ONE PLACE THAT KNOWS WHICH SHOP THIS SCREEN IS SHOWING

   Two businesses now share one database. Row level security stops an account
   reading a shop it is not a member of, and that is the boundary that actually
   holds — but it is not the same promise as "you only see the shop in the URL".
   For anybody who belongs to both shops those two sentences come apart, and the
   database cannot tell the difference: PostgREST has no reliable per-session
   "active shop" across a connection pool.

   So the app makes the second promise itself, here, in one module — one place to
   get right and one place to audit — rather than in fifty query call sites that
   each have to remember. See `shopFrom` in supabase.js, which is the only thing
   that reads it.

   IT IS ASLEEP UNTIL THE DATABASE HAS THE COLUMN. `shop_id` does not exist until
   supabase/multishop/ has been run, and a filter on a column that is not there
   fails every query in the shop. So scoping is switched on by `setScopeReady`,
   which api.js sets from one cheap probe at start-up. Off means "behave exactly
   as this app behaved when there was one shop" — which is correct, because when
   there is no shop_id there is only one shop's data to see.

   No storage. The shop is in the address bar; that is the source of truth, it
   survives a reload, and it can be read by the person using it.
--------------------------------------------------------- */

/* Tables carrying one shop's data. Every one of these gets `shop_id` in the
   migration, and every read and write through shopFrom() is narrowed to the shop
   on screen.

   What is NOT here matters as much as what is. `profiles`, `trusted_devices`,
   `email_codes` and `verified_emails` are about a person's login, not a shop's
   data — a phone is trusted by the human who owns it, and if that human works for
   both shops the trust is still one fact about one phone. `app_settings` is not
   here either: its only row is the new-phone code switch, which is a property of
   a login rather than of a shop (decision F in MULTI_SHOP_PLAN.md), so it stays
   global on purpose.

   The three catalogue views are absent because they are read by strangers with no
   session at all, so they carry `shop_slug` and are filtered by slug instead —
   see fetchCatalogue in api.js.

   `messages` was here and has been taken out ON PURPOSE, by the owner's decision:
   the staff feed is ONE room both shops share, so somebody at one counter can ask
   the other whether they have a part. It is the one table where that is true, and
   it is worth being blunt about the cost — there is no private feed left. A note
   typed at Jaspare is read at Sure Fit Auto Spares and the other way round. Each
   message still RECORDS the shop it was sent from (see sendMessage in api.js) so
   the room says who is speaking and from where; only the reading is shared. */
export const SCOPED_TABLES = [
  "inventory",
  "sales",
  "stock_movements",
  "notifications",
  "customer_orders",
  "quotes",
  "receipts",
  "credit_accounts",
  "credit_txns",
  "expenses",
  "expense_categories",
  "finance_opening",
  "part_categories",
  "transfers",
  "staff_contacts",
  "branches",
];

export const isScopedTable = (table) => SCOPED_TABLES.includes(String(table || ""));

/* Module state rather than a React context, because api.js is not a component and
   threading a shop id through every call site is exactly the mistake this module
   exists to prevent. Set once when the route resolves; read on every query. */
let active = { slug: "", id: "", name: "" };
let ready = false;

/* The whole shops row is kept, not just the three fields the query layer needs.
   The extra columns are the letterhead — name, address, phone, KRA PIN — which
   shopInfo.js reads to head a receipt. Keeping them here rather than in a second
   module means there is one answer to "which shop is this", and the name printed on
   the document cannot drift from the shop the rows were read from.

   Written field by field rather than by spreading the argument, so a stray column
   from a future migration cannot quietly overwrite `id` or `slug`. */
export function setShop({
  slug = "", id = "", name = "",
  tagline = "", address = "", po_box = "", phone = "", phone_display = "",
  phone2 = "", email = "", kra_pin = "", footer = "", makes = "", parts_dealt = "",
} = {}) {
  active = {
    slug: String(slug || ""), id: String(id || ""), name: String(name || ""),
    tagline, address, po_box, phone, phone_display, phone2,
    email, kra_pin, footer, makes, parts_dealt,
  };
  return active;
}

export const currentShop = () => active;
export const currentShopId = () => active.id;
export const currentShopSlug = () => active.slug;

/* True only when BOTH halves are true: the database has the column, and this
   screen knows which shop it is. Either missing means no filter — and in both
   cases no filter is the honest behaviour, because a filter on nothing would
   either error or silently return an empty shop. */
export function setScopeReady(v) {
  ready = Boolean(v);
  return ready;
}
export const scopeReady = () => ready;
export const scopeActive = () => ready && Boolean(active.id);

/* Put the shop on a row, or on every row of a batch, without overwriting one that
   already says something. A caller that has deliberately named a shop is more
   likely to be right than this is — and silently rewriting it would hide the bug
   rather than showing it. */
export function stampShop(rows, id = currentShopId()) {
  if (!id) return rows;
  const one = (r) => (r && typeof r === "object" && !r.shop_id ? { ...r, shop_id: id } : r);
  return Array.isArray(rows) ? rows.map(one) : one(rows);
}

/* Errors that mean "this database has not had the migration run yet", as opposed
   to "something went wrong". Postgres 42703 is undefined_column; PostgREST sends
   PGRST204 when a column named in a request is not in its schema cache, and
   PGRST205 / 42P01 when the whole table is absent. Treating these as "not yet"
   rather than as failures is what lets the app ship before the SQL is pasted. */
export function isNotMigrated(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(code)) return true;
  const msg = String(error.message || "").toLowerCase();
  return msg.includes("shop_id") && (msg.includes("does not exist") || msg.includes("column"));
}
