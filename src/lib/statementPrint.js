/* ---------------------------------------------------------
   THE FINANCIAL STATEMENT, ON PAPER

   The screen in finance.jsx works out the cash book, the trading account and the
   balance sheet. This turns those same three objects into one A4 document, and it
   does nothing else — not one figure is calculated here. Every number that lands
   on the page was already on the screen, so a printed statement and the screen it
   was printed from cannot disagree.

   WHY IT IS ITS OWN FILE. It is a page of string-building with no React in it, so
   it can be imported by node and checked. What is being checked is not the layout
   — it is the WARNINGS. A statement whose figures are incomplete says so on the
   screen in red; a printed copy of the same figures with that line missing is a
   document somebody files, takes to a bank, or works out their tax from. So the
   tests assert that a document built from incomplete data carries the warning, and
   that one built from an unbalanced balance sheet says it does not tally.

   NOTHING IS ROUNDED OR RE-DERIVED HERE either. `check`, `marginPct` and the
   totals arrive as they were worked out and are printed as they arrive.

   printedAt and preparedBy are passed IN rather than read from the clock and the
   session, because a document that says who printed it and when is only worth
   printing if those two are true, and because it makes this testable.
--------------------------------------------------------- */
import { POTS } from "./finance.js";

/* The same four replacements as the other print builders in this app. Copied
   rather than imported: the original lives inside src/tabs.jsx, which cannot be
   imported by node, and four lines of escaping is a cheaper duplicate than making
   this file untestable. */
const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Whole shillings, grouped. Negatives in brackets, the way a ledger prints them —
   a minus sign in front of a long figure is the easiest character on a page to
   miss, and on paper there is no colour to fall back on. */
export function money(v) {
  const n = Math.round(num(v));
  const shown = `KES ${Math.abs(n).toLocaleString("en-KE")}`;
  return n < 0 ? `(${shown})` : shown;
}

const dateOnly = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
};

/* One label-and-figure line. `rule` is the single line above a subtotal, `total`
   the heavy line above a final figure, `indent` a component of the one below it. */
function line({ label, value, note, rule, total, indent }) {
  const cls = [rule ? "rule" : "", total ? "total" : "", indent ? "in" : ""]
    .filter(Boolean)
    .join(" ");
  return `<tr class="${cls}">
    <td class="l">${esc(label)}${note ? `<span class="note">${esc(note)}</span>` : ""}</td>
    <td class="r">${money(value)}</td>
  </tr>`;
}

const lines = (rows) => rows.filter(Boolean).join("");

/* ---------- the cash book, pot by pot ---------- */
function cashBookTable(book, broughtForward) {
  const row = (label, pots, total, { sign = 1, strong = false } = {}) => `<tr class="${strong ? "total" : ""}">
    <td class="l">${esc(label)}</td>
    ${POTS.map((p) => `<td class="r">${money(sign * num(pots?.[p]))}</td>`).join("")}
    <td class="r"><b>${money(sign * num(total))}</b></td>
  </tr>`;

  return `<table class="grid">
    <thead><tr>
      <th class="l"></th>
      ${POTS.map((p) => `<th class="r">${esc(p)}</th>`).join("")}
      <th class="r">Total</th>
    </tr></thead>
    <tbody>
      ${row(broughtForward ? "Brought forward" : "Opening balance", book.opening, book.openingTotal)}
      ${row("Money in", book.in?.pots, book.in?.total)}
      ${row("Money out", book.out?.pots, book.out?.total, { sign: -1 })}
      ${row("Closing balance", book.closing, book.closingTotal, { strong: true })}
    </tbody>
  </table>`;
}

/* Every movement, oldest first, with the running balance. Printed only when it was
   showing on the screen — an owner who wanted the summary should get one page, and
   one who opened the entries wants the workings. */
function entriesTable(entries) {
  if (!entries || !entries.length) return "";
  const rows = entries.map((e) => `<tr>
      <td>${esc(dateOnly(e.ts))}</td>
      <td>${esc(e.label)}${e.who ? ` · ${esc(e.who)}` : ""}${e.note ? ` · ${esc(e.note)}` : ""}</td>
      <td>${esc(e.pot)}</td>
      <td>${esc(e.by || "")}</td>
      <td class="r">${money(e.signed)}</td>
      <td class="r">${money(e.balance)}</td>
    </tr>`).join("");
  return `<h2 class="sec break">Every entry in this period</h2>
  <table class="grid">
    <thead><tr>
      <th class="l">Date</th><th class="l">Detail</th><th class="l">Where</th>
      <th class="l">By</th><th class="r">Amount</th><th class="r">Balance</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ---------------------------------------------------------
   THE DOCUMENT

   shop      { name, tagline, location, poBox, phone, email, kraPin }
   office    { name, phone } — the head office line, or null for a shop that is one
   book/pl/bs  exactly the objects finance.js returned
   problems  the same list the screen shows in red; each { what, message }
--------------------------------------------------------- */
export function statementHtml({
  shop = {},
  office = null,
  footer = "",
  accent = "#2563EB",
  periodLabel = "",
  asOfLabel = "",
  book,
  pl,
  bs,
  /* True when a single month is being printed: the opening column is then what the
     months before it left behind, not the shop's day-one figures, and calling it
     "Opening balance" on paper would read as day one. */
  broughtForward = false,
  entries = [],
  problems = [],
  openingSet = true,
  preparedBy = "",
  printedAt = "",
  vatMultiple = 3,
} = {}) {
  const balanced = Math.abs(num(bs?.check)) < 1;

  /* The warnings, at the TOP of the page and before a single figure. On the screen
     they sit above the cards for the same reason: somebody who reads three lines of
     a statement and stops must have read the part that says not to trust it. */
  const caution = lines([
    problems.length
      ? `<div class="warn"><b>These figures are incomplete — do not rely on them.</b><ul>${
          problems.map((p) => `<li>${esc(p.what)} could not be read (${esc(p.message)})</li>`).join("")
        }</ul></div>`
      : "",
    !openingSet && !problems.length
      ? `<div class="warn soft"><b>Opening balances were not set.</b> Every total below starts
         from zero, so this is the shop's position since the app was installed — not
         its real one.</div>`
      : "",
    !balanced
      ? `<div class="warn"><b>It does not tally — out by ${money(bs?.check)}.</b>
         Something in the records is inconsistent. Do not rely on these figures.</div>`
      : "",
  ]);

  const contacts = [shop.location, shop.poBox ? `P.O. Box ${shop.poBox}` : "", shop.phone, shop.email]
    .filter(Boolean)
    .map(esc)
    .join(" · ");

  const expenseRows = Object.entries(pl?.expensesByCategory || {})
    .sort((a, b) => num(b[1]) - num(a[1]))
    .map(([cat, amt]) => `<tr><td class="l in">${esc(cat)}</td><td class="r">${money(amt)}</td></tr>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Financial Statement — ${esc(shop.name || "")}${periodLabel ? ` — ${esc(periodLabel)}` : ""}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1B2430;margin:0;padding:28px;}
  .wrap{max-width:780px;margin:0 auto;}
  .head{text-align:center;border-bottom:3px solid ${accent};padding-bottom:10px;}
  .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#5A6472;}
  .brand{font-size:23px;font-weight:800;text-transform:uppercase;letter-spacing:1px;}
  .contacts{color:#5A6472;font-size:11.5px;margin-top:3px;}
  .doc{display:flex;justify-content:space-between;align-items:flex-end;margin:14px 0 4px;}
  .doc .t{font-size:17px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:2px;}
  .doc .p{font-size:12px;color:#5A6472;font-weight:600;}
  .doc .m{color:#5A6472;font-size:11px;text-align:right;line-height:1.5;}
  h2.sec{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#5A6472;
         border-bottom:1px solid #DEE3E9;padding-bottom:4px;margin:22px 0 6px;}
  h3.sub{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#5A6472;margin:12px 0 2px;}
  table{width:100%;border-collapse:collapse;font-size:12.5px;}
  table.grid th{background:#EEF2F6;font-size:10px;text-transform:uppercase;letter-spacing:1px;
                color:#5A6472;padding:6px;text-align:right;}
  table.grid th.l{text-align:left;}
  table.grid td{padding:6px;border-bottom:1px solid #EEF2F6;}
  td.l{text-align:left;}
  td.r,th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  td.in{padding-left:20px;color:#5A6472;}
  tr.rule td{border-top:1px solid #9BA6B4;font-weight:700;}
  tr.total td{border-top:2px solid #1B2430;font-weight:800;}
  tr.total td.l{text-transform:uppercase;font-size:11px;letter-spacing:1px;}
  .note{display:block;font-size:10.5px;color:#5A6472;font-style:italic;font-weight:400;
        text-transform:none;letter-spacing:0;}
  .warn{border:1.5px solid #DC3B2E;background:#FBEAE8;color:#8C1D13;border-radius:6px;
        padding:9px 11px;margin:12px 0;font-size:11.5px;line-height:1.5;}
  .warn.soft{border-color:#E0A400;background:#FEF6E7;color:#7A5900;}
  .warn ul{margin:4px 0 0 16px;padding:0;}
  .tally{border:1.5px solid #15926A;background:#E7F5EF;color:#0F6E50;border-radius:6px;
         padding:9px 11px;margin-top:12px;font-size:11.5px;}
  .small{font-size:10.5px;color:#5A6472;line-height:1.6;margin-top:8px;}
  .sign{display:flex;gap:28px;margin-top:34px;}
  .sign div{flex:1;border-top:1px solid #1B2430;padding-top:5px;font-size:10.5px;color:#5A6472;}
  .foot{margin-top:24px;color:#5A6472;font-size:10.5px;border-top:1px solid #DEE3E9;
        padding-top:8px;text-align:center;line-height:1.6;}
  @media print{
    body{padding:0;}
    .wrap{max-width:none;}
    h2.sec{page-break-after:avoid;}
    table{page-break-inside:avoid;}
    .break{page-break-before:always;}
    tr{page-break-inside:avoid;}
  }
</style></head>
<body><div class="wrap">

  <div class="head">
    ${office?.name && office.name !== shop.name ? `<div class="eyebrow">${esc(office.name)}</div>` : ""}
    <div class="brand">${esc(shop.name || "")}</div>
    ${contacts ? `<div class="contacts">${contacts}</div>` : ""}
    ${shop.kraPin ? `<div class="contacts">KRA PIN: ${esc(shop.kraPin)}</div>` : ""}
  </div>

  <div class="doc">
    <div>
      <div class="t">Financial Statement</div>
      ${periodLabel ? `<div class="p">${esc(periodLabel)}</div>` : ""}
    </div>
    <div class="m">
      ${printedAt ? `Printed ${esc(printedAt)}<br>` : ""}
      ${preparedBy ? `Prepared by: ${esc(preparedBy)}` : ""}
    </div>
  </div>

  ${caution}

  <h2 class="sec">Cash book${asOfLabel ? ` — ${esc(asOfLabel)}` : ""}</h2>
  ${cashBookTable(book || {}, broughtForward)}
  <p class="small">
    Count the drawer and the Cash column should agree. Unpaid sales are not here —
    they are a debt, and they reach the cash book on the day they are paid.
  </p>

  <h2 class="sec">Trading account${periodLabel ? ` — ${esc(periodLabel)}` : ""}</h2>
  <table>${lines([
    line({ label: "Sales", value: pl?.revenue, note: `${num(pl?.units)} item${num(pl?.units) === 1 ? "" : "s"} sold` }),
    /* Only when there were some. A line reading "Refunded (KES 0)" on every
       statement teaches people to skip it, and this is a line that must be read on
       the one statement where it is not zero. */
    num(pl?.refunds) > 0
      ? line({ label: "Refunded to customers", value: -num(pl.refunds), indent: true,
               note: "Money handed back. Taken off turnover rather than charged as a cost, so the sales figure is not left overstated." })
      : "",
    num(pl?.refunds) > 0
      ? line({ label: "Net sales", value: pl?.netRevenue, rule: true })
      : "",
    line({ label: "Cost of what was sold", value: -num(pl?.costOfSales), indent: true }),
    line({ label: "Gross profit", value: pl?.grossProfit, rule: true,
           note: `${num(pl?.marginPct).toFixed(1)}% — estimated at ${vatMultiple}× the VAT in each sale` }),
    line({ label: "Running expenses", value: -num(pl?.expenses), indent: true }),
    line({ label: "Net profit", value: pl?.netProfit, total: true }),
  ])}</table>
  ${expenseRows ? `<h3 class="sub">Where the expenses went</h3><table>${expenseRows}</table>` : ""}
  <p class="small">
    ${num(pl?.unpaidRevenue) > 0
      ? `${money(pl.unpaidRevenue)} of these sales has not been paid for yet — that is why profit and cash do not match.<br>`
      : ""}
    ${num(pl?.stockSpend) > 0
      ? `${money(pl.stockSpend)} was spent buying stock. It is money out of the drawer but not a loss — it is on the balance sheet as stock, and becomes a cost only when the part sells.<br>`
      : ""}
    <i>The shop does not record what each part cost, so profit is an estimate, not a measured figure.</i>
  </p>

  <h2 class="sec">Balance sheet${bs?.asOf ? ` as at ${esc(bs.asOf)}` : " — today"}</h2>
  <h3 class="sub">What the shop owns</h3>
  <table>${lines([
    line({ label: "Cash in the drawer", value: bs?.assets?.cash, indent: true }),
    line({ label: "M-Pesa", value: bs?.assets?.mpesa, indent: true }),
    line({ label: "Bank", value: bs?.assets?.bank, indent: true }),
    line({ label: "Stock on the shelves", value: bs?.assets?.stock, indent: true,
           note: `${num(bs?.stock?.units)} items — at estimated cost. Would fetch ${money(bs?.stock?.retail)} if it all sold.${
             num(bs?.writeOffs) !== 0
               ? ` ${money(-num(bs.writeOffs))} has been written off damaged or missing stock.`
               : ""}` }),
    line({ label: "Owed by credit accounts", value: bs?.assets?.debtors, indent: true }),
    line({ label: "Owed on unpaid sales", value: bs?.assets?.unpaidSales, indent: true }),
    line({ label: "Total owned", value: bs?.totalAssets, rule: true }),
  ])}</table>
  <h3 class="sub">What the shop owes</h3>
  <table>${lines([
    line({ label: "Suppliers", value: bs?.liabilities?.suppliers, indent: true,
           note: num(bs?.payables?.overdue) > 0
             ? `${money(bs.payables.overdue)} of it is past its due date.`
             : "Unpaid purchase invoices. The parts they bought are already counted on the shelf above, so they are not added again here." }),
    line({ label: "Total owed", value: bs?.totalLiabilities, rule: true }),
  ])}</table>
  <h3 class="sub">What it is worth</h3>
  <table>${lines([
    line({ label: "Money the owner put in", value: bs?.capital, indent: true,
           note: num(bs?.capitalSince) > 0
             ? `${money(bs.capitalOpening)} at the start, ${money(bs.capitalSince)} since.`
             : "" }),
    line({ label: "Money the owner took out", value: -num(bs?.drawings), indent: true,
           note: num(bs?.drawingsSince) > 0
             ? `${money(bs.drawingsSince)} of it in this system's records.`
             : "" }),
    line({ label: "Made by the business since", value: bs?.retainedEarnings, indent: true }),
    line({ label: "Net worth of the shop", value: bs?.equity, total: true }),
  ])}</table>
  ${balanced
    ? `<div class="tally"><b>It tallies.</b> Owned ${money(bs?.totalAssets)} = owed ${money(bs?.totalLiabilities)} + worth ${money(bs?.equity)}.</div>`
    : `<div class="warn"><b>It does not tally — out by ${money(bs?.check)}.</b> Something in the records is inconsistent.</div>`}

  ${entriesTable(entries)}

  <div class="sign">
    <div>Prepared by${preparedBy ? ` — ${esc(preparedBy)}` : ""}</div>
    <div>Checked by</div>
  </div>

  <div class="foot">
    Worked out from the sales, receipts and expenses recorded in this shop's system.
    Nothing on this page is a stored total.
    ${footer ? `<br>${esc(footer)}` : ""}
    ${office?.name && office.name !== shop.name
      ? `<br>A branch reporting to ${esc(office.name)}${office.phone ? ` · ${esc(office.phone)}` : ""}`
      : ""}
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
}
