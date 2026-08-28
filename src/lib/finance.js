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

/* A sale that was undone. undo_sale puts the part back on the shelf, so the books
   have to agree with the shelf: a returned sale that still counted as revenue would
   have the same part counted twice — once as money the shop earned, once as stock
   the shop still owns. Assets and profit would both be overstated, by the same
   amount, for good.

   It is one function rather than four conditions because there are four places a
   sale is read (the cash book, the trading account, what the shop is owed, and the
   ledger) and the fifth one somebody adds must not be the one that forgets. */
export const isLiveSale = (s) => !s.returnedAt;

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
                          equityMovements = [], receiptsAreSeparate = false } = {}) {
  const pots = emptyPots();
  const rows = [];

  for (const s of sales) {
    if (!inRange(s.ts, from, to)) continue;
    // Undone, part back on the shelf, money handed back. See isLiveSale.
    if (!isLiveSale(s)) continue;
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

  /* Money the owner puts into the business. Not income — it is not earned, and it
     must never reach the trading account — but it is unquestionably money arriving
     in a pot, and a cash book that cannot see it shows a drawer that does not
     agree with the one on the counter. A movement with no method never touched the
     shop's money (a machine bought with the owner's own cash), so it is left out
     of the pots and picked up by the balance sheet alone. */
  for (const m of equityMovements) {
    if (m.voidedAt) continue;
    if (m.kind !== "capital" || !m.method) continue;
    const when = m.happenedOn || m.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(m.amount);
    if (amount === 0) continue;
    const pot = toPot(m.method);
    pots[pot] += amount;
    rows.push({ ts: when, kind: "capital", pot, amount,
                label: "Capital introduced", note: m.note || "", by: m.byName || "" });
  }

  const total = POTS.reduce((s, p) => s + pots[p], 0);
  return { pots, total, rows };
}

/* ---- MONEY OUT ----

   Four streams, and the reason each is separate matters:

     expenses          rent, wages, and buying stock (flagged, not a loss)
     supplierPayments  settling a purchase invoice — money out, NOT an expense,
                       because the stock it bought is already on the shelf and
                       charging it again would tax the same parts twice
     drawings          the owner taking money out; not a business cost at all
     mpesaRefunds      money handed back to a customer

   ON READING REFUNDS BUT NOT PAYMENTS. supabase/mpesa.sql says in its header that
   nothing here may read mpesa_payments, because an M-Pesa sale already reaches the
   M-Pesa pot through sales.method and counting the table too would double it. A
   refund is the exception, and not an inconsistency: there is no OTHER record of it
   anywhere. Leaving it out would mean money genuinely left the till and no
   statement could see it. So the caller passes refunded rows only, explicitly. */
export function moneyOut({ expenses = [], supplierPayments = [], equityMovements = [],
                           mpesaRefunds = [], from, to } = {}) {
  const pots = emptyPots();
  const rows = [];
  const byCategory = {};
  let stockSpend = 0;   // buying parts: cash out, but not a loss
  let running = 0;      // the true running expenses
  let supplierPaid = 0; // settling invoices: cash out, not a loss either
  let drawings = 0;     // the owner's own money out
  let refunded = 0;     // handed back to customers

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

  for (const sp of supplierPayments) {
    if (sp.voidedAt) continue;
    const when = sp.paidOn || sp.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(sp.amount);
    if (amount === 0) continue;
    const pot = toPot(sp.method);
    pots[pot] += amount;
    supplierPaid += amount;
    rows.push({ ts: when, kind: "supplier_payment", pot, amount,
                label: "Supplier payment", who: sp.supplierName || "",
                note: sp.reference || "", by: sp.byName || "" });
  }

  for (const m of equityMovements) {
    if (m.voidedAt) continue;
    if (m.kind !== "drawings" || !m.method) continue;
    const when = m.happenedOn || m.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(m.amount);
    if (amount === 0) continue;
    const pot = toPot(m.method);
    pots[pot] += amount;
    drawings += amount;
    rows.push({ ts: when, kind: "drawings", pot, amount,
                label: "Owner's drawings", note: m.note || "", by: m.byName || "" });
  }

  /* Refunds always leave the M-Pesa pot, because that is where they came in and
     that is the only place Safaricom can send them back from. */
  for (const r of mpesaRefunds) {
    const when = r.refundAt || r.refundRequestedAt || r.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(r.refundAmount);
    if (amount === 0) continue;
    pots["M-Pesa"] += amount;
    refunded += amount;
    rows.push({ ts: when, kind: "refund", pot: "M-Pesa", amount,
                label: "M-Pesa refund", who: r.phone || "",
                note: r.refundReason || "", by: r.refundRequestedBy || "" });
  }

  const total = POTS.reduce((s, p) => s + pots[p], 0);
  return { pots, total, rows, byCategory, stockSpend, runningExpenses: running,
           supplierPaid, drawings, refunded };
}

/* ---- THE CASH BOOK ----
   Opening + in - out = closing, per pot. Shown side by side so the owner can
   count the drawer and check it against the Cash column. */
export function cashBook({ opening = {}, sales = [], creditTxns = [], receipts = [],
                           expenses = [], supplierPayments = [], equityMovements = [],
                           mpesaRefunds = [], from, to, receiptsAreSeparate = false } = {}) {
  const inn = moneyIn({ sales, creditTxns, receipts, equityMovements, from, to, receiptsAreSeparate });
  const out = moneyOut({ expenses, supplierPayments, equityMovements, mpesaRefunds, from, to });

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
    /* One list of names rather than "is it an expense", so a stream added later
       cannot default to counting as money IN by omission. */
    .map((r) => ({ ...r, signed: OUT_KINDS.has(r.kind) ? -r.amount : r.amount }));

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

/* Every kind that takes money out of a pot. Named explicitly: the old test was
   `kind === "expense"`, and the moment supplier payments and drawings arrived that
   would have added them to the day's takings. */
const OUT_KINDS = new Set(["expense", "supplier_payment", "drawings", "refund"]);

/* ---- TRADING / PROFIT AND LOSS ----
   Revenue counts EVERY sale in the period, paid or not - a sale on credit is
   still a sale that was earned. That is why profit and cash never match, and
   the screen says so rather than leaving the owner to wonder. */
export function profitAndLoss({ sales = [], expenses = [], mpesaRefunds = [],
                                from, to, vatRate = 0.16 } = {}) {
  let revenue = 0;
  let unpaidRevenue = 0;
  let units = 0;

  for (const s of sales) {
    if (!inRange(s.ts, from, to)) continue;
    if (!isLiveSale(s)) continue;   // see isLiveSale
    const total = num(s.total);
    revenue += total;
    units += num(s.qty);
    if (s.paid === false) unpaidRevenue += total;
  }

  /* A refund is a sale undone. It comes off revenue rather than sitting in
     expenses, because treating money handed back as a cost of trading would leave
     turnover overstated for good — and turnover is the figure the shop is judged
     on. Shown on its own line so it is never silently netted away. */
  let refunds = 0;
  for (const r of mpesaRefunds) {
    if (!inRange(r.refundAt || r.refundRequestedAt || r.ts, from, to)) continue;
    refunds += num(r.refundAmount);
  }
  const netRevenue = revenue - refunds;

  const grossProfit = estimatedProfit(netRevenue, vatRate);
  const costOfSales = netRevenue - grossProfit;
  const out = moneyOut({ expenses, from, to });
  // Buying stock is left out: it is not a cost until the part is sold, and
  // the cost of what WAS sold is already in costOfSales above. Including it
  // would charge the same stock to profit twice.
  const netProfit = grossProfit - out.runningExpenses;

  return {
    revenue, units, unpaidRevenue, refunds, netRevenue,
    paidRevenue: revenue - unpaidRevenue,
    costOfSales, grossProfit,
    expenses: out.runningExpenses,
    expensesByCategory: out.byCategory,
    stockSpend: out.stockSpend,
    netProfit,
    marginPct: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
    vatRate,
    assumedVat: assumedVat(netRevenue, vatRate),
    /* Said out loud, on every screen and every printout that shows these figures.
       What a part cost is not recorded anywhere, so cost of sales and gross profit
       are worked out from the shop's own rule — see estimatedProfit. They are
       estimates, and an estimate presented as a fact is the beginning of a bad
       decision. */
    costIsEstimated: true,
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
                               expenses = [], purchaseInvoices = [], supplierPayments = [],
                               equityMovements = [], stockAdjustments = [],
                               mpesaRefunds = [], asOf, vatRate = 0.16,
                               receiptsAreSeparate = false } = {}) {
  // Everything from the beginning up to the date asked for.
  const book = cashBook({ opening, sales, creditTxns, receipts, expenses,
                          supplierPayments, equityMovements, mpesaRefunds,
                          to: asOf, receiptsAreSeparate });
  const stock = stockValue(items, vatRate);
  /* Stock written off. Signed, so the sum is the adjustment and there is no case
     analysis here. It moves the VALUE only — the count on the shelf is corrected by
     the person holding the part, in Add Stock. Two systems that both believe they
     own the stock count will disagree inside a week. */
  const writeOffs = stockAdjustments.reduce(
    (t, a) => (a.voidedAt || !inRange(a.happenedOn || a.ts, null, asOf) ? t : t + num(a.value)), 0);
  const stockAfter = Math.max(0, stock.cost + writeOffs);

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
    stock: stockAfter,
    debtors,
    unpaidSales: unpaidWalkIn,
  };
  const totalAssets = cashAtBank + stockAfter + debtors + unpaidWalkIn;

  /* What the shop owes suppliers: invoices raised, less what has been paid
     against them. See the header of supabase/finance_ledger.sql for why an
     invoice adds a liability and no matching asset — the parts it paid for are
     already counted on the shelf, so adding them again would count them twice,
     and an unpaid bill genuinely does reduce what the business is worth. */
  const ap = payables({ purchaseInvoices, supplierPayments, asOf });
  const liabilities = { suppliers: ap.outstanding };
  const totalLiabilities = ap.outstanding;

  /* Day one, plus everything since. The two opening figures used to be the whole
     story, which made a balance sheet that was right on the first morning and
     wrong by the end of the month. */
  const eq = equityTotals({ equityMovements, opening, asOf });
  const capital = eq.capital;
  const drawings = eq.drawings;
  const equity = totalAssets - totalLiabilities;

  return {
    asOf: asOf || null,
    assets, totalAssets,
    liabilities, totalLiabilities,
    capital, drawings,
    capitalOpening: eq.capitalOpening, capitalSince: eq.capitalSince,
    drawingsOpening: eq.drawingsOpening, drawingsSince: eq.drawingsSince,
    payables: ap, writeOffs, stockBeforeWriteOffs: stock.cost,
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

/* ---- WHAT THE SHOP OWES SUPPLIERS ----
   Invoice by invoice, so a bill can be chased rather than only totalled, and a
   payment on account (money handed over with no invoice named) is not lost.

   Overdue is worked out against `today` passed in, never against the clock read
   in here: a figure that changes depending on when a statement is reprinted is a
   figure nobody can check. */
export function payables({ purchaseInvoices = [], supplierPayments = [], asOf, today } = {}) {
  const live = purchaseInvoices.filter(
    (i) => !i.voidedAt && inRange(i.invoicedOn || i.ts, null, asOf));
  const paidRows = supplierPayments.filter(
    (p) => !p.voidedAt && inRange(p.paidOn || p.ts, null, asOf));

  const paidByInvoice = {};
  let onAccount = 0;
  for (const p of paidRows) {
    if (p.invoiceId) paidByInvoice[p.invoiceId] = (paidByInvoice[p.invoiceId] || 0) + num(p.amount);
    else onAccount += num(p.amount);
  }

  const cutoff = today ? dayKey(today) : null;
  const invoices = live.map((i) => {
    const paid = paidByInvoice[i.id] || 0;
    const due = Math.max(0, num(i.amount) - paid);
    return {
      ...i, paid, due,
      settled: due < 0.5,
      overdue: Boolean(due >= 0.5 && i.dueOn && cutoff && dayKey(i.dueOn) < cutoff),
    };
  }).sort((a, b) => String(a.dueOn || a.invoicedOn).localeCompare(String(b.dueOn || b.invoicedOn)));

  const billed = live.reduce((t, i) => t + num(i.amount), 0);
  const paid = paidRows.reduce((t, p) => t + num(p.amount), 0);

  /* Payments on account are subtracted from the total owed but cannot be pinned to
     an invoice, so the two never quite tally and the screen shows both. Clamped at
     zero: a supplier the shop has overpaid is not a negative debt, it is a credit,
     and pretending otherwise would quietly inflate what the business is worth. */
  const outstanding = Math.max(0, billed - paid);

  const bySupplier = {};
  for (const i of invoices) {
    const k = i.supplierName || "(no supplier named)";
    bySupplier[k] = (bySupplier[k] || 0) + i.due;
  }

  return { invoices, billed, paid, onAccount, outstanding, bySupplier,
           overdue: invoices.filter((i) => i.overdue).reduce((t, i) => t + i.due, 0) };
}

/* ---- WHAT THE SHOP IS OWED ----
   The other side of the same coin, kept here so Accounts Receivable and Accounts
   Payable are read from one place and cannot drift apart in their arithmetic. */
export function receivables({ creditAccounts = [], sales = [], asOf } = {}) {
  const accounts = creditAccounts
    .map((a) => ({ ...a, due: Math.max(0, num(a.balance)) }))
    .filter((a) => a.due >= 0.5)
    .sort((a, b) => b.due - a.due);

  const names = new Set(
    creditAccounts.map((a) => String(a.name || "").trim().toLowerCase()).filter(Boolean));
  const walkIns = sales.filter((s) =>
    s.paid === false
    && isLiveSale(s)
    && inRange(s.ts, null, asOf)
    && !names.has(String(s.buyer || "").trim().toLowerCase()));

  return {
    accounts,
    accountsTotal: accounts.reduce((t, a) => t + a.due, 0),
    walkIns,
    walkInsTotal: walkIns.reduce((t, s) => t + num(s.total), 0),
    get total() { return this.accountsTotal + this.walkInsTotal; },
  };
}

/* ---- THE OWNER'S STAKE ----
   Opening figures are day one; movements are everything since. Kept apart in the
   answer so a balance sheet can show "put in on day one" and "put in since"
   separately, which is the question an owner actually asks. */
export function equityTotals({ equityMovements = [], opening = {}, asOf } = {}) {
  let capitalSince = 0;
  let drawingsSince = 0;
  for (const m of equityMovements) {
    if (m.voidedAt) continue;
    if (!inRange(m.happenedOn || m.ts, null, asOf)) continue;
    const amount = num(m.amount);
    if (m.kind === "capital") capitalSince += amount;
    else if (m.kind === "drawings") drawingsSince += amount;
  }
  const capitalOpening = num(opening.capital);
  const drawingsOpening = num(opening.drawings);
  return {
    capitalOpening, capitalSince, capital: capitalOpening + capitalSince,
    drawingsOpening, drawingsSince, drawings: drawingsOpening + drawingsSince,
    net: capitalOpening + capitalSince - drawingsOpening - drawingsSince,
  };
}

/* ---- THE GENERAL LEDGER ----

   Every movement of money, in date order, with the account it belongs to and a
   running balance for that account.

   WHAT THIS IS NOT. It is not posted double entry. There is no journal table; each
   line here is worked out from the sale, expense or payment that caused it, which
   is why no figure on it can disagree with the records underneath. The cost of that
   choice is that it cannot be audited as a book of prime entry, and the screen says
   so on its face rather than letting it be assumed.

   Each line carries `debit` and `credit` against a named account so a trial balance
   can be built from the same source and the two can never tell different stories. */
export const ACCOUNTS = {
  CASH: "Cash", MPESA: "M-Pesa", BANK: "Bank",
  STOCK: "Stock", DEBTORS: "Accounts receivable", CREDITORS: "Accounts payable",
  SALES: "Sales", COGS: "Cost of sales (estimated)",
  CAPITAL: "Owner's capital", DRAWINGS: "Owner's drawings",
  REFUNDS: "Refunds", WRITEOFF: "Stock written off",
};

export function generalLedger({ sales = [], creditTxns = [], receipts = [], expenses = [],
                                purchaseInvoices = [], supplierPayments = [],
                                equityMovements = [], stockAdjustments = [],
                                mpesaRefunds = [], from, to,
                                receiptsAreSeparate = false } = {}) {
  const lines = [];
  const add = (ts, account, debit, credit, label, ref) => {
    if (!num(debit) && !num(credit)) return;
    lines.push({ ts, account, debit: num(debit), credit: num(credit), label, ref: ref || "" });
  };

  for (const s of sales) {
    if (!inRange(s.ts, from, to)) continue;
    if (!isLiveSale(s)) continue;   // see isLiveSale
    const total = num(s.total);
    if (!total) continue;
    const label = s.name || s.code || "Sale";
    // Paid: the pot is debited. Unpaid: the customer owes it.
    add(s.ts, s.paid === false ? ACCOUNTS.DEBTORS : toPot(s.method), total, 0, label, s.code || "");
    add(s.ts, ACCOUNTS.SALES, 0, total, label, s.code || "");
  }

  for (const t of creditTxns) {
    if (!inRange(t.ts, from, to)) continue;
    const amount = num(t.amount);
    if (!amount || t.kind !== "payment") continue;
    add(t.ts, toPot(t.method), amount, 0, "Account payment", t.accountName || "");
    add(t.ts, ACCOUNTS.DEBTORS, 0, amount, "Account payment", t.accountName || "");
  }

  if (receiptsAreSeparate) {
    for (const r of receipts) {
      if (!inRange(r.ts, from, to)) continue;
      const amount = num(r.paid) || num(r.total);
      if (!amount) continue;
      add(r.ts, toPot(r.method), amount, 0, "Receipt", r.number || "");
      add(r.ts, ACCOUNTS.SALES, 0, amount, "Receipt", r.number || "");
    }
  }

  for (const e of expenses) {
    if (e.voidedAt) continue;
    const when = e.spentOn || e.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(e.amount);
    if (!amount) continue;
    /* Buying stock is not a cost. It is money turning into an asset, so it debits
       Stock, not an expense account — the cost of what was SOLD is charged
       separately, when it sells. */
    add(when, e.isStock ? ACCOUNTS.STOCK : e.category, amount, 0,
        e.description || e.category, e.reference || "");
    add(when, toPot(e.method), 0, amount, e.category, e.reference || "");
  }

  for (const i of purchaseInvoices) {
    if (i.voidedAt) continue;
    const when = i.invoicedOn || i.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(i.amount);
    if (!amount) continue;
    /* Debits Stock, credits the supplier. On the balance sheet the debit is
       ignored, because the shelf is already counted — see balanceSheet. Here it is
       shown, because a ledger that credits a supplier and debits nothing does not
       balance and would make the trial balance look broken. */
    add(when, ACCOUNTS.STOCK, amount, 0, "Purchase invoice", i.invoiceNo || "");
    add(when, ACCOUNTS.CREDITORS, 0, amount, i.supplierName || "Supplier", i.invoiceNo || "");
  }

  for (const sp of supplierPayments) {
    if (sp.voidedAt) continue;
    const when = sp.paidOn || sp.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(sp.amount);
    if (!amount) continue;
    add(when, ACCOUNTS.CREDITORS, amount, 0, sp.supplierName || "Supplier", sp.reference || "");
    add(when, toPot(sp.method), 0, amount, "Supplier payment", sp.reference || "");
  }

  for (const m of equityMovements) {
    if (m.voidedAt) continue;
    const when = m.happenedOn || m.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(m.amount);
    if (!amount) continue;
    /* No method means the money never touched the shop's pots — the owner paid a
       supplier out of their own pocket, say. There is nothing to put on the other
       side of the entry, because the thing bought was never recorded either, so a
       line here would be a credit with no matching debit and would make the trial
       balance look broken for a reason that has nothing to do with the books. It is
       left to the balance sheet, which counts it in the owner's stake without
       needing a second leg. */
    if (!m.method) continue;
    const pot = toPot(m.method);
    if (m.kind === "capital") {
      add(when, pot, amount, 0, "Capital introduced", m.note || "");
      add(when, ACCOUNTS.CAPITAL, 0, amount, "Capital introduced", m.note || "");
    } else {
      add(when, ACCOUNTS.DRAWINGS, amount, 0, "Owner's drawings", m.note || "");
      add(when, pot, 0, amount, "Owner's drawings", m.note || "");
    }
  }

  for (const a of stockAdjustments) {
    if (a.voidedAt) continue;
    const when = a.happenedOn || a.ts;
    if (!inRange(when, from, to)) continue;
    const v = num(a.value);
    if (!v) continue;
    // A write-off is a loss: it debits the loss account and credits the stock away.
    add(when, ACCOUNTS.WRITEOFF, v < 0 ? -v : 0, v > 0 ? v : 0, a.reason || "Adjustment", a.code || "");
    add(when, ACCOUNTS.STOCK, v > 0 ? v : 0, v < 0 ? -v : 0, a.reason || "Adjustment", a.code || "");
  }

  for (const r of mpesaRefunds) {
    const when = r.refundAt || r.refundRequestedAt || r.ts;
    if (!inRange(when, from, to)) continue;
    const amount = num(r.refundAmount);
    if (!amount) continue;
    add(when, ACCOUNTS.REFUNDS, amount, 0, "M-Pesa refund", r.receipt || "");
    add(when, ACCOUNTS.MPESA, 0, amount, "M-Pesa refund", r.receipt || "");
  }

  lines.sort((a, b) => new Date(a.ts) - new Date(b.ts));

  // Running balance per account, which is the whole reason to open a ledger.
  const running = {};
  for (const l of lines) {
    running[l.account] = (running[l.account] || 0) + l.debit - l.credit;
    l.balance = running[l.account];
  }

  const byAccount = {};
  for (const l of lines) {
    const a = (byAccount[l.account] ||= { account: l.account, debit: 0, credit: 0, lines: [] });
    a.debit += l.debit;
    a.credit += l.credit;
    a.lines.push(l);
  }

  const totalDebit = lines.reduce((t, l) => t + l.debit, 0);
  const totalCredit = lines.reduce((t, l) => t + l.credit, 0);

  return {
    lines, byAccount, totalDebit, totalCredit,
    /* Both sides come from the same loop, so this is arithmetic rather than proof.
       Checked anyway: if it ever fails, one of the pairs above is missing a leg. */
    balanced: Math.abs(totalDebit - totalCredit) < 1,
  };
}

/* ---- TRIAL BALANCE ----
   One line per account, debit or credit whichever way it fell. Built from the
   ledger above, so the two cannot disagree.

   BE HONEST ABOUT WHAT IT PROVES: nothing. It balances because every line above
   was written as a matching pair, not because a bookkeeper's entries were checked
   against each other. It is useful for seeing where money sat, and it is not an
   audit. The screen and the printout both say so. */
export function trialBalance(ledger) {
  const rows = Object.values(ledger?.byAccount || {})
    .map((a) => {
      const net = a.debit - a.credit;
      return { account: a.account, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0,
               grossDebit: a.debit, grossCredit: a.credit };
    })
    .filter((r) => r.debit >= 0.5 || r.credit >= 0.5)
    .sort((a, b) => a.account.localeCompare(b.account));

  const debit = rows.reduce((t, r) => t + r.debit, 0);
  const credit = rows.reduce((t, r) => t + r.credit, 0);
  return { rows, debit, credit, difference: debit - credit,
           balanced: Math.abs(debit - credit) < 1, derived: true };
}

/* ---- CASH FLOW ----
   Where the money in the drawer came from and went, in the three groups a
   statement uses. Built from the cash book, so it can only ever add up to the
   movement the cash book already shows — `check` proves it.

   There is no investing section with anything in it: the shop has nowhere to
   record buying a machine or a vehicle. Shown as zero and labelled, rather than
   left off, so nobody wonders whether it was forgotten. */
export function cashFlow({ book, pl } = {}) {
  const inn = book?.in?.pots || emptyPots();
  const out = book?.out || {};
  const totalIn = POTS.reduce((t, p) => t + num(inn[p]), 0);

  const capitalIn = (book?.in?.rows || [])
    .filter((r) => r.kind === "capital")
    .reduce((t, r) => t + num(r.amount), 0);

  const operatingIn = totalIn - capitalIn;
  const operatingOut = num(out.runningExpenses) + num(out.stockSpend)
                     + num(out.supplierPaid) + num(out.refunded);
  const financingIn = capitalIn;
  const financingOut = num(out.drawings);

  const operating = operatingIn - operatingOut;
  const investing = 0;
  const financing = financingIn - financingOut;
  const movement = operating + investing + financing;

  return {
    operatingIn, operatingOut, operating,
    investing,
    financingIn, financingOut, financing,
    movement,
    opening: num(book?.openingTotal),
    closing: num(book?.openingTotal) + movement,
    netProfit: num(pl?.netProfit),
    /* Proof, not decoration. If this is not zero the three groups above have lost
       or invented money and the screen must say so. */
    check: (num(book?.openingTotal) + movement) - num(book?.closingTotal),
  };
}

/* Month keys ("2026-08") newest first, for the period picker. Built from the
   data that exists, so the list can never offer an empty month. */
export function monthsPresent({ sales = [], expenses = [], creditTxns = [],
                                purchaseInvoices = [], supplierPayments = [],
                                equityMovements = [], stockAdjustments = [] } = {}) {
  const set = new Set();
  const add = (ts) => { const k = dayKey(ts); if (k) set.add(k.slice(0, 7)); };
  sales.forEach((s) => add(s.ts));
  expenses.forEach((e) => add(e.spentOn || e.ts));
  creditTxns.forEach((t) => add(t.ts));
  purchaseInvoices.forEach((i) => add(i.invoicedOn || i.ts));
  supplierPayments.forEach((p) => add(p.paidOn || p.ts));
  equityMovements.forEach((m) => add(m.happenedOn || m.ts));
  stockAdjustments.forEach((a) => add(a.happenedOn || a.ts));
  return [...set].sort().reverse();
}

export function monthRange(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  if (!y || !m) return { from: undefined, to: undefined };
  const last = new Date(y, m, 0).getDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(last).padStart(2, "0")}` };
}
