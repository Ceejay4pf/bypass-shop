/* ---------------------------------------------------------
   API layer — all Supabase reads/writes live here.
   Maps between DB rows (snake_case) and app items (camelCase),
   and records notifications + stock movements for every action.
--------------------------------------------------------- */
import { supabase, createIsolatedClient } from "./supabase.js";
import { toLoginEmail } from "./auth.js";

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
    min: r.min_qty ?? 3,
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
    min_qty: i.min ?? 3,
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
  const { data, error } = await supabase
    .from("inventory")
    .select(ITEM_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(rowToItem);
}

/* The photos, fetched after the list is already on screen. Returns a map of
   code -> images array so the caller can merge them in. */
export async function fetchInventoryImages() {
  const { data, error } = await supabase
    .from("inventory")
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
  const { data, error } = await supabase
    .from("inventory")
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
  const { data, error } = await supabase.from("inventory").insert(row).select().single();
  if (error) throw error;
  if (!batch) {
    await addNotification({ type: "new_item", code: item.code, name: item.name, qty: item.qty, by_name: byName, remaining: item.qty });
  }
  await addMovement({ code: item.code, type: "new_item", qty: item.qty, by_name: byName, remaining: item.qty, supplier: item.supplier });
  if (!batch) {
    emailAdmin(
      `Bypass Shop — new item added: ${item.code}`,
      `A new item was added to inventory:<br><br><b>${item.code}</b> — ${item.name}<br>Quantity: ${item.qty}`,
      byName
    );
  }
  return rowToItem(data);
}

// Edit a part's details (not quantity — that stays with Add Stock / Sell).
// Whitelists editable fields so a save can never clobber code/qty by accident.
export async function updateItem(code, patch, byName) {
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
  const { data, error } = await supabase
    .from("inventory")
    .update(row)
    .eq("code", code)
    .select()
    .single();
  if (error) throw error;
  await addNotification({ type: "adjust", code, name: patch.name, by_name: byName });
  await addMovement({ code, type: "adjust", by_name: byName, reason: "Edited part details" });
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
    const { data } = await supabase.from("inventory").select("name,qty").eq("code", code).single();
    name = data?.name ?? null;
    qty = data?.qty ?? null;
  } catch {
    /* the part may already be gone; carry on with what we have */
  }

  const { error } = await supabase.from("inventory").delete().eq("code", code);
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
    `Bypass Shop — ${parts.length} part${parts.length !== 1 ? "s" : ""} ${what}`,
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
  const verb = { new_item: "added", delete: "removed", stock: "restocked" }[type] || type;
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
  if (supplier) await supabase.from("inventory").update({ supplier }).eq("code", code);
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
    const { data } = await supabase.from("inventory").select("qty").eq("code", code).single();
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
  let saleErr = (await supabase.from("sales").insert(saleRow)).error;
  if (saleErr && (saleErr.code === "PGRST204" || /method/.test(saleErr.message || ""))) {
    const { method: _drop, ...noMethod } = saleRow;
    saleErr = (await supabase.from("sales").insert(noMethod)).error;
  }
  // Not thrown: the stock is already deducted and the movement logged, so
  // failing the call now would tell staff the sale didn't happen when it did.
  if (saleErr) console.error("sale insert failed", saleErr);
  emailAdmin(
    `Bypass Shop — stock sold: ${code}`,
    `Stock was deducted from a sale:<br><br><b>${code}</b> — ${name}<br>Sold: ${qty} (remaining: ${newQty})<br>` +
      `Customer: ${buyer || "—"}${phone ? " · " + phone : ""}<br>Total: KES ${Number(total || 0).toLocaleString()} — ${paid ? "Paid" : "Pending"}`,
    byName
  );
  return newQty;
}

export async function adjustQty(code, newQty, reason, byName) {
  const { data: qty, error } = await supabase.rpc("set_qty", { p_code: code, p_qty: newQty });
  if (error) throw error;
  const name = await itemName(code);
  await addNotification({ type: "adjust", code, name, qty: newQty, by_name: byName, remaining: qty });
  await addMovement({ code, type: "adjust", qty: newQty, by_name: byName, reason, remaining: qty });
  return qty;
}

async function itemName(code) {
  const { data } = await supabase.from("inventory").select("name").eq("code", code).single();
  return data?.name || code;
}

/* ---- CATEGORIES THE SHOP ADDS ITSELF ----
   The built-in thirteen are in data.js; these are the extra sections an admin
   creates in Settings (boot lights, hinges, bulbs, headlight computers…).
   See supabase/part_categories.sql. */

export async function fetchPartCategories() {
  const { data, error } = await supabase
    .from("part_categories")
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
  const { data, error } = await supabase
    .from("part_categories")
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
  const { error } = await supabase.from("part_categories").update(patch).eq("key", key);
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
  const { data, error } = await supabase
    .from("notifications")
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
  let { error } = await supabase.from("notifications").insert(n);
  if (error && isMissingColumn(error)) {
    ({ error } = await supabase.from("notifications").insert(withoutLaterColumns(n)));
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
  let q = supabase.from("stock_movements").select("*").order("ts", { ascending: false });
  if (code) q = q.eq("code", code);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function addMovement(m) {
  let { error } = await supabase.from("stock_movements").insert(m);
  if (error && isMissingColumn(error)) {
    ({ error } = await supabase.from("stock_movements").insert(withoutLaterColumns(m)));
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
  const { count } = await supabase.from("quotes").select("*", { count: "exact", head: true });
  return `QT-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
}

export async function fetchQuotes(limit = 200) {
  const { data, error } = await supabase
    .from("quotes")
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
  const { data, error } = await supabase.from("quotes").insert(row).select().single();
  if (error) throw error;
  return rowToQuote(data);
}

export async function setQuoteStatus(id, status) {
  const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
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
    by: r.created_by || "",
  };
}

// Next human-friendly receipt number: RCP-<year>-<0000>.
async function nextReceiptNumber() {
  const { data, error } = await supabase.rpc("next_receipt_number");
  if (!error && data) return data;
  const year = new Date().getFullYear();
  const { count } = await supabase.from("receipts").select("*", { count: "exact", head: true });
  return `RCP-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
}

export async function fetchReceipts(limit = 200) {
  const { data, error } = await supabase
    .from("receipts")
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
    created_by: byName || null,
  };
  const { data, error } = await supabase.from("receipts").insert(row).select().single();
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
  const { data, error } = await supabase
    .from("credit_accounts")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map(rowToAccount);
}

export async function addCreditAccount({ name, contact, phone, notes }, byName) {
  const { data, error } = await supabase
    .from("credit_accounts")
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
  const { error } = await supabase.from("credit_accounts").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteCreditAccount(id) {
  const { error } = await supabase.from("credit_accounts").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCreditTxns(accountId, limit = 300) {
  const { data, error } = await supabase
    .from("credit_txns")
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
  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToTransfer);
}

export async function addTransfer({ direction, otherBranch, code, item, qty, note }, byName) {
  const { data, error } = await supabase
    .from("transfers")
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
  const { error } = await supabase.from("transfers").delete().eq("id", id);
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
export async function fetchSales(limit = 500) {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/* Every sale by one person, newest first. */
export async function fetchSalesBy(person, limit = 500) {
  const { data, error } = await supabase
    .from("sales")
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
  const { data, error } = await supabase
    .from("notifications")
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
    options: { data: { full_name: name.trim(), phone: usesEmail ? "" : c } },
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
  const { data, error } = await supabase
    .from("staff_contacts")
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
  const { error } = await supabase.from("staff_contacts").insert({
    dept: (dept || "General").trim(),
    name: (name || "").trim(),
    role: (role || "").trim() || null,
    phone: (phone || "").trim(),
  });
  if (error) throw error;
}

export async function deleteStaffContact(id) {
  const { error } = await supabase.from("staff_contacts").delete().eq("id", id);
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
  };
}

// Load recent messages, oldest first (so the newest sits at the bottom).
export async function fetchMessages(limit = 200) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToMessage).reverse();
}

export async function sendMessage({ userId, author, body }) {
  const text = String(body || "").trim();
  if (!text) return;
  const { data, error } = await supabase
    .from("messages")
    .insert({ user_id: userId, author, body: text })
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
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("spent_on", { ascending: false })
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToExpense);
}

export async function addExpense({ spentOn, category, description, amount, method, reference }, byName) {
  const { data, error } = await supabase
    .from("expenses")
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
  const { error } = await supabase
    .from("expenses")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: byName || null,
      void_reason: reason || null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchExpenseCategories() {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .order("sort", { ascending: true });
  if (error) throw error;
  return (data || []).map((c) => ({ name: c.name, isStock: c.is_stock === true }));
}

/* The opening balances. Returns nulls when the row has never been filled in,
   so the screen can ask for it rather than silently starting from zero and
   presenting a wrong position as if it were checked. */
export async function fetchOpening() {
  const { data, error } = await supabase
    .from("finance_opening")
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
  const { error } = await supabase.from("finance_opening").upsert({
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
