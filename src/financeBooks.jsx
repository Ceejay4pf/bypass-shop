/* ---------------------------------------------------------
   FINANCE — the books either side of the statements.

   Purchases, sales, what the shop is owed, what it owes, the owner's own money,
   stock valuation, the cash book, the general ledger and the trial balance. The
   three statements themselves stay in finance.jsx; everything that feeds them is
   here, one screen per thing, because the owner asked for the tree by name and a
   tree with nine branches behind three buttons is not a tree.

   TWO RULES RUN THROUGH THE WHOLE FILE.

   ONE — NOTHING HERE CHANGES A STOCK COUNT. The owner's words: "but they dont
   affet thestock in the shop". A purchase invoice records money owed to a
   supplier, not parts arriving — parts still arrive only through Add Stock. A
   stock adjustment writes a value off the balance sheet; the count on the shelf is
   corrected by the person holding the part. There is no call to insertItem,
   addStock or adjustQty anywhere below, and there should never be one: two systems
   that both believe they own the stock count will disagree inside a week.

   TWO — NOTHING HERE CALCULATES ANYTHING. Every figure comes from lib/finance.js
   and every printout from lib/ledgerPrint.js. These are forms, lists and buttons.
   A total worked out in a component is a total that will disagree with the
   statement printed from the same data ten minutes later.
--------------------------------------------------------- */
import React, { useMemo, useState } from "react";
import {
  Plus, Truck, Users, Boxes, BookOpen, Scale, PiggyBank, Banknote,
  ShoppingCart, HandCoins, AlertTriangle, ChevronRight, Wallet,
} from "lucide-react";
import * as api from "./lib/api.js";
import { Field, inputCls, fmtDateTime } from "./ui.jsx";
import {
  POT_ICON, KES, Money, Line, Card, Stat, Estimate, PrintButton, Warn,
  SaveButton, MethodPicker, VoidButton, ListRow, Empty, printDoc, printHtml,
  todayKey, dayText,
} from "./financeUI.jsx";
/* POTS from lib/finance.js and not from a list typed out here: the cash book is
   built over those three names, and a fourth one invented on this side would show
   a column the book never fills. */
import { POTS, PROFIT_VAT_MULTIPLE } from "./lib/finance.js";
import {
  reportHtml, payablesHtml, receivablesHtml, salesReportHtml,
  stockAdjustmentsHtml, equityHtml, generalLedgerHtml, trialBalanceHtml,
} from "./lib/ledgerPrint.js";

/* A day-only string inside the chosen period. Written here rather than reused from
   lib/finance.js because that one takes timestamps as well and this only ever sees
   "2026-08-04" — and comparing those as strings is both correct and immune to the
   timezone slip that parsing them would introduce. */
const inWindow = (day, from, to) => {
  const k = String(day || "").slice(0, 10);
  if (!k) return true;
  if (from && k < from) return false;
  if (to && k > to) return false;
  return true;
};

const errText = (e) => (e?.message || String(e));

/* Every list screen below is the same shape: a button that opens a form, the form,
   then the rows. This wraps the first two so eight screens cannot drift apart. */
function AddPanel({ open, onToggle, label, err, children }) {
  return (
    <>
      <button
        onClick={onToggle}
        className="w-full mb-4 border border-[#DEE3E9] rounded-md py-2.5 text-sm font-semibold text-[#2563EB] flex items-center justify-center gap-1.5 hover:bg-[#EEF2F6]"
      >
        <Plus size={14} /> {open ? "Close" : label}
      </button>
      {open && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
          {err && (
            <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-2.5 mb-3 text-xs">
              {err}
            </div>
          )}
          {children}
        </div>
      )}
    </>
  );
}

/* The one message that means "the SQL has not been run". Said the same way on
   every screen, and it names the file, because "relation does not exist" sends
   nobody to the right place. */
function NeedsSql({ what }) {
  return (
    <Warn>
      <b>{what} could not be read.</b> Run <span className="font-mono">supabase/finance_ledger.sql</span>{" "}
      once in the Supabase SQL editor, then refresh. Until then this screen stays empty
      and the statements leave these figures out rather than guessing them.
    </Warn>
  );
}

/* Void, with the reason optional. Deliberately: the owner asked for undo without
   being interrogated, and a required box only ever gets "x" typed into it. */
async function voidWithReason(table, row, label, user, onChanged) {
  const reason = prompt(
    `Void this ${label}?\n\nIt stays on the list crossed out and stops counting towards any total.\n` +
    `Why, if you want to say (you can leave this blank):`, "");
  if (reason === null) return;
  try {
    await api.voidFinanceRow(table, row.id, user, reason);
    onChanged();
  } catch (e) {
    alert("Could not void it: " + errText(e));
  }
}

/* ======================= THE CASH BOOK TABLE =======================
   Shared by Cash & Bank and by the statements, so the two can never show the
   drawer differently. */
export function PotsTable({ book, month }) {
  const Row = ({ label, pots, total, strong, tone }) => {
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
        <td className="py-2 px-1 text-right"><Money value={sign * (total || 0)} bold /></td>
      </tr>
    );
  };
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[26rem]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[#5A6472]">
            <th className="text-left font-bold py-1.5 px-1"> </th>
            {POTS.map((p) => {
              const Icon = POT_ICON[p];
              return (
                <th key={p} className="text-right font-bold py-1.5 px-1">
                  <span className="inline-flex items-center gap-1"><Icon size={11} /> {p}</span>
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
  );
}

export function EntriesList({ entries, max = "max-h-96" }) {
  if (!entries.length) {
    return <Empty>Nothing moved in this period.</Empty>;
  }
  return (
    <div className={`space-y-1 ${max} overflow-y-auto`}>
      {entries.map((e, i) => (
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
            <span className="block text-[10px] text-[#5A6472] tabular-nums">bal {KES(e.balance)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ======================= CASH & BANK ======================= */
export function CashBankView({ book, month, periodLabel, user, opening }) {
  const print = () => printHtml(reportHtml({
    ...printDoc(user),
    title: "Cash and Bank",
    periodLabel,
    landscape: true,
    summary: [
      { label: "Brought forward", value: book.openingTotal },
      { label: "Money in", value: book.in.total },
      { label: "Money out", value: -book.out.total },
      { label: "Closing balance", value: book.closingTotal },
    ],
    columns: [
      { key: "ts", label: "Date", date: true },
      { key: "label", label: "Detail" },
      { key: "who", label: "Who" },
      { key: "pot", label: "In / out of" },
      { key: "by", label: "Entered by" },
      { key: "signed", label: "Amount", money: true },
      { key: "balance", label: "Balance", money: true },
    ],
    rows: book.entries,
    totals: { signed: book.in.total - book.out.total },
    totalLabel: "Movement in the period",
    notes: [
      "Count the drawer and the Cash column should agree.",
      "Unpaid sales are not here. They are a debt, and reach the cash book on the day they are paid.",
      "A sale that was returned is not here either — the part went back on the shelf and the money went back to the customer.",
    ],
    emptyMessage: "Nothing moved in this period.",
  }));

  return (
    <>
      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <Card title={`Cash book — ${periodLabel}`} icon={Banknote}>
        <PotsTable book={book} month={month} />
        <p className="text-[11px] text-[#5A6472] mt-2 italic">
          Count the drawer and the Cash column should agree. Unpaid sales are not here —
          they are a debt, and reach the cash book on the day they are paid.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {POTS.map((p) => (
          <Stat key={p} label={p} value={book.closing[p] || 0} icon={POT_ICON[p]}
                tone={(book.closing[p] || 0) < 0 ? "bad" : "plain"} />
        ))}
      </div>

      {POTS.some((p) => (book.closing[p] || 0) < 0) && (
        <Warn>
          <b>One of the pots is below zero.</b> That cannot happen in real life, so
          something is missing: money paid in that was never recorded, or an expense
          entered against the wrong pot. Check the entries below before trusting any
          total on this screen.
        </Warn>
      )}

      <Card title={`All ${book.entries.length} entries`} icon={Wallet}>
        <EntriesList entries={book.entries} />
      </Card>

      {!opening && (
        <Warn tone="warn">
          Opening balances have not been set, so this cash book starts from zero — it
          shows the shop's position since the app was installed, not its real one.
        </Warn>
      )}
    </>
  );
}

/* ======================= PURCHASES — INVOICES ======================= */
export function PurchaseInvoicesView({ invoices, suppliers, ap, user, from, to,
                                       periodLabel, problems, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newSupplier, setNewSupplier] = useState(false);
  const blank = { supplierId: "", supplierName: "", invoiceNo: "", invoicedOn: todayKey(),
                  dueOn: "", amount: "", note: "" };
  const [form, setForm] = useState(blank);
  const [sup, setSup] = useState({ name: "", phone: "", kraPin: "" });

  const missing = problems.some((p) => /purchase invoices/i.test(p.what));
  const shown = useMemo(
    () => invoices.filter((i) => inWindow(i.invoicedOn, from, to)),
    [invoices, from, to]);

  const saveSupplier = async () => {
    if (!sup.name.trim()) { setErr("What is the supplier called?"); return; }
    setBusy(true);
    try {
      const row = await api.addSupplier(sup, user);
      setForm({ ...form, supplierId: row.id, supplierName: row.name });
      setSup({ name: "", phone: "", kraPin: "" });
      setNewSupplier(false);
      setErr("");
      onChanged();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.supplierId && !form.supplierName.trim()) { setErr("Which supplier?"); return; }
    if (!(amount > 0)) { setErr("How much is the invoice for?"); return; }
    setBusy(true);
    try {
      const name = form.supplierId
        ? (suppliers.find((s) => s.id === form.supplierId)?.name || form.supplierName)
        : form.supplierName.trim();
      await api.addPurchaseInvoice({ ...form, supplierName: name, amount }, user);
      setForm({ ...blank, supplierId: form.supplierId, supplierName: form.supplierName });
      setOpen(false);
      setErr("");
      onChanged();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const print = () => printHtml(payablesHtml({
    doc: printDoc(user), ap, asOfLabel: to ? `as at ${dayText(to)}` : "as at today",
  }));

  const billed = shown.reduce((t, i) => t + (i.voidedAt ? 0 : i.amount), 0);

  return (
    <>
      {missing && <NeedsSql what="Purchase invoices" />}

      <Card title="What a purchase invoice is — and is not" icon={AlertTriangle}>
        <p className="text-xs text-[#5A6472]">
          It records <b>money the shop owes a supplier</b>. It does <b>not</b> bring parts
          into stock: parts arrive only through Add Stock, counted by whoever unpacked the
          box. So entering an invoice here adds a debt and no stock value — which is
          correct, because the parts it paid for are already on the shelves and counted
          there. An unpaid supplier bill genuinely makes the business worth less.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Invoiced in this period" value={billed} icon={Truck} />
        <Stat label="Still owed in total" value={ap.outstanding} tone={ap.outstanding > 0 ? "dark" : "good"}
              note={ap.overdue > 0 ? `${KES(ap.overdue)} of it is late` : "Nothing overdue"} />
      </div>

      <div className="flex items-center justify-end mb-3">
        <PrintButton onClick={print} label="Print supplier statement" />
      </div>

      <AddPanel open={open} onToggle={() => { setOpen((v) => !v); setErr(""); }}
                label="Enter a supplier invoice" err={err}>
        {newSupplier ? (
          <>
            <p className="text-[11px] text-[#5A6472] mb-2">
              A new supplier. One row per business — two "Kirinyaga Motors" would split
              one debt across two lines, so the list refuses a name it already has.
            </p>
            <Field label="Supplier name">
              <input value={sup.name} placeholder="e.g. Kirinyaga Motors"
                     onChange={(e) => setSup({ ...sup, name: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone (optional)">
                <input value={sup.phone} onChange={(e) => setSup({ ...sup, phone: e.target.value })} className={inputCls} />
              </Field>
              <Field label="KRA PIN (optional)">
                <input value={sup.kraPin} onChange={(e) => setSup({ ...sup, kraPin: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNewSupplier(false)}
                      className="flex-1 border border-[#DEE3E9] rounded-md py-2.5 text-sm font-semibold text-[#5A6472]">
                Back
              </button>
              <div className="flex-1"><SaveButton onClick={saveSupplier} busy={busy}>Add supplier</SaveButton></div>
            </div>
          </>
        ) : (
          <>
            <Field label="Which supplier?">
              <select value={form.supplierId} className={inputCls}
                      onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">Choose…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <button onClick={() => { setNewSupplier(true); setErr(""); }}
                    className="text-[#2563EB] text-xs font-semibold mb-3 flex items-center gap-1">
              <Plus size={12} /> Add a supplier who isn't on the list
            </button>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice number">
                <input value={form.invoiceNo} placeholder="e.g. KM-4471"
                       onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} className={inputCls} />
              </Field>
              <Field label="How much">
                <input type="number" min="0" step="1" value={form.amount} placeholder="0"
                       onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice date">
                <input type="date" value={form.invoicedOn} max={todayKey()}
                       onChange={(e) => setForm({ ...form, invoicedOn: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Due by (optional)" hint="Leave blank and it can never show as overdue.">
                <input type="date" value={form.dueOn}
                       onChange={(e) => setForm({ ...form, dueOn: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <input value={form.note} placeholder="e.g. brake pads and filters, van delivery"
                     onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
            </Field>
            <SaveButton onClick={save} busy={busy}>Enter the invoice</SaveButton>
          </>
        )}
      </AddPanel>

      {shown.length === 0 ? (
        <Empty>No supplier invoices for this period.</Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((i) => {
            const line = ap.invoices.find((x) => x.id === i.id);
            return (
              <ListRow
                key={i.id}
                title={i.supplierName || "(no supplier named)"}
                subtitle={i.invoiceNo || undefined}
                meta={`${dayText(i.invoicedOn)}${i.dueOn ? ` · due ${dayText(i.dueOn)}` : ""}${i.byName ? ` · ${i.byName}` : ""}`}
                amount={i.amount}
                voided={Boolean(i.voidedAt)}
                voidNote={i.voidReason}
                right={!i.voidedAt && (
                  <VoidButton onClick={() => voidWithReason("purchase_invoices", i,
                    `invoice of ${KES(i.amount)}`, user, onChanged)} />
                )}
              >
                {line && !i.voidedAt && (
                  <div className={`text-[11px] mt-1 font-semibold ${
                    line.settled ? "text-[#0F6E50]" : line.overdue ? "text-[#DC3B2E]" : "text-[#5A6472]"
                  }`}>
                    {line.settled
                      ? "Paid in full."
                      : `${KES(line.due)} still owed${line.overdue ? " — OVERDUE" : ""}${
                          line.paid > 0 ? ` (${KES(line.paid)} paid so far)` : ""}`}
                  </div>
                )}
                {i.note && <div className="text-[11px] text-[#5A6472] mt-0.5 italic">{i.note}</div>}
              </ListRow>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ======================= PURCHASES — PAYMENTS ======================= */
export function SupplierPaymentsView({ payments, invoices, suppliers, ap, user,
                                       from, to, periodLabel, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const blank = { supplierId: "", invoiceId: "", paidOn: todayKey(), amount: "",
                  method: "Cash", reference: "", note: "" };
  const [form, setForm] = useState(blank);

  const shown = useMemo(
    () => payments.filter((p) => inWindow(p.paidOn, from, to)),
    [payments, from, to]);
  const total = shown.reduce((t, p) => t + (p.voidedAt ? 0 : p.amount), 0);

  /* Only invoices with something still owing. Paying a settled invoice again is a
     mistake nobody makes on purpose, and offering it is how it happens. */
  const owing = ap.invoices.filter((i) => !i.settled);

  const save = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) { setErr("How much was paid?"); return; }
    setBusy(true);
    try {
      const inv = owing.find((i) => i.id === form.invoiceId);
      await api.addSupplierPayment({
        ...form, amount,
        supplierId: form.supplierId || inv?.supplierId || null,
      }, user);
      setForm({ ...blank, method: form.method });
      setOpen(false);
      setErr("");
      onChanged();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const print = () => printHtml(reportHtml({
    ...printDoc(user),
    title: "Supplier Payments",
    periodLabel,
    summary: [{ label: "Paid to suppliers", value: total },
              { label: "Payments", value: String(shown.filter((p) => !p.voidedAt).length), money: false }],
    columns: [
      { key: "paidOn", label: "Date", date: true },
      { key: "supplierName", label: "Supplier" },
      { key: "against", label: "Against" },
      { key: "method", label: "Paid out of" },
      { key: "reference", label: "Reference" },
      { key: "byName", label: "Entered by" },
      { key: "amount", label: "Amount", money: true },
    ],
    rows: shown.map((p) => ({
      ...p,
      against: p.invoiceId
        ? (invoices.find((i) => i.id === p.invoiceId)?.invoiceNo || "an invoice")
        : "on account",
      __muted: Boolean(p.voidedAt),
    })),
    totals: { amount: total },
    notes: [
      "Paying a supplier is money out of a pot. It is NOT an expense: the parts it bought are already counted on the shelves, and charging them again would tax the same stock twice.",
      "\"On account\" means the payment was not tied to a numbered invoice. It still comes off what the shop owes, but it cannot be matched to a line.",
    ],
    emptyMessage: "No supplier payments in this period.",
  }));

  return (
    <>
      <div className="bg-[#1B2430] text-white rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HandCoins size={20} className="text-[#F5B301]" />
          <span className="text-sm text-[#C6CBD3]">Paid to suppliers in this period</span>
        </div>
        <span className="text-2xl font-extrabold tabular-nums">{KES(total)}</span>
      </div>

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <AddPanel open={open} onToggle={() => { setOpen((v) => !v); setErr(""); }}
                label="Record a payment to a supplier" err={err}>
        <Field label="Against which invoice?"
               hint="Leave it on 'not tied to an invoice' for a payment on account.">
          <select value={form.invoiceId} className={inputCls}
                  onChange={(e) => {
                    const inv = owing.find((i) => i.id === e.target.value);
                    setForm({ ...form, invoiceId: e.target.value,
                              amount: inv ? String(Math.round(inv.due)) : form.amount });
                  }}>
            <option value="">Not tied to an invoice</option>
            {owing.map((i) => (
              <option key={i.id} value={i.id}>
                {i.supplierName} · {i.invoiceNo || dayText(i.invoicedOn)} · {KES(i.due)} owed
              </option>
            ))}
          </select>
        </Field>
        {!form.invoiceId && (
          <Field label="Which supplier?">
            <select value={form.supplierId} className={inputCls}
                    onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">Choose…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day it was paid">
            <input type="date" value={form.paidOn} max={todayKey()}
                   onChange={(e) => setForm({ ...form, paidOn: e.target.value })} className={inputCls} />
          </Field>
          <Field label="How much">
            <input type="number" min="0" step="1" value={form.amount} placeholder="0"
                   onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label="Paid out of">
          <MethodPicker value={form.method} onChange={(m) => setForm({ ...form, method: m })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reference (optional)">
            <input value={form.reference} placeholder="e.g. M-Pesa code or cheque no."
                   onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Notes (optional)">
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <SaveButton onClick={save} busy={busy}>Record the payment</SaveButton>
      </AddPanel>

      {shown.length === 0 ? (
        <Empty>No payments to suppliers in this period.</Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => {
            const inv = p.invoiceId ? invoices.find((i) => i.id === p.invoiceId) : null;
            return (
              <ListRow
                key={p.id}
                title={p.supplierName || (inv?.supplierName) || "Supplier payment"}
                subtitle={inv ? `invoice ${inv.invoiceNo || dayText(inv.invoicedOn)}` : "on account"}
                meta={`${dayText(p.paidOn)} · ${p.method}${p.reference ? ` · ${p.reference}` : ""}${p.byName ? ` · ${p.byName}` : ""}`}
                amount={p.amount}
                voided={Boolean(p.voidedAt)}
                voidNote={p.voidReason}
                right={!p.voidedAt && (
                  <VoidButton onClick={() => voidWithReason("supplier_payments", p,
                    `payment of ${KES(p.amount)}`, user, onChanged)} />
                )}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

/* ======================= PURCHASES — ACCOUNTS PAYABLE ======================= */
export function PayablesView({ ap, user, to }) {
  const asOfLabel = to ? `as at ${dayText(to)}` : "as at today";
  const print = () => printHtml(payablesHtml({ doc: printDoc(user), ap, asOfLabel }));
  const bySupplier = Object.entries(ap.bySupplier || {})
    .filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Owed to suppliers" value={ap.outstanding} tone={ap.outstanding > 0 ? "dark" : "good"} />
        <Stat label="Overdue" value={ap.overdue} tone={ap.overdue > 0 ? "bad" : "good"}
              icon={AlertTriangle} note={ap.overdue > 0 ? "Past the date on the invoice" : "Nothing late"} />
      </div>

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <Card title={`What the shop owes ${asOfLabel}`} icon={Truck}>
        <Line label="Invoiced by suppliers" value={ap.billed} indent />
        <Line label="Paid to suppliers" value={-ap.paid} indent />
        <Line label="Still owed" value={ap.outstanding} total />
        {ap.onAccount > 0 && (
          <p className="text-[11px] text-[#5A6472] mt-2 italic">
            {KES(ap.onAccount)} of what has been paid was not tied to a numbered invoice.
            It still comes off the total owed, but it cannot be matched to a line, so the
            invoice list below will not add up to the figure above.
          </p>
        )}
      </Card>

      {bySupplier.length > 0 && (
        <Card title="By supplier" icon={Users}>
          {bySupplier.map(([name, due]) => (
            <div key={name} className="flex justify-between text-sm py-1 border-b border-[#EEF2F6] last:border-0">
              <span className="text-[#5A6472]">{name}</span>
              <Money value={due} />
            </div>
          ))}
        </Card>
      )}

      {ap.invoices.length === 0 ? (
        <Empty>No supplier invoices have been entered.</Empty>
      ) : (
        <div className="space-y-2">
          {ap.invoices.map((i) => (
            <ListRow
              key={i.id}
              title={i.supplierName || "(no supplier named)"}
              subtitle={i.invoiceNo || undefined}
              meta={`${dayText(i.invoicedOn)}${i.dueOn ? ` · due ${dayText(i.dueOn)}` : " · no due date"}`}
              amount={i.due}
            >
              <div className={`text-[11px] mt-1 font-semibold ${
                i.settled ? "text-[#0F6E50]" : i.overdue ? "text-[#DC3B2E]" : "text-[#5A6472]"
              }`}>
                {i.settled ? "Settled" : i.overdue ? "OVERDUE" : "Due"}
                {" · "}invoiced {KES(i.amount)}, paid {KES(i.paid)}
              </div>
            </ListRow>
          ))}
        </div>
      )}
    </>
  );
}

/* ======================= SALES — INVOICES =======================
   Read-only. A sale is recorded on the Sales tab by the person at the counter, and
   returned there too, because a return puts a part back on a shelf and that is not
   a decision to make from the accounts screen. */
export function SalesInvoicesView({ sales, user, from, to, periodLabel }) {
  const shown = useMemo(
    () => sales.filter((s) => inWindow(String(s.ts).slice(0, 10), from, to))
               .sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    [sales, from, to]);
  const live = shown.filter((s) => !s.returnedAt);
  const revenue = live.reduce((t, s) => t + (Number(s.total) || 0), 0);
  const unpaid = live.reduce((t, s) => (s.paid === false ? t + (Number(s.total) || 0) : t), 0);
  const returned = shown.filter((s) => s.returnedAt);

  const print = () => printHtml(salesReportHtml({
    doc: printDoc(user), sales: shown, periodLabel,
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Sold in this period" value={revenue} icon={ShoppingCart}
              note={`${live.length} sale${live.length === 1 ? "" : "s"}`} />
        <Stat label="Not paid for yet" value={unpaid} tone={unpaid > 0 ? "bad" : "good"}
              note={unpaid > 0 ? "A debt, not money in the drawer" : "Everything is paid"} />
      </div>

      <div className="flex items-center justify-end mb-3">
        <PrintButton onClick={print} label="Print sales report" />
      </div>

      {returned.length > 0 && (
        <Card title={`${returned.length} returned`} icon={AlertTriangle}
              note="Returned sales are left out of every figure above and out of the statements. The part went back on the shelf, so counting the money as well would count the same part twice.">
          {returned.slice(0, 10).map((s, i) => (
            <div key={i} className="flex justify-between text-xs py-1 border-b border-[#EEF2F6] last:border-0">
              <span className="text-[#5A6472] line-through">{s.name || s.code}</span>
              <span className="tabular-nums text-[#5A6472] line-through">{KES(s.total)}</span>
            </div>
          ))}
          {returned.length > 10 && (
            <p className="text-[11px] text-[#5A6472] mt-1">…and {returned.length - 10} more. They all print.</p>
          )}
        </Card>
      )}

      {shown.length === 0 ? (
        <Empty>No sales in this period.</Empty>
      ) : (
        <div className="space-y-2">
          {shown.slice(0, 200).map((s, i) => (
            <ListRow
              key={s.id || i}
              title={s.name || s.code || "Sale"}
              subtitle={s.buyer || undefined}
              meta={`${fmtDateTime(s.ts)} · ${s.qty} × · ${s.method || "Cash"}${s.by || s.byName ? ` · ${s.by || s.byName}` : ""}`}
              amount={s.total}
              voided={Boolean(s.returnedAt)}
              voidNote={s.returnedAt ? "returned, part back on the shelf" : ""}
            >
              {!s.returnedAt && s.paid === false && (
                <div className="text-[11px] text-[#DC3B2E] mt-1 font-semibold">Not paid for yet.</div>
              )}
            </ListRow>
          ))}
          {shown.length > 200 && (
            <p className="text-[11px] text-[#5A6472] text-center py-2">
              Showing the most recent 200 of {shown.length}. All {shown.length} print.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/* ======================= SALES — CUSTOMER PAYMENTS =======================
   Money arriving from customers who owe. Not the same thing as a sale: the sale
   was recorded when the part left the shop, and this is the debt being settled.
   Counting both as income would double the shop's turnover. */
export function CustomerPaymentsView({ creditTxns, user, from, to, periodLabel }) {
  const shown = useMemo(
    () => creditTxns.filter((t) => t.kind === "payment"
                                && inWindow(String(t.ts).slice(0, 10), from, to))
                    .sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    [creditTxns, from, to]);
  const total = shown.reduce((t, x) => t + (Number(x.amount) || 0), 0);

  const print = () => printHtml(reportHtml({
    ...printDoc(user),
    title: "Customer Payments",
    periodLabel,
    summary: [{ label: "Received from credit customers", value: total },
              { label: "Payments", value: String(shown.length), money: false }],
    columns: [
      { key: "ts", label: "Date", date: true },
      { key: "accountName", label: "Account" },
      { key: "method", label: "Paid in by" },
      { key: "reference", label: "Reference" },
      { key: "byName", label: "Taken by" },
      { key: "amount", label: "Amount", money: true },
    ],
    rows: shown,
    totals: { amount: total },
    notes: [
      "These are debts being settled, not new sales. The sale itself was recorded when the part left the shop; counting both would double the shop's turnover.",
      "A charge on an account is not here for the same reason — it is goods leaving on credit, and no money changed hands.",
    ],
    emptyMessage: "No credit customers paid in this period.",
  }));

  return (
    <>
      <div className="bg-[#1B2430] text-white rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HandCoins size={20} className="text-[#F5B301]" />
          <span className="text-sm text-[#C6CBD3]">Received from credit customers</span>
        </div>
        <span className="text-2xl font-extrabold tabular-nums">{KES(total)}</span>
      </div>

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <Card title="Why this is not sales" icon={AlertTriangle}>
        <p className="text-xs text-[#5A6472]">
          The sale was counted on the day the part left the shop. This screen is the
          debt being paid off — money into a pot, and no new turnover. Adding it to
          sales would show the shop selling everything twice. Charges put onto an
          account are left out for the mirror-image reason: goods left, no money moved.
        </p>
      </Card>

      {shown.length === 0 ? (
        <Empty>No credit customer paid in this period.</Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((t, i) => (
            <ListRow
              key={t.id || i}
              title={t.accountName || "Account payment"}
              subtitle={t.description || undefined}
              meta={`${fmtDateTime(t.ts)} · ${t.method || "Cash"}${t.reference ? ` · ${t.reference}` : ""}${t.byName ? ` · ${t.byName}` : ""}`}
              amount={t.amount}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ======================= SALES — ACCOUNTS RECEIVABLE ======================= */
export function ReceivablesView({ ar, user, to }) {
  const asOfLabel = to ? `as at ${dayText(to)}` : "as at today";
  const print = () => printHtml(receivablesHtml({ doc: printDoc(user), ar, asOfLabel }));

  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Owed in total" value={ar.total} tone={ar.total > 0 ? "dark" : "good"} />
        <Stat label="Credit accounts" value={ar.accountsTotal} icon={Users} />
        <Stat label="Walk-ins" value={ar.walkInsTotal} icon={ShoppingCart} />
      </div>

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <Card title="Credit accounts" icon={Users}
            note="Each garage's running balance, as kept on the Credit tab.">
        {ar.accounts.length === 0 ? (
          <p className="text-xs text-[#5A6472] italic py-2">No credit account owes anything.</p>
        ) : ar.accounts.map((a) => (
          <div key={a.id} className="flex justify-between items-baseline text-sm py-1.5 border-b border-[#EEF2F6] last:border-0">
            <span className="text-[#1B2430]">
              {a.name}
              {a.phone && <span className="block text-[10px] text-[#5A6472]">{a.phone}</span>}
            </span>
            <Money value={a.due} />
          </div>
        ))}
      </Card>

      <Card title="Unpaid sales to people without an account" icon={ShoppingCart}
            note="A sale taken on trust. Counted here once only — a buyer who does have an account is left out, because their debt is already in the account balance above.">
        {ar.walkIns.length === 0 ? (
          <p className="text-xs text-[#5A6472] italic py-2">Nothing left the shop unpaid.</p>
        ) : ar.walkIns
              .slice()
              .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
              .map((s, i) => (
          <div key={s.id || i} className="flex justify-between items-baseline text-sm py-1.5 border-b border-[#EEF2F6] last:border-0">
            <span className="text-[#1B2430]">
              {s.buyer || "(no name taken)"}
              <span className="block text-[10px] text-[#5A6472]">
                {s.name || s.code} · {fmtDateTime(s.ts)}{s.by || s.byName ? ` · ${s.by || s.byName}` : ""}
              </span>
            </span>
            <Money value={s.total} />
          </div>
        ))}
      </Card>
    </>
  );
}

/* ======================= INVENTORY VALUATION — STOCK VALUE ======================= */
export function StockValueView({ items, stock, writeOffs, stockAfter, user }) {
  const live = useMemo(
    () => items.filter((i) => String(i.status || "Active") === "Active" && (Number(i.qty) || 0) > 0)
               .map((i) => ({ ...i, retail: (Number(i.price) || 0) * (Number(i.qty) || 0) }))
               .sort((a, b) => b.retail - a.retail),
    [items]);

  const print = () => printHtml(reportHtml({
    ...printDoc(user),
    title: "Stock Valuation",
    subtitle: "Everything on the shelves, most valuable first",
    landscape: true,
    estimated: true,
    summary: [
      { label: "Items on the shelves", value: String(stock.units), money: false },
      { label: "Would fetch if it all sold", value: stock.retail },
      { label: "Tied up in it (estimated cost)", value: stock.cost },
      { label: "After write-offs", value: stockAfter },
    ],
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Part" },
      { key: "qty", label: "On shelf", qty: true },
      { key: "price", label: "Price each", money: true },
      { key: "retail", label: "Would fetch", money: true },
      { key: "location", label: "Where" },
    ],
    rows: live,
    totals: { retail: stock.retail },
    totalLabel: "Whole shelf at selling price",
    notes: [
      `The cost figure is the selling price less an assumed margin of ${PROFIT_VAT_MULTIPLE}× the VAT in it. The shop does not record what it paid for a part.`,
      "A balance sheet uses the cost figure. Valuing stock at what it might sell for would book profit the shop has not earned.",
      "This is a count of what is on the shelves, not of what was bought — a purchase invoice does not add anything to this list.",
    ],
    emptyMessage: "Nothing on the shelves.",
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="On the shelves" value={String(stock.units)} icon={Boxes} note="items" />
        <Stat label="Would fetch" value={stock.retail} note="if every part sold at its price" />
        <Stat label="Tied up in it" value={stock.cost} est tone="dark" note="the balance sheet figure" />
        <Stat label="After write-offs" value={stockAfter} est
              note={writeOffs ? `${KES(Math.abs(writeOffs))} written off` : "nothing written off"} />
      </div>

      <Estimate what="What the stock cost" />

      <div className="flex items-center justify-end my-3">
        <PrintButton onClick={print} label="Print the whole shelf" />
      </div>

      <Card title="How the figure is reached" icon={Scale}>
        <Line label="Every active part at its selling price" value={stock.retail} indent />
        <Line label="Less the margin assumed in those prices" value={-(stock.retail - stock.cost)} indent
              note={`${PROFIT_VAT_MULTIPLE}× the VAT in each price`} />
        <Line label="Estimated cost of the stock" value={stock.cost} rule />
        <Line label="Written off as damaged or missing" value={writeOffs} indent />
        <Line label="Stock on the balance sheet" value={stockAfter} total />
        <p className="text-[11px] text-[#5A6472] mt-2 italic">
          Parts marked sold, and parts with none left, are not counted. Neither is
          anything on a supplier invoice that has not been put on a shelf and counted —
          this figure follows the shelf, not the paperwork.
        </p>
      </Card>

      <Card title="The twenty most valuable lines" icon={Boxes}>
        {live.slice(0, 20).map((i) => (
          <div key={i.code} className="flex justify-between items-baseline text-sm py-1.5 border-b border-[#EEF2F6] last:border-0">
            <span className="text-[#1B2430] min-w-0">
              {i.name || i.code}
              <span className="block text-[10px] text-[#5A6472] font-mono">
                {i.code} · {i.qty} × {KES(i.price)}
              </span>
            </span>
            <Money value={i.retail} />
          </div>
        ))}
        {live.length === 0 && <p className="text-xs text-[#5A6472] italic py-2">Nothing on the shelves.</p>}
      </Card>
    </>
  );
}

/* ======================= INVENTORY VALUATION — COST OF SALES ======================= */
export function CogsView({ pl, periodLabel, user }) {
  const print = () => printHtml(reportHtml({
    ...printDoc(user),
    title: "Cost of Sales",
    periodLabel,
    estimated: true,
    summary: [
      { label: "Sold", value: pl.revenue },
      { label: "Cost of what was sold", value: pl.costOfSales },
      { label: "Gross profit", value: pl.grossProfit },
    ],
    columns: [{ key: "label", label: "Working" }, { key: "amount", label: "Amount", money: true }],
    rows: [
      { label: "Sales in the period", amount: pl.revenue },
      ...(pl.refunds > 0 ? [{ label: "Less refunded to customers", amount: -pl.refunds }] : []),
      { label: "Net sales", amount: pl.netRevenue, __rule: true, __strong: true },
      { label: `VAT assumed inside those sales (${(pl.vatRate * 100).toFixed(0)}%)`, amount: pl.assumedVat },
      { label: `Gross profit — ${PROFIT_VAT_MULTIPLE}× that VAT`, amount: pl.grossProfit },
      { label: "Cost of what was sold — the rest", amount: pl.costOfSales, __rule: true, __strong: true },
    ],
    notes: [
      "There is no purchase cost recorded against a part anywhere in this system, so cost of sales cannot be measured. It is worked out backwards from the selling price by the shop's own rule.",
      "Money spent buying stock is NOT cost of sales. It becomes a cost only when the part sells; until then it sits on the balance sheet as stock.",
    ],
  }));

  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Net sales" value={pl.netRevenue} icon={ShoppingCart} />
        <Stat label="Cost of sales" value={pl.costOfSales} est tone="dark" />
        <Stat label="Gross profit" value={pl.grossProfit} est
              tone={pl.grossProfit >= 0 ? "good" : "bad"}
              note={`${pl.marginPct.toFixed(1)}% margin`} />
      </div>

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <Card title={`Working — ${periodLabel}`} icon={Scale}>
        <Line label="Sales in the period" value={pl.revenue}
              note={`${pl.units} item${pl.units === 1 ? "" : "s"}`} />
        {pl.refunds > 0 && <Line label="Less refunded to customers" value={-pl.refunds} indent />}
        {pl.refunds > 0 && <Line label="Net sales" value={pl.netRevenue} rule />}
        <Line label={`VAT assumed inside those sales at ${(pl.vatRate * 100).toFixed(0)}%`}
              value={pl.assumedVat} indent />
        <Line label={`Gross profit — ${PROFIT_VAT_MULTIPLE} times that VAT`} value={pl.grossProfit} indent />
        <Line label="Cost of what was sold — the rest" value={pl.costOfSales} total />
        <Estimate what="Cost of sales, and the gross profit above it," />
      </Card>

      {pl.stockSpend > 0 && (
        <Card title="Money spent buying stock" icon={Truck}>
          <p className="text-xs text-[#5A6472]">
            <b>{KES(pl.stockSpend)}</b> went on buying stock in this period. It is
            deliberately not in the figures above. It is money out of the drawer but not
            a loss — it turned into parts on a shelf, and becomes a cost only on the day
            one of them sells. Counting it here as well would charge the same stock to
            profit twice.
          </p>
        </Card>
      )}
    </>
  );
}

/* ======================= INVENTORY VALUATION — ADJUSTMENTS ======================= */
export function StockAdjustmentsView({ adjustments, items, user, from, to,
                                       periodLabel, problems, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const blank = { happenedOn: todayKey(), code: "", reason: "Damaged", value: "",
                  qty: "", note: "", direction: "off" };
  const [form, setForm] = useState(blank);

  const missing = problems.some((p) => /stock adjustments/i.test(p.what));
  const shown = useMemo(
    () => adjustments.filter((a) => inWindow(a.happenedOn, from, to)),
    [adjustments, from, to]);
  const total = shown.reduce((t, a) => t + (a.voidedAt ? 0 : a.value), 0);

  /* Typing a code fills the value in from that part's price, because the figure
     wanted is what the shop is losing off the balance sheet and nobody knows that
     off the top of their head. It stays editable: a part half-damaged is not a
     whole write-off. */
  const pick = (code) => {
    const it = items.find((i) => String(i.code).toUpperCase() === String(code).toUpperCase());
    setForm((f) => ({
      ...f, code,
      value: it && !f.value ? String(Math.round((Number(it.price) || 0) * (Number(f.qty) || 1))) : f.value,
    }));
  };

  const save = async () => {
    const value = Number(form.value);
    if (!(value > 0)) { setErr("How much value is coming off?"); return; }
    setBusy(true);
    try {
      await api.addStockAdjustment({ ...form, value }, user);
      setForm({ ...blank, reason: form.reason, direction: form.direction });
      setOpen(false);
      setErr("");
      onChanged();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const print = () => printHtml(stockAdjustmentsHtml({
    doc: printDoc(user), adjustments: shown, periodLabel,
  }));

  return (
    <>
      {missing && <NeedsSql what="Stock adjustments" />}

      <Warn tone="warn">
        <b>This screen does not change a stock count.</b> It writes value off the
        balance sheet and nothing else. Whoever is holding the damaged part still has
        to correct the number on the shelf, in Add Stock — because two screens that
        both believe they own the count will disagree within a week, and then nobody
        trusts either.
      </Warn>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Written off in this period" value={total}
              tone={total < 0 ? "bad" : "plain"} est />
        <Stat label="Entries" value={String(shown.filter((a) => !a.voidedAt).length)} />
      </div>

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <AddPanel open={open} onToggle={() => { setOpen((v) => !v); setErr(""); }}
                label="Write stock off" err={err}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Which day">
            <input type="date" value={form.happenedOn} max={todayKey()}
                   onChange={(e) => setForm({ ...form, happenedOn: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Part code (optional)" hint="Fills the value in from its price.">
            <input value={form.code} placeholder="e.g. BRK-TOY-COR-14-001"
                   onChange={(e) => pick(e.target.value)}
                   className={`${inputCls} font-mono uppercase`} />
          </Field>
        </div>
        <Field label="Why">
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls}>
            {["Damaged", "Missing", "Expired", "Stolen", "Wrong count found", "Other"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How many" hint="For the record only. It does not move the count.">
            <input type="number" min="0" step="1" value={form.qty} placeholder="1"
                   onChange={(e) => setForm({ ...form, qty: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Value coming off">
            <input type="number" min="0" step="1" value={form.value} placeholder="0"
                   onChange={(e) => setForm({ ...form, value: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label="Which way" hint="'Found again' is for a part written off by mistake, or one that turned up.">
          <div className="flex gap-2">
            {[["off", "Written off"], ["on", "Found again"]].map(([k, label]) => (
              <button key={k} onClick={() => setForm({ ...form, direction: k })}
                      className={`flex-1 rounded-md py-2.5 font-semibold text-xs border ${
                        form.direction === k
                          ? "bg-[#2563EB18] border-[#2563EB] text-[#2563EB]"
                          : "border-[#DEE3E9] text-[#5A6472]"}`}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes (optional)">
          <input value={form.note} placeholder="e.g. crushed in the store"
                 onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
        </Field>
        <SaveButton onClick={save} busy={busy}>Record it</SaveButton>
      </AddPanel>

      {shown.length === 0 ? (
        <Empty>Nothing written off in this period.</Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((a) => (
            <ListRow
              key={a.id}
              title={a.reason || "Adjustment"}
              subtitle={a.code || undefined}
              meta={`${dayText(a.happenedOn)}${a.qty != null ? ` · ${a.qty} item${a.qty === 1 ? "" : "s"}` : ""}${a.byName ? ` · ${a.byName}` : ""}`}
              amount={a.value}
              voided={Boolean(a.voidedAt)}
              voidNote={a.voidReason}
              right={!a.voidedAt && (
                <VoidButton onClick={() => voidWithReason("stock_adjustments", a,
                  `write-off of ${KES(Math.abs(a.value))}`, user, onChanged)} />
              )}
            >
              {a.note && <div className="text-[11px] text-[#5A6472] mt-0.5 italic">{a.note}</div>}
            </ListRow>
          ))}
        </div>
      )}
    </>
  );
}

/* ======================= EQUITY ======================= */
export function EquityView({ movements, totals, retainedEarnings, equity, user,
                             from, to, periodLabel, problems, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const blank = { happenedOn: todayKey(), kind: "capital", amount: "", method: "Cash", note: "" };
  const [form, setForm] = useState(blank);

  const missing = problems.some((p) => /owner/i.test(p.what));
  const shown = useMemo(
    () => movements.filter((m) => inWindow(m.happenedOn, from, to)),
    [movements, from, to]);

  const save = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) { setErr("How much?"); return; }
    setBusy(true);
    try {
      await api.addEquityMovement({ ...form, amount }, user);
      setForm({ ...blank, kind: form.kind, method: form.method });
      setOpen(false);
      setErr("");
      onChanged();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const print = () => printHtml(equityHtml({
    doc: printDoc(user), movements: shown, totals, periodLabel,
  }));

  return (
    <>
      {missing && <NeedsSql what="The owner's money in and out" />}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Put in by the owner" value={totals.capital} icon={PiggyBank}
              note={`${KES(totals.capitalOpening)} at the start, ${KES(totals.capitalSince)} since`} />
        <Stat label="Taken out by the owner" value={-totals.drawings}
              note={`${KES(totals.drawingsOpening)} at the start, ${KES(totals.drawingsSince)} since`} />
        <Stat label="Made by the business" value={retainedEarnings} est />
        <Stat label="What the shop is worth" value={equity} tone="dark" est />
      </div>

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <Card title="Why taking money out is not an expense" icon={AlertTriangle}>
        <p className="text-xs text-[#5A6472]">
          The owner taking money for personal use is not a cost of running the shop, so
          it never reaches the trading account and never reduces profit — it reduces
          what the owner is owed by the business. Recording it as an expense would make
          the shop look less profitable than it is, which is the wrong answer to give a
          bank. Money the owner puts in works the same way in reverse: it is not income,
          it is a bigger stake.
        </p>
      </Card>

      <AddPanel open={open} onToggle={() => { setOpen((v) => !v); setErr(""); }}
                label="Record money the owner put in or took out" err={err}>
        <Field label="Which way">
          <div className="flex gap-2">
            {[["capital", "Put in"], ["drawings", "Took out"]].map(([k, label]) => (
              <button key={k} onClick={() => setForm({ ...form, kind: k })}
                      className={`flex-1 rounded-md py-2.5 font-semibold text-sm border ${
                        form.kind === k
                          ? "bg-[#2563EB18] border-[#2563EB] text-[#2563EB]"
                          : "border-[#DEE3E9] text-[#5A6472]"}`}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Which day">
            <input type="date" value={form.happenedOn} max={todayKey()}
                   onChange={(e) => setForm({ ...form, happenedOn: e.target.value })} className={inputCls} />
          </Field>
          <Field label="How much">
            <input type="number" min="0" step="1" value={form.amount} placeholder="0"
                   onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label={form.kind === "capital" ? "Into which pot?" : "Out of which pot?"}
               hint="Choose Own pocket when the money never went through the shop — a bench bought with the owner's own cash. The cash book then leaves it alone and only the balance sheet counts it.">
          <MethodPicker value={form.method} onChange={(m) => setForm({ ...form, method: m })} allowNone />
        </Field>
        <Field label="What for (optional)">
          <input value={form.note} placeholder="e.g. school fees, or bought a workbench"
                 onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
        </Field>
        <SaveButton onClick={save} busy={busy}>Record it</SaveButton>
      </AddPanel>

      {shown.length === 0 ? (
        <Empty>Nothing recorded for this period.</Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((m) => (
            <ListRow
              key={m.id}
              title={m.kind === "capital" ? "Owner put money in" : "Owner took money out"}
              subtitle={m.note || undefined}
              meta={`${dayText(m.happenedOn)} · ${m.method || "Not through the shop"}${m.byName ? ` · ${m.byName}` : ""}`}
              amount={m.kind === "capital" ? m.amount : -m.amount}
              voided={Boolean(m.voidedAt)}
              voidNote={m.voidReason}
              right={!m.voidedAt && (
                <VoidButton onClick={() => voidWithReason("equity_movements", m,
                  `${m.kind === "capital" ? "capital" : "drawing"} of ${KES(m.amount)}`, user, onChanged)} />
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ======================= GENERAL LEDGER ======================= */
export function LedgerView({ ledger, periodLabel, user }) {
  const [openAccount, setOpenAccount] = useState("");
  const accounts = Object.values(ledger.byAccount || {})
    .sort((a, b) => String(a.account).localeCompare(String(b.account)));

  const print = () => printHtml(generalLedgerHtml({ doc: printDoc(user), ledger, periodLabel }));

  return (
    <>
      <Card title="What this is, and what it is not" icon={BookOpen}>
        <p className="text-xs text-[#5A6472]">
          Every movement of money in the period, in date order, against the account it
          belongs to. It is worked out from the sales, expenses and payments underneath,
          which is why no figure on it can disagree with them. It is <b>not</b> posted
          double entry: there is no journal, nothing was ever written into a book, and
          it cannot be audited as a book of prime entry. It says so on its own printout
          too, rather than letting anyone assume otherwise.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Debits" value={ledger.totalDebit} />
        <Stat label="Credits" value={ledger.totalCredit} />
        <Stat label="Agreement" value={ledger.balanced ? "It agrees" : "It does not"}
              tone={ledger.balanced ? "good" : "bad"} />
      </div>

      {!ledger.balanced && (
        <Warn>
          <b>The two sides do not agree.</b> Debits {KES(ledger.totalDebit)} against
          credits {KES(ledger.totalCredit)}. Something in the records is inconsistent —
          do not take a figure off this screen until it is found.
        </Warn>
      )}

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      {accounts.length === 0 ? (
        <Empty>Nothing moved in this period.</Empty>
      ) : accounts.map((a) => {
        const open = openAccount === a.account;
        return (
          <div key={a.account} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg mb-2 overflow-hidden">
            <button
              onClick={() => setOpenAccount(open ? "" : a.account)}
              className="w-full flex items-center justify-between gap-2 p-3 text-left"
            >
              <span className="min-w-0">
                <span className="font-bold text-[#1B2430] text-sm">{a.account}</span>
                <span className="block text-[10px] text-[#5A6472]">
                  {a.lines.length} entr{a.lines.length === 1 ? "y" : "ies"} ·
                  debits {KES(a.debit)} · credits {KES(a.credit)}
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <Money value={a.debit - a.credit} bold />
                <ChevronRight size={14} className={`text-[#5A6472] transition-transform ${open ? "rotate-90" : ""}`} />
              </span>
            </button>
            {open && (
              <div className="border-t border-[#DEE3E9] px-3 pb-3 max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-[#5A6472]">
                      <th className="text-left font-bold py-1.5">Date</th>
                      <th className="text-left font-bold py-1.5">Detail</th>
                      <th className="text-right font-bold py-1.5">Debit</th>
                      <th className="text-right font-bold py-1.5">Credit</th>
                      <th className="text-right font-bold py-1.5">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.lines.map((l, i) => (
                      <tr key={i} className="border-t border-[#EEF2F6]">
                        <td className="py-1.5 text-[#5A6472] whitespace-nowrap">{dayText(String(l.ts).slice(0, 10)) || fmtDateTime(l.ts)}</td>
                        <td className="py-1.5 text-[#1B2430]">
                          {l.label}
                          {l.ref && <span className="block text-[10px] text-[#5A6472] font-mono">{l.ref}</span>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{l.debit ? KES(l.debit) : ""}</td>
                        <td className="py-1.5 text-right tabular-nums">{l.credit ? KES(l.credit) : ""}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold">{KES(l.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ======================= TRIAL BALANCE ======================= */
export function TrialBalanceView({ tb, periodLabel, user }) {
  const print = () => printHtml(trialBalanceHtml({ doc: printDoc(user), tb, periodLabel }));

  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Debits" value={tb.debit} />
        <Stat label="Credits" value={tb.credit} />
        <Stat label={tb.balanced ? "Balanced" : "Out by"} value={tb.balanced ? "0" : KES(tb.difference)}
              tone={tb.balanced ? "good" : "bad"} />
      </div>

      {!tb.balanced && (
        <Warn>
          <b>Out by {KES(tb.difference)}.</b> Every entry in this system is written as a
          pair, so a difference means one of the records underneath is incomplete rather
          than that a sum went wrong. Find it before relying on any statement.
        </Warn>
      )}

      <div className="flex items-center justify-end mb-3"><PrintButton onClick={print} /></div>

      <Card title={`Trial balance — ${periodLabel}`} icon={Scale}
            note="Derived from the records, not from a posted journal. It shows where money sat. It is not an audit.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#5A6472]">
              <th className="text-left font-bold py-1.5">Account</th>
              <th className="text-right font-bold py-1.5">Debit</th>
              <th className="text-right font-bold py-1.5">Credit</th>
            </tr>
          </thead>
          <tbody>
            {(tb.rows || []).map((r) => (
              <tr key={r.account} className="border-t border-[#EEF2F6]">
                <td className="py-2 text-[#1B2430]">{r.account}</td>
                <td className="py-2 text-right tabular-nums">{r.debit ? KES(r.debit) : ""}</td>
                <td className="py-2 text-right tabular-nums">{r.credit ? KES(r.credit) : ""}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#1B2430]">
              <td className="py-2 font-bold uppercase text-xs tracking-wide">Total</td>
              <td className="py-2 text-right"><Money value={tb.debit} bold /></td>
              <td className="py-2 text-right"><Money value={tb.credit} bold /></td>
            </tr>
          </tbody>
        </table>
        {(tb.rows || []).length === 0 && (
          <p className="text-xs text-[#5A6472] italic py-3 text-center">Nothing moved in this period.</p>
        )}
        <Estimate what="Cost of sales, and any figure built on it," />
      </Card>
    </>
  );
}
