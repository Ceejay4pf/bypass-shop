/* ---------------------------------------------------------
   API layer — all Supabase reads/writes live here.
   Maps between DB rows (snake_case) and app items (camelCase),
   and records notifications + stock movements for every action.
--------------------------------------------------------- */
import { supabase } from "./supabase.js";

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
export async function fetchInventory() {
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(rowToItem);
}

// Generate a unique serial from the DB sequence (safe across devices),
// then build the rich code the same way the app always has.
export async function nextSerial() {
  const { data, error } = await supabase.rpc("next_inventory_serial");
  if (error) throw error;
  return data;
}

export async function insertItem(item, byName) {
  const row = { ...itemToRow(item), created_by: byName };
  const { data, error } = await supabase.from("inventory").insert(row).select().single();
  if (error) throw error;
  await addNotification({ type: "new_item", code: item.code, name: item.name, qty: item.qty, by_name: byName, remaining: item.qty });
  await addMovement({ code: item.code, type: "new_item", qty: item.qty, by_name: byName, remaining: item.qty, supplier: item.supplier });
  return rowToItem(data);
}

export async function deleteItem(code, byName) {
  const { error } = await supabase.from("inventory").delete().eq("code", code);
  if (error) throw error;
  await addNotification({ type: "delete", code, by_name: byName });
  await addMovement({ code, type: "delete", by_name: byName });
}

/* ---- STOCK CHANGES (atomic, via DB functions) ---- */
export async function addStock(code, amount, byName, supplier = "") {
  const { data: newQty, error } = await supabase.rpc("add_stock", { p_code: code, p_amount: amount });
  if (error) throw error;
  if (supplier) await supabase.from("inventory").update({ supplier }).eq("code", code);
  const name = await itemName(code);
  await addNotification({ type: "stock", code, name, qty: amount, by_name: byName, remaining: newQty });
  await addMovement({ code, type: "stock", qty: amount, by_name: byName, remaining: newQty, supplier });
  return newQty;
}

export async function sellItem({ code, qty, buyer, phone, paid, total }, byName) {
  const { data: newQty, error } = await supabase.rpc("sell_item", { p_code: code, p_qty: qty });
  if (error) throw error;
  const name = await itemName(code);
  await addNotification({ type: "sale", code, name, qty, by_name: byName, buyer, phone, paid, total, remaining: newQty });
  await addMovement({ code, type: "sale", qty, by_name: byName, buyer, paid, remaining: newQty });
  await supabase.from("sales").insert({ code, name, qty, buyer, phone, paid, total, by_name: byName });
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
  };
}
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
export async function addNotification(n) {
  const { error } = await supabase.from("notifications").insert(n);
  if (error) console.error("notification insert failed", error);
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
  const { error } = await supabase.from("stock_movements").insert(m);
  if (error) console.error("movement insert failed", error);
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
