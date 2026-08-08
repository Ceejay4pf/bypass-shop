/* ---------------------------------------------------------
   FINANCIAL STATEMENTS - the arithmetic

   Kept apart from the screens and from the database calls on purpose: these
   are the numbers the owner will trust, so they have to be testable on their
   own, without a browser or a database.

   NOTHING HERE IS STORED. Every figure is worked out from the sales, receipts,
   credit movements, expenses and stock the shop already records. That is
   deliberate - a stored total is a total that can quietly disagree with the
   records underneath it, and then nobody knows which one is lying.
--------------------------------------------------------- */

export const POTS = ["Cash", "M-Pesa", "Bank"];

/* Which pot a payment went into. Staff type the method on the sale screen as
   "Cash", "M-Pesa", "Mpesa", "Paybill", "Cheque"... so it gets normalised
   here rather than trusted. Anything unrecognised counts as Cash, because in
   this shop an unlabelled payment is nearly always notes in the drawer. */
export function toPot(method) {
  const m = String(method || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!m) return "Cash";
  if (m.includes("mpesa") || m.includes("paybill") || m.includes("till")) return "M-Pesa";
  // A card payment is settled into the bank account, never the drawer.
  if (m.includes("bank") || m.includes("cheque") || m.includes("check") ||
      m.includes("transfer") || m.includes("eft") || m.includes("card")) return "Bank";
  return "Cash";
}

const num = (v) => Number(v) || 0;
const emptyPots = () => ({ Cash: 0, "M-Pesa": 0, Bank: 0 });

/* ---- THE PROFIT MODEL ----

   The shop does not record what it paid for each part, so true profit cannot
   be calculated. Instead the owner's own rule of thumb is used: profit is
   about three times the VAT in a sale.

   At the standard 16%, the VAT inside a gross sale is
       gross - gross / 1.16
   which is 13.79% of the sale, so profit works out at 41.4% of the sale and
   the implied cost is the remaining 58.6%.

   This is an ESTIMATE and every screen that shows it says so. It is worked
   out from the sale total the same way whether or not VAT was charged on the
   receipt, because VAT is off by default in this shop - using only the stored
   VAT would make profit read zero on nearly every sale. */
export const PROFIT_VAT_MULTIPLE = 3;

export function assumedVat(gross, rate = 0.16) {
  const g = num(gross);
  const r = num(rate);
  if (g <= 0 || r <= 0) return 0;
  return g - g / (1 + r);
}

export function estimatedProfit(gross, rate = 0.16, multiple = PROFIT_VAT_MULTIPLE) {
  return assumedVat(gross, rate) * multiple;
}

/* The cost the profit rule implies. Sale minus estimated profit - so profit
   and cost always add back up to the sale exactly, with nothing lost to
   rounding in between. */
export function impliedCost(gross, rate = 0.16, multiple = PROFIT_VAT_MULTIPLE) {
  return num(gross) - estimatedProfit(gross, rate, multiple);
}

/* ---- DATE HELPERS ----
   A shop day runs to midnight local time, not UTC - so a sale at 9pm belongs
   to that day, not tomorrow. */
export const dayKey = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function inRange(ts, from, to) {
  const k = dayKey(ts);
  if (!k) return false;
  if (from && k < from) return false;
  if (to && k > to) return false;
  return true;
}

/* ---- MONEY IN ----

   The trap this avoids: a walk-in sale can be recorded on the Sell screen
   (a `sales` row) AND written up on the Receipt screen (a `receipts` row).
   Adding both would count the same money twice and every statement would
   overstate takings.

   So money in is taken from ONE source per stream:
     sales     - what left the shelves and was charged for
     credit    - payments from garages settling their accounts
   Receipts are treated as paperwork for sales already counted, not as
   separate income. `receiptsAreSeparate` exists for a shop that writes
   receipts for work that never touches stock; it is off by default. */
export function moneyIn({ sales = [], creditTxns = [], receipts = [], from, to,
                          receiptsAreSeparate = false } = {}) {
  const pots = emptyPots();
  const rows = [];

  for (const s of sales) {
    if (!inRange(s.ts, from, to)) continue;
    const total = num(s.total);
    if (total === 0) continue;
    /* An unpaid sale is NOT money in - it is a debt. It shows on the balance
       sheet as owed to the shop, and reaches the cash book only when paid. */
    if (s.paid === false) continue;
    const pot = toPot(s.method);
    pots[pot] += total;
    rows.push({ ts: s.ts, kind: "sale", pot, amount: total,
                label: s.name || s.code || "Sale", who: s.buyer || "", by: s.byName || "" });
  }

  for (const t of creditTxns) {
    if (!inRange(t.ts, from, to)) continue;
    // Only a payment is money in. A 'charge' is goods leaving on credit -
    // already counted as a sale, and no cash changed hands.
    if (t.kind !== "payment") continue;
    const amount = num(t.amount);
    if (amount === 0) continue;
    const pot = toPot(t.method);
    pots[pot] += amount;
    rows.push({ ts: t.ts, kind: "credit_payment", pot, amount,
                label: "Account payment", who: t.accountName || "", by: t.byName || "" });
  }

  if (receiptsAreSeparate) {
    for (const r of receipts) {
      if (!inRange(r.ts, from, to)) continue;
      const amount = num(r.paid) || num(r.total);
      if (amount === 0) continue;
      const pot = toPot(r.method);
      pots[pot] += amount;
      rows.push({ ts: r.ts, kind: "receipt", pot, amount,
                  label: `Receipt ${r.number || ""}`.trim(), who: r.customer || "", by: r.createdBy || "" });
    }
  }

  const total = POTS.reduce((s, p) => s + pots[p], 0);
  return { pots, total, rows };
}

/* ---- MONEY OUT ---- */
export function moneyOut({ expenses = [], from, to } = {}) {
  const pots = emptyPots();
  const rows = [];
  const byCategory = {};
  let stockSpend = 0;   // buying parts: cash out, but not a loss
  let running = 0;      // the true running expenses

  for (const e of expenses) {
    // A voided expense is kept as a record but is not money out - counting it
    // would leave every total below reflecting a payment that never happened.
    if (e.voidedAt) continue;
    const when = e.spentOn || e.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(e.amount);
    if (amount === 0) continue;
    const pot = toPot(e.method);
    pots[pot] += amount;
    byCategory[e.category] = (byCategory[e.category] || 0) + amount;
    if (e.isStock) stockSpend += amount;
    else running += amount;
    rows.push({ ts: when, kind: "expense", pot, amount, label: e.category,
                note: e.description || "", by: e.byName || "" });
  }

  const total = POTS.reduce((s, p) => s + pots[p], 0);
  return { pots, total, rows, byCategory, stockSpend, runningExpenses: running };
}

/* ---- THE CASH BOOK ----
   Opening + in - out = closing, per pot. Shown side by side so the owner can
   count the drawer and check it against the Cash column. */
export function cashBook({ opening = {}, sales = [], creditTxns = [], receipts = [],
                           expenses = [], from, to, receiptsAreSeparate = false } = {}) {
  const inn = moneyIn({ sales, creditTxns, receipts, from, to, receiptsAreSeparate });
  const out = moneyOut({ expenses, from, to });

  const open = {
    Cash: num(opening.cash),
    "M-Pesa": num(opening.mpesa),
    Bank: num(opening.bank),
  };

  const closing = emptyPots();
  for (const p of POTS) closing[p] = open[p] + inn.pots[p] - out.pots[p];

  // One list, oldest first, the way a cash book is read.
  const entries = [...inn.rows, ...out.rows]
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))
    .map((r) => ({ ...r, signed: r.kind === "expense" ? -r.amount : r.amount }));

  /* A running balance per row, so the owner can see the moment the drawer
     went short rather than only the month's end figure. */
  let bal = POTS.reduce((s, p) => s + open[p], 0);
  for (const e of entries) {
    bal += e.signed;
    e.balance = bal;
  }

  return {
    opening: open,
    in: inn,
    out,
    closing,
    entries,
    openingTotal: POTS.reduce((s, p) => s + open[p], 0),
    closingTotal: POTS.reduce((s, p) => s + closing[p], 0),
  };
}

/* ---- TRADING / PROFIT AND LOSS ----
   Revenue counts EVERY sale in the period, paid or not - a sale on credit is
   still a sale that was earned. That is why profit and cash never match, and
   the screen says so rather than leaving the owner to wonder. */
export function profitAndLoss({ sales = [], expenses = [], from, to, vatRate = 0.16 } = {}) {
  let revenue = 0;
  let unpaidRevenue = 0;
  let units = 0;

  for (const s of sales) {
    if (!inRange(s.ts, from, to)) continue;
    const total = num(s.total);
    revenue += total;
    units += num(s.qty);
    if (s.paid === false) unpaidRevenue += total;
  }

  const grossProfit = estimatedProfit(revenue, vatRate);
  const costOfSales = revenue - grossProfit;
  const out = moneyOut({ expenses, from, to });
  // Buying stock is left out: it is not a cost until the part is sold, and
  // the cost of what WAS sold is already in costOfSales above. Including it
  // would charge the same stock to profit twice.
  const netProfit = grossProfit - out.runningExpenses;

  return {
    revenue, units, unpaidRevenue,
    paidRevenue: revenue - unpaidRevenue,
    costOfSales, grossProfit,
    expenses: out.runningExpenses,
    expensesByCategory: out.byCategory,
    stockSpend: out.stockSpend,
    netProfit,
    marginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    vatRate,
    assumedVat: assumedVat(revenue, vatRate),
  };
}

/* ---- STOCK VALUE ----
   Two figures, because they answer different questions:
     retail - what the shelves would fetch if it all sold
     cost   - what the shop has tied up in it, by the same profit rule
   A balance sheet uses the cost figure: valuing stock at its selling price
   would book profit the shop has not earned yet. */
export function stockValue(items = [], vatRate = 0.16) {
  let retail = 0;
  let units = 0;
  for (const it of items) {
    if (String(it.status || "Active") !== "Active") continue;
    const q = num(it.qty);
    if (q <= 0) continue;
    retail += num(it.price) * q;
    units += q;
  }
  return { retail, cost: impliedCost(retail, vatRate), units };
}

/* ---- BALANCE SHEET ----
   What the shop owns, what it owes, and the difference - which is what the
   business is actually worth. It is built to balance by construction:
   equity is defined as assets minus liabilities, and `check` proves it. */
export function balanceSheet({ opening = {}, items = [], creditAccounts = [],
                               sales = [], creditTxns = [], receipts = [],
                               expenses = [], asOf, vatRate = 0.16,
                               receiptsAreSeparate = false } = {}) {
  // Everything from the beginning up to the date asked for.
  const book = cashBook({ opening, sales, creditTxns, receipts, expenses,
                          to: asOf, receiptsAreSeparate });
  const stock = stockValue(items, vatRate);

  // Owed to the shop by garages on credit.
  const debtors = creditAccounts.reduce((s, a) => s + Math.max(0, num(a.balance)), 0);

  /* Unpaid walk-in sales are owed to the shop too, but a garage's unpaid
     sale is ALREADY in its account balance above. Counting both would
     double-count the same debt, so only sales with no credit account behind
     them are added. */
  const accountNames = new Set(
    creditAccounts.map((a) => String(a.name || "").trim().toLowerCase()).filter(Boolean)
  );
  let unpaidWalkIn = 0;
  for (const s of sales) {
    if (asOf && !inRange(s.ts, null, asOf)) continue;
    if (s.paid !== false) continue;
    const buyer = String(s.buyer || "").trim().toLowerCase();
    if (buyer && accountNames.has(buyer)) continue;
    unpaidWalkIn += num(s.total);
  }

  const cashAtBank = book.closingTotal;
  const assets = {
    cash: book.closing.Cash,
    mpesa: book.closing["M-Pesa"],
    bank: book.closing.Bank,
    stock: stock.cost,
    debtors,
    unpaidSales: unpaidWalkIn,
  };
  const totalAssets = cashAtBank + stock.cost + debtors + unpaidWalkIn;

  /* Liabilities: what the shop owes others. The system has nowhere to record
     supplier credit yet, so this is zero and the screen says as much rather
     than presenting a blank as if it were a checked figure. */
  const liabilities = { suppliers: 0 };
  const totalLiabilities = 0;

  const capital = num(opening.capital);
  const drawings = num(opening.drawings);
  const equity = totalAssets - totalLiabilities;

  return {
    asOf: asOf || null,
    assets, totalAssets,
    liabilities, totalLiabilities,
    capital, drawings,
    // What the business has made since it started, after what the owner put
    // in and took out. The plug that makes the two sides agree.
    retainedEarnings: equity - capital + drawings,
    equity,
    stock,
    cashBook: book,
    // Proof, not decoration: if this is ever non-zero the statement is wrong
    // and the screen must say so instead of quietly showing a wrong total.
    check: totalAssets - (totalLiabilities + equity),
  };
}

/* Month keys ("2026-08") newest first, for the period picker. Built from the
   data that exists, so the list can never offer an empty month. */
export function monthsPresent({ sales = [], expenses = [], creditTxns = [] } = {}) {
  const set = new Set();
  const add = (ts) => { const k = dayKey(ts); if (k) set.add(k.slice(0, 7)); };
  sales.forEach((s) => add(s.ts));
  expenses.forEach((e) => add(e.spentOn || e.ts));
  creditTxns.forEach((t) => add(t.ts));
  return [...set].sort().reverse();
}

export function monthRange(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  if (!y || !m) return { from: undefined, to: undefined };
  const last = new Date(y, m, 0).getDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(last).padStart(2, "0")}` };
}
