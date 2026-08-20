/* ---------------------------------------------------------
   FINANCIAL STATEMENTS — the screens

   Three views behind one tab:
     Statements  cash book, trading account, balance sheet
     Expenses    money out, typed in as it is spent
     Opening     what was in Cash / M-Pesa / Bank on day one

   Every figure here is worked out by src/lib/finance.js from records that
   already exist. Nothing on this screen is a stored total, so no number can
   quietly disagree with the sales, receipts and expenses beneath it.

   ADMIN ONLY — and not only here. The database refuses non-admins too
   (supabase/finance.sql), because a screen the app hides is still a screen
   anyone can reach with the app's own key.
--------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import {
  Wallet, TrendingUp, Scale, Plus, Trash2, AlertTriangle, Check,
  RefreshCw, Loader2, Landmark, Smartphone, Banknote, Lock,
} from "lucide-react";
import * as api from "./lib/api.js";
import { Field, inputCls, SectionTitle, fmtDateTime } from "./ui.jsx";
import {
  POTS, cashBook, profitAndLoss, balanceSheet,
  monthsPresent, monthRange, PROFIT_VAT_MULTIPLE,
} from "./lib/finance.js";

const KES = (n) =>
  `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;

/* Negative money reads red and in brackets, the way a ledger prints it —
   a minus sign in front of a long figure is easy to miss. */
function Money({ value, bold = false, className = "" }) {
  const n = Number(value) || 0;
  const neg = n < 0;
  return (
    <span
      className={`tabular-nums ${bold ? "font-extrabold" : "font-semibold"} ${
        neg ? "text-[#DC3B2E]" : "text-[#1B2430]"
      } ${className}`}
    >
      {neg ? `(${KES(Math.abs(n))})` : KES(n)}
    </span>
  );
}

const POT_ICON = { Cash: Banknote, "M-Pesa": Smartphone, Bank: Landmark };

const todayKey = () => new Date().toISOString().slice(0, 10);

/* One line of a statement: label left, figure right. `rule` draws the single
   line above a subtotal, `total` the heavy line above a final figure. */
function Line({ label, value, note, rule, total, indent }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        rule ? "border-t border-[#DEE3E9] mt-1 pt-2" : ""
      } ${total ? "border-t-2 border-[#1B2430] mt-1 pt-2" : ""}`}
    >
      <span className={`text-sm ${indent ? "pl-4 text-[#5A6472]" : "text-[#1B2430]"} ${total ? "font-bold uppercase text-xs tracking-wide" : ""}`}>
        {label}
        {note && <span className="block text-[11px] text-[#5A6472] italic">{note}</span>}
      </span>
      <Money value={value} bold={total || rule} />
    </div>
  );
}

function Card({ title, icon: Icon, children, right }) {
  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[#1B2430] font-bold uppercase text-xs tracking-wide flex items-center gap-2">
          {Icon && <Icon size={14} className="text-[#2563EB]" />} {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ======================= THE TAB ======================= */
export function FinanceTab({ user, admin, initialView = "statements" }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  /* "i want to record an expense" should land on the expenses view, not on the
     statements it opens with — otherwise the person who said what they wanted
     still has to find the tab. */
  const [view, setView] = useState(initialView);
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
        <SectionTitle eyebrow="Admin only" title="Financial Statements" />
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
        <SectionTitle eyebrow="Working out the figures" title="Financial Statements" />
        <div className="text-[#5A6472] text-sm py-10 text-center flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Adding everything up…
        </div>
      </div>
    );
  }

  const d = data || { sales: [], expenses: [], creditTxns: [], creditAccounts: [],
                      items: [], categories: [], opening: null, receipts: [], problems: [] };
  const months = monthsPresent(d);
  const range = month ? monthRange(month) : {};

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
  const pl = profitAndLoss({ sales: d.sales, expenses, from: range.from, to: range.to });
  const bs = balanceSheet({ ...d, expenses, opening, asOf: range.to });

  const periodLabel = month ? monthName(month) : "Since the shop started";

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow={periodLabel}
        title="Financial Statements"
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
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 mb-4 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Couldn't load the figures. Run <span className="font-mono">supabase/finance.sql</span> once
            in the Supabase SQL editor, then refresh.
          </span>
        </div>
      )}

      {/* Part of the data wouldn't load. Said plainly, because a total that
          reads zero because nothing could be read looks exactly like a total
          that reads zero because nothing happened. */}
      {d.problems?.length > 0 && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 mb-4 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <b>These figures are incomplete — do not rely on them.</b>
            <ul className="mt-1 space-y-0.5">
              {d.problems.map((p, i) => (
                <li key={i}>· {p.what} could not be read ({p.message})</li>
              ))}
            </ul>
            <p className="mt-1">
              If this mentions expenses or opening balances,
              run <span className="font-mono">supabase/finance.sql</span> once in the Supabase
              SQL editor, then refresh.
            </p>
          </div>
        </div>
      )}

      {!d.opening && !d.problems?.length && (
        <div className="bg-[#FEF6E7] border border-[#E0A400] text-[#8A6400] rounded-md p-3 mb-4 text-xs">
          <b>Opening balances not set.</b> Every total below starts from zero, which is
          the shop's position <i>since this app was installed</i> — not its real one.
          <button onClick={() => setView("opening")} className="underline font-semibold ml-1">
            Set them now
          </button>
          .
        </div>
      )}

      {/* ---- which view ---- */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {[
          { id: "statements", label: "Statements", icon: Scale },
          { id: "expenses", label: "Expenses", icon: Wallet },
          { id: "opening", label: "Opening balances", icon: Landmark },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold border flex items-center gap-1.5 ${
              view === v.id
                ? "bg-[#2563EB] border-[#2563EB] text-white"
                : "border-[#DEE3E9] text-[#5A6472]"
            }`}
          >
            <v.icon size={13} /> {v.label}
          </button>
        ))}
      </div>

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

      {view === "statements" && (
        <Statements book={book} pl={pl} bs={bs} month={month} periodLabel={periodLabel} />
      )}
      {view === "expenses" && (
        <Expenses
          expenses={d.expenses}
          categories={d.categories}
          user={user}
          from={range.from}
          to={range.to}
          onChanged={load}
        />
      )}
      {view === "opening" && (
        <Opening opening={d.opening} user={user} onSaved={load} />
      )}
    </div>
  );
}

/* ======================= STATEMENTS ======================= */
function Statements({ book, pl, bs, month, periodLabel }) {
  const [showEntries, setShowEntries] = useState(false);
  // Rounding to whole shillings can leave a shilling or two; anything bigger
  // than that is a real fault in the statement and has to be said out loud.
  const balanced = Math.abs(bs.check) < 1;

  return (
    <>
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
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[26rem]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[#5A6472]">
                <th className="text-left font-bold py-1.5 px-1"> </th>
                {POTS.map((p) => {
                  const Icon = POT_ICON[p];
                  return (
                    <th key={p} className="text-right font-bold py-1.5 px-1">
                      <span className="inline-flex items-center gap-1">
                        <Icon size={11} /> {p}
                      </span>
                    </th>
                  );
                })}
                <th className="text-right font-bold py-1.5 px-1">Total</th>
              </tr>
            </thead>
            <tbody>
              <Row label={month ? "Brought forward" : "Opening balance"} pots={book.opening} total={book.openingTotal} />
              <Row label="Money in" pots={book.in.pots} total={book.in.total} tone="in" />
              <Row label="Money out" pots={book.out.pots} total={book.out.total} tone="out" />
              <Row label="Closing balance" pots={book.closing} total={book.closingTotal} strong />
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#5A6472] mt-2 italic">
          Count the drawer and the Cash column should agree. Unpaid sales are not here —
          they are a debt, and reach the cash book on the day they are paid.
        </p>

        {showEntries && (
          <div className="mt-3 border-t border-[#DEE3E9] pt-2 space-y-1 max-h-80 overflow-y-auto">
            {book.entries.length === 0 ? (
              <p className="text-xs text-[#5A6472] italic py-3 text-center">
                Nothing moved in this period.
              </p>
            ) : (
              book.entries.map((e, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-xs py-1 border-b border-[#EEF2F6] last:border-0">
                  <div className="min-w-0">
                    <span className="text-[#1B2430] font-medium">{e.label}</span>
                    {e.who && <span className="text-[#5A6472]"> · {e.who}</span>}
                    {e.note && <span className="text-[#5A6472]"> · {e.note}</span>}
                    <span className="block text-[10px] text-[#5A6472]">
                      {fmtDateTime(e.ts)} · {e.pot}{e.by ? ` · ${e.by}` : ""}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <Money value={e.signed} />
                    <span className="block text-[10px] text-[#5A6472] tabular-nums">
                      bal {KES(e.balance)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* ---- TRADING / P&L ---- */}
      <Card title={`Trading account — ${periodLabel}`} icon={TrendingUp}>
        <Line label="Sales" value={pl.revenue} note={`${pl.units} item${pl.units === 1 ? "" : "s"} sold`} />
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
      <Card title={`Balance sheet${bs.asOf ? ` as at ${bs.asOf}` : " — today"}`} icon={Scale}>
        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-1 mb-1">
          What the shop owns
        </p>
        <Line label="Cash in the drawer" value={bs.assets.cash} indent />
        <Line label="M-Pesa" value={bs.assets.mpesa} indent />
        <Line label="Bank" value={bs.assets.bank} indent />
        <Line label="Stock on the shelves" value={bs.assets.stock} indent
              note={`${bs.stock.units} items — at cost. Would fetch ${KES(bs.stock.retail)} if it all sold.`} />
        <Line label="Owed by credit accounts" value={bs.assets.debtors} indent />
        <Line label="Owed on unpaid sales" value={bs.assets.unpaidSales} indent />
        <Line label="Total owned" value={bs.totalAssets} rule />

        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-3 mb-1">
          What the shop owes
        </p>
        <Line label="Suppliers" value={bs.liabilities.suppliers} indent
              note="Nowhere in the system records buying on credit yet, so this is zero rather than checked." />
        <Line label="Total owed" value={bs.totalLiabilities} rule />

        <p className="text-[10px] uppercase tracking-wide font-bold text-[#5A6472] mt-3 mb-1">
          What it is worth
        </p>
        <Line label="Money the owner put in" value={bs.capital} indent />
        <Line label="Money the owner took out" value={-bs.drawings} indent />
        <Line label="Made by the business since" value={bs.retainedEarnings} indent />
        <Line label="Net worth of the shop" value={bs.equity} total />

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
      </Card>
    </>
  );
}

function Row({ label, pots, total, strong, tone }) {
  const sign = tone === "out" ? -1 : 1;
  return (
    <tr className={strong ? "border-t-2 border-[#1B2430]" : "border-t border-[#DEE3E9]"}>
      <td className={`py-2 px-1 text-xs ${strong ? "font-bold uppercase tracking-wide" : "text-[#5A6472]"}`}>
        {label}
      </td>
      {POTS.map((p) => (
        <td key={p} className="py-2 px-1 text-right">
          <Money value={sign * (pots[p] || 0)} bold={strong} />
        </td>
      ))}
      <td className="py-2 px-1 text-right">
        <Money value={sign * (total || 0)} bold />
      </td>
    </tr>
  );
}

/* ======================= EXPENSES ======================= */
function Expenses({ expenses, categories, user, from, to, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const blank = { spentOn: todayKey(), category: "", description: "", amount: "", method: "Cash", reference: "" };
  const [form, setForm] = useState(blank);

  const shown = useMemo(
    () => expenses.filter((e) => {
      const k = String(e.spentOn || "").slice(0, 10);
      if (from && k < from) return false;
      if (to && k > to) return false;
      return true;
    }),
    [expenses, from, to]
  );
  // Voided rows still show, greyed out, but never in the total.
  const total = shown.reduce((s, e) => s + (e.voidedAt ? 0 : e.amount), 0);

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
      `Why is it being voided?`,
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

      {shown.length === 0 ? (
        <p className="text-[#5A6472] text-sm py-8 text-center">
          Nothing recorded for this period yet.
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((e) => {
            const dead = !!e.voidedAt;
            return (
              <div
                key={e.id}
                className={`bg-[#FFFFFF] border rounded-md p-3 ${
                  dead ? "border-[#EEF2F6] opacity-60" : "border-[#DEE3E9]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`font-semibold text-[#1B2430] ${dead ? "line-through" : ""}`}>
                      {e.category}
                    </span>
                    {e.description && <span className="text-[#5A6472] text-sm"> — {e.description}</span>}
                    <div className="text-[11px] text-[#5A6472] mt-0.5">
                      {e.spentOn} · {e.method}
                      {e.reference ? ` · ${e.reference}` : ""}
                      {e.byName ? ` · ${e.byName}` : ""}
                    </div>
                    {dead && (
                      <div className="text-[11px] text-[#DC3B2E] mt-1 font-semibold">
                        Voided{e.voidedBy ? ` by ${e.voidedBy}` : ""}
                        {e.voidReason ? ` — ${e.voidReason}` : ""}. Not counted.
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Money value={e.amount} bold className={dead ? "line-through" : ""} />
                    {!dead && (
                      <button
                        onClick={() => voidIt(e)}
                        className="p-1.5 rounded bg-[#EEF2F6] text-[#5A6472] hover:text-[#DC3B2E]"
                        title="Void this entry"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
      {done && (
        <div className="bg-[#E7F5EF] border border-[#15926A] text-[#0F6E50] rounded-md p-2.5 mb-3 text-xs flex items-center gap-2">
          <Check size={14} /> Saved. Every statement now starts from these figures.
        </div>
      )}

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
             hint="Everything invested since the shop opened, not just the cash above.">
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

/* ---- small date helpers ---- */
/* "2026-08-01" -> "2026-07-31". Used so a month's cash book opens with what the
   months before it actually left behind, rather than day-one money. */
function prevDayOf(dayString) {
  if (!dayString) return undefined;
  const [y, m, d] = dayString.split("-").map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function monthName(key) {
  const [y, m] = String(key).split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}
