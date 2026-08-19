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

/* The shop's day, not the calendar's in London. `toISOString()` is UTC, and
   Nairobi is three hours ahead of it — a sale rung up at 1am would be filed
   under yesterday, so the batch for a late night would arrive split in two. */
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/* Same day as the clock says now. Used to decide what is safe to fill in
   without being asked. */
export function isToday(ts, now) {
  return !!ts && !!now && dayKey(ts) === dayKey(now);
}

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

/* ---------- what the screen can fill in without being asked ---------- */

/* The one batch a blank Receipt screen should open already holding.

   The shop asked for the parts to "already be there" — not for a button to go
   looking for them. But filling a receipt in unasked is only safe when there is
   no question about which sale is meant, so this is deliberately narrow:

     - today only. Yesterday's delivery is a decision, not an assumption.
     - not already on a receipt.
     - exactly one candidate. Two customers served this morning and a guess
       would put one of them on the other's receipt.

   Anything else returns null, and the screen shows the list instead and lets
   somebody choose. Getting this wrong is worse than not doing it: a receipt that
   arrives pre-filled looks authoritative, and the figures are the ones the
   customer is charged. */
export function autoFillBatch(batches = [], receipted = new Set(), { now = 0 } = {}) {
  const open = batches.filter(
    (b) => isToday(b.ts, now) && b.sales.length && !b.sales.some((s) => receipted.has(s.id))
  );
  return open.length === 1 ? open[0] : null;
}

/* Batches worth showing in the picker, newest first, with the ones still needing
   a receipt above the ones already done — that is the order somebody is actually
   working in. */
export function sortBatchesForPicker(batches = [], receipted = new Set()) {
  const done = (b) => (b.sales.length && b.sales.every((s) => receipted.has(s.id)) ? 1 : 0);
  return [...batches].sort((a, b) => done(a) - done(b) || b.ts - a.ts);
}

/* ---------- the prices still to write ---------- */

/* "Yu will just write the prices" — so say how many are left, and which.
   A line with a part named but no price is the work remaining; a line with
   nothing on it at all is just an empty row and is not counted. */
export function priceGaps(lines = []) {
  const gaps = [];
  lines.forEach((l, i) => {
    const named = String(l?.desc || "").trim();
    if (!named) return;
    if (!(Number(l?.price) > 0)) gaps.push({ index: i, desc: named });
  });
  return gaps;
}

/* What the shelf says this part sells for, so a missing price is one tap rather
   than a walk to the shelf. The code is on the line as "(DOR-HON-CRV-XX-FL-0293)"
   because that is what saleToLine writes, so it can be read back out.

   Only a price the shop has actually set is offered. A part priced at 0 in the
   inventory is a part nobody has priced yet, and suggesting 0 would put "free"
   on a receipt. */
export function suggestPrice(line, items = []) {
  const m = /\(([A-Z0-9-]{4,})\)\s*$/.exec(String(line?.desc || ""));
  if (!m) return 0;
  const held = items.find((i) => i.code === m[1]);
  const price = Number(held?.price) || 0;
  return price > 0 ? Math.round(price) : 0;
}

/* ---------- finding a quotation from the Receipt screen ---------- */

/* A quote is written, and days later the customer walks in to pay. They give a
   name or wave a printed page with a number on it — so both have to find it.

   Matched word by word rather than as one run of text, because "kamau 0014" is
   how somebody who has both facts in front of them types. Still to be converted
   comes first: that is what a person standing at the counter is looking for. */
export function findQuotes(quotes = [], query = "") {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (q) => {
    const hay = `${q.number || ""} ${q.customer || ""} ${q.phone || ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  return quotes
    .filter((q) => (q.lines || []).length > 0 && hit(q))
    .sort((a, b) => (a.status === "Converted" ? 1 : 0) - (b.status === "Converted" ? 1 : 0) || b.ts - a.ts);
}

/* Which quote numbers already have a receipt, and the receipt that came from
   each. Read off the receipts, not off the quote's own status, because the
   status is a label somebody could have set by hand — the receipt row is the
   evidence that money changed hands. */
export function receiptsByQuote(receipts = []) {
  const map = new Map();
  for (const r of receipts) {
    const n = r?.fromQuote;
    if (n && !map.has(n)) map.set(n, r.number);
  }
  return map;
}
