/* ---------------------------------------------------------
   FINANCE — the pieces every finance screen is built from.

   Pulled out of finance.jsx when that file grew from three views to eleven. The
   reason is not tidiness: `Money` decides how a negative figure reads, `Line`
   decides where the heavy rule above a total goes, and `Estimate` decides how the
   shop is told that a profit figure is not a measured one. Those are decisions
   that have to be the same on the balance sheet and on the dashboard, and the way
   to make sure of that is to have one of each rather than eleven.

   THE ESTIMATE LABEL. The shop does not record what it paid for a part, so every
   profit, every cost of sales and every stock value in this system is worked out
   from the VAT in the selling price (see estimatedProfit in lib/finance.js). The
   owner chose that over typing a buying price on 604 parts, on the condition that
   nothing ever presents the result as a measured fact. `<Estimate />` is how that
   promise is kept, and it is a component rather than a sentence typed eleven times
   so that it cannot be left off the twelfth screen.

   Nothing in this file calculates anything.
--------------------------------------------------------- */
import React from "react";
import {
  Landmark, Smartphone, Banknote, Printer, Loader2, Check, AlertTriangle, Trash2,
} from "lucide-react";
import { SHOP_INFO } from "./lib/shopInfo.js";
import { shopAccent } from "./lib/shopSkin.js";

export const KES = (n) =>
  `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;

export const POT_ICON = { Cash: Banknote, "M-Pesa": Smartphone, Bank: Landmark };

export const todayKey = () => new Date().toISOString().slice(0, 10);

/* Negative money reads red and in brackets, the way a ledger prints it —
   a minus sign in front of a long figure is easy to miss. */
export function Money({ value, bold = false, className = "" }) {
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

/* One line of a statement: label left, figure right. `rule` draws the single
   line above a subtotal, `total` the heavy line above a final figure. */
export function Line({ label, value, note, rule, total, indent }) {
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

export function Card({ title, icon: Icon, children, right, note }) {
  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[#1B2430] font-bold uppercase text-xs tracking-wide flex items-center gap-2">
          {Icon && <Icon size={14} className="text-[#2563EB]" />} {title}
        </h3>
        {right}
      </div>
      {note && <p className="text-[11px] text-[#5A6472] italic mb-2">{note}</p>}
      {children}
    </div>
  );
}

/* The one sentence that has to appear beside every figure the shop did not
   measure. Small, italic, and never omitted — see the file header. */
export function Estimate({ what = "This figure" }) {
  return (
    <p className="text-[11px] text-[#8A6400] bg-[#FEF6E7] border border-[#F0D9A8] rounded px-2 py-1 mt-2 italic">
      {what} is an <b>estimate</b>. The shop does not record what each part cost, so
      it is worked out from the VAT in the selling price — not measured.
    </p>
  );
}

/* A headline figure. `est` marks it as one of the estimated ones with a small
   asterisk, so a screen full of tiles does not need a paragraph under each. */
export function Stat({ label, value, icon: Icon, tone = "plain", est = false, note, onClick }) {
  const tones = {
    plain: "bg-[#FFFFFF] border-[#DEE3E9] text-[#1B2430]",
    good: "bg-[#E7F5EF] border-[#15926A] text-[#0F6E50]",
    bad: "bg-[#FBEAE8] border-[#DC3B2E] text-[#DC3B2E]",
    dark: "bg-[#1B2430] border-[#1B2430] text-white",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`border rounded-lg p-3 text-left w-full ${tones[tone] || tones.plain} ${
        onClick ? "active:scale-[0.99]" : ""
      }`}
    >
      <span className="text-[10px] uppercase tracking-wide font-bold opacity-70 flex items-center gap-1">
        {Icon && <Icon size={11} />} {label}{est ? " *" : ""}
      </span>
      <span className="block text-lg font-extrabold tabular-nums mt-1">
        {typeof value === "number"
          ? (value < 0 ? `(${KES(Math.abs(value))})` : KES(value))
          : value}
      </span>
      {note && <span className="block text-[10px] opacity-70 mt-0.5">{note}</span>}
    </Tag>
  );
}

export function PrintButton({ onClick, label = "Print", disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 bg-[#2563EB] text-white text-xs font-bold rounded-md px-3 py-2 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-40"
    >
      <Printer size={13} /> {label}
    </button>
  );
}

export function Warn({ children, tone = "bad" }) {
  const cls = tone === "bad"
    ? "bg-[#FBEAE8] border-[#DC3B2E] text-[#DC3B2E]"
    : "bg-[#FEF6E7] border-[#E0A400] text-[#8A6400]";
  return (
    <div className={`border rounded-md p-3 mb-4 text-xs flex items-start gap-2 ${cls}`}>
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Good({ children }) {
  return (
    <div className="bg-[#E7F5EF] border border-[#15926A] text-[#0F6E50] rounded-md p-2.5 mb-3 text-xs flex items-start gap-2">
      <Check size={14} className="mt-0.5 shrink-0" /> <div>{children}</div>
    </div>
  );
}

export function SaveButton({ onClick, busy, children }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full bg-[#2563EB] text-white font-bold uppercase tracking-wide rounded-md py-2.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {children}
    </button>
  );
}

/* Paid out of / into. The three pots, and nothing else — `toPot` in lib/finance.js
   only knows these three, so an "Other" button here would silently land in Cash. */
export function MethodPicker({ value, onChange, allowNone = false, noneLabel = "Own pocket" }) {
  const options = allowNone ? ["Cash", "M-PESA", "Bank", ""] : ["Cash", "M-PESA", "Bank"];
  return (
    <div className="flex gap-2">
      {options.map((m) => (
        <button
          key={m || "none"}
          onClick={() => onChange(m)}
          className={`flex-1 rounded-md py-2.5 font-semibold text-xs border ${
            value === m
              ? "bg-[#2563EB18] border-[#2563EB] text-[#2563EB]"
              : "border-[#DEE3E9] text-[#5A6472]"
          }`}
        >
          {m || noneLabel}
        </button>
      ))}
    </div>
  );
}

/* Void, never delete — the tables have no delete policy at all. The reason stays
   optional on purpose: the owner asked for undo without an interrogation, and a
   required box only teaches people to type "x". */
export function VoidButton({ onClick, title = "Void this entry" }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded bg-[#EEF2F6] text-[#5A6472] hover:text-[#DC3B2E]"
      title={title}
    >
      <Trash2 size={13} />
    </button>
  );
}

/* A row on any of the list screens. Voided rows stay, greyed and struck through,
   because a month's figures changing with nothing to explain why is worse than an
   untidy list. */
export function ListRow({ title, subtitle, meta, amount, voided, voidNote, right, children }) {
  return (
    <div className={`bg-[#FFFFFF] border rounded-md p-3 ${voided ? "border-[#EEF2F6] opacity-60" : "border-[#DEE3E9]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={`font-semibold text-[#1B2430] ${voided ? "line-through" : ""}`}>{title}</span>
          {subtitle && <span className="text-[#5A6472] text-sm"> — {subtitle}</span>}
          {meta && <div className="text-[11px] text-[#5A6472] mt-0.5">{meta}</div>}
          {voided && (
            <div className="text-[11px] text-[#DC3B2E] mt-1 font-semibold">
              Voided{voidNote ? ` — ${voidNote}` : ""}. Not counted.
            </div>
          )}
          {children}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {amount !== undefined && <Money value={amount} bold className={voided ? "line-through" : ""} />}
          {right}
        </div>
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="text-[#5A6472] text-sm py-8 text-center">{children}</p>;
}

/* ---------------- printing ----------------
   Every report builder in lib/ledgerPrint.js takes the same `doc`: who the shop
   is, what colour it wears, who pressed the button and when. Built here so a new
   report cannot print without a letterhead. */
export function printDoc(user) {
  return {
    shop: SHOP_INFO.branch,
    office: SHOP_INFO.main,
    footer: SHOP_INFO.footer,
    accent: shopAccent(),
    preparedBy: user || "",
    printedAt: new Date().toLocaleString("en-KE", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    }),
  };
}

export function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print."); return false; }
  w.document.write(html);
  w.document.close();
  return true;
}

/* ---------------- small date helpers ---------------- */
/* "2026-08-01" -> "2026-07-31". Used so a month's cash book opens with what the
   months before it actually left behind, rather than day-one money. */
export function prevDayOf(dayString) {
  if (!dayString) return undefined;
  const [y, m, d] = dayString.split("-").map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export function monthName(key) {
  const [y, m] = String(key).split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}

/* A date-only string printed the way a person reads it, without handing it to
   `new Date()` — "2026-08-01" parsed as a date is midnight UTC, which prints as
   31 July anywhere west of Greenwich. Same reasoning as dateOnly in
   lib/ledgerPrint.js; the two must agree or a screen and its printout will differ. */
export function dayText(v) {
  const s = String(v || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
