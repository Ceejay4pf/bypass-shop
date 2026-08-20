/* ---------------------------------------------------------
   BYPASS SHOP — the customer's basket, and the searching of the public list

   The public page has no account behind it, so this is all there is: a few
   lines in localStorage on the customer's own phone. Kept pure and away from
   the screen so the arithmetic can be tested, because the arithmetic is what a
   customer reads and then believes.

   THE ONE THING THIS FILE IS CAREFUL ABOUT
   Most of this shop's shelf has no price written on it — the price is given at
   the counter. So a basket is usually part figures and part "ask us", and a
   total that quietly counts an unpriced part as nothing would tell somebody
   their four parts come to KES 9,000 when three of them haven't been priced
   yet. The total therefore carries its own count of what it could not include,
   and the screen has to say so.

   Nothing here touches stock. A basket is a request for a phone call.
--------------------------------------------------------- */

const KEY = "bypass.basket.v1";
const MAX_LINES = 40;     // the database refuses more, so refuse it here too
const MAX_PER_LINE = 99;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* A basket line is deliberately its own little record rather than a pointer to
   a catalogue row: the customer may leave the page open for an hour, and what
   they were shown when they added it is what they will expect to be charged.
   The shop's own figure still wins when the order is sent — the database
   re-reads it — but the two disagreeing is worth being able to see. */
export function cartLine(item, qty = 1) {
  return {
    code: item.code,
    name: item.name || item.code,
    price: n(item.price),
    photo: item.photo || "",
    condition: item.condition || "",
    /* What the shelf said at the time, so the basket can warn when somebody
       asks for three of something there is one of. */
    stock: n(item.qty),
    qty: clamp(Math.round(n(qty)) || 1, 1, MAX_PER_LINE),
  };
}

export function addToCart(cart, item, qty = 1) {
  const list = Array.isArray(cart) ? cart : [];
  const at = list.findIndex((l) => l.code === item.code);
  if (at >= 0) {
    const next = [...list];
    next[at] = { ...next[at], qty: clamp(next[at].qty + (Math.round(n(qty)) || 1), 1, MAX_PER_LINE) };
    return next;
  }
  if (list.length >= MAX_LINES) return list;   // full; the screen says why
  return [...list, cartLine(item, qty)];
}

export function setCartQty(cart, code, qty) {
  const want = Math.round(n(qty));
  /* Zero means take it out. A stepper that stops at one leaves people holding a
     part they have decided against, and there is no other way off the line. */
  if (want <= 0) return removeFromCart(cart, code);
  return (cart || []).map((l) => (l.code === code ? { ...l, qty: clamp(want, 1, MAX_PER_LINE) } : l));
}

export function removeFromCart(cart, code) {
  return (cart || []).filter((l) => l.code !== code);
}

export const cartFull = (cart) => (cart || []).length >= MAX_LINES;

/* What the basket comes to, and what it honestly cannot say.
   `quoted` is the number of lines with no price on them — the screen must show
   that number next to the total or the total is a lie by omission. */
export function cartTotals(cart) {
  const list = Array.isArray(cart) ? cart : [];
  let pieces = 0, priced = 0, quoted = 0, total = 0, over = 0;
  for (const l of list) {
    const qty = clamp(Math.round(n(l.qty)) || 1, 1, MAX_PER_LINE);
    pieces += qty;
    if (n(l.price) > 0) {
      priced += 1;
      total += n(l.price) * qty;
    } else {
      quoted += 1;
    }
    if (n(l.stock) > 0 && qty > n(l.stock)) over += 1;
  }
  return { lines: list.length, pieces, priced, quoted, total, over };
}

/* ---- kept on the customer's own phone ---- */
export function loadCart() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l.code === "string")
      .slice(0, MAX_LINES)
      .map((l) => ({ ...l, qty: clamp(Math.round(n(l.qty)) || 1, 1, MAX_PER_LINE) }));
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  const list = (Array.isArray(cart) ? cart : []).slice(0, MAX_LINES);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* A full or private-mode storage loses the basket on reload, which is not
       worth interrupting anybody about. What is on screen still works. */
  }
  return list;
}

export function clearCart() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
  return [];
}

/* ---- what the customer typed, against what is on the shelf ----

   Every word has to match something, but each word may match a different field:
   "toyota premio bumper" is a make, a model and a section, and requiring one
   field to contain the whole phrase finds nothing. Order doesn't matter either,
   because "premio toyota" is how people type. */
export function matchesQuery(item, query, sectionLabel = "") {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    item.code, item.name, item.brand, item.model, item.series, item.condition,
    item.side, item.variant, item.color, sectionLabel,
    item.yearFrom, item.yearTo,
  ]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* The year as a customer reads it: "2010–2015", "2010 on", or nothing at all
   rather than a stray dash. */
export function yearText(item) {
  const from = n(item.yearFrom), to = n(item.yearTo);
  if (from && to && from !== to) return `${from}–${to}`;
  if (from) return `${from} on`;
  if (to) return `up to ${to}`;
  return "";
}

export const priceText = (price) =>
  n(price) > 0 ? `KES ${Math.round(n(price)).toLocaleString()}` : "Ask for the price";
