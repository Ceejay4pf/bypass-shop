/* ---------------------------------------------------------
   FINANCE — the tab, and the three statements.

   THE TREE, in the owner's own words:

     Dashboard             revenue, expenses, gross profit, net profit,
                           cash balance, inventory value
     Sales                 sales invoices · customer payments · accounts receivable
     Purchases             purchase invoices · supplier payments · accounts payable
     Inventory valuation   stock value · cost of sales · stock adjustments
     Expenses              the printable expense ledger
     Cash & bank           the cash book, every entry
     General ledger        every movement, by account
     Trial balance         both sides, and whether they agree
     Financial statements  income statement · balance sheet · cash flow statement
     Equity                what the owner put in and took out
     Opening balances      what was in Cash / M-Pesa / Bank on day one

   WHAT IS IN THIS FILE and what is not. The three statements are here, because
   they are the reason the tab exists. Everything that feeds them — purchases,
   receivables, valuation, the ledger — is in financeBooks.jsx, and the pieces they
   are all built from are in financeUI.jsx. The split is by weight, not by subject:
   one file of two thousand lines is one file nobody reads before changing.

   NOT ONE FIGURE ON ANY OF THESE SCREENS IS A STORED TOTAL. Every one is worked
   out by src/lib/finance.js from the sales, expenses, invoices and payments
   underneath, so no number here can quietly disagree with the records it came
   from. The cost of that is that there is no journal to audit, and the general
   ledger says so on its face.

   NOTHING IN FINANCE TOUCHES A STOCK COUNT. The owner's words: "but they dont
   affet thestock in the shop". Parts arrive through Add Stock and leave through
   Sales, and that is the only pair of doors.

   ADMIN ONLY — and not only here. The database refuses non-admins too
   (supabase/finance.sql, supabase/finance_ledger.sql), because a screen the app
   hides is still a screen anyone can reach with the app's own key.
--------------------------------------------------------- */
import React, { useEffect, useState } from "react";
import {
  Wallet, TrendingUp, Scale, Plus, Trash2, AlertTriangle, Check,
  RefreshCw, Loader2, Landmark, Lock, LayoutDashboard, ShoppingCart, Truck,
  Boxes, BookOpen, FileText, PiggyBank, Banknote,
} from "lucide-react";
import * as api from "./lib/api.js";
import { Field, inputCls, SectionTitle, fmtDateTime } from "./ui.jsx";
import {
  cashBook, profitAndLoss, balanceSheet, payables, receivables, equityTotals,
  generalLedger, trialBalance, cashFlow, monthsPresent, monthRange,
  PROFIT_VAT_MULTIPLE,
} from "./lib/finance.js";
import { statementHtml } from "./lib/statementPrint.js";
import { reportHtml, expenseLedgerHtml, cashFlowHtml } from "./lib/ledgerPrint.js";
import { SHOP_INFO } from "./lib/shopInfo.js";
import { shopAccent } from "./lib/shopSkin.js";
import {
  KES, Line, Card, Stat, Estimate, PrintButton, Warn, Good,
  ListRow, Empty, printDoc, printHtml, todayKey, prevDayOf, monthName, dayText,
} from "./financeUI.jsx";
import {
  PotsTable, EntriesList, CashBankView,
  PurchaseInvoicesView, SupplierPaymentsView, PayablesView,
  SalesInvoicesView, CustomerPaymentsView, ReceivablesView,
  StockValueView, CogsView, StockAdjustmentsView,
  EquityView, LedgerView, TrialBalanceView,
} from "./financeBooks.jsx";

/* ---- THE TREE ----
   One list, so the buttons across the top and the screen underneath can never
   disagree about what exists. A group with `views` gets a second row of chips; a
   group without goes straight to its own screen. */
const TREE = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sales", label: "Sales", icon: ShoppingCart, views: [
      { id: "sales-invoices", label: "Sales invoices" },
      { id: "sales-payments", label: "Customer payments" },
      { id: "receivables", label: "Accounts receivable" },
    ] },
  { id: "purchases", label: "Purchases", icon: Truck, views: [
      { id: "purchase-invoices", label: "Purchase invoices" },
      { id: "supplier-payments", label: "Supplier payments" },
      { id: "payables", label: "Accounts payable" },
    ] },
  { id: "valuation", label: "Inventory valuation", icon: Boxes, views: [
      { id: "stock-value", label: "Stock value" },
      { id: "cogs", label: "Cost of sales" },
      { id: "stock-adjustments", label: "Stock adjustments" },
    ] },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "cash", label: "Cash & bank", icon: Banknote },
  { id: "ledger", label: "General ledger", icon: BookOpen },
  { id: "trial", label: "Trial balance", icon: Scale },
  { id: "statements", label: "Financial statements", icon: FileText, views: [
      { id: "st-income", label: "Income statement" },
      { id: "st-balance", label: "Balance sheet" },
      { id: "st-cashflow", label: "Cash flow statement" },
      { id: "st-all", label: "All three together" },
    ] },
  { id: "equity", label: "Equity", icon: PiggyBank },
  { id: "opening", label: "Opening balances", icon: Landmark },
];

/* Which group a view belongs to, worked out from the tree rather than written
   twice. `open` is the view a group lands on when its button is pressed. */
const GROUP_OF = {};
for (const g of TREE) {
  if (g.views) for (const v of g.views) GROUP_OF[v.id] = g.id;
  else GROUP_OF[g.id] = g.id;
}
const openOf = (groupId) => {
  const g = TREE.find((x) => x.id === groupId);
  return g?.views ? g.views[0].id : groupId;
};

/* The tab used to have three views and other screens ask for them by name — "i
   want to record an expense" lands on Expenses, not on the statements. Those old
   names still work, so nothing that calls this tab had to change. */
const LEGACY = { statements: "st-all", expenses: "expenses", opening: "opening" };
const normalise = (id) => (GROUP_OF[id] ? id : LEGACY[id] || openOf(id) || "dashboard");

/* ======================= THE TAB ======================= */
export function FinanceTab({ user, admin, initialView = "statements" }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => normalise(initialView));
  // "" = every month since the shop started.
  const [month, setMonth] = useState("");

  const load = () => {
    setLoading(true);
    return api.fetchFinanceData()
      .then((d) => { setData(d); setErr(""); })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (admin) load(); }, [admin]);

  /* The database blocks non-admins as well, so this is a courtesy message
      rather than the protection. */
  if (!admin) {
    return (
      <div className="bp-fade-up">
        <SectionTitle eyebrow="Admin only" title="Finance" />
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-6 text-center">
          <Lock size={28} className="mx-auto text-[#5A6472] mb-2" />
          <p className="text-sm text-[#5A6472]">
            Costs, profit and what the shop is worth are for the owner only.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="bp-fade-up">
        <SectionTitle eyebrow="Working out the figures" title="Finance" />
        <div className="text-[#5A6472] text-sm py-10 text-center flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Adding everything up…
        </div>
      </div>
    );
  }

  const d = data || {
    sales: [], expenses: [], creditTxns: [], creditAccounts: [], items: [],
    categories: [], opening: null, receipts: [], suppliers: [], purchaseInvoices: [],
    supplierPayments: [], equityMovements: [], stockAdjustments: [],
    mpesaRefunds: [], mpesaPayments: [], problems: [],
  };
  const months = monthsPresent(d);
  const range = month ? monthRange(month) : {};
  const group = GROUP_OF[view] || "dashboard";
  const groupDef = TREE.find((g) => g.id === group);

  /* Expenses carry their category's is_stock flag, because buying parts is
     money out of the drawer but NOT a loss — it turns into stock. The flag
     lives on the category in the database, so it is joined on here. */
  const stockCats = new Set(d.categories.filter((c) => c.isStock).map((c) => c.name));
  const expenses = d.expenses.map((e) => ({ ...e, isStock: stockCats.has(e.category) }));

  const opening = d.opening || { cash: 0, mpesa: 0, bank: 0, capital: 0, drawings: 0 };

  /* The cash book for the chosen month starts from the shop's opening figures
     only when no month is chosen. Pick a single month and the opening column
     would otherwise show day-one money as if it arrived that month — so the
     month view opens with what the previous months actually left behind. */
  /* `...d` first, then the named keys: d carries an `opening` of its own (null
     until the form is filled in) and spreading it last would wipe out the
     defaulted figures above. */
  const untilMonth = month
    ? cashBook({ ...d, expenses, opening, to: prevDayOf(range.from) })
    : null;
  const bookOpening = month
    ? { cash: untilMonth.closing.Cash, mpesa: untilMonth.closing["M-Pesa"], bank: untilMonth.closing.Bank }
    : opening;

  const book = cashBook({ ...d, expenses, opening: bookOpening, from: range.from, to: range.to });
  const pl = profitAndLoss({ sales: d.sales, expenses, mpesaRefunds: d.mpesaRefunds,
                             from: range.from, to: range.to });
  const bs = balanceSheet({ ...d, expenses, opening, asOf: range.to });
  /* `today` is handed in rather than read from the clock inside payables, so a
     statement reprinted next month shows the same invoices overdue as it did the
     day it was first printed. */
  const ap = payables({ purchaseInvoices: d.purchaseInvoices,
                        supplierPayments: d.supplierPayments,
                        asOf: range.to, today: range.to || todayKey() });
  const ar = receivables({ creditAccounts: d.creditAccounts, sales: d.sales, asOf: range.to });
  const eq = equityTotals({ equityMovements: d.equityMovements, opening, asOf: range.to });
  const ledger = generalLedger({ ...d, expenses, from: range.from, to: range.to });
  const tb = trialBalance(ledger);
  const cf = cashFlow({ book, pl });

  const periodLabel = month ? monthName(month) : "Since the shop started";
  const asOfLabel = range.to ? `as at ${dayText(range.to)}` : "as at today";
  const shared = { user, periodLabel, from: range.from, to: range.to,
                   problems: d.problems || [], onChanged: load };

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow={periodLabel}
        title="Finance"
        right={
          <button
            onClick={load}
            className="text-[#2563EB] text-xs font-semibold border border-[#DEE3E9] rounded-md px-3 py-1.5 hover:bg-[#EEF2F6] flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      {err && (
        <Warn>
          Couldn't load the figures. Run <span className="font-mono">supabase/finance.sql</span> and{" "}
          <span className="font-mono">supabase/finance_ledger.sql</span> once in the Supabase
          SQL editor, then refresh.
        </Warn>
      )}

      {/* Part of the data wouldn't load. Said plainly, because a total that
          reads zero because nothing could be read looks exactly like a total
          that reads zero because nothing happened. */}
      {d.problems?.length > 0 && (
        <Warn>
          <b>These figures are incomplete — do not rely on them.</b>
          <ul className="mt-1 space-y-0.5">
            {d.problems.map((p, i) => (
              <li key={i}>· {p.what} could not be read ({p.message})</li>
            ))}
          </ul>
          <p className="mt-1">
            Run <span className="font-mono">supabase/finance.sql</span> and{" "}
            <span className="font-mono">supabase/finance_ledger.sql</span> once in the
            Supabase SQL editor, then refresh.
          </p>
        </Warn>
      )}

      {!d.opening && !d.problems?.length && (
        <Warn tone="warn">
          <b>Opening balances not set.</b> Every total below starts from zero, which is
          the shop's position <i>since this app was installed</i> — not its real one.
          <button onClick={() => setView("opening")} className="underline font-semibold ml-1">
            Set them now
          </button>
          .
        </Warn>
      )}

      {/* ---- which branch of the tree ---- */}
      <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
        {TREE.map((g) => (
          <button
            key={g.id}
            onClick={() => setView(openOf(g.id))}
            className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold border flex items-center gap-1.5 ${
              group === g.id
                ? "bg-[#2563EB] border-[#2563EB] text-white"
                : "border-[#DEE3E9] text-[#5A6472]"
            }`}
          >
            <g.icon size={13} /> {g.label}
          </button>
        ))}
      </div>

      {groupDef?.views && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {groupDef.views.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold border ${
                view === v.id
                  ? "bg-[#1B2430] border-[#1B2430] text-white"
                  : "border-[#DEE3E9] text-[#5A6472] bg-[#FFFFFF]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {view !== "opening" && (
        <Field label="Which period?">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls}>
            <option value="">Since the shop started</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthName(m)}</option>
            ))}
          </select>
        </Field>
      )}

      {/* ---- the screen ---- */}
      {view === "dashboard" && (
        <Dashboard book={book} pl={pl} bs={bs} ap={ap} ar={ar} cf={cf}
                   periodLabel={periodLabel} onGo={setView} />
      )}

      {view === "sales-invoices" && <SalesInvoicesView sales={d.sales} {...shared} />}
      {view === "sales-payments" && <CustomerPaymentsView creditTxns={d.creditTxns} {...shared} />}
      {view === "receivables" && <ReceivablesView ar={ar} user={user} to={range.to} />}

      {view === "purchase-invoices" && (
        <PurchaseInvoicesView invoices={d.purchaseInvoices} suppliers={d.suppliers}
                              ap={ap} {...shared} />
      )}
      {view === "supplier-payments" && (
        <SupplierPaymentsView payments={d.supplierPayments} invoices={d.purchaseInvoices}
                              suppliers={d.suppliers} ap={ap} {...shared} />
      )}
      {view === "payables" && <PayablesView ap={ap} user={user} to={range.to} />}

      {view === "stock-value" && (
        <StockValueView items={d.items} stock={bs.stock} writeOffs={bs.writeOffs}
                        stockAfter={bs.assets.stock} user={user} />
      )}
      {view === "cogs" && <CogsView pl={pl} periodLabel={periodLabel} user={user} />}
      {view === "stock-adjustments" && (
        <StockAdjustmentsView adjustments={d.stockAdjustments} items={d.items} {...shared} />
      )}

      {view === "expenses" && (
        <Expenses expenses={d.expenses} categories={d.categories} pl={pl} {...shared} />
      )}

      {view === "cash" && (
        <CashBankView book={book} month={month} periodLabel={periodLabel}
                      user={user} opening={d.opening} />
      )}

      {view === "ledger" && <LedgerView ledger={ledger} periodLabel={periodLabel} user={user} />}
      {view === "trial" && <TrialBalanceView tb={tb} periodLabel={periodLabel} user={user} />}

      {view === "st-income" && (
        <IncomeStatement pl={pl} periodLabel={periodLabel} user={user} />
      )}
      {view === "st-balance" && (
        <BalanceSheetView bs={bs} ap={ap} asOfLabel={asOfLabel} user={user} />
      )}
      {view === "st-cashflow" && (
        <CashFlowView cf={cf} periodLabel={periodLabel} user={user} />
      )}
      {view === "st-all" && (
        <Statements book={book} pl={pl} bs={bs} ap={ap} month={month}
                    periodLabel={periodLabel} user={user}
                    problems={d.problems || []} openingSet={Boolean(d.opening)} />
      )}

      {view === "equity" && (
        <EquityView movements={d.equityMovements} totals={eq}
                    retainedEarnings={bs.retainedEarnings} equity={bs.equity} {...shared} />
      )}

      {view === "opening" && <Opening opening={d.opening} user={user} onSaved={load} />}
    </div>
  );
}

/* ======================= DASHBOARD =======================
   The six figures the owner named, and nothing else above the fold. Every tile is
   a button, because the question after "net profit is that?" is always "made up of
   what?" and the answer is one tap away. */
function Dashboard({ book, pl, bs, ap, ar, cf, periodLabel, onGo }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Revenue" value={pl.netRevenue} icon={ShoppingCart} onClick={() => onGo("sales-invoices")}
              note={pl.refunds > 0 ? `after ${KES(pl.refunds)} refunded` : `${pl.units} item${pl.units === 1 ? "" : "s"} sold`} />
        <Stat label="Expenses" value={pl.expenses} icon={Wallet} onClick={() => onGo("expenses")}
              note="running costs only" />
        <Stat label="Gross profit" value={pl.grossProfit} est icon={TrendingUp}
              tone={pl.grossProfit >= 0 ? "good" : "bad"} onClick={() => onGo("cogs")}
              note={`${pl.marginPct.toFixed(1)}% margin`} />
        <Stat label="Net profit" value={pl.netProfit} est tone={pl.netProfit >= 0 ? "good" : "bad"}
              onClick={() => onGo("st-income")} note="after running costs" />
        <Stat label="Cash balance" value={book.closingTotal} icon={Banknote} tone="dark"
              onClick={() => onGo("cash")} note="cash, M-Pesa and bank together" />
        <Stat label="Inventory value" value={bs.assets.stock} est icon={Boxes}
              onClick={() => onGo("stock-value")} note={`${bs.stock.units} items at estimated cost`} />
      </div>

      <Estimate what="Gross profit, net profit and inventory value" />

      <div className="grid grid-cols-3 gap-2 my-4">
        <Stat label="Owed to the shop" value={ar.total} onClick={() => onGo("receivables")} />
        <Stat label="Owed to suppliers" value={ap.outstanding} onClick={() => onGo("payables")}
              tone={ap.overdue > 0 ? "bad" : "plain"}
              note={ap.overdue > 0 ? `${KES(ap.overdue)} late` : undefined} />
        <Stat label="Shop is worth" value={bs.equity} est onClick={() => onGo("st-balance")} />
      </div>

      <Card title={`Where the money went — ${periodLabel}`} icon={TrendingUp}>
        <Line label="Sales" value={pl.revenue} note={`${pl.units} item${pl.units === 1 ? "" : "s"}`} />
        {pl.refunds > 0 && <Line label="Refunded to customers" value={-pl.refunds} indent />}
        <Line label="Cost of what was sold" value={-pl.costOfSales} indent
              note="estimated — the shop does not record what a part cost" />
        <Line label="Gross profit" value={pl.grossProfit} rule />
        <Line label="Running expenses" value={-pl.expenses} indent />
        <Line label="Net profit" value={pl.netProfit} total />
      </Card>

      <Card title="The drawer" icon={Banknote}>
        <Line label="Brought forward" value={book.openingTotal} />
        <Line label="Money in" value={book.in.total} indent />
        <Line label="Money out" value={-book.out.total} indent />
        <Line label="In the pots now" value={book.closingTotal} total />
        <p className="text-[11px] text-[#5A6472] mt-2 italic">
          Cash balance and net profit are different questions and rarely the same
          figure. {pl.unpaidRevenue > 0
            ? `${KES(pl.unpaidRevenue)} of this period's sales has not been paid for yet.`
            : "Money the owner puts in or takes out moves one and not the other."}
        </p>
      </Card>

      {Math.abs(bs.check) >= 1 && (
        <Warn>
          <b>The balance sheet does not tally — out by {KES(bs.check)}.</b> Do not rely on
          anything on this screen until it is found.
        </Warn>
      )}

      {Math.abs(cf.check) >= 1 && (
        <Warn>
          <b>The cash flow statement does not prove against the cash book — out by{" "}
          {KES(cf.check)}.</b> One of the streams of money in or out is not being counted.
        </Warn>
      )}
    </>
  );
}

/* ======================= INCOME STATEMENT ======================= */
function IncomeStatement({ pl, periodLabel, user }) {
  const print = () => printHtml(reportHtml({
    ...printDoc(user),
    title: "Income Statement",
    periodLabel,
    estimated: true,
    summary: [
      { label: "Net sales", value: pl.netRevenue },
      { label: "Gross profit", value: pl.grossProfit },
      { label: "Net profit", value: pl.netProfit },
    ],
    columns: [{ key: "label", label: "" }, { key: "amount", label: "Amount", money: true }],
    rows: [
      { label: "Sales", amount: pl.revenue },
      ...(pl.refunds > 0 ? [{ label: "Less refunded to customers", amount: -pl.refunds },
                            { label: "Net sales", amount: pl.netRevenue, __rule: true, __strong: true }] : []),
      { label: "Cost of what was sold (estimated)", amount: -pl.costOfSales },
      { label: "Gross profit", amount: pl.grossProfit, __rule: true, __strong: true },
      ...Object.entries(pl.expensesByCategory).sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => ({ label: cat, amount: -amt, __muted: true })),
      { label: "Running expenses", amount: -pl.expenses },
      { label: "Net profit", amount: pl.netProfit, __rule: true, __strong: true },
    ],
    notes: [
      `Gross profit is estimated at ${PROFIT_VAT_MULTIPLE} times the VAT inside each sale. The shop does not record what it paid for a part.`,
      pl.stockSpend > 0
        ? `${KES(pl.stockSpend)} was spent buying stock. It is not in the figures above: it is money out of the drawer but not a loss, and becomes a cost only when a part sells.`
        : "Money spent buying stock is not a cost until the part sells.",
      "Sales that were returned are left out entirely — the part went back on the shelf.",
      "Money the owner took out is not here. It is not a cost of running the shop.",
    ],
  }));

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <PrintButton onClick={print} label="Print income statement" />
      </div>

      <Card title={`Income statement — ${periodLabel}`} icon={TrendingUp}>
        <Line label="Sales" value={pl.revenue}
              note={`${pl.units} item${pl.units === 1 ? "" : "s"} sold`} />
        {pl.refunds > 0 && (
          <>
            <Line label="Refunded to customers" value={-pl.refunds} indent />
            <Line label="Net sales" value={pl.netRevenue} rule />
          </>
        )}
        <Line label="Cost of what was sold" value={-pl.costOfSales} indent
              note={`estimated at ${PROFIT_VAT_MULTIPLE}× the VAT in each sale`} />
        <Line label="Gross profit" value={pl.grossProfit} rule
              note={`${pl.marginPct.toFixed(1)}% of net sales`} />
        <Line label="Running expenses" value={-pl.expenses} indent />
        <Line label="Net profit" value={pl.netProfit} total />

        {Object.keys(pl.expensesByCategory).length > 0 && (
          <div className="mt-3 border-t border-[#DEE3E9] pt-2">
            <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mb-1">
              Where the expenses went
            </p>
            {Object.entries(pl.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-xs py-0.5">
                <span className="text-[#5A6472]">{cat}</span>
                <span className="tabular-nums text-[#1B2430]">{KES(amt)}</span>
              </div>
            ))}
          </div>
        )}

        <Estimate what="Cost of sales, gross profit and net profit" />
      </Card>

      <div className="text-[11px] text-[#5A6472] space-y-1">
        {pl.unpaidRevenue > 0 && (
          <p>
            <b>{KES(pl.unpaidRevenue)}</b> of these sales has not been paid for yet.
            That is why profit and cash do not match.
          </p>
        )}
        {pl.stockSpend > 0 && (
          <p>
            <b>{KES(pl.stockSpend)}</b> was spent buying stock. It is money out of the
            drawer but not a loss — it is on the balance sheet as stock, and becomes a
            cost only when the part sells.
          </p>
        )}
        <p>
          Money the owner took out of the business is not on this statement. It is not a
          cost of running the shop — see Equity.
        </p>
      </div>
    </>
  );
}

/* ======================= BALANCE SHEET ======================= */
function BalanceSheetView({ bs, ap, asOfLabel, user }) {
  const balanced = Math.abs(bs.check) < 1;

  const print = () => printHtml(reportHtml({
    ...printDoc(user),
    title: "Balance Sheet",
    subtitle: asOfLabel,
    estimated: true,
    summary: [
      { label: "What it owns", value: bs.totalAssets },
      { label: "What it owes", value: bs.totalLiabilities },
      { label: "What it is worth", value: bs.equity },
    ],
    /* Three groups rather than one list with heading rows in it: the amount column
       is a money column, and a heading row with no amount would print "KES 0"
       beside it. A nil that reads as a figure is worse than no line at all. */
    columns: [{ key: "label", label: "" }, { key: "amount", label: "Amount", money: true }],
    groups: [
      { heading: "What the shop owns",
        rows: [
          { label: "Cash in the drawer", amount: bs.assets.cash },
          { label: "M-Pesa", amount: bs.assets.mpesa },
          { label: "Bank", amount: bs.assets.bank },
          { label: "Stock on the shelves (estimated cost)", amount: bs.assets.stock },
          { label: "Owed by credit accounts", amount: bs.assets.debtors },
          { label: "Owed on unpaid sales", amount: bs.assets.unpaidSales },
        ],
        totals: { amount: bs.totalAssets }, totalLabel: "Total owned" },
      { heading: "What the shop owes",
        note: suppliersNote(ap),
        rows: [{ label: "Suppliers", amount: bs.liabilities.suppliers }],
        totals: { amount: bs.totalLiabilities }, totalLabel: "Total owed" },
      { heading: "What it is worth",
        rows: [
          { label: "Money the owner put in", amount: bs.capital },
          { label: "Money the owner took out", amount: -bs.drawings },
          { label: "Made by the business since", amount: bs.retainedEarnings },
        ],
        totals: { amount: bs.equity }, totalLabel: "Net worth of the shop" },
    ],
    notes: [
      "Stock is valued at estimated cost, worked out backwards from the selling prices. Valuing it at what it might sell for would book profit the shop has not earned.",
      bs.writeOffs
        ? `${KES(Math.abs(bs.writeOffs))} of damaged or missing stock has been written off the value above.`
        : "Nothing has been written off the stock value.",
      "An unpaid supplier invoice adds a debt and no stock value — the parts it paid for are already counted on the shelves.",
      `Owner's capital: ${KES(bs.capitalOpening)} at the start, ${KES(bs.capitalSince)} since. Drawings: ${KES(bs.drawingsOpening)} at the start, ${KES(bs.drawingsSince)} since.`,
    ],
    cautions: balanced ? [] : [{
      title: "This balance sheet does not tally.",
      body: `The two sides are out by ${KES(bs.check)}. Something in the records is inconsistent — do not rely on these figures.`,
    }],
  }));

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <PrintButton onClick={print} label="Print balance sheet" />
      </div>

      <Card title={`Balance sheet ${asOfLabel}`} icon={Scale}>
        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-1 mb-1">
          What the shop owns
        </p>
        <Line label="Cash in the drawer" value={bs.assets.cash} indent />
        <Line label="M-Pesa" value={bs.assets.mpesa} indent />
        <Line label="Bank" value={bs.assets.bank} indent />
        <Line label="Stock on the shelves" value={bs.assets.stock} indent
              note={`${bs.stock.units} items at estimated cost. Would fetch ${KES(bs.stock.retail)} if it all sold.${
                bs.writeOffs ? ` ${KES(Math.abs(bs.writeOffs))} written off.` : ""}`} />
        <Line label="Owed by credit accounts" value={bs.assets.debtors} indent />
        <Line label="Owed on unpaid sales" value={bs.assets.unpaidSales} indent />
        <Line label="Total owned" value={bs.totalAssets} rule />

        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-3 mb-1">
          What the shop owes
        </p>
        <Line label="Suppliers" value={bs.liabilities.suppliers} indent
              note={suppliersNote(ap)} />
        <Line label="Total owed" value={bs.totalLiabilities} rule />

        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-3 mb-1">
          What it is worth
        </p>
        <Line label="Money the owner put in" value={bs.capital} indent
              note={`${KES(bs.capitalOpening)} at the start, ${KES(bs.capitalSince)} since`} />
        <Line label="Money the owner took out" value={-bs.drawings} indent
              note={`${KES(bs.drawingsOpening)} at the start, ${KES(bs.drawingsSince)} since`} />
        <Line label="Made by the business since" value={bs.retainedEarnings} indent />
        <Line label="Net worth of the shop" value={bs.equity} total />

        <Tally bs={bs} />
        <Estimate what="Stock value, and the net worth built on it," />
      </Card>
    </>
  );
}

/* The suppliers line used to say nothing in the system recorded buying on credit.
   Something does now, so it says what is actually there — a note that has stopped
   being true is worse than no note, because it stops anyone looking. */
function suppliersNote(ap) {
  if (!ap || ap.outstanding < 0.5) return "No supplier invoice is outstanding.";
  if (ap.overdue >= 0.5) return `${KES(ap.overdue)} of it is past its due date.`;
  return "Unpaid purchase invoices. The parts they bought are already counted on the shelf above, so they are not added again here.";
}

function Tally({ bs }) {
  const balanced = Math.abs(bs.check) < 1;
  return (
    <div
      className={`mt-3 rounded-md p-2.5 text-xs flex items-start gap-2 ${
        balanced
          ? "bg-[#E7F5EF] border border-[#15926A] text-[#0F6E50]"
          : "bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E]"
      }`}
    >
      {balanced ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
      <span>
        {balanced ? (
          <>
            <b>It tallies.</b> Owned {KES(bs.totalAssets)} = owed {KES(bs.totalLiabilities)} +
            worth {KES(bs.equity)}.
          </>
        ) : (
          <>
            <b>It does not tally — out by {KES(bs.check)}.</b> Do not rely on these
            figures; something in the records is inconsistent.
          </>
        )}
      </span>
    </div>
  );
}

/* ======================= CASH FLOW STATEMENT ======================= */
function CashFlowView({ cf, periodLabel, user }) {
  const print = () => printHtml(cashFlowHtml({ doc: printDoc(user), cf, periodLabel }));
  const proves = Math.abs(cf.check) < 1;

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <PrintButton onClick={print} label="Print cash flow" />
      </div>

      <Card title={`Cash flow — ${periodLabel}`} icon={Banknote}>
        <Line label="Money in from trading" value={cf.operatingIn} indent />
        <Line label="Money out on trading, stock and suppliers" value={-cf.operatingOut} indent />
        <Line label="From trading" value={cf.operating} rule />
        <Line label="Buying or selling equipment" value={cf.investing} indent
              note="Always zero: the shop has nowhere to record a machine or a vehicle, so it is shown rather than left off." />
        <Line label="Money the owner put in" value={cf.financingIn} indent />
        <Line label="Money the owner took out" value={-cf.financingOut} indent />
        <Line label="From the owner" value={cf.financing} rule />
        <Line label="Movement in the period" value={cf.movement} rule />
        <Line label="Brought forward" value={cf.opening} indent />
        <Line label="In the pots at the end" value={cf.closing} total />

        <div className={`mt-3 rounded-md p-2.5 text-xs flex items-start gap-2 ${
          proves ? "bg-[#E7F5EF] border border-[#15926A] text-[#0F6E50]"
                 : "bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E]"}`}>
          {proves ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span>
            {proves ? (
              <><b>It proves against the cash book.</b> The three sections add up to exactly the
              movement the drawer shows.</>
            ) : (
              <><b>Out by {KES(cf.check)}.</b> A stream of money in or out is not being counted
              in one of the two places.</>
            )}
          </span>
        </div>
      </Card>

      <Card title="Why this is not the same as profit" icon={TrendingUp}>
        <Line label="Net profit for the period" value={cf.netProfit} note="estimated" />
        <Line label="Movement in the pots" value={cf.movement} />
        <p className="text-[11px] text-[#5A6472] mt-2 italic">
          They differ for ordinary reasons and a shop can have one without the other:
          money spent buying stock leaves the drawer without being a loss, a sale on
          credit is profit with no money behind it yet, and the owner putting money in
          or taking it out moves the drawer without touching profit at all.
        </p>
        <Estimate what="Net profit" />
      </Card>
    </>
  );
}

/* ======================= ALL THREE, ON ONE LETTERHEAD ======================= */
function Statements({ book, pl, bs, ap, month, periodLabel, user, problems = [], openingSet = true }) {
  const [showEntries, setShowEntries] = useState(false);

  /* On paper: the same three statements, on this shop's letterhead. The building is
     all in lib/statementPrint.js, which is why this is short — the only decisions
     made here are the ones that need the screen, and there are two of them. The
     entries print when they are showing, and the warnings that are on the screen go
     onto the page whether they are showing or not, because the person reading the
     paper copy cannot see this screen. */
  const printIt = () => printHtml(statementHtml({
    shop: SHOP_INFO.branch,
    office: SHOP_INFO.main,
    footer: SHOP_INFO.footer,
    accent: shopAccent(),
    periodLabel,
    book,
    pl,
    bs,
    broughtForward: Boolean(month),
    entries: showEntries ? book.entries : [],
    problems,
    openingSet,
    preparedBy: user || "",
    printedAt: new Date().toLocaleString("en-KE", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    }),
    vatMultiple: PROFIT_VAT_MULTIPLE,
  }));

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-3">
        <span className="text-[11px] text-[#5A6472] text-right">
          {showEntries ? "Every entry prints too" : "Summary only — open the entries below to print them as well"}
        </span>
        <PrintButton onClick={printIt} label="Print all three" />
      </div>

      {/* ---- CASH BOOK ---- */}
      <Card
        title="Cash book"
        icon={Wallet}
        right={
          <button
            onClick={() => setShowEntries((v) => !v)}
            className="text-[#2563EB] text-[11px] font-semibold"
          >
            {showEntries ? "Hide entries" : `Show all ${book.entries.length} entries`}
          </button>
        }
      >
        <PotsTable book={book} month={month} />
        <p className="text-[11px] text-[#5A6472] mt-2 italic">
          Count the drawer and the Cash column should agree. Unpaid sales are not here —
          they are a debt, and reach the cash book on the day they are paid.
        </p>
        {showEntries && (
          <div className="mt-3 border-t border-[#DEE3E9] pt-2">
            <EntriesList entries={book.entries} max="max-h-80" />
          </div>
        )}
      </Card>

      {/* ---- TRADING / P&L ---- */}
      <Card title={`Trading account — ${periodLabel}`} icon={TrendingUp}>
        <Line label="Sales" value={pl.revenue} note={`${pl.units} item${pl.units === 1 ? "" : "s"} sold`} />
        {pl.refunds > 0 && (
          <>
            <Line label="Refunded to customers" value={-pl.refunds} indent />
            <Line label="Net sales" value={pl.netRevenue} rule />
          </>
        )}
        <Line label="Cost of what was sold" value={-pl.costOfSales} indent />
        <Line label="Gross profit" value={pl.grossProfit} rule
              note={`${pl.marginPct.toFixed(1)}% — estimated at ${PROFIT_VAT_MULTIPLE}× the VAT in each sale`} />
        <Line label="Running expenses" value={-pl.expenses} indent />
        <Line label="Net profit" value={pl.netProfit} total />

        {Object.keys(pl.expensesByCategory).length > 0 && (
          <div className="mt-3 border-t border-[#DEE3E9] pt-2">
            <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mb-1">
              Where the expenses went
            </p>
            {Object.entries(pl.expensesByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt]) => (
                <div key={cat} className="flex justify-between text-xs py-0.5">
                  <span className="text-[#5A6472]">{cat}</span>
                  <span className="tabular-nums text-[#1B2430]">{KES(amt)}</span>
                </div>
              ))}
          </div>
        )}

        <div className="mt-3 text-[11px] text-[#5A6472] space-y-1">
          {pl.unpaidRevenue > 0 && (
            <p>
              <b>{KES(pl.unpaidRevenue)}</b> of these sales has not been paid for yet.
              That is why profit and cash do not match.
            </p>
          )}
          {pl.stockSpend > 0 && (
            <p>
              <b>{KES(pl.stockSpend)}</b> was spent buying stock. It is money out of the
              drawer but not a loss — it is on the balance sheet as stock, and becomes a
              cost only when the part sells.
            </p>
          )}
          <p className="italic">
            The shop does not record what each part cost, so profit is an estimate, not a
            measured figure.
          </p>
        </div>
      </Card>

      {/* ---- BALANCE SHEET ---- */}
      <Card title={`Balance sheet${bs.asOf ? ` as at ${dayText(bs.asOf)}` : " — today"}`} icon={Scale}>
        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-1 mb-1">
          What the shop owns
        </p>
        <Line label="Cash in the drawer" value={bs.assets.cash} indent />
        <Line label="M-Pesa" value={bs.assets.mpesa} indent />
        <Line label="Bank" value={bs.assets.bank} indent />
        <Line label="Stock on the shelves" value={bs.assets.stock} indent
              note={`${bs.stock.units} items at estimated cost. Would fetch ${KES(bs.stock.retail)} if it all sold.`} />
        <Line label="Owed by credit accounts" value={bs.assets.debtors} indent />
        <Line label="Owed on unpaid sales" value={bs.assets.unpaidSales} indent />
        <Line label="Total owned" value={bs.totalAssets} rule />

        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-3 mb-1">
          What the shop owes
        </p>
        <Line label="Suppliers" value={bs.liabilities.suppliers} indent note={suppliersNote(ap)} />
        <Line label="Total owed" value={bs.totalLiabilities} rule />

        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-3 mb-1">
          What it is worth
        </p>
        <Line label="Money the owner put in" value={bs.capital} indent />
        <Line label="Money the owner took out" value={-bs.drawings} indent />
        <Line label="Made by the business since" value={bs.retainedEarnings} indent />
        <Line label="Net worth of the shop" value={bs.equity} total />

        <Tally bs={bs} />
      </Card>
    </>
  );
}

/* ======================= EXPENSES ======================= */
function Expenses({ expenses, categories, pl, user, from, to, periodLabel, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const blank = { spentOn: todayKey(), category: "", description: "", amount: "", method: "Cash", reference: "" };
  const [form, setForm] = useState(blank);

  const shown = expenses.filter((e) => {
    const k = String(e.spentOn || "").slice(0, 10);
    if (from && k < from) return false;
    if (to && k > to) return false;
    return true;
  });
  // Voided rows still show, greyed out, but never in the total.
  const total = shown.reduce((s, e) => s + (e.voidedAt ? 0 : e.amount), 0);

  /* The category's is_stock flag joined back on, so the printed ledger can say
     which of these was buying stock rather than a loss — the same join the
     statements do, done here because the print builder is handed rows, not tables. */
  const stockCats = new Set(categories.filter((c) => c.isStock).map((c) => c.name));

  const print = () => printHtml(expenseLedgerHtml({
    doc: printDoc(user),
    expenses: shown.map((e) => ({ ...e, isStock: stockCats.has(e.category) })),
    periodLabel,
    byCategory: pl?.expensesByCategory || null,
  }));

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.category) { setErr("Pick what the money went on."); return; }
    if (!(amount > 0)) { setErr("Enter how much was spent."); return; }
    setBusy(true);
    try {
      await api.addExpense({ ...form, amount }, user);
      setForm({ ...blank, category: form.category, method: form.method });
      setAdding(false);
      setErr("");
      onChanged();
    } catch (e) {
      setErr((e.message || String(e)) + " — has supabase/finance.sql been run?");
    } finally {
      setBusy(false);
    }
  };

  /* Void, not delete. The entry stays on the list crossed out, so the books
     show that a mistake was made and corrected rather than quietly changing
     a month's figures with nothing to explain why. */
  const voidIt = async (e) => {
    const reason = prompt(
      `Void this ${e.category} of ${KES(e.amount)}?\n\n` +
      `It stays on the list crossed out and stops counting towards any total.\n` +
      `Why, if you want to say (you can leave this blank):`,
      ""
    );
    if (reason === null) return;
    try {
      await api.voidExpense(e.id, user, reason);
      onChanged();
    } catch (ex) {
      alert("Could not void it: " + (ex.message || ex));
    }
  };

  return (
    <>
      <div className="bg-[#1B2430] text-white rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={20} className="text-[#F5B301]" />
          <span className="text-sm text-[#C6CBD3]">Spent in this period</span>
        </div>
        <span className="text-2xl font-extrabold tabular-nums">{KES(total)}</span>
      </div>

      <div className="flex items-center justify-end mb-3">
        <PrintButton onClick={print} label="Print expense ledger" />
      </div>

      <button
        onClick={() => { setAdding((v) => !v); setErr(""); }}
        className="w-full mb-4 border border-[#DEE3E9] rounded-md py-2.5 text-sm font-semibold text-[#2563EB] flex items-center justify-center gap-1.5 hover:bg-[#EEF2F6]"
      >
        <Plus size={14} /> {adding ? "Close" : "Record money spent"}
      </button>

      {adding && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
          {err && (
            <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-2.5 mb-3 text-xs">
              {err}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day it was spent">
              <input type="date" value={form.spentOn} max={todayKey()}
                     onChange={(e) => setForm({ ...form, spentOn: e.target.value })} className={inputCls} />
            </Field>
            <Field label="How much">
              <input type="number" min="0" step="1" value={form.amount} placeholder="0"
                     onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
            </Field>
          </div>
          {/* An empty list means finance.sql hasn't been run. Saying so beats
              a dropdown with nothing in it and no reason given. */}
          {categories.length === 0 ? (
            <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-2.5 mb-4 text-xs">
              The list of things the shop spends on couldn't be read.
              Run <span className="font-mono">supabase/finance.sql</span> once, then refresh.
            </div>
          ) : (
            <Field label="What on?">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                <option value="">Choose…</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}{c.isStock ? " (becomes stock)" : ""}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Paid out of">
            <div className="flex gap-3">
              {["Cash", "M-PESA", "Bank"].map((m) => (
                <button
                  key={m}
                  onClick={() => setForm({ ...form, method: m })}
                  className={`flex-1 rounded-md py-2.5 font-semibold text-sm border ${
                    form.method === m
                      ? "bg-[#2563EB18] border-[#2563EB] text-[#2563EB]"
                      : "border-[#DEE3E9] text-[#5A6472]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Details (optional)">
              <input value={form.description} placeholder="e.g. September rent"
                     onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Receipt / till no. (optional)">
              <input value={form.reference} placeholder="e.g. QGH4T2LX9"
                     onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-[#2563EB] text-white font-bold uppercase tracking-wide rounded-md py-2.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Record it
          </button>
        </div>
      )}

      {pl?.stockSpend > 0 && (
        <p className="text-[11px] text-[#5A6472] italic mb-3">
          {KES(pl.stockSpend)} of the figure above went on buying stock. It is money out
          of the drawer but not a loss, so the income statement leaves it out — it becomes
          a cost on the day the part sells. Paying a supplier invoice is not on this
          screen at all, for the same reason: see Purchases.
        </p>
      )}

      {shown.length === 0 ? (
        <Empty>Nothing recorded for this period yet.</Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((e) => (
            <ListRow
              key={e.id}
              title={e.category}
              subtitle={e.description || undefined}
              meta={`${dayText(e.spentOn)} · ${e.method}${e.reference ? ` · ${e.reference}` : ""}${e.byName ? ` · ${e.byName}` : ""}`}
              amount={e.amount}
              voided={Boolean(e.voidedAt)}
              voidNote={[e.voidedBy && `by ${e.voidedBy}`, e.voidReason].filter(Boolean).join(" — ")}
              right={!e.voidedAt && (
                <button
                  onClick={() => voidIt(e)}
                  className="p-1.5 rounded bg-[#EEF2F6] text-[#5A6472] hover:text-[#DC3B2E]"
                  title="Void this entry"
                >
                  <Trash2 size={13} />
                </button>
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ======================= OPENING BALANCES ======================= */
function Opening({ opening, user, onSaved }) {
  const [form, setForm] = useState(() => ({
    asOf: opening?.asOf || todayKey(),
    cash: opening?.cash ?? "",
    mpesa: opening?.mpesa ?? "",
    bank: opening?.bank ?? "",
    capital: opening?.capital ?? "",
    drawings: opening?.drawings ?? "",
    notes: opening?.notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setDone(false); };

  const save = async () => {
    setBusy(true);
    try {
      await api.saveOpening(form, user);
      setErr("");
      setDone(true);
      onSaved();
    } catch (e) {
      setErr((e.message || String(e)) + " — has supabase/finance.sql been run?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
      <p className="text-xs text-[#5A6472] mb-4">
        Typed once. What the shop already had on the day it started using these statements —
        without it every balance below is only "since we installed the app", which is not
        the shop's real position.
      </p>

      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-2.5 mb-3 text-xs">{err}</div>
      )}
      {done && <Good>Saved. Every statement now starts from these figures.</Good>}

      <Field label="Counted on which day?">
        <input type="date" value={form.asOf} max={todayKey()} onChange={set("asOf")} className={inputCls} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Cash">
          <input type="number" min="0" value={form.cash} placeholder="0" onChange={set("cash")} className={inputCls} />
        </Field>
        <Field label="M-Pesa">
          <input type="number" min="0" value={form.mpesa} placeholder="0" onChange={set("mpesa")} className={inputCls} />
        </Field>
        <Field label="Bank">
          <input type="number" min="0" value={form.bank} placeholder="0" onChange={set("bank")} className={inputCls} />
        </Field>
      </div>
      <Field label="Money the owner has put into the business"
             hint="Everything invested since the shop opened, not just the cash above. Anything put in from now on goes in under Equity instead.">
        <input type="number" min="0" value={form.capital} placeholder="0" onChange={set("capital")} className={inputCls} />
      </Field>
      <Field label="Money the owner has taken out for personal use"
             hint="The balance sheet cannot show a true net worth without this.">
        <input type="number" min="0" value={form.drawings} placeholder="0" onChange={set("drawings")} className={inputCls} />
      </Field>
      <Field label="Notes (optional)">
        <input value={form.notes} placeholder="e.g. counted with Joseph, 1st Aug" onChange={set("notes")} className={inputCls} />
      </Field>

      <button
        onClick={save}
        disabled={busy}
        className="w-full bg-[#2563EB] text-white font-bold uppercase tracking-wide rounded-md py-2.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save opening balances
      </button>

      {opening?.updatedAt && (
        <p className="text-[11px] text-[#5A6472] mt-3 text-center">
          Last changed {fmtDateTime(opening.updatedAt)}
          {opening.updatedBy ? ` by ${opening.updatedBy}` : ""}.
        </p>
      )}
    </div>
  );
}
