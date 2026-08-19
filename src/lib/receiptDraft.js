/* ---------------------------------------------------------
   BYPASS SHOP — turning what already happened into a document

   Two things the shop was typing twice.

   A quotation is a list of parts and prices, agreed with a customer. When they
   come back and pay, that same list was being typed again into the Receipt
   screen from a printed page — the one moment where a slip changes the money.

   A sale is already recorded: the part, how many, who bought it, what it came
   to. Writing the receipt meant naming those parts again by hand, while the
   system was holding them the whole time.

   Nothing here touches the database or React. It takes records that exist and
   returns the draft a document starts from, so it can be tested by reading it.
--------------------------------------------------------- */

/* A receipt line, in the shape both screens already use: desc, qty, price, all
   as strings because they are typed into text inputs and a controlled input with
   a number in it fights the person editing it. */
function line(desc, qty, price) {
  return {
    desc: String(desc || "").trim(),
    qty: String(Math.max(1, Number(qty) || 1)),
    /* Blank, not "0". A zero in a price box reads as free, and somebody clearing
       it to type the real figure has to delete the 0 first. Blank asks the
       question. */
    price: Number(price) > 0 ? String(Math.round(Number(price))) : "",
  };
}

/* ---------- from a quotation ---------- */

/* The whole quote, ready to be a receipt. The discount comes across too: it was
   agreed with the customer and dropping it would quietly charge them more than
   the paper they are holding says.

   `fromQuote` is carried so the receipt screen can say where the figures came
   from, and so the quote can be stamped Converted once the receipt actually
   saves — not before. A quote marked Converted against a receipt that failed to
   save is a quote nobody will quote from again. */
export function quoteToDraft(quote) {
  if (!quote) return null;
  return {
    customer: quote.customer || "",
    phone: quote.phone || "",
    lines: (quote.lines || []).map((l) => line(l.desc, l.qty, l.price)),
    discount: Number(quote.discount) > 0 ? String(Math.round(Number(quote.discount))) : "",
    fromQuote: { id: quote.id, number: quote.number },
  };
}

/* ---------- from sales already recorded ---------- */

/* One sale as a receipt line. The part's name and the code, because a receipt
   with "Doors - Honda CR-V" on it and nothing else does not tell a customer
   which door they bought, and the code is what is on the shelf label.

   The price is worked back out of what the sale came to, since that is the
   figure the money actually moved on. A sale recorded with no total leaves the
   box blank rather than putting a 0 on a receipt. */
export function saleToLine(sale) {
  const qty = Math.max(1, Number(sale?.qty) || 1);
  const each = Number(sale?.total) > 0 ? Number(sale.total) / qty : 0;
  const name = String(sale?.name || "").trim();
  const code = String(sale?.code || "").trim();
  const desc = name && code ? `${name} (${code})` : name || code;
  return line(desc, qty, each);
}

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

/* Recent sales gathered into the documents they would become: one per customer
   per day. Per day, not per customer outright, because a garage that buys every
   week wants a receipt for this delivery and not for the last four.

   A returned sale is left out. The goods came back and the money with them, so
   putting it on a receipt would be charging for something the shop has on the
   shelf.

   `now` is passed in rather than read from the clock so this can be tested. */
export function groupSalesForReceipt(sales = [], { days = 7, now = 0 } = {}) {
  const cutoff = (now || 0) - days * 86400000;
  const groups = new Map();
  for (const s of sales) {
    if (!s || s.returnedAt) continue;
    if (now && Number(s.ts) < cutoff) continue;
    /* No buyer written down is still a sale that happened, and a walk-in is the
       commonest sale in the shop. They are grouped as one "Walk-in" batch for
       the day rather than dropped, and split apart by tapping if need be. */
    const buyer = String(s.buyer || "").trim();
    const key = `${buyer.toLowerCase() || "(walk-in)"}|${dayKey(s.ts)}`;
    if (!groups.has(key)) {
      groups.set(key, { key, buyer, phone: String(s.phone || "").trim(), ts: Number(s.ts) || 0, sales: [], total: 0 });
    }
    const g = groups.get(key);
    g.sales.push(s);
    g.total += Number(s.total) || 0;
    /* The newest moment in the batch, so the list sorts by when the shop last
       served this customer rather than when it first did. */
    if (Number(s.ts) > g.ts) g.ts = Number(s.ts);
    if (!g.phone && s.phone) g.phone = String(s.phone).trim();
  }
  return [...groups.values()].sort((a, b) => b.ts - a.ts);
}

/* A batch of sales as a receipt draft. Called with one group from above, or with
   a hand-picked set of sales. */
export function salesToDraft(sales = []) {
  const list = (sales || []).filter((s) => s && !s.returnedAt);
  if (!list.length) return null;
  const withBuyer = list.find((s) => String(s.buyer || "").trim());
  const withPhone = list.find((s) => String(s.phone || "").trim());
  return {
    customer: withBuyer ? String(withBuyer.buyer).trim() : "",
    phone: withPhone ? String(withPhone.phone).trim() : "",
    lines: list.map(saleToLine),
    discount: "",
    /* Which sales this came from. Carried so the receipt can name them, and so
       the same sale is not receipted twice by accident. */
    fromSales: list.map((s) => s.id).filter(Boolean),
  };
}

/* Sale ids that already appear on a saved receipt, so the picker can say so
   rather than letting the shop hand the same customer two receipts for one
   delivery. Receipts store `fromSales` on the row when they were built this way;
   older receipts have nothing, and are simply not counted — an absent record is
   not evidence. */
export function receiptedSaleIds(receipts = []) {
  const out = new Set();
  for (const r of receipts) for (const id of r?.fromSales || []) out.add(id);
  return out;
}
