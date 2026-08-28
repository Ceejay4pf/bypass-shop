/* ---------------------------------------------------------
   LEDGERS AND REPORTS, ON PAPER

   One document builder for every list in Finance that somebody wants to hold:
   the expense ledger, the general ledger, the trial balance, accounts payable,
   accounts receivable, stock adjustments, the sales report.

   WHY ONE BUILDER AND NOT SEVEN. Seven builders is seven places for the warning
   line to be forgotten, and the warning is the part that matters — see the header
   of statementPrint.js. A printed page of profit figures with no note saying the
   cost was estimated is a page somebody takes to a bank. So the caution block, the
   estimate note, the "prepared by" and the totals rule are written once here and
   every report gets them whether its author remembered or not.

   NOT ONE FIGURE IS CALCULATED IN THIS FILE. Rows and totals arrive worked out, and
   are printed as they arrive, so a printout and the screen it came from cannot
   disagree. `printedAt` and `preparedBy` are passed in rather than read from the
   clock and the session, for the same reason — and because it makes this file
   importable by node and therefore checkable.
--------------------------------------------------------- */

/* Same four replacements as the other print builders here. Copied rather than
   imported: the original is inside src/tabs.jsx, which node cannot import, and four
   lines of escaping is a cheaper duplicate than making this file untestable. */
const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Whole shillings, grouped, negatives in brackets — a minus sign in front of a long
   figure is the easiest character on a page to miss, and paper has no colour to fall
   back on. Deliberately identical to money() in statementPrint.js: two documents
   printed on the same morning must not format the same figure two ways. */
export function money(v) {
  const n = Math.round(num(v));
  const shown = `KES ${Math.abs(n).toLocaleString("en-KE")}`;
  return n < 0 ? `(${shown})` : shown;
}

export function dateOnly(ts) {
  if (ts == null || ts === "") return "";
  /* A date-only string is taken apart by hand rather than handed to Date. "2026-08-01"
     parsed as a date is midnight UTC, and in Nairobi that is still the 1st — but the
     same trick on a machine west of Greenwich prints the 31st of July. A ledger that
     dates a row differently depending on where it was printed is worthless. */
  const s = String(ts);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(ts);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

/* What goes in one cell. A column says how it should read; nothing is guessed from
   the value, because a reference number that happens to be all digits must not come
   out formatted as money. */
function cell(row, col) {
  const raw = typeof col.value === "function" ? col.value(row) : row[col.key];
  if (col.money) return money(raw);
  if (col.date) return esc(dateOnly(raw));
  if (col.qty) return raw == null || raw === "" ? "" : esc(String(raw));
  return esc(raw == null ? "" : String(raw));
}

const cls = (col) => (col.money || col.qty ? "r" : col.align === "c" ? "c" : "l");

function bodyRows(rows, columns) {
  return rows.map((r) => {
    const marks = [r.__strong ? "strong" : "", r.__muted ? "muted" : "", r.__rule ? "rule" : ""]
      .filter(Boolean).join(" ");
    return `<tr class="${marks}">${
      columns.map((c) => `<td class="${cls(c)}">${cell(r, c)}</td>`).join("")
    }</tr>`;
  }).join("");
}

function totalsRow(totals, columns, label) {
  if (!totals) return "";
  let labelled = false;
  return `<tr class="total">${columns.map((c, i) => {
    if (Object.prototype.hasOwnProperty.call(totals, c.key)) {
      return `<td class="${cls(c)}">${cell(totals, c)}</td>`;
    }
    // The label goes in the first column that has no total of its own to print.
    if (!labelled) { labelled = true; return `<td class="l">${esc(label)}</td>`; }
    return `<td class="${cls(c)}"></td>`;
  }).join("")}</tr>`;
}

function table(columns, rows, totals, totalLabel, emptyMessage) {
  /* No rows means the empty message, whatever totals were handed over. A totals
     object of zeros is what a caller passes without thinking, and a table with a
     heavy "Total KES 0" rule and nothing above it reads as a checked figure rather
     than as a period in which nothing happened. */
  if (!rows.length) {
    return `<p class="empty">${esc(emptyMessage)}</p>`;
  }
  return `<table class="grid">
    <thead><tr>${columns.map((c) => `<th class="${cls(c)}">${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${bodyRows(rows, columns)}${totalsRow(totals, columns, totalLabel)}</tbody>
  </table>`;
}

/* ---------------------------------------------------------
   THE DOCUMENT

   shop      { name, tagline, location, poBox, phone, email, kraPin }
   office    { name, phone } — the head office line, or null for a shop that is one
   summary   [{ label, value, note, money }] — the figures across the top
   columns   [{ key, label, money, date, qty, align, value }]
   rows      plain objects; __strong / __muted / __rule mark a row
   groups    [{ heading, note, columns, rows, totals, totalLabel }] instead of rows,
             for a report broken up by account or by supplier
   totals    one object keyed like a row
   cautions  [{ tone: "bad" | "soft", title, body }]
--------------------------------------------------------- */
export function reportHtml({
  shop = {},
  office = null,
  footer = "",
  accent = "#2563EB",
  title = "Report",
  periodLabel = "",
  subtitle = "",
  summary = [],
  columns = [],
  rows = [],
  groups = [],
  totals = null,
  totalLabel = "Total",
  notes = [],
  cautions = [],
  problems = [],
  /* Set on anything showing profit, cost of sales or stock value. The shop does not
     record what a part cost, so those are worked out from its own rule — and an
     estimate printed as a fact is the beginning of a bad decision. Defaults to off,
     because a list of rent payments is not an estimate and saying so would teach
     people to ignore the line where it matters. */
  estimated = false,
  preparedBy = "",
  printedAt = "",
  landscape = false,
  emptyMessage = "Nothing to show for this period.",
} = {}) {
  const contacts = [shop.location, shop.poBox ? `P.O. Box ${shop.poBox}` : "", shop.phone, shop.email]
    .filter(Boolean).map(esc).join(" · ");

  /* Warnings first, above every figure. Somebody who reads three lines of a report
     and stops must have read the part that says not to trust it. */
  const warnings = [
    problems.length
      ? `<div class="warn"><b>These figures are incomplete — do not rely on them.</b><ul>${
          problems.map((p) => `<li>${esc(p.what)} could not be read (${esc(p.message)})</li>`).join("")
        }</ul></div>`
      : "",
    ...cautions.map((c) => `<div class="warn ${c.tone === "soft" ? "soft" : ""}">${
      c.title ? `<b>${esc(c.title)}</b> ` : ""}${esc(c.body || "")}</div>`),
  ].filter(Boolean).join("");

  const summaryCards = summary.length
    ? `<div class="cards">${summary.map((s) => `<div class="card">
        <div class="cl">${esc(s.label)}</div>
        <div class="cv">${s.money === false ? esc(s.value) : money(s.value)}</div>
        ${s.note ? `<div class="cn">${esc(s.note)}</div>` : ""}
      </div>`).join("")}</div>`
    : "";

  const body = groups.length
    ? groups.map((g) => `
        <h2 class="sec">${esc(g.heading || "")}</h2>
        ${g.note ? `<p class="small">${esc(g.note)}</p>` : ""}
        ${table(g.columns || columns, g.rows || [], g.totals, g.totalLabel || totalLabel, emptyMessage)}
      `).join("")
    : table(columns, rows, totals, totalLabel, emptyMessage);

  const noteList = [
    ...notes,
    estimated
      ? "The shop does not record what each part cost, so cost of sales, profit and stock value on this page are estimates worked out from the shop's own rule — not measured figures."
      : "",
  ].filter(Boolean);

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — ${esc(shop.name || "")}${periodLabel ? ` — ${esc(periodLabel)}` : ""}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1B2430;margin:0;padding:28px;}
  .wrap{max-width:${landscape ? "1040px" : "780px"};margin:0 auto;}
  .head{text-align:center;border-bottom:3px solid ${accent};padding-bottom:10px;}
  .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#5A6472;}
  .brand{font-size:23px;font-weight:800;text-transform:uppercase;letter-spacing:1px;}
  .contacts{color:#5A6472;font-size:11.5px;margin-top:3px;}
  .doc{display:flex;justify-content:space-between;align-items:flex-end;margin:14px 0 4px;gap:16px;}
  .doc .t{font-size:17px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:2px;}
  .doc .p{font-size:12px;color:#5A6472;font-weight:600;}
  .doc .m{color:#5A6472;font-size:11px;text-align:right;line-height:1.5;white-space:nowrap;}
  h2.sec{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#5A6472;
         border-bottom:1px solid #DEE3E9;padding-bottom:4px;margin:22px 0 6px;}
  .cards{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 4px;}
  .card{flex:1 1 130px;border:1px solid #DEE3E9;border-radius:7px;padding:8px 10px;}
  .cl{font-size:9.5px;text-transform:uppercase;letter-spacing:1px;color:#5A6472;}
  .cv{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:2px;}
  .cn{font-size:10px;color:#5A6472;margin-top:1px;line-height:1.4;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  table.grid th{background:#EEF2F6;font-size:9.5px;text-transform:uppercase;letter-spacing:1px;
                color:#5A6472;padding:6px;text-align:left;}
  table.grid th.r{text-align:right;}
  table.grid th.c{text-align:center;}
  table.grid td{padding:5px 6px;border-bottom:1px solid #EEF2F6;vertical-align:top;}
  td.l{text-align:left;}
  td.c{text-align:center;}
  td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  tr.strong td{font-weight:700;}
  tr.muted td{color:#8A94A2;text-decoration:line-through;}
  tr.rule td{border-top:1px solid #9BA6B4;}
  tr.total td{border-top:2px solid #1B2430;font-weight:800;}
  .empty{border:1px dashed #DEE3E9;border-radius:7px;padding:16px;text-align:center;
         color:#5A6472;font-size:12px;}
  .warn{border:1.5px solid #DC3B2E;background:#FBEAE8;color:#8C1D13;border-radius:6px;
        padding:9px 11px;margin:12px 0;font-size:11.5px;line-height:1.5;}
  .warn.soft{border-color:#E0A400;background:#FEF6E7;color:#7A5900;}
  .warn ul{margin:4px 0 0 16px;padding:0;}
  .small{font-size:10.5px;color:#5A6472;line-height:1.6;margin-top:8px;}
  .sign{display:flex;gap:28px;margin-top:34px;}
  .sign div{flex:1;border-top:1px solid #1B2430;padding-top:5px;font-size:10.5px;color:#5A6472;}
  .foot{margin-top:24px;color:#5A6472;font-size:10.5px;border-top:1px solid #DEE3E9;
        padding-top:8px;text-align:center;line-height:1.6;}
  @media print{
    body{padding:0;}
    .wrap{max-width:none;}
    @page{size:${landscape ? "A4 landscape" : "A4 portrait"};margin:12mm;}
    thead{display:table-header-group;}
    tr{page-break-inside:avoid;}
    h2.sec{page-break-after:avoid;}
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
      <div class="t">${esc(title)}</div>
      ${periodLabel ? `<div class="p">${esc(periodLabel)}</div>` : ""}
      ${subtitle ? `<div class="p">${esc(subtitle)}</div>` : ""}
    </div>
    <div class="m">
      ${printedAt ? `Printed ${esc(printedAt)}<br>` : ""}
      ${preparedBy ? `Prepared by: ${esc(preparedBy)}` : ""}
    </div>
  </div>

  ${warnings}
  ${summaryCards}
  ${body}

  ${noteList.length ? `<p class="small">${noteList.map(esc).join("<br>")}</p>` : ""}

  <div class="sign">
    <div>Prepared by${preparedBy ? ` — ${esc(preparedBy)}` : ""}</div>
    <div>Checked by</div>
  </div>

  <div class="foot">
    Worked out from the records in this shop's system. Nothing on this page is a
    stored total.
    ${footer ? `<br>${esc(footer)}` : ""}
    ${office?.name && office.name !== shop.name
      ? `<br>A branch reporting to ${esc(office.name)}${office.phone ? ` · ${esc(office.phone)}` : ""}`
      : ""}
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
}

/* ---------------------------------------------------------
   THE REPORTS THEMSELVES

   Each one is a column list and a total. They are here rather than in the JSX so
   that what lands on paper can be checked by node, and so that two screens asking
   for "the expense ledger" get the same document.

   Every builder takes { doc, ... } where `doc` is the shop/office/accent/preparedBy
   /printedAt bundle the caller assembles once.
--------------------------------------------------------- */

/* THE EXPENSE LEDGER. Every shilling out, in date order, with the running total —
   which is the figure an owner is actually looking for and the one a list of rows
   without it makes them add up by hand.

   Voided rows are PRINTED, struck through, and excluded from the total. Leaving them
   off would make a printed ledger disagree with the screen it came from for a reason
   nobody could see; and a voided expense is exactly the row somebody later asks
   about. */
export function expenseLedgerHtml({ doc = {}, expenses = [], periodLabel = "", byCategory = null } = {}) {
  const ordered = [...expenses].sort((a, b) =>
    String(a.spentOn || a.ts).localeCompare(String(b.spentOn || b.ts)));

  let running = 0;
  const rows = ordered.map((e) => {
    const voided = Boolean(e.voidedAt);
    if (!voided) running += num(e.amount);
    return {
      date: e.spentOn || e.ts,
      category: e.category || "",
      detail: [e.description, e.reference ? `Ref ${e.reference}` : "",
               voided ? `VOIDED${e.voidReason ? `: ${e.voidReason}` : ""}` : ""]
        .filter(Boolean).join(" · "),
      method: e.method || "",
      by: e.byName || "",
      amount: voided ? 0 : num(e.amount),
      // A voided row leaves the running total where the row above it left it.
      running,
      __muted: voided,
    };
  });

  const total = rows.reduce((t, r) => t + r.amount, 0);
  const stock = ordered.reduce((t, e) => (!e.voidedAt && e.isStock ? t + num(e.amount) : t), 0);

  const catRows = byCategory
    ? Object.entries(byCategory).sort((a, b) => num(b[1]) - num(a[1]))
        .map(([category, amount]) => ({ category, amount }))
    : [];

  return reportHtml({
    ...doc,
    title: "Expense Ledger",
    periodLabel,
    landscape: true,
    summary: [
      { label: "Total out", value: total },
      { label: "Of that, buying stock", value: stock,
        note: "Money out of the drawer, but not a loss — it is stock until it sells." },
      { label: "Running expenses", value: total - stock },
      { label: "Entries", value: String(ordered.length), money: false },
    ],
    columns: [
      { key: "date", label: "Date", date: true },
      { key: "category", label: "Category" },
      { key: "detail", label: "Detail" },
      { key: "method", label: "Paid from" },
      { key: "by", label: "Entered by" },
      { key: "amount", label: "Amount", money: true },
      { key: "running", label: "Running total", money: true },
    ],
    rows,
    totals: { amount: total },
    totalLabel: "Total out",
    groups: catRows.length
      ? [
          { heading: "Every entry", columns: undefined, rows, totals: { amount: total }, totalLabel: "Total out" },
          { heading: "By category",
            columns: [{ key: "category", label: "Category" }, { key: "amount", label: "Amount", money: true }],
            rows: catRows, totals: { amount: catRows.reduce((t, r) => t + num(r.amount), 0) },
            totalLabel: "Total out" },
        ]
      : [],
    notes: [
      "Rows struck through were voided and are not in the total. They are printed anyway — a voided expense is exactly the row somebody asks about later.",
      "Unpaid supplier invoices are not here. They are a debt, not money out, and they reach this ledger on the day they are paid.",
    ],
  });
}

/* THE GENERAL LEDGER, one block per account, with the running balance. */
export function generalLedgerHtml({ doc = {}, ledger = {}, periodLabel = "" } = {}) {
  const accounts = Object.values(ledger.byAccount || {})
    .sort((a, b) => String(a.account).localeCompare(String(b.account)));

  const columns = [
    { key: "ts", label: "Date", date: true },
    { key: "label", label: "Detail" },
    { key: "ref", label: "Reference" },
    { key: "debit", label: "Debit", money: true },
    { key: "credit", label: "Credit", money: true },
    { key: "balance", label: "Balance", money: true },
  ];

  return reportHtml({
    ...doc,
    title: "General Ledger",
    periodLabel,
    landscape: true,
    estimated: true,
    summary: [
      { label: "Total debits", value: ledger.totalDebit },
      { label: "Total credits", value: ledger.totalCredit },
      { label: "Entries", value: String((ledger.lines || []).length), money: false },
      { label: "Accounts", value: String(accounts.length), money: false },
    ],
    cautions: ledger.balanced === false
      ? [{ tone: "bad", title: "The two sides do not agree.",
           body: "Every entry is written as a matching pair, so this should be impossible. Do not rely on this page." }]
      : [],
    groups: accounts.map((a) => ({
      heading: a.account,
      columns,
      rows: a.lines || [],
      totals: { debit: a.debit, credit: a.credit, balance: a.debit - a.credit },
      totalLabel: `${a.account} total`,
    })),
    emptyMessage: "No money moved in this period.",
    notes: [
      "This is not a posted book of prime entry. Every line is worked out from the sale, expense or payment that caused it, so no figure here can disagree with the records underneath — and equally, none of it was written down at the time by a bookkeeper.",
      "Money the owner put in or took out without it passing through a till is not here. It never touched the shop's cash, M-Pesa or bank, so there is nothing to put on the other side of the entry; it is on the balance sheet instead.",
    ],
  });
}

/* THE TRIAL BALANCE. */
export function trialBalanceHtml({ doc = {}, tb = {}, periodLabel = "" } = {}) {
  return reportHtml({
    ...doc,
    title: "Trial Balance",
    periodLabel,
    estimated: true,
    summary: [
      { label: "Debits", value: tb.debit },
      { label: "Credits", value: tb.credit },
      { label: "Difference", value: tb.difference },
    ],
    cautions: [
      { tone: "soft", title: "What this does and does not prove.",
        body: "It balances because every entry behind it was written as a matching pair, not because one bookkeeper's figures were checked against another's. It shows where money sat. It is not an audit." },
      ...(tb.balanced === false
        ? [{ tone: "bad", title: `Out by ${money(tb.difference)}.`,
             body: "Something behind this page is inconsistent. Do not rely on it." }]
        : []),
    ],
    columns: [
      { key: "account", label: "Account" },
      { key: "debit", label: "Debit", money: true },
      { key: "credit", label: "Credit", money: true },
    ],
    rows: tb.rows || [],
    totals: { debit: tb.debit, credit: tb.credit },
    emptyMessage: "No money moved in this period.",
  });
}

/* ACCOUNTS PAYABLE — what the shop owes, oldest due first. */
export function payablesHtml({ doc = {}, ap = {}, asOfLabel = "" } = {}) {
  const rows = (ap.invoices || []).map((i) => ({
    ...i,
    invoicedOn: i.invoicedOn,
    dueOn: i.dueOn || "",
    state: i.settled ? "Settled" : i.overdue ? "OVERDUE" : "Due",
    __strong: Boolean(i.overdue),
    __muted: Boolean(i.settled),
  }));
  return reportHtml({
    ...doc,
    title: "Accounts Payable",
    subtitle: asOfLabel,
    landscape: true,
    summary: [
      { label: "Owed to suppliers", value: ap.outstanding },
      { label: "Of that, overdue", value: ap.overdue },
      { label: "Invoiced in total", value: ap.billed },
      { label: "Paid", value: ap.paid },
    ],
    cautions: num(ap.onAccount) > 0
      ? [{ tone: "soft", title: `${money(ap.onAccount)} was paid without an invoice named.`,
           body: "It is subtracted from what is owed but cannot be shown against a line below, so the invoice list and the total will not tally by that much." }]
      : [],
    columns: [
      { key: "invoicedOn", label: "Invoiced", date: true },
      { key: "dueOn", label: "Due", date: true },
      { key: "supplierName", label: "Supplier" },
      { key: "invoiceNo", label: "Invoice no." },
      { key: "state", label: "State" },
      { key: "amount", label: "Amount", money: true },
      { key: "paid", label: "Paid", money: true },
      { key: "due", label: "Still owed", money: true },
    ],
    rows,
    totals: { amount: ap.billed, due: ap.outstanding },
    totalLabel: "Total",
    emptyMessage: "The shop owes no supplier anything on record.",
    notes: [
      "An invoice here is a debt, not a delivery. The parts it paid for are counted on the shelf and are not added again by this page.",
    ],
  });
}

/* ACCOUNTS RECEIVABLE — what the shop is owed. */
export function receivablesHtml({ doc = {}, ar = {}, asOfLabel = "" } = {}) {
  return reportHtml({
    ...doc,
    title: "Accounts Receivable",
    subtitle: asOfLabel,
    summary: [
      { label: "Owed in total", value: ar.total },
      { label: "By credit accounts", value: ar.accountsTotal },
      { label: "On unpaid walk-in sales", value: ar.walkInsTotal },
    ],
    groups: [
      { heading: "Credit accounts",
        columns: [
          { key: "name", label: "Account" },
          { key: "phone", label: "Phone" },
          { key: "due", label: "Owed", money: true },
        ],
        rows: ar.accounts || [],
        totals: { due: ar.accountsTotal },
        totalLabel: "Owed by accounts" },
      { heading: "Unpaid sales with no account behind them",
        note: "A garage's unpaid sale is already in its account balance above and is not repeated here.",
        columns: [
          { key: "ts", label: "Date", date: true },
          { key: "code", label: "Part" },
          { key: "name", label: "Item" },
          { key: "buyer", label: "Who" },
          { key: "by", label: "Sold by" },
          { key: "total", label: "Owed", money: true },
        ],
        rows: ar.walkIns || [],
        totals: { total: ar.walkInsTotal },
        totalLabel: "Owed on unpaid sales" },
    ],
    emptyMessage: "Nobody owes the shop anything on record.",
  });
}

/* THE SALES REPORT — every sale, and what became of it. */
export function salesReportHtml({ doc = {}, sales = [], periodLabel = "", vatRate = 0.16 } = {}) {
  const ordered = [...sales].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const live = ordered.filter((s) => !s.returnedAt);
  const returned = ordered.filter((s) => s.returnedAt);
  const revenue = live.reduce((t, s) => t + num(s.total), 0);
  const unpaid = live.reduce((t, s) => (s.paid === false ? t + num(s.total) : t), 0);
  const units = live.reduce((t, s) => t + num(s.qty), 0);

  return reportHtml({
    ...doc,
    title: "Sales Report",
    periodLabel,
    landscape: true,
    summary: [
      { label: "Sales", value: revenue, note: `${units} item${units === 1 ? "" : "s"}` },
      { label: "Not paid for yet", value: unpaid },
      { label: "Returned", value: returned.reduce((t, s) => t + num(s.total), 0),
        note: `${returned.length} sale${returned.length === 1 ? "" : "s"} undone` },
      { label: "Sales recorded", value: String(ordered.length), money: false },
    ],
    columns: [
      { key: "ts", label: "Date", date: true },
      { key: "code", label: "Part" },
      { key: "name", label: "Item" },
      { key: "qty", label: "Qty", qty: true },
      { key: "buyer", label: "Customer" },
      { key: "method", label: "Paid by" },
      { key: "state", label: "State", value: (s) => (s.returnedAt ? "RETURNED" : s.paid === false ? "Not paid" : "Paid") },
      { key: "by", label: "Sold by" },
      { key: "total", label: "Amount", money: true },
    ],
    rows: ordered.map((s) => ({ ...s, __muted: Boolean(s.returnedAt), __strong: s.paid === false && !s.returnedAt })),
    totals: { total: revenue },
    totalLabel: "Sales, returns excluded",
    emptyMessage: "No sales were recorded in this period.",
    notes: [
      "Rows struck through were returned. The sale is kept — the books still show it happened — and it is left out of the total.",
      "Sales not yet paid for are counted here in full, because a sale on credit is still a sale that was earned. That is why this figure and the money in the drawer do not match.",
    ],
  });
}

/* STOCK ADJUSTMENTS — what was written off the valuation, and why. */
export function stockAdjustmentsHtml({ doc = {}, adjustments = [], periodLabel = "" } = {}) {
  const ordered = [...adjustments].sort((a, b) =>
    String(a.happenedOn || a.ts).localeCompare(String(b.happenedOn || b.ts)));
  const total = ordered.reduce((t, a) => (a.voidedAt ? t : t + num(a.value)), 0);
  return reportHtml({
    ...doc,
    title: "Stock Adjustments",
    periodLabel,
    landscape: true,
    estimated: true,
    summary: [
      { label: "Written off the valuation", value: total },
      { label: "Entries", value: String(ordered.length), money: false },
    ],
    columns: [
      { key: "happenedOn", label: "Date", date: true },
      { key: "code", label: "Part" },
      { key: "reason", label: "Reason" },
      { key: "qty", label: "Qty", qty: true },
      { key: "note", label: "Note" },
      { key: "byName", label: "Entered by" },
      { key: "value", label: "Value", money: true },
    ],
    rows: ordered.map((a) => ({ ...a, __muted: Boolean(a.voidedAt) })),
    totals: { value: total },
    totalLabel: "Net adjustment",
    emptyMessage: "Nothing has been written off.",
    notes: [
      "THIS DOES NOT CHANGE A STOCK COUNT. It records why the valuation moved. The number of parts on the shelf is corrected by whoever is holding them, in Add Stock.",
    ],
  });
}

/* THE OWNER'S MONEY — capital in and drawings out. */
export function equityHtml({ doc = {}, movements = [], totals = {}, periodLabel = "" } = {}) {
  const ordered = [...movements].sort((a, b) =>
    String(a.happenedOn || a.ts).localeCompare(String(b.happenedOn || b.ts)));
  return reportHtml({
    ...doc,
    title: "Owner's Capital and Drawings",
    periodLabel,
    landscape: true,
    summary: [
      { label: "Put in on day one", value: totals.capitalOpening },
      { label: "Put in since", value: totals.capitalSince },
      { label: "Taken out in total", value: totals.drawings },
      { label: "Owner's stake", value: totals.net },
    ],
    columns: [
      { key: "happenedOn", label: "Date", date: true },
      { key: "kind", label: "In or out",
        value: (m) => (m.kind === "capital" ? "Put in" : "Taken out") },
      { key: "method", label: "Through",
        value: (m) => m.method || "Not through the shop" },
      { key: "note", label: "Note" },
      { key: "byName", label: "Entered by" },
      { key: "amount", label: "Amount", money: true,
        value: (m) => (m.voidedAt ? 0 : m.kind === "capital" ? num(m.amount) : -num(m.amount)) },
    ],
    rows: ordered.map((m) => ({ ...m, __muted: Boolean(m.voidedAt) })),
    totals: { amount: num(totals.capitalSince) - num(totals.drawingsSince) },
    totalLabel: "Net movement in this period",
    emptyMessage: "The owner has neither put money in nor taken any out on record.",
    notes: [
      "A movement marked \"not through the shop\" never touched the till, M-Pesa or bank — the owner used their own money. It counts towards their stake and is left out of the cash book.",
      "Money the owner takes out is not a business cost. It never reaches profit; it reduces what the business is worth.",
    ],
  });
}

/* THE CASH FLOW STATEMENT. */
export function cashFlowHtml({ doc = {}, cf = {}, periodLabel = "" } = {}) {
  const rows = [
    { label: "Money in from trading", amount: num(cf.operatingIn) },
    { label: "Money out on trading, stock and suppliers", amount: -num(cf.operatingOut) },
    { label: "From trading", amount: num(cf.operating), __rule: true, __strong: true },
    { label: "Buying or selling equipment", amount: num(cf.investing) },
    { label: "Money the owner put in", amount: num(cf.financingIn) },
    { label: "Money the owner took out", amount: -num(cf.financingOut) },
    { label: "From the owner", amount: num(cf.financing), __rule: true, __strong: true },
    { label: "Change in cash over the period", amount: num(cf.movement), __strong: true },
    { label: "Cash at the start", amount: num(cf.opening) },
    { label: "Cash at the end", amount: num(cf.closing), __strong: true },
  ];
  return reportHtml({
    ...doc,
    title: "Cash Flow Statement",
    periodLabel,
    summary: [
      { label: "From trading", value: cf.operating },
      { label: "From the owner", value: cf.financing },
      { label: "Change in cash", value: cf.movement },
      { label: "Cash at the end", value: cf.closing },
    ],
    cautions: Math.abs(num(cf.check)) >= 1
      ? [{ tone: "bad", title: `Out by ${money(cf.check)}.`,
           body: "The three sections do not add up to the movement the cash book shows. Do not rely on this page." }]
      : [],
    columns: [
      { key: "label", label: "" },
      { key: "amount", label: "Amount", money: true },
    ],
    rows,
    emptyMessage: "No money moved in this period.",
    notes: [
      "Buying or selling equipment is shown as nothing because the system has nowhere to record it — not because none happened. It is left on the page so nobody wonders whether it was forgotten.",
      num(cf.netProfit) !== num(cf.movement)
        ? `Profit for the period was ${money(cf.netProfit)} and cash moved by ${money(cf.movement)}. They differ mostly because of sales not yet paid for, stock bought and the owner's own money — profit is what was earned, this page is what actually moved.`
        : "",
    ],
  });
}
