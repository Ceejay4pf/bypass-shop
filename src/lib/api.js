/* ---------------------------------------------------------
   API layer — all Supabase reads/writes live here.
   Maps between DB rows (snake_case) and app items (camelCase),
   and records notifications + stock movements for every action.
--------------------------------------------------------- */
/* `shopFrom` instead of `supabase.from` for every table that belongs to a shop
   rather than to a person — see the choke point in supabase.js. `supabase.from`
   is still correct for profiles (one row per human) and for the three public
   catalogue views, which are narrowed by shop_slug because the people reading them
   have no session at all. */
import { supabase, shopFrom, createIsolatedClient } from "./supabase.js";
import {
  setShop,
  currentShop,
  currentShopId,
  setScopeReady,
  currentShopSlug,
  isNotMigrated,
} from "./shopScope.js";
import { toLoginEmail } from "./auth.js";
import { shopName } from "./shopInfo.js";

/* ---------------------------------------------------------
   WHICH SHOPS EXIST, AND WHICH ONE THIS SCREEN IS SHOWING

   Four functions, all of which have to work on a database that has never had
   supabase/multishop/ pasted into it. That is not politeness: the app deploys the
   moment it is pushed, and the SQL needs an account that is not the one building
   this. Between those two events every one of these must behave as though there is
   one shop — which is true, because there is.
--------------------------------------------------------- */

/* The list for the landing page. Read by strangers, so it comes from
   public.shop_directory (name, slug, phone and nothing else) and falls back to
   public.shops for a database that has 01 but not 04.

   Returns [] rather than throwing when neither exists. The caller then shows the
   two shops the app already knows about — see mergeShops in shopRoute.js. A picker
   that shows nothing because a table is missing is a shop with no front door. */
export async function fetchShops() {
  /* The letterhead columns come back with the name, because they head every receipt
     the shop prints and one fetch is cheaper than two. Asked for by name rather than
     with `*` so a column added later cannot silently change what the picker renders.

     Three attempts, narrowing each time: the full letterhead view, then the three
     columns the view had before step 08, then the table itself. A database that has
     had only part of supabase/multishop/ pasted still gets a working shop picker —
     it just heads its documents with the built-in wording until 08 is run. */
  const FULL =
    "slug,name,phone,tagline,address,po_box,phone_display,phone2,email,kra_pin,footer,makes,parts_dealt";
  const ask = (view, cols) => supabase.from(view).select(cols).order("name");

  let { data, error } = await ask("shop_directory", FULL);
  if (error) ({ data, error } = await ask("shop_directory", "slug,name,phone"));
  if (error) ({ data, error } = await ask("shops", "slug,name,phone"));
  if (error) return [];
  return (data || []).filter((r) => r && r.slug);
}

/* The shops the signed-in account actually works at, with its role at each.
   Returns null — not [] — when user_shops does not exist, because "no memberships"
   and "the question cannot be asked yet" must not look the same: the first locks
   somebody out and the second has to let them in. */
export async function fetchMyShops() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("user_shops")
    .select("shop_id, role, shops(slug, name)")
    .eq("user_id", uid);
  if (error) return isNotMigrated(error) ? null : [];

  return (data || []).map((r) => ({
    id: r.shop_id,
    role: r.role || "staff",
    slug: r.shops?.slug || "",
    name: r.shops?.name || "",
  }));
}

/* Name the shop this screen is showing, and work out whether filtering by it is
   possible at all.

   The probe is one row and one column. If `shop_id` comes back, the migration has
   run and every query from here on is narrowed to this shop. If it comes back
   "no such column", scoping stays off — which is exactly right, because a database
   with no shop_id has only one shop's data in it, and a filter on a column that
   does not exist would empty the parts list for whoever is standing at the counter.

   Called after sign-in, and again whenever the shop in the address changes. */
export async function activateShop({ slug = "", id = "", name = "" } = {}) {
  /* Merged over what is already there, not written fresh. This is called after
     sign-in with the three facts a membership carries — slug, id, name — while the
     letterhead (address, phone, KRA PIN) was loaded earlier from the shops row by
     main.jsx. Replacing the whole record here would blank the heading on every
     receipt printed after signing in, and only after signing in, which is the kind
     of bug that gets found by a customer rather than by a test. */
  const keep = currentShop();
  setShop({ ...keep, slug, id, name: name || keep.name });

  if (!id) {
    setScopeReady(false);
    return { scoped: false, reason: "no shop id" };
  }

  const { error } = await supabase.from("inventory").select("shop_id").limit(1);
  if (error && isNotMigrated(error)) {
    setScopeReady(false);
    return { scoped: false, reason: "not migrated" };
  }
  /* Any other error — offline, a bad key, RLS refusing outright — is not an answer
     about the column, so it must not be read as one. Leave scoping off and let the
     screen that actually needed the data report its own failure. */
  if (error) {
    setScopeReady(false);
    return { scoped: false, reason: error.message || "unavailable" };
  }

  setScopeReady(true);
  return { scoped: true };
}

/* Does this account work at the shop whose address is open?

   Returns "yes" / "no" / "unknown". Unknown means user_shops is not there yet, and
   unknown is treated as yes by the caller — before the migration nobody has a
   membership and refusing everybody would lock the whole shop out of its own
   system. After it, everybody does, so unknown stops happening. */
export async function checkShopMembership(slug) {
  const want = String(slug || "").toLowerCase();
  if (!want) return { answer: "unknown", shop: null };

  const mine = await fetchMyShops();
  if (mine === null) return { answer: "unknown", shop: null };

  const hit = mine.find((m) => String(m.slug).toLowerCase() === want);
  if (hit) return { answer: "yes", shop: hit, all: mine };
  return { answer: "no", shop: null, all: mine };
}

/* ---------------------------------------------------------
   THE SHOPS & CONTACTS LIST, FROM THE DATABASE

   The numbers staff ring: this shop's own places first, then the other businesses
   on the system. It replaces a hardcoded array in tabs.jsx whose third entry named
   a real business "Super Fix Auto" — a wrong name nobody could correct without a
   deploy, printed next to a phone number staff actually dial.

   Two reads, both narrow. `branches` is shop-scoped, so shopFrom() already limits
   it to the shop on screen; `shops` is the public list, minus the one we are in.

   Returns null when neither table is there, so the caller can keep showing the old
   list rather than an empty card. Before the migration that old list is the only
   list there is.
--------------------------------------------------------- */
export async function fetchDirectory() {
  const slug = currentShopSlug();

  const [br, sh] = await Promise.all([
    shopFrom("branches").select("id,name,code,kind,location,phone,is_active").order("code"),
    supabase.from("shops").select("slug,name,phone,is_active").order("name"),
  ]);

  if (br.error && sh.error) return null;

  const digits = (p) => String(p || "").replace(/\D/g, "");

  /* This shop's places. MAIN is the head office by its code, not by being first in
     the list — a list can be reordered, a code cannot be reordered by accident. */
  const places = (br.data || [])
    .filter((b) => b.is_active !== false)
    .map((b) => ({
      id: `branch:${b.id}`,
      name: b.name,
      tag: String(b.code).toUpperCase() === "MAIN" ? "Head office" : (b.kind || "Branch"),
      location: b.location || "",
      wa: digits(b.phone),
      display: b.phone || "",
    }));

  /* The other businesses. Listed as sister shops with a name and a number and
     nothing else — this app knows where its own branches are and deliberately does
     not claim to know where anybody else's shop is. */
  const others = (sh.data || [])
    .filter((s) => s.is_active !== false && String(s.slug).toLowerCase() !== String(slug).toLowerCase())
    .map((s) => ({
      id: `shop:${s.slug}`,
      name: s.name,
      tag: "Sister shop",
      location: "",
      wa: digits(s.phone),
      display: s.phone || "",
    }));

  const all = [...places, ...others].filter((r) => r.name);
  return all.length ? all : null;
}

/* ---- row <-> item mapping ---- */
export function rowToItem(r) {
  return {
    code: r.code,
    cat: r.cat,
    brand: r.brand || "",
    model: r.model || "",
    series: r.series || "",
    yearFrom: r.year_from,
    yearTo: r.year_to,
    condition: r.condition || "",
    side: r.side || "",
    variant: r.variant || "",
    color: r.color || "",
    name: r.name || "",
    price: Number(r.price) || 0,
    qty: Number(r.qty) || 0,
    /* Not `?? 3`. A missing level means nobody set one, and saying "3" on the
       way in made that indistinguishable from a level somebody chose — which is
       how every one-piece part ended up permanently in the reorder list. Null
       travels as null; reorderLevel() in data.js decides what unset means. */
    min: r.min_qty ?? null,
    location: r.location || "",
    supplier: r.supplier || "",
    notes: r.notes || "",
    images: Array.isArray(r.images) ? r.images : [],
    status: r.status || "Active",
    createdBy: r.created_by || "",
    createdAt: r.created_at || null,
  };
}
export function itemToRow(i) {
  return {
    code: i.code,
    cat: i.cat,
    brand: i.brand,
    model: i.model,
    series: i.series || null,
    year_from: i.yearFrom,
    year_to: i.yearTo,
    condition: i.condition,
    side: i.side,
    variant: i.variant || null,
    color: i.color || null,
    name: i.name,
    price: i.price,
    qty: i.qty,
    // Write what the form actually said. Blank stays blank (warn when finished).
    min_qty: i.min === "" || i.min === undefined ? null : i.min,
    location: i.location || null,
    supplier: i.supplier || null,
    notes: i.notes || null,
    images: i.images || [],
    status: i.status || "Active",
    created_by: i.createdBy || null,
  };
}

/* ---- INVENTORY ---- */

/* Every column EXCEPT images. Photos are base64 data URLs held in the row,
   so `select("*")` drags several MB down the wire before the stock list can
   appear — on a shop connection that's the difference between instant and a
   long blank wait. The list needs none of it, so we fetch the parts first
   and the photos separately (see fetchInventoryImages). */
const ITEM_COLUMNS =
  "code,cat,brand,model,series,year_from,year_to,condition,side,variant," +
  "color,name,price,qty,min_qty,location,supplier,notes,status,created_by,created_at";

export async function fetchInventory() {
  const { data, error } = await shopFrom("inventory")
    .select(ITEM_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(rowToItem);
}

/* The photos, fetched after the list is already on screen. Returns a map of
   code -> images array so the caller can merge them in. */
export async function fetchInventoryImages() {
  const { data, error } = await shopFrom("inventory")
    .select("code,images")
    .not("images", "is", null);
  if (error) throw error;
  const map = {};
  for (const r of data) {
    if (Array.isArray(r.images) && r.images.length) map[r.code] = r.images;
  }
  return map;
}

/* One item in full, photos included — for the edit screen. */
export async function fetchItem(code) {
  const { data, error } = await shopFrom("inventory")
    .select("*")
    .eq("code", code)
    .single();
  if (error) throw error;
  return rowToItem(data);
}

// Generate a unique serial from the DB sequence (safe across devices),
// then build the rich code the same way the app always has.
export async function nextSerial() {
  const { data, error } = await supabase.rpc("next_inventory_serial");
  if (error) throw error;
  return data;
}

/* `batch` = true when this insert is one of many in a bulk paste. The part
   still gets its own ledger entry (the audit trail must stay per-part), but
   the notification and the email are left to the caller, which sends ONE
   summary for the whole batch instead of one per part. */
export async function insertItem(item, byName, { batch = false } = {}) {
  const row = { ...itemToRow(item), created_by: byName };
  const { data, error } = await shopFrom("inventory").insert(row).select().single();
  if (error) throw error;
  if (!batch) {
    await addNotification({ type: "new_item", code: item.code, name: item.name, qty: item.qty, by_name: byName, remaining: item.qty });
  }
  await addMovement({ code: item.code, type: "new_item", qty: item.qty, by_name: byName, remaining: item.qty, supplier: item.supplier });
  if (!batch) {
    emailAdmin(
      `${shopName()} — new item added: ${item.code}`,
      `A new item was added to inventory:<br><br><b>${item.code}</b> — ${item.name}<br>Quantity: ${item.qty}`,
      byName
    );
  }
  return rowToItem(data);
}

// Edit a part's details (not quantity — that stays with Add Stock / Sell).
// Whitelists editable fields so a save can never clobber code/qty by accident.
export async function updateItem(code, patch, byName, { batch = false, reason = "Edited part details" } = {}) {
  const allowed = [
    "cat", "brand", "model", "series", "yearFrom", "yearTo", "condition",
    "side", "variant", "color", "name", "price", "min", "location",
    "supplier", "notes", "images", "status",
  ];
  const full = itemToRow({ code, ...patch });
  const row = {};
  const map = { yearFrom: "year_from", yearTo: "year_to", min: "min_qty" };
  for (const k of allowed) {
    const col = map[k] || k;
    if (col in full) row[col] = full[col];
  }
  const { data, error } = await shopFrom("inventory")
    .update(row)
    .eq("code", code)
    .select()
    .single();
  if (error) throw error;
  // As with adjustQty: a bulk edit is summarised once by its caller, but every
  // part still gets its own ledger line.
  if (!batch) await addNotification({ type: "adjust", code, name: patch.name, by_name: byName });
  await addMovement({ code, type: "adjust", by_name: byName, reason });
  return rowToItem(data);
}

/* Where stock went when it was removed from the books. The label is what
   staff see; the key is what goes in the database, so reports can group by
   it years later. `asks` is the follow-up question the sheet puts on screen. */
export const DISPOSALS = [
  { key: "sold", label: "Sold", asks: "Which customer bought it?" },
  { key: "credit", label: "Given to a credit customer", asks: "Which credit account?" },
  { key: "branch", label: "Taken to another shop", asks: "Which shop?" },
  { key: "returned_supplier", label: "Returned to the supplier", asks: "Which supplier?" },
  { key: "damaged", label: "Damaged or written off", asks: "What happened to it?" },
  { key: "staff", label: "Taken by staff / internal use", asks: "Who took it?" },
  { key: "lost", label: "Missing / unaccounted for", asks: "Last known with whom?" },
  { key: "duplicate", label: "Entered twice by mistake", asks: "Which code is the real one?" },
  { key: "other", label: "Something else", asks: "Where did it go?" },
];
export const disposalLabel = (key) =>
  DISPOSALS.find((d) => d.key === key)?.label || key || "";

/* Remove a part from the books, recording where it went.
   The item row goes, but stock_movements keeps the story - deliberately
   not linked by a foreign key, so the trail survives the deletion. */
export async function deleteItem(code, byName, disposal = {}, { batch = false } = {}) {
  // Read what we're about to lose, so the record names the part rather
  // than just its code. Best-effort: a missing row must not block a delete.
  let name = null;
  let qty = null;
  try {
    const { data } = await shopFrom("inventory").select("name,qty").eq("code", code).single();
    name = data?.name ?? null;
    qty = data?.qty ?? null;
  } catch {
    /* the part may already be gone; carry on with what we have */
  }

  const { error } = await shopFrom("inventory").delete().eq("code", code);
  if (error) throw error;

  const extra = {
    disposal: disposal.disposal || null,
    taken_by: disposal.takenBy || null,
    logistics: disposal.logistics || null,
  };
  // In a bulk removal the caller writes one summary instead (see
  // deleteItemsBulk). The per-part ledger entry below is always written.
  if (!batch) {
    await addNotification({ type: "delete", code, name, qty, by_name: byName, ...extra });
  }
  await addMovement({
    code,
    type: "delete",
    qty,
    by_name: byName,
    reason: disposal.reason || null,
    ...extra,
  });
  return { code, name, qty };
}

/* ---- BULK ACTIONS: one notification for the whole batch ----
   Each part is still written to inventory and to stock_movements
   individually - only the notification is summarised, because that feed
   is read by a person and twenty near-identical lines drown out
   everything else in it. */

/* Remove several parts that are leaving together, for the same reason.
   Returns what went, so the caller can report it. */
export async function deleteItemsBulk(codes, byName, disposal = {}) {
  const gone = [];
  const failed = [];
  for (const code of codes) {
    try {
      gone.push(await deleteItem(code, byName, disposal, { batch: true }));
    } catch (e) {
      failed.push({ code, message: e.message || String(e) });
    }
  }
  if (gone.length) {
    await addBatchNotification({
      type: "delete",
      by_name: byName,
      parts: gone,
      extra: {
        disposal: disposal.disposal || null,
        taken_by: disposal.takenBy || null,
        logistics: disposal.logistics || null,
      },
    });
  }
  return { gone, failed };
}

/* Add the same quantity to several parts at once. */
export async function addStockBulk(codes, amount, byName) {
  const done = [];
  const failed = [];
  for (const code of codes) {
    try {
      const remaining = await addStock(code, amount, byName, "", { batch: true });
      done.push({ code, name: await itemName(code), qty: amount, remaining });
    } catch (e) {
      failed.push({ code, message: e.message || String(e) });
    }
  }
  if (done.length) {
    await addBatchNotification({ type: "stock", by_name: byName, parts: done });
  }
  return { done, failed };
}

/* The single summary entry that stands in for a whole batch.
   `parts` is [{code, name, qty}] - everything the batch touched. */
export async function addBatchNotification({ type, by_name, parts, extra = {} }) {
  const codes = parts.map((p) => p.code).filter(Boolean);
  const units = parts.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  await addNotification({
    type,
    by_name,
    // The code column names the batch rather than a part, so the feed
    // never shows one part's code as if it were the whole action.
    code: `${codes.length} parts`,
    name: batchSummaryName(type, parts),
    qty: units || null,
    batch_count: codes.length,
    batch_codes: codes,
    ...extra,
  });
}

/* ONE email for a whole batch, as a small table of what changed - rather
   than one message per part, which filled the owner's inbox and made the
   batch harder to read, not easier. */
export function emailBatch(type, parts, byName) {
  if (!parts.length) return;
  const what = { new_item: "added to inventory", delete: "removed from inventory", stock: "restocked" }[type] || type;
  const units = parts.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const rows = parts
    .map(
      (p) =>
        `<tr><td style="padding:3px 10px 3px 0"><b>${p.code}</b></td>` +
        `<td style="padding:3px 10px 3px 0">${p.name || ""}</td>` +
        `<td style="padding:3px 0">${p.qty ?? ""}</td></tr>`
    )
    .join("");
  emailAdmin(
    `${shopName()} — ${parts.length} part${parts.length !== 1 ? "s" : ""} ${what}`,
    `<b>${parts.length} part${parts.length !== 1 ? "s" : ""}</b> ${what} in one go` +
      (units ? `, ${units} unit${units !== 1 ? "s" : ""} in total` : "") +
      `.<br><br><table style="border-collapse:collapse;font-size:13px">` +
      `<tr><th align="left" style="padding:0 10px 4px 0">Code</th>` +
      `<th align="left" style="padding:0 10px 4px 0">Part</th>` +
      `<th align="left" style="padding:0 0 4px 0">Qty</th></tr>${rows}</table>`,
    byName
  );
}

/* A one-line description of a batch, e.g.
   "12 parts added - Toyota, Mazda and 2 other makes". Falls back to the
   part names when they share no make, so the line is never empty. */
function batchSummaryName(type, parts) {
  const verb = { new_item: "added", delete: "removed", stock: "restocked", adjust: "changed" }[type] || type;
  const n = parts.length;
  const makes = [...new Set(
    parts.map((p) => String(p.name || "").split(/[-–—]/)[1]?.trim().split(/\s+/)[0]).filter(Boolean)
  )];
  let who = "";
  if (makes.length === 1) who = ` — ${makes[0]}`;
  else if (makes.length === 2) who = ` — ${makes[0]} and ${makes[1]}`;
  else if (makes.length > 2) who = ` — ${makes[0]}, ${makes[1]} and ${makes.length - 2} other make${makes.length - 2 !== 1 ? "s" : ""}`;
  return `${n} part${n !== 1 ? "s" : ""} ${verb}${who}`;
}

/* ---- STOCK CHANGES (atomic, via DB functions) ---- */
export async function addStock(code, amount, byName, supplier = "", { batch = false } = {}) {
  const { data: newQty, error } = await supabase.rpc("add_stock", { p_code: code, p_amount: amount });
  if (error) throw error;
  if (supplier) await shopFrom("inventory").update({ supplier }).eq("code", code);
  const name = await itemName(code);
  // A bulk restock gets one summary from addStockBulk instead.
  if (!batch) await addNotification({ type: "stock", code, name, qty: amount, by_name: byName, remaining: newQty });
  await addMovement({ code, type: "stock", qty: amount, by_name: byName, remaining: newQty, supplier });
  return newQty;
}

export async function sellItem({ code, qty, buyer, phone, paid, total, method = "Cash", deduct = true, sourceBranch = "" }, byName) {
  let newQty = null;
  if (deduct) {
    // Sold from THIS branch — atomically reduce our stock.
    const { data, error } = await supabase.rpc("sell_item", { p_code: code, p_qty: qty });
    if (error) throw error;
    newQty = data;
  } else {
    // Sold from another branch — record the sale but leave our stock untouched.
    const { data } = await shopFrom("inventory").select("qty").eq("code", code).single();
    newQty = data?.qty ?? null;
  }
  const name = await itemName(code);
  const reason = deduct ? undefined : `From ${sourceBranch || "another branch"} — not deducted here`;
  await addNotification({ type: "sale", code, name, qty, by_name: byName, buyer, phone, paid, total, remaining: newQty });
  await addMovement({ code, type: "sale", qty, by_name: byName, buyer, paid, remaining: newQty, reason });
  /* sales.method arrives with finance.sql. Until that has been run the column
     isn't there and naming it would throw away the whole sale row — so the
     sale is written without it rather than lost. */
  const saleRow = { code, name, qty, buyer, phone, paid, total, by_name: byName, method: method || "Cash" };
  let saleErr = (await shopFrom("sales").insert(saleRow)).error;
  if (saleErr && (saleErr.code === "PGRST204" || /method/.test(saleErr.message || ""))) {
    const { method: _drop, ...noMethod } = saleRow;
    saleErr = (await shopFrom("sales").insert(noMethod)).error;
  }
  // Not thrown: the stock is already deducted and the movement logged, so
  // failing the call now would tell staff the sale didn't happen when it did.
  if (saleErr) console.error("sale insert failed", saleErr);
  emailAdmin(
    `${shopName()} — stock sold: ${code}`,
    `Stock was deducted from a sale:<br><br><b>${code}</b> — ${name}<br>Sold: ${qty} (remaining: ${newQty})<br>` +
      `Customer: ${buyer || "—"}${phone ? " · " + phone : ""}<br>Total: KES ${Number(total || 0).toLocaleString()} — ${paid ? "Paid" : "Pending"}`,
    byName
  );
  return newQty;
}

export async function adjustQty(code, newQty, reason, byName, { batch = false } = {}) {
  const { data: qty, error } = await supabase.rpc("set_qty", { p_code: code, p_qty: newQty });
  if (error) throw error;
  const name = await itemName(code);
  /* A bulk change gets one summary from its caller instead. Forty parts
     announced one at a time buries everything else that happened today — which
     is the pile-up the shop complained about over bulk stock. The MOVEMENT is
     always written, batch or not: the ledger is the record of what happened to
     each part and must never be summarised away. */
  if (!batch) await addNotification({ type: "adjust", code, name, qty: newQty, by_name: byName, remaining: qty });
  await addMovement({ code, type: "adjust", qty: newQty, by_name: byName, reason, remaining: qty });
  return qty;
}

async function itemName(code) {
  const { data } = await shopFrom("inventory").select("name").eq("code", code).single();
  return data?.name || code;
}

/* ---- CATEGORIES THE SHOP ADDS ITSELF ----
   The built-in thirteen are in data.js; these are the extra sections an admin
   creates in Settings (boot lights, hinges, bulbs, headlight computers…).
   See supabase/part_categories.sql. */

export async function fetchPartCategories() {
  const { data, error } = await shopFrom("part_categories")
    .select("key,label,shelf,color,sort,created_by,created_at")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((c) => ({
    key: c.key,
    label: c.label,
    shelf: c.shelf || "",
    color: c.color || "#6B7480",
    createdBy: c.created_by || "",
    custom: true,
  }));
}

export async function addPartCategory({ key, label, shelf, color }, byName) {
  const { data, error } = await shopFrom("part_categories")
    .insert({
      key: String(key || "").toUpperCase(),
      label: String(label || "").trim(),
      shelf: shelf || null,
      color: color || null,
      created_by: byName || null,
    })
    .select()
    .single();
  /* 23505 is a duplicate key. Two people naming a section at the same moment
     is an ordinary thing to happen in a shop, and "duplicate key value
     violates unique constraint" tells the person nothing they can act on. */
  if (error) {
    if (error.code === "23505") {
      throw new Error(`The code ${String(key).toUpperCase()} is already in use — try a different one.`);
    }
    throw error;
  }
  return { key: data.key, label: data.label, shelf: data.shelf || "", color: data.color || "#6B7480", custom: true };
}

/* Rename a section, or recolour it. The KEY is deliberately not editable:
   it is stamped into every code that category has ever issued, so changing it
   would leave the existing parts pointing at a category that no longer
   exists. The label is only what it's called, so that can change freely. */
export async function updatePartCategory(key, { label, shelf, color }) {
  const patch = {};
  if (label !== undefined) patch.label = String(label).trim();
  if (shelf !== undefined) patch.shelf = shelf || null;
  if (color !== undefined) patch.color = color || null;
  if (!Object.keys(patch).length) return;
  const { error } = await shopFrom("part_categories").update(patch).eq("key", key);
  if (error) throw error;
}

/* Live-subscribe to added/renamed categories. A section created on the counter
   phone has to reach the workshop phone, or the second person cannot file the
   part they are holding. Returns an unsubscribe function. */
export function subscribePartCategories(onChange) {
  const ch = supabase
    .channel("part-categories-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "part_categories" }, (p) => onChange(p))
    .subscribe();
  return () => supabase.removeChannel(ch);
}

/* ---- NOTIFICATIONS ---- */
// Map a DB row to the shape the UI components already expect
// (ts as a millisecond number, `by` instead of `by_name`).
export function rowToNotif(r) {
  return {
    id: r.id,
    ts: new Date(r.ts).getTime(),
    type: r.type,
    code: r.code,
    name: r.name,
    qty: r.qty,
    by: r.by_name,
    buyer: r.buyer,
    phone: r.phone,
    paid: r.paid,
    total: r.total,
    remaining: r.remaining,
    // Set once a sale has been undone (see undo_and_activity.sql).
    returnedAt: r.returned_at ? new Date(r.returned_at).getTime() : null,
    returnedBy: r.returned_by || null,
    // Where deleted stock went, and who moved it (see delete_reason.sql).
    disposal: r.disposal || "",
    takenBy: r.taken_by || "",
    logistics: r.logistics || "",
    // Set when this one entry summarises a bulk action (batch_notifications.sql).
    batchCount: r.batch_count || 0,
    batchCodes: Array.isArray(r.batch_codes) ? r.batch_codes : [],
  };
}

/* How many parts an entry accounts for. A bulk summary stands for its
   whole batch, so totals must add this rather than count rows - otherwise
   twenty parts added together would report as one. */
export const notifWeight = (n) => Number(n.batchCount) || 1;
export function rowToMovement(r) {
  return {
    ts: new Date(r.ts).getTime(),
    type: r.type,
    qty: r.qty,
    by: r.by_name,
    buyer: r.buyer,
    supplier: r.supplier,
    reason: r.reason,
    paid: r.paid,
    remaining: r.remaining,
    disposal: r.disposal || "",
    takenBy: r.taken_by || "",
    logistics: r.logistics || "",
  };
}

export async function fetchNotifications(limit = 200) {
  const { data, error } = await shopFrom("notifications")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToNotif);
}
/* Columns added by a later migration. If delete_reason.sql hasn't been run
   on this database yet, an insert naming them fails outright — and losing
   the whole log entry would be far worse than losing the extra detail. So
   on that one error we drop them and write the entry anyway. */
const LATER_COLUMNS = [
  "disposal", "taken_by", "logistics",
  // batch_notifications.sql — a bulk action writes one summary entry
  "batch_count", "batch_codes",
];
const isMissingColumn = (error) =>
  error?.code === "PGRST204" ||
  LATER_COLUMNS.some((c) => String(error?.message || "").includes(`'${c}'`) ||
                            String(error?.message || "").includes(`"${c}"`));
function withoutLaterColumns(row) {
  const out = { ...row };
  for (const c of LATER_COLUMNS) delete out[c];
  return out;
}

export async function addNotification(n) {
  let { error } = await shopFrom("notifications").insert(n);
  if (error && isMissingColumn(error)) {
    ({ error } = await shopFrom("notifications").insert(withoutLaterColumns(n)));
  }
  if (error) console.error("notification insert failed", error);
}

/* Record a login so the main shop can see who signed in and when.
   Also triggers the (optional) email alert via a Supabase Edge Function. */
export async function logLogin(who) {
  await addNotification({ type: "login", name: who, by_name: who });
  // Best-effort email alert; ignored if the function isn't deployed.
  try {
    await supabase.functions.invoke("notify-login", { body: { who, at: new Date().toISOString() } });
  } catch {
    /* Edge Function not set up yet — the in-app log above still works. */
  }
}

/* Best-effort admin email for inventory events (new item, stock sold).
   Fire-and-forget: never blocks or fails the underlying action. */
export function emailAdmin(subject, message, who) {
  try {
    supabase.functions
      .invoke("notify-admin", { body: { subject, message, who } })
      .catch(() => {});
  } catch {
    /* function not deployed yet — in-app notifications still record everything */
  }
}

/* ---- STOCK MOVEMENTS ---- */
export async function fetchMovements(code) {
  let q = shopFrom("stock_movements").select("*").order("ts", { ascending: false });
  if (code) q = q.eq("code", code);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function addMovement(m) {
  let { error } = await shopFrom("stock_movements").insert(m);
  if (error && isMissingColumn(error)) {
    ({ error } = await shopFrom("stock_movements").insert(withoutLaterColumns(m)));
  }
  if (error) console.error("movement insert failed", error);
}

/* ---- QUOTATIONS ---- */
export function rowToQuote(r) {
  return {
    id: r.id,
    number: r.number,
    ts: new Date(r.ts).getTime(),
    customer: r.customer || "",
    phone: r.phone || "",
    lines: Array.isArray(r.lines) ? r.lines : [],
    subtotal: Number(r.subtotal) || 0,
    discount: Number(r.discount) || 0,
    total: Number(r.total) || 0,
    status: r.status || "Draft",
    by: r.created_by || "",
  };
}

// Build the next human-friendly quote number: QT-<year>-<0000>.
// Uses the DB function (atomic); falls back to a count if it's not deployed.
async function nextQuoteNumber() {
  const { data, error } = await supabase.rpc("next_quote_number");
  if (!error && data) return data;
  const year = new Date().getFullYear();
  const { count } = await shopFrom("quotes").select("*", { count: "exact", head: true });
  return `QT-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
}

export async function fetchQuotes(limit = 200) {
  const { data, error } = await shopFrom("quotes")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToQuote);
}

export async function saveQuote(q, byName) {
  const number = await nextQuoteNumber();
  const row = {
    number,
    customer: q.customer || null,
    phone: q.phone || null,
    lines: q.lines || [],
    subtotal: q.subtotal || 0,
    discount: q.discount || 0,
    total: q.total || 0,
    status: q.status || "Sent",
    created_by: byName || null,
  };
  const { data, error } = await shopFrom("quotes").insert(row).select().single();
  if (error) throw error;
  return rowToQuote(data);
}

export async function setQuoteStatus(id, status) {
  const { error } = await shopFrom("quotes").update({ status }).eq("id", id);
  if (error) throw error;
}

/* ---- RECEIPTS ---- */
export function rowToReceipt(r) {
  return {
    id: r.id,
    number: r.number,
    ts: new Date(r.ts).getTime(),
    customer: r.customer || "",
    phone: r.phone || "",
    lines: Array.isArray(r.lines) ? r.lines : [],
    subtotal: Number(r.subtotal) || 0,
    discount: Number(r.discount) || 0,
    total: Number(r.total) || 0,
    paid: Number(r.paid) || 0,
    method: r.method || "",
    vat: Number(r.vat) || 0,
    vatRate: Number(r.vat_rate) || 0,
    kraPin: r.kra_pin || "",
    docType: r.doc_type || "Receipt",
    stamp: r.stamp || "",
    customerType: r.customer_type || "",
    /* Where the figures came from, when they weren't typed. `fromQuote` is a
       quote number for the page; `fromSales` is the sale ids, so the same
       delivery cannot be receipted twice. Older receipts have neither — see
       supabase/receipt_sources.sql. */
    fromQuote: r.from_quote || "",
    fromSales: Array.isArray(r.from_sales) ? r.from_sales : [],
    by: r.created_by || "",
  };
}

// Next human-friendly receipt number: RCP-<year>-<0000>.
async function nextReceiptNumber() {
  const { data, error } = await supabase.rpc("next_receipt_number");
  if (!error && data) return data;
  const year = new Date().getFullYear();
  const { count } = await shopFrom("receipts").select("*", { count: "exact", head: true });
  return `RCP-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
}

export async function fetchReceipts(limit = 200) {
  const { data, error } = await shopFrom("receipts")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToReceipt);
}

export async function saveReceipt(rc, byName) {
  const number = await nextReceiptNumber();
  const row = {
    number,
    customer: rc.customer || null,
    phone: rc.phone || null,
    lines: rc.lines || [],
    subtotal: rc.subtotal || 0,
    discount: rc.discount || 0,
    total: rc.total || 0,
    paid: rc.paid || 0,
    method: rc.method || null,
    vat: rc.vat || 0,
    vat_rate: rc.vatRate || 0,
    kra_pin: rc.kraPin || null,
    doc_type: rc.docType || "Receipt",
    stamp: rc.stamp || null,
    customer_type: rc.customerType || null,
    from_quote: rc.fromQuote || null,
    from_sales: rc.fromSales || [],
    created_by: byName || null,
  };
  const { data, error } = await shopFrom("receipts").insert(row).select().single();
  if (error) throw error;
  return rowToReceipt(data);
}

/* ============================================================
   CREDIT ACCOUNTS — garages that buy on credit.
   Charge = took goods (balance up). Payment = paid us (balance down).
   Every move is posted atomically via the post_credit_txn function.
   ============================================================ */
function rowToAccount(a) {
  return {
    id: a.id,
    name: a.name || "",
    contact: a.contact || "",
    phone: a.phone || "",
    balance: Number(a.balance) || 0,
    notes: a.notes || "",
    createdAt: a.created_at ? new Date(a.created_at).getTime() : 0,
    by: a.created_by || "",
  };
}

function rowToTxn(t) {
  return {
    id: t.id,
    accountId: t.account_id,
    ts: t.ts ? new Date(t.ts).getTime() : 0,
    kind: t.kind,                         // "charge" | "payment"
    amount: Number(t.amount) || 0,
    method: t.method || "",
    reference: t.reference || "",
    description: t.description || "",
    balanceAfter: Number(t.balance_after) || 0,
    by: t.by_name || "",
  };
}

export async function fetchCreditAccounts() {
  const { data, error } = await shopFrom("credit_accounts")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map(rowToAccount);
}

export async function addCreditAccount({ name, contact, phone, notes }, byName) {
  const { data, error } = await shopFrom("credit_accounts")
    .insert({ name, contact: contact || null, phone: phone || null, notes: notes || null, created_by: byName || null })
    .select()
    .single();
  if (error) throw error;
  return rowToAccount(data);
}

export async function updateCreditAccount(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.contact !== undefined) row.contact = patch.contact || null;
  if (patch.phone !== undefined) row.phone = patch.phone || null;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  const { error } = await shopFrom("credit_accounts").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteCreditAccount(id) {
  const { error } = await shopFrom("credit_accounts").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCreditTxns(accountId, limit = 300) {
  const { data, error } = await shopFrom("credit_txns")
    .select("*")
    .eq("account_id", accountId)
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToTxn);
}

// Post a charge (took goods) or a payment (paid us). Returns the new balance.
export async function postCreditTxn({ accountId, kind, amount, method, reference, description }, byName) {
  const { data, error } = await supabase.rpc("post_credit_txn", {
    p_account: accountId,
    p_kind: kind,
    p_amount: amount,
    p_method: method || null,
    p_reference: reference || null,
    p_description: description || null,
    p_by: byName || null,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export function subscribeCreditAccounts(onChange) {
  const ch = supabase
    .channel("credit_accounts_rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "credit_accounts" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "credit_txns" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

/* ============================================================
   BRANCH TRANSFERS — a log of stock moving between branches.
   LOG ONLY: recording a transfer does NOT change any stock count.
   ============================================================ */
function rowToTransfer(t) {
  return {
    id: t.id,
    ts: t.ts ? new Date(t.ts).getTime() : 0,
    direction: t.direction,               // "out" (taken) | "in" (received)
    otherBranch: t.other_branch || "",
    code: t.code || "",
    item: t.item || "",
    qty: Number(t.qty) || 0,
    note: t.note || "",
    by: t.by_name || "",
  };
}

export async function fetchTransfers(limit = 300) {
  const { data, error } = await shopFrom("transfers")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToTransfer);
}

export async function addTransfer({ direction, otherBranch, code, item, qty, note }, byName) {
  const { data, error } = await shopFrom("transfers")
    .insert({
      direction,
      other_branch: otherBranch || null,
      code: code || null,
      item,
      qty: Number(qty) || 0,
      note: note || null,
      by_name: byName || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToTransfer(data);
}

export async function deleteTransfer(id) {
  const { error } = await shopFrom("transfers").delete().eq("id", id);
  if (error) throw error;
}

export function subscribeTransfers(onChange) {
  const ch = supabase
    .channel("transfers_rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "transfers" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

/* ---- SALES ---- */

/* A sales-register row in the same shape the activity feed uses, so a screen
   can read its figures from either source without caring which.

   Reports needs this. The feed is capped at 200 rows so it loads fast, which
   is right for "what happened today" and quietly wrong for "what did we take
   this year" — past a couple of weeks of trading, a month and a year read the
   same figures off the same ten days. */
export function rowToSale(r) {
  return {
    id: r.id,
    ts: new Date(r.ts).getTime(),
    type: "sale",
    code: r.code || "",
    name: r.name || "",
    qty: Number(r.qty) || 0,
    buyer: r.buyer || "",
    phone: r.phone || "",
    paid: Boolean(r.paid),
    total: Number(r.total) || 0,
    by: r.by_name || "",
    // Both arrive with later migrations; absent is fine, never fatal.
    method: r.method || "",
    returnedAt: r.returned_at ? new Date(r.returned_at).getTime() : null,
  };
}

export async function fetchSales(limit = 500) {
  const { data, error } = await shopFrom("sales")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/* Every sale by one person, newest first. */
export async function fetchSalesBy(person, limit = 500) {
  const { data, error } = await shopFrom("sales")
    .select("*")
    .eq("by_name", person)
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/* Undo a sale: the goods come back into stock and the sale is stamped
   as returned, keeping the original date while the return gets today's.
   Nothing is erased — the books still show the sale happened.
   Returns the item's new quantity. */
export async function undoSale(saleId, byName, reason = "", restock = true) {
  const { data, error } = await supabase.rpc("undo_sale", {
    p_sale_id: saleId,
    p_by: byName,
    p_reason: reason || null,
    p_restock: restock,
  });
  if (error) throw error;
  return data;
}

/* ---- PER-PERSON ACTIVITY (admin only) ---- */
/* One row per person: sales, revenue, returns, items added/edited/deleted. */
export async function fetchStaffActivity() {
  const { data, error } = await supabase.rpc("staff_activity_summary");
  if (error) throw error;
  return data || [];
}

/* Everything one person has done, newest first. */
export async function fetchActivityBy(person, limit = 400) {
  const { data, error } = await shopFrom("notifications")
    .select("*")
    .eq("by_name", person)
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToNotif);
}

/* ---- ACCOUNT APPROVALS ---- */
// Is THIS account approved to use the app? Missing column (migration not run
// yet) is treated as approved so the app never locks everyone out by mistake.
export async function getMyApproval(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("approved")
    .eq("id", userId)
    .single();
  if (error) return true; // fail open — don't trap staff if the query fails
  return data?.approved !== false;
}

// This account's granted + pending capabilities (for the staff-side UI and
// for gating delicate actions). Missing columns (migration not run) → none.
export async function getMyPermissions(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("permissions, pending_permissions")
    .eq("id", userId)
    .single();
  if (error) return { permissions: [], pending: [] };
  return {
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    pending: Array.isArray(data?.pending_permissions) ? data.pending_permissions : [],
  };
}

// Admin: list all staff profiles with their approval state + permissions.
export async function fetchProfiles() {
  const BASE = "id, full_name, approved, permissions, pending_permissions, created_at";
  /* email_verified only exists once email_verification.sql has been run. Naming
     a column that isn't there fails the WHOLE select, which would empty the
     Staff Approvals screen — so ask for it, and fall back to the columns that
     have always been there if the database says it doesn't know it. */
  let { data, error } = await supabase
    .from("profiles")
    .select(`${BASE}, email_verified`)
    .order("created_at", { ascending: false });
  if (error) {
    ({ data, error } = await supabase
      .from("profiles")
      .select(BASE)
      .order("created_at", { ascending: false }));
  }
  if (error) throw error;
  return (data || []).map((p) => ({
    id: p.id,
    name: p.full_name || "(no name)",
    approved: p.approved !== false,
    permissions: Array.isArray(p.permissions) ? p.permissions : [],
    pending: Array.isArray(p.pending_permissions) ? p.pending_permissions : [],
    createdAt: p.created_at || null,
    emailVerified: p.email_verified === true,
  }));
}

/* ---- PER-ACTION PERMISSIONS ---- */
// Staff: request / cancel a capability for my own account.
export async function requestPermission(perm) {
  const { error } = await supabase.rpc("request_permission", { perm });
  if (error) throw error;
}
export async function cancelPermissionRequest(perm) {
  const { error } = await supabase.rpc("cancel_permission_request", { perm });
  if (error) throw error;
}
// Admin: grant / revoke / deny a capability for a staff account.
export async function grantPermission(targetId, perm) {
  const { error } = await supabase.rpc("grant_permission", { target: targetId, perm });
  if (error) throw error;
}
export async function revokePermission(targetId, perm) {
  const { error } = await supabase.rpc("revoke_permission", { target: targetId, perm });
  if (error) throw error;
}
export async function denyPermissionRequest(targetId, perm) {
  const { error } = await supabase.rpc("deny_permission_request", { target: targetId, perm });
  if (error) throw error;
}

// Admin: approve or revoke an account (server checks caller is an admin).
export async function setUserApproved(targetId, approved) {
  const { error } = await supabase.rpc("set_user_approved", { target: targetId, val: approved });
  if (error) throw error;
}

// Admin: force a staff member's current session to sign out (account stays
// approved — they can log back in). The target's app reacts over realtime.
export async function forceLogout(targetId) {
  const { error } = await supabase.rpc("force_logout", { target: targetId });
  if (error) throw error;
}

// Admin: rename a staff account.
export async function renameUser(targetId, newName) {
  const { error } = await supabase.rpc("rename_user", { target: targetId, new_name: newName.trim() });
  if (error) throw error;
}

// Admin: create a staff account directly and auto-approve it, so the new
// member can log in immediately without waiting for approval. Uses an
// isolated client so it never replaces the admin's own session.
export async function adminCreateStaff({ name, password, contact = "" }) {
  const c = String(contact || "").trim();
  const usesEmail = c.includes("@");
  const email = usesEmail ? c.toLowerCase() : toLoginEmail(name);
  const iso = createIsolatedClient();
  if (!iso) throw new Error("Supabase is not configured.");
  const { data, error } = await iso.auth.signUp({
    email,
    password,
    /* shop_slug is what puts them in a shop. handle_new_user() reads it and writes
       the user_shops row; without it the admin creates an account that signs in to
       an empty app, because every policy asks which shop you belong to. The slug is
       the shop the admin is signed into, which is the only shop they can hire for. */
    options: {
      data: {
        full_name: name.trim(),
        phone: usesEmail ? "" : c,
        ...(currentShopSlug() ? { shop_slug: currentShopSlug() } : {}),
      },
    },
  });
  if (error) throw error;
  const newId = data.user?.id;
  // Auto-approve so they skip the pending screen (admin double-checks server-side).
  if (newId) {
    try { await supabase.rpc("set_user_approved", { target: newId, val: true }); } catch { /* ignore */ }
  }
  return { id: newId, email };
}

// This account's force-logout timestamp (ms) — used to detect an admin
// signing us out. Returns 0 if the column/row is missing.
export async function getForceLogoutAt(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("force_logout_at")
    .eq("id", userId)
    .single();
  if (error || !data?.force_logout_at) return 0;
  return new Date(data.force_logout_at).getTime();
}

// Live-subscribe to profile changes (new sign-ups, approvals). Returns an
// unsubscribe function.
export function subscribeProfiles(onChange) {
  const ch = supabase
    .channel("profiles-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => onChange())
    .subscribe();
  return () => supabase.removeChannel(ch);
}

/* ---- STAFF DIRECTORY (admin-typed contacts) ---- */
// Turn a typed phone into WhatsApp/international digits (no + or leading 0).
// Kenyan local numbers (07.. / 01..) become 2547.. / 2541..
export function waDigits(phone) {
  let d = String(phone || "").replace(/[^\d]/g, "");
  if (d.startsWith("0")) d = "254" + d.slice(1);
  return d;
}

export async function fetchStaffContacts() {
  const { data, error } = await shopFrom("staff_contacts")
    .select("*")
    .order("dept", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    dept: r.dept || "General",
    name: r.name || "",
    role: r.role || "",
    phone: r.phone || "",
    wa: waDigits(r.phone),
  }));
}

export async function addStaffContact({ dept, name, role, phone }) {
  const { error } = await shopFrom("staff_contacts").insert({
    dept: (dept || "General").trim(),
    name: (name || "").trim(),
    role: (role || "").trim() || null,
    phone: (phone || "").trim(),
  });
  if (error) throw error;
}

export async function deleteStaffContact(id) {
  const { error } = await shopFrom("staff_contacts").delete().eq("id", id);
  if (error) throw error;
}

export function subscribeStaffContacts(onChange) {
  const ch = supabase
    .channel("staff-contacts-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "staff_contacts" }, () => onChange())
    .subscribe();
  return () => supabase.removeChannel(ch);
}

/* ---- STAFF FEED (group chat) ---- */
export function rowToMessage(r) {
  return {
    id: r.id,
    userId: r.user_id,
    author: r.author || "Staff",
    body: r.body || "",
    ts: r.created_at ? new Date(r.created_at).getTime() : 0,
    /* Which shop it was sent from. The NAME is stored on the row rather than
       joined, because a shop can be renamed — and it was, the week this shipped —
       and a message should still say the name that was over the door when somebody
       typed it. shopId is kept as the fact the delete rule is checked against. */
    shopId: r.shop_id || "",
    shopName: r.shop_name || "",
  };
}

// Load recent messages, oldest first (so the newest sits at the bottom).
export async function fetchMessages(limit = 200) {
  /* supabase.from, not shopFrom, and that is the whole feature: this is the one
     shop-stamped table read WITHOUT narrowing to the shop on screen. */
  const { data, error } = await supabase.from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToMessage).reverse();
}

export async function sendMessage({ userId, author, body }) {
  const text = String(body || "").trim();
  if (!text) return;
  /* Stamped by hand, because messages is no longer a scoped table and so nothing
     stamps it automatically any more. Both halves matter: shop_id is what the
     database checks the sender against, and shop_name is what the room shows. A
     message that cannot say where it came from is a message in a shared room with
     no way to tell which shop is being asked. */
  const shop = currentShop();
  const { data, error } = await supabase.from("messages")
    .insert({
      user_id: userId, author, body: text,
      shop_id: currentShopId() || null,
      shop_name: shop.name || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToMessage(data);
}

export async function deleteMessage(id) {
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) throw error;
}

// Live-subscribe to new/removed messages. Returns an unsubscribe function.
export function subscribeMessages(onChange) {
  const ch = supabase
    .channel("messages-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => onChange(payload))
    .subscribe();
  return () => supabase.removeChannel(ch);
}

/* ---- FINANCIAL STATEMENTS ----
   Money out, and the opening balances. Everything else the statements need
   already exists in sales / receipts / credit / inventory, so it is read
   through the fetchers above rather than copied into another table.

   All of this is admin-only, enforced by RLS in supabase/finance.sql. A
   non-admin gets an empty list from the database, not just a hidden screen. */

export function rowToExpense(r) {
  return {
    id: r.id,
    ts: r.ts,
    spentOn: r.spent_on,
    category: r.category,
    description: r.description || "",
    amount: Number(r.amount) || 0,
    method: r.method || "Cash",
    reference: r.reference || "",
    byName: r.by_name || "",
    voidedAt: r.voided_at || null,
    voidedBy: r.voided_by || "",
    voidReason: r.void_reason || "",
  };
}

export async function fetchExpenses(limit = 1000) {
  const { data, error } = await shopFrom("expenses")
    .select("*")
    .order("spent_on", { ascending: false })
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToExpense);
}

export async function addExpense({ spentOn, category, description, amount, method, reference }, byName) {
  const { data, error } = await shopFrom("expenses")
    .insert({
      spent_on: spentOn || new Date().toISOString().slice(0, 10),
      category,
      description: description || null,
      amount: Number(amount),
      method: method || "Cash",
      reference: reference || null,
      by_name: byName || null,
    })
    .select()
    .single();
  if (error) throw error;
  /* Deliberately NOT written to `notifications`. That feed is read by every
     member of staff, and rent and salary figures are admin-only - putting
     them there would walk straight around the restriction this whole feature
     is gated by. The expenses list itself is the record. */
  return rowToExpense(data);
}

/* An expense is voided, not deleted - the row stays, stamped with who voided
   it and why. Money out is the last thing that should be able to disappear
   without trace: a deleted row changes every total above it and leaves nothing
   to explain the change. The database has no delete policy, so this is the
   only way it can go. */
export async function voidExpense(id, byName, reason = "") {
  const { error } = await shopFrom("expenses")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: byName || null,
      void_reason: reason || null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchExpenseCategories() {
  const { data, error } = await shopFrom("expense_categories")
    .select("*")
    .order("sort", { ascending: true });
  if (error) throw error;
  return (data || []).map((c) => ({ name: c.name, isStock: c.is_stock === true }));
}

/* The opening balances. Returns nulls when the row has never been filled in,
   so the screen can ask for it rather than silently starting from zero and
   presenting a wrong position as if it were checked. */
export async function fetchOpening() {
  const { data, error } = await shopFrom("finance_opening")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    asOf: data.as_of,
    cash: Number(data.cash) || 0,
    mpesa: Number(data.mpesa) || 0,
    bank: Number(data.bank) || 0,
    capital: Number(data.capital) || 0,
    drawings: Number(data.drawings) || 0,
    notes: data.notes || "",
    updatedAt: data.updated_at,
    updatedBy: data.updated_by || "",
  };
}

export async function saveOpening({ asOf, cash, mpesa, bank, capital, drawings, notes }, byName) {
  const { error } = await shopFrom("finance_opening").upsert({
    id: 1,
    as_of: asOf || new Date().toISOString().slice(0, 10),
    cash: Number(cash) || 0,
    mpesa: Number(mpesa) || 0,
    bank: Number(bank) || 0,
    capital: Number(capital) || 0,
    drawings: Number(drawings) || 0,
    notes: notes || null,
    updated_at: new Date().toISOString(),
    updated_by: byName || null,
  });
  if (error) throw error;
}

/* Everything the statements need, in one go. Fetched together so the figures
   on screen all describe the same moment - loading them separately would let
   a sale land between two reads and make the totals disagree.

   One failing table does not sink the rest - the sales figures are still worth
   showing when the expenses table is missing. But whatever failed is reported
   back in `problems`, because a screen of zeros that looks calculated is worse
   than no screen at all: the owner cannot tell "nothing was spent" from
   "spending could not be read". */
export async function fetchFinanceData() {
  const problems = [];
  const safe = (label, p, fallback) =>
    p.then((v) => v ?? fallback).catch((e) => {
      problems.push({ what: label, message: e?.message || String(e) });
      return fallback;
    });
  const [sales, expenses, receipts, accounts, items, opening, categories] = await Promise.all([
    safe("sales", fetchSales(5000), []),
    safe("expenses", fetchExpenses(5000), []),
    safe("receipts", fetchReceipts(2000), []),
    safe("credit accounts", fetchCreditAccounts(), []),
    safe("stock", fetchInventory(), []),
    safe("opening balances", fetchOpening(), null),
    safe("expense categories", fetchExpenseCategories(), []),
  ]);
  /* Credit movements come per account, so they are gathered here - the cash
     book needs every payment, not one garage's. `byName` is added because the
     statements name whoever took the money, and rowToTxn calls that field
     `by` - reading the wrong name would leave the cash book anonymous. */
  const txnLists = await Promise.all(
    accounts.map((a) =>
      safe(
        `payments for ${a.name}`,
        fetchCreditTxns(a.id, 1000).then((rows) =>
          rows.map((t) => ({ ...t, accountName: a.name, byName: t.by }))
        ),
        []
      )
    )
  );
  return {
    sales: (sales || []).map((s) => ({
      ts: s.ts, code: s.code, name: s.name, qty: s.qty, buyer: s.buyer,
      paid: s.paid, total: s.total, byName: s.by_name, method: s.method,
    })),
    expenses,
    receipts,
    creditAccounts: accounts,
    creditTxns: txnLists.flat(),
    items,
    opening,
    categories,
    problems,
  };
}

/* ============================================================
   THE PUBLIC ENQUIRY LIST — what a customer with no account sees,
   and the order they send back.

   Two calls out (a narrow view and one function, both set up in
   supabase/customer_enquiries.sql) and three calls in for staff. The public
   half never touches the inventory, notifications or sales tables: the view is
   a hand-picked list of columns, and the function is the only thing on this
   whole database an anonymous visitor is allowed to run.

   Nothing here changes a stock count. An order is a request for a call back —
   the sale is recorded by a person on the real screen, as it always was.
   ============================================================ */

/* The catalogue, in the same camelCase shape as the rest of the app so the
   public page can use the same helpers.

   NO PHOTOGRAPHS COME DOWN WITH THE LIST. The view sends has_photo and nothing
   else about the picture, so the shop window can be drawn the moment the words
   arrive. Photographs are asked for afterwards, by code, through
   fetchCataloguePhotos — because photographs here are stored inline as they came
   off a phone, and one part carrying a camera original used to mean minutes of
   blank screen and megabytes of somebody's bundle spent before a single price
   was readable. `photo` starts empty on every item and is filled in later. */
export function rowToCatalogueItem(r) {
  return {
    code: r.code,
    cat: r.cat,
    brand: r.brand || "",
    model: r.model || "",
    series: r.series || "",
    yearFrom: r.year_from,
    yearTo: r.year_to,
    condition: r.condition || "",
    side: r.side || "",
    variant: r.variant || "",
    color: r.color || "",
    name: r.name || "",
    /* 0 means nobody has written a price on this part. It is shown as "ask for
       the price" rather than as free, and rather than being hidden — most of
       this shop's shelf is priced at the counter. */
    price: Number(r.price) || 0,
    /* No quantity. The catalogue view stopped sending one: everything in it is
       in stock — that is the view's own filter — and how MANY the shop holds is
       nobody's business but the shop's. It is not read here because it does not
       arrive here, which is the only version of "the customer can't see it"
       that survives somebody opening the network tab. */
    /* False for a part with no photograph AND for one whose photograph is too
       heavy to send a customer — either way the page draws its coloured tile and
       nobody waits. */
    hasPhoto: r.has_photo === true,
    photo: "",
  };
}

/* THE CUSTOMER PAGE IS NARROWED BY SLUG, NOT BY shop_id.

   Everywhere else the shop is filtered through shopFrom(), which needs a signed-in
   session to know the shop's id. Nobody reading the parts list has one. So the
   three public views carry `shop_slug` — the same word that is in the address bar —
   and these three functions ask by that.

   Each one falls back to the unfiltered query when the column is not there yet,
   because until supabase/multishop/ has been pasted the views have no shop_slug and
   there is only one shop's stock behind them. Asking for a column that does not
   exist would take the whole parts list down for a customer standing in the shop. */
function shopSlugFilter(q) {
  const slug = currentShopSlug();
  return slug ? q.eq("shop_slug", slug) : q;
}

export async function fetchCatalogue() {
  const ask = (filtered) => {
    let q = supabase.from("catalogue").select("*");
    if (filtered) q = shopSlugFilter(q);
    return q.order("cat", { ascending: true }).order("name", { ascending: true });
  };

  let { data, error } = await ask(true);
  if (error && isNotMigrated(error)) ({ data, error } = await ask(false));
  if (error) throw error;
  return (data || []).map(rowToCatalogueItem);
}

/* The photographs for named parts, once their cards are on the screen.

   Asked for in small batches on purpose: the point of taking them out of the list
   was that nobody waits for a picture of a part they are not looking at. A batch
   that fails is not an error a customer should ever see — the cards keep their
   coloured tiles and the page carries on working, so this returns {} rather than
   throwing. */
export async function fetchCataloguePhotos(codes = []) {
  const want = [...new Set((codes || []).filter(Boolean))].slice(0, 40);
  if (!want.length) return {};
  const ask = (filtered) => {
    let q = supabase.from("catalogue_photos").select("code,photo");
    if (filtered) q = shopSlugFilter(q);
    return q.in("code", want);
  };
  try {
    let { data, error } = await ask(true);
    if (error && isNotMigrated(error)) ({ data, error } = await ask(false));
    if (error) throw error;
    const out = {};
    for (const r of data || []) if (r.photo) out[r.code] = r.photo;
    return out;
  } catch {
    return {};
  }
}

/* Section names for grouping. Optional in both directions: the app's built-in
   sections cover most of them, this covers the ones the shop added, and a shop
   that never ran part_categories.sql gets an empty list rather than an error. */
export async function fetchCatalogueSections() {
  const ask = (filtered) => {
    const q = supabase.from("catalogue_sections").select("*");
    return filtered ? shopSlugFilter(q) : q;
  };
  try {
    let { data, error } = await ask(true);
    if (error && isNotMigrated(error)) ({ data, error } = await ask(false));
    if (error) throw error;
    return (data || []).map((r) => ({ key: r.key, label: r.label, sort: r.sort ?? 100 }));
  } catch {
    return [];
  }
}

/* Send an order. The database re-reads every price and name from the inventory
   and ignores the browser's copy, so what comes back is the shop's own figures,
   not the customer's. It returns the reference to show them. */
/* "Function not found" as opposed to "the function said no". A missing function is
   a database that has not had a file pasted into it yet; anything else is a real
   answer and must not be retried or swallowed. */
function functionMissing(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "42883" || code === "PGRST202" || /could not find the function/i.test(msg);
}

export async function placeCustomerOrder({ customer, phone, note, items }) {
  const args = {
    p_customer: customer,
    p_phone: phone,
    p_note: note || "",
    p_items: (items || []).map((l) => ({ code: l.code, qty: l.qty })),
  };

  /* The shop the customer is actually standing in front of. Sent as the slug from
     the address bar, because an anonymous browser has no business holding internal
     ids — and without it every order from either storefront lands in Jaspare's
     notifications, which is a Surefit customer's basket ringing the wrong shop.

     The five-argument form only exists after multishop/04. Until then the old
     four-argument one is called, which is correct: before the migration there is
     only one shop. */
  let { data, error } = await supabase.rpc("place_customer_order", {
    ...args,
    p_shop_slug: currentShopSlug() || "",
  });
  if (error && functionMissing(error)) {
    ({ data, error } = await supabase.rpc("place_customer_order", args));
  }
  if (error) {
    /* The function raises in plain English on purpose — no name, no phone, an
       empty basket, too many in an hour — so its message is the one to show. */
    throw new Error(error.message || "That didn't send. Check your connection and try again.");
  }
  return data;
}

/* A customer reading their own order back, with no account.

   Needs BOTH the reference and the phone it was placed with, and the checking is
   done inside the database (order_lookup, in supabase/SETUP_REMAINING.sql) —
   customer_orders has no anon read policy at all, so there is no way to ask this
   question any other way. The reference alone would not be enough: they count
   upwards, and anybody could try the next one.

   Returns the order, or null for "no such order" — which is deliberately the same
   answer as "wrong number for that reference", because saying which of the two it
   was would turn this into a way of confirming that a reference exists.

   Throws { setup: true } when the function has not been created yet, so the
   screen can say "not available yet, please call" instead of showing a customer a
   Postgres error. */
export async function lookupCustomerOrder(ref, phone) {
  const args = {
    p_ref: String(ref || "").trim(),
    p_phone: String(phone || "").trim(),
  };

  /* With two shops, references start again from 0001 at each — so ENQ-2026-0001
     exists twice. The three-argument form asks within one shop and is the right
     one. The two-argument fallback is for a database that has not had multishop/04
     pasted yet; its own body refuses to answer if a reference and phone match at
     more than one shop, rather than picking whichever row came back first. */
  let { data, error } = await supabase.rpc("order_lookup", {
    ...args,
    p_shop_slug: currentShopSlug() || "",
  });
  if (error && functionMissing(error)) {
    ({ data, error } = await supabase.rpc("order_lookup", args));
  }
  if (error) {
    const msg = String(error.message || "");
    if (functionMissing(error)) {
      const e = new Error("Checking an order isn't switched on yet.");
      e.setup = true;
      throw e;
    }
    throw new Error(msg || "That couldn't be checked. Please call the shop.");
  }
  return data || null;
}

/* ---- the staff side of the same thing ---- */
function rowToCustomerOrder(r) {
  return {
    id: r.id,
    ref: r.ref,
    ts: new Date(r.ts).getTime(),
    customer: r.customer || "",
    phone: r.phone || "",
    note: r.note || "",
    lines: Array.isArray(r.items) ? r.items : [],
    pieces: Number(r.pieces) || 0,
    total: Number(r.total) || 0,
    status: r.status || "new",
    handledBy: r.handled_by || "",
    handledAt: r.handled_at ? new Date(r.handled_at).getTime() : null,
    source: r.source || "web",
  };
}

export async function fetchCustomerOrders(limit = 100) {
  const { data, error } = await shopFrom("customer_orders")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToCustomerOrder);
}

export async function setCustomerOrderStatus(id, status, who) {
  const { error } = await shopFrom("customer_orders")
    .update({ status, handled_by: who, handled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* One order, by the reference on its notification. The feed entry only carries a
   summary — "Premio front bumper and 2 more" — and somebody about to ring the
   customer needs the actual list, so the row fetches it when it's opened rather
   than every order being loaded with the feed. */
export async function fetchCustomerOrder(ref) {
  const { data, error } = await shopFrom("customer_orders")
    .select("*")
    .eq("ref", ref)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCustomerOrder(data) : null;
}

export function subscribeCustomerOrders(onChange) {
  const ch = supabase
    .channel("customer_orders_rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "customer_orders" }, () => onChange())
    .subscribe();
  return () => supabase.removeChannel(ch);
}
