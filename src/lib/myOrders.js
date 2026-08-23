/* ---------------------------------------------------------
   BYPASS SHOP — the orders this phone has sent

   The customer page has no account. So when somebody sends a basket, the only
   record they get is a reference on a screen they are about to close, and the
   next thing they say on the phone is "I sent something, I don't remember the
   number".

   This keeps the references on their own phone. It is a receipt book, not a
   database: what was sent, when, how many pieces, and the reference to quote.
   Nothing here can read the shop's records — the shop's answer comes from
   order_lookup(), which needs the reference AND the phone number, and is asked
   for one order at a time.

   THE PHONE NUMBER IS KEPT TOO, and that deserves saying out loud, because it
   is the customer's own number sitting in their own browser. It is kept for one
   reason: checking an order needs it, and asking somebody to retype the number
   they used three weeks ago is how a feature goes unused. It never leaves the
   phone except as the argument to that one lookup.

   Pure functions over a storage object, so all of it is tested without a
   browser.
--------------------------------------------------------- */

export const ORDERS_KEY = "bypass.myorders.v1";

/* Enough to be useful, few enough that nothing ever needs pruning in anger. A
   customer with more than twenty live enquiries has a relationship with the shop
   that runs through the phone, not this page. */
export const MAX_KEPT = 20;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* The digits only, which is how order_lookup compares them: a number saved as
   "+254 768 553182" and typed back as "0768553182" is the same phone. */
export function digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/* One entry from a basket that has just been sent.

   `lines` is trimmed to name and quantity — not price. The price a customer was
   shown before the shop quoted is the least reliable number in the whole
   exchange, and keeping it here would mean this page could show one figure while
   the shop's reply showed another. What the parts cost is the shop's answer, and
   it comes from the lookup. */
export function orderRecord({ ref, phone, name = "", lines = [], at = 0 }) {
  return {
    ref: String(ref || "").trim().toUpperCase(),
    phone: digits(phone),
    name: String(name || "").trim(),
    at: n(at),
    pieces: (Array.isArray(lines) ? lines : []).reduce((s, l) => s + (n(l.qty) || 1), 0),
    lines: (Array.isArray(lines) ? lines : []).slice(0, 40).map((l) => ({
      name: String(l.name || l.code || "").slice(0, 120),
      qty: n(l.qty) || 1,
    })),
  };
}

export function readOrders(store) {
  try {
    const raw = store?.getItem(ORDERS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // Newest first, and anything without a reference is unusable here.
    return list.filter((o) => o && o.ref).slice(0, MAX_KEPT);
  } catch {
    return [];
  }
}

/* Add one and return the new list. Newest first, and a reference that is already
   there replaces the old entry rather than appearing twice — sending the same
   basket after a failed-looking attempt is common, and the database gives the
   same reference back. */
export function addOrder(store, record) {
  const rec = record && record.ref ? record : null;
  if (!rec) return readOrders(store);
  const next = [rec, ...readOrders(store).filter((o) => o.ref !== rec.ref)].slice(0, MAX_KEPT);
  try { store?.setItem(ORDERS_KEY, JSON.stringify(next)); } catch { /* not worth a word */ }
  return next;
}

export function forgetOrder(store, ref) {
  const want = String(ref || "").trim().toUpperCase();
  const next = readOrders(store).filter((o) => o.ref !== want);
  try { store?.setItem(ORDERS_KEY, JSON.stringify(next)); } catch { /* not worth a word */ }
  return next;
}

export function clearOrders(store) {
  try { store?.removeItem(ORDERS_KEY); } catch { /* not worth a word */ }
  return [];
}

/* ---- what the shop's reply means, in the customer's words ----

   The status column is written by staff for staff: new / called / done /
   cancelled. Handing those four words to a customer would be telling them the
   shop's internal state and expecting them to care. These say what has happened
   to them instead. */
export const STATUS_WORDS = {
  new:       { label: "With the shop",  tone: "wait", say: "Sent. The shop has it and will ring you." },
  called:    { label: "Quoted",         tone: "good", say: "The shop has been through it — the prices are below." },
  done:      { label: "Completed",      tone: "good", say: "Finished. Thanks for your business." },
  cancelled: { label: "Cancelled",      tone: "off",  say: "This one was cancelled. Call the shop if that's wrong." },
};

export function statusWords(status) {
  return STATUS_WORDS[String(status || "").toLowerCase()] || {
    label: "With the shop",
    tone: "wait",
    say: "Sent. The shop has it and will ring you.",
  };
}

/* Whether the shop's reply is worth calling a quotation.

   A quote is prices, and this shop mostly does not carry them: a reply where
   every line is blank is a phone call waiting to happen, not a document. So the
   page only calls it a quotation when at least one line has a figure on it —
   otherwise it says the shop has seen it and will ring, which is the truth. */
export function isQuote(reply) {
  const lines = Array.isArray(reply?.items) ? reply.items : [];
  return lines.some((l) => n(l.price) > 0);
}

/* The total of what is actually priced, and how many lines could not be counted.
   The same rule as the basket: a total that treats an unpriced part as free is a
   number somebody will hold the shop to. */
export function quoteTotals(reply) {
  const lines = Array.isArray(reply?.items) ? reply.items : [];
  let total = 0;
  let unpriced = 0;
  let pieces = 0;
  for (const l of lines) {
    const qty = n(l.qty) || 1;
    pieces += qty;
    const price = n(l.price);
    if (price > 0) total += price * qty;
    else unpriced += 1;
  }
  return { total, unpriced, pieces, lines: lines.length };
}
