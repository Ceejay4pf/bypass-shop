/* ---------------------------------------------------------
   BYPASS SHOP — feature screens
--------------------------------------------------------- */
import React, { useMemo, useState, useEffect } from "react";
import * as api from "./lib/api.js";
import {
  Search, Plus, PackagePlus, ShoppingCart, Bell, Boxes, X, Check,
  AlertTriangle, TrendingUp, DollarSign, Package, Layers, ImagePlus,
  Trash2, Download, Upload, Settings as SettingsIcon, MapPin, Phone, FileText,
  ChevronRight, ArrowLeft, AlertCircle, MessageCircle, CheckSquare, Square, Fingerprint,
  UserCheck, UserX, Clock, ShieldCheck, Lock, Send, LogOut, Pencil, Printer, Receipt,
  Wallet, CreditCard, ArrowRightLeft, Building2, User, RotateCcw, Loader2,
  Wand2, Sun, Moon, Smartphone, CheckCircle2, Mail, ChevronDown,
} from "lucide-react";
import { THEME_CHOICES, useTheme, useThemeMode, readableOnDark } from "./lib/theme.js";
import { parsePartsList, rowToNewItem, sideMissing, planRows } from "./lib/parseParts.js";
/* readInstruction reads a question first and an order second — see the note over
   CommandBox for why that order is a safety rule rather than a preference. */
import { readInstruction, ASK_EXAMPLES } from "./lib/ask.js";
import { loadChat, saveChat, clearChat, groupByDay, daySummary, newId } from "./lib/chatLog.js";
import {
  quoteToDraft, salesToDraft, groupSalesForReceipt, receiptedSaleIds,
  autoFillBatch, sortBatchesForPicker, priceGaps, suggestPrice, findQuotes, receiptsByQuote,
} from "./lib/receiptDraft.js";
import * as rpt from "./lib/reports.js";
import { estimatedProfit, PROFIT_VAT_MULTIPLE } from "./lib/finance.js";
import { CAPABILITIES } from "./lib/roles.js";
import { ROLE_ACCOUNTS, defaultRolePassword } from "./lib/roleAccounts.js";
import {
  changeRolePassword, deviceOtpStatus, setDeviceOtp, myDevices, forgetDevice,
  sendLoginCode, verifyLoginCode,
  otpLoginAvailable, startOtpLogin, setOtpLogin, checkEmailCode,
} from "./lib/auth.js";
import { getDeviceId, thisDeviceLabel, agoText } from "./lib/device.js";
import { SHOP_INFO } from "./lib/shopInfo.js";
import {
  isBiometricSupported, isLockEnabled, enableLock, disableLock,
} from "./lib/appLock.js";
import {
  CONDITIONS, SIDES, sidesFor, splitSide, POSITIONED_CATS, POSITION_ORDER,
  BRANDS, PAYMENT, generateCode, formatLocation,
  LOW_STOCK_THRESHOLD, isLowStock, isOutOfStock, reorderLevel,
  categoryGroups, CATEGORY_COLORS,
  suggestCategoryKey, suggestShelf,
} from "./data.js";
import {
  Field, inputCls, SectionTitle, ItemCard, StatCard, StockBadge,
  timeAgo, fmtDateTime, BarChart, TrendChart, DonutChart, Pills, SearchBox,
} from "./ui.jsx";

// Read an image File and return a compressed JPEG data URL. Phone photos are
// several MB; we downscale to <=1000px and re-encode so items stay light in
// the database and load fast on other devices. Falls back to the raw file if
// anything goes wrong.
function readImageCompressed(file, maxSide = 1000, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxSide || height > maxSide) {
            const scale = maxSide / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(reader.result); // fall back to original
        }
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Escape user text before dropping it into the generated PDF HTML.
const escapeHtml = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const matchesQuery = (i, cat, q) => {
  // Include buyers/suppliers pulled from the item's own movement ledger,
  // so "Auto Garage" or "Ex Japan" finds the part too.
  const ledgerText = (i.ledger || [])
    .map((m) => [m.buyer, m.supplier].filter(Boolean).join(" "))
    .join(" ");
  // The year, and - for parts that have none - the words to search for them
  // by, so the ones still needing a year can be found and filled in later.
  const yearText = i.yearFrom
    ? [i.yearFrom, i.yearTo].filter(Boolean).join(" ")
    : "no year unknown year";
  const haystack = [
    i.code, i.name, i.brand, i.model, i.series, i.condition, i.color,
    i.side, i.variant, i.supplier, i.location, cat?.label, ledgerText, yearText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  /* Every word has to appear, but they don't have to appear together. The whole
     query used to be matched as one run of characters, so "front door" found
     nothing: the section is called Doors and the side is Front Left, and those
     two facts live in different fields. Same for "honda door" and "toyota
     silver". Words are what people type; a phrase spanning two fields is not
     something they can be expected to know not to type. */
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

/* ======================= DASHBOARD ======================= */
export function DashboardTab({ items, notifications, categories, user, onNav, onOpenLedger, admin = false }) {
  const totalItems = items.length;
  const totalQty = items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const lowStock = items.filter(isLowStock);
  const outOfStock = items.filter(isOutOfStock).length;

  // Live list of shop staff (names) for the team panel. Admin-only, so we
  // don't even fetch it for regular staff.
  const [staff, setStaff] = useState([]);
  const [teamOpen, setTeamOpen] = useState(false);
  useEffect(() => {
    if (!admin) { setStaff([]); return; }
    let alive = true;
    api.fetchProfiles().then((p) => { if (alive) setStaff(p); }).catch(() => {});
    const unsub = api.subscribeProfiles
      ? api.subscribeProfiles(() => api.fetchProfiles().then((p) => alive && setStaff(p)).catch(() => {}))
      : null;
    return () => { alive = false; if (unsub) unsub(); };
  }, [admin]);

  // Live directory contacts (admin-typed names + phone numbers). Admin-only.
  const [contacts, setContacts] = useState([]);
  useEffect(() => {
    if (!admin) { setContacts([]); return; }
    let alive = true;
    if (!api.fetchStaffContacts) return;
    api.fetchStaffContacts().then((c) => { if (alive) setContacts(c); }).catch(() => {});
    const unsub = api.subscribeStaffContacts
      ? api.subscribeStaffContacts(() => api.fetchStaffContacts().then((c) => alive && setContacts(c)).catch(() => {}))
      : null;
    return () => { alive = false; if (unsub) unsub(); };
  }, [admin]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaySales = notifications.filter((n) => n.type === "sale" && n.ts >= startOfToday.getTime());
  const soldToday = todaySales.reduce((s, n) => s + Number(n.qty || 0), 0);
  const revenueToday = todaySales.reduce((s, n) => s + Number(n.total || 0), 0);

  const byCategory = categories
    .map((c) => ({
      label: c.label,
      color: c.color,
      value: items.filter((i) => i.cat === c.key).reduce((s, i) => s + Number(i.qty || 0), 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Stock share of the top categories for the donut (rest folded into "Other").
  const donut = useMemo(() => {
    const all = categories
      .map((c) => ({
        label: c.label,
        color: c.color,
        value: items.filter((i) => i.cat === c.key).reduce((s, i) => s + Number(i.qty || 0), 0),
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    if (all.length <= 6) return all;
    const top = all.slice(0, 5);
    const rest = all.slice(5).reduce((s, d) => s + d.value, 0);
    return [...top, { label: "Other", color: "#9BB7F0", value: rest }];
  }, [items, categories]);

  // Sales trend for last 7 days.
  const trend = useMemo(() => {
    const days = [];
    for (let d = 6; d >= 0; d--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - d);
      const start = day.getTime();
      const end = start + 86400000;
      const value = notifications
        .filter((n) => n.type === "sale" && n.ts >= start && n.ts < end)
        .reduce((s, n) => s + Number(n.qty || 0), 0);
      days.push({ label: day.toLocaleDateString("en-KE", { weekday: "short" }), value });
    }
    return days;
  }, [notifications]);

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow={`Welcome, ${user}`} title="Dashboard" />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {/* These two count different things and used to be labelled as though
            they counted the same one — "Inventory Items" against "Total Stock
            Qty" — so the two figures never matching read as a bug in the
            system. They are one row per part against every piece on the shelf:
            eight headlights are one part and eight pieces. Each card now says
            which it is, and the second says how the first turns into it. */}
        <StatCard
          icon={Boxes}
          label="Different Parts"
          value={totalItems}
          sub="rows in the stock list"
          tone="purple"
          onClick={() => onNav("inventory")}
        />
        {/* An average was the wrong thing to print here. "0.7 pieces each" is
            not a thing that exists — no part holds seven tenths of a bumper —
            and it hid the fact it was actually reporting: an average below 1
            can only mean parts are sitting at zero, because nothing keyed in
            goes below one piece unless it was sold or deducted. So say that
            instead. The gap between the two cards is exactly the finished
            parts plus the pieces stacked on the parts that have several. */}
        <StatCard
          icon={Layers}
          label="Pieces On The Shelf"
          value={totalQty}
          sub={
            !totalItems
              ? "nothing in stock yet"
              : outOfStock
              ? `across ${totalItems} part${totalItems === 1 ? "" : "s"} — ${outOfStock} finished, holding no pieces`
              : totalQty === totalItems
              ? `${totalItems} part${totalItems === 1 ? "" : "s"}, one piece each`
              : `across ${totalItems} part${totalItems === 1 ? "" : "s"} — ${totalQty - totalItems} spare${totalQty - totalItems === 1 ? "" : "s"} beyond one each`
          }
          tone="blue"
          onClick={() => onNav("inventory")}
        />
        <StatCard icon={ShoppingCart} label="Items Sold Today" value={soldToday} tone="green" onClick={() => onNav("sell")} />
        <StatCard icon={DollarSign} label="Today's Sales" value={`KES ${revenueToday.toLocaleString()}`} tone="yellow" onClick={() => onNav("reports")} />
        {/* Straight to Low Stock. It used to open Reports, which meant hunting
            for the panel that this number came from. */}
        <StatCard
          icon={AlertTriangle}
          label={outOfStock ? "Finished / Running Low" : "Running Low"}
          value={lowStock.length}
          sub={
            lowStock.length === 0
              ? "everything in stock"
              : outOfStock
              ? `${outOfStock} finished${lowStock.length > outOfStock ? `, ${lowStock.length - outOfStock} near its level` : ""}`
              : "at their own reorder level"
          }
          tone="red"
          onClick={() => onNav("lowstock")}
        />
        {/* Counts parts, not feed entries - a bulk summary stands for many. */}
        {admin && (
          <StatCard
            icon={Bell}
            label="Total Activity"
            value={notifications.reduce((s, n) => s + api.notifWeight(n), 0)}
            tone="purple"
            onClick={() => onNav("notify")}
          />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
            <Package size={15} className="text-[#7C5CD6]" /> Stock Share
          </div>
          <DonutChart data={donut} />
        </div>
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
            <Layers size={15} className="text-[#2563EB]" /> Stock by Category
          </div>
          <BarChart data={byCategory} />
        </div>
      </div>

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
          <TrendingUp size={15} className="text-[#15926A]" /> Sales Trend (7 days)
        </div>
        <TrendChart points={trend} />
      </div>

      {/* Team + shops. The team list is admin-only; shop contacts are for everyone. */}
      <div className={`grid gap-4 mb-4 ${admin ? "lg:grid-cols-2" : ""}`}>
        {admin && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          {/* Collapsed by default — the list can get long, and it's rarely
              what an admin opened the dashboard to see. */}
          <button
            onClick={() => setTeamOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <UserCheck size={15} className="text-[#2563EB]" /> Shop Team ({staff.length})
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#7C5CD6] bg-[#7C5CD622] rounded px-1.5 py-0.5">
                Admin only
              </span>
              <ChevronRight
                size={16}
                className={`text-[#5A6472] transition-transform ${teamOpen ? "rotate-90" : ""}`}
              />
            </div>
          </button>

          {!teamOpen && (
            <div className="text-[11px] text-[#5A6472] mt-2">
              Tap to see the {staff.length === 1 ? "person" : `${staff.length} people`} on the team.
            </div>
          )}

          {teamOpen && (
            staff.length === 0 ? (
              <div className="text-[#5A6472] text-sm italic mt-3">No staff loaded yet.</div>
            ) : (
              <div className="space-y-2 mt-3">
                {staff.map((s) => {
                  let hue = 0;
                  for (const ch of s.name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
                  return (
                    <div key={s.id} className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}>
                        {(s.name || "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-[#1B2430] truncate">{s.name}</span>
                      {!s.approved && (
                        <span className="text-[10px] font-bold uppercase text-[#DC3B2E] bg-[#DC3B2E22] rounded px-1.5 py-0.5">Pending</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
        )}

        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
            <MapPin size={15} className="text-[#DC3B2E]" /> Shops &amp; Contacts
          </div>
          <div className="space-y-2">
            {SHOPS.map((s) => (
              <div key={s.name} className="flex items-center gap-2 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{s.name}</div>
                  <div className="text-[11px] text-[#5A6472] font-mono truncate">{s.display}</div>
                </div>
                <a href={`tel:+${s.wa}`} className="p-1.5 rounded-md bg-[#2563EB22] text-[#2563EB] hover:bg-[#2563EB] hover:text-white transition-colors shrink-0" title={`Call ${s.name}`}>
                  <Phone size={14} />
                </a>
                <a href={`https://wa.me/${s.wa}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md bg-[#15926A22] text-[#15926A] hover:bg-[#15926A] hover:text-white transition-colors shrink-0" title={`WhatsApp ${s.name}`}>
                  <MessageCircle size={14} />
                </a>
              </div>
            ))}
          </div>
          {admin && (
            <button onClick={() => onNav("settings")} className="text-xs text-[#2563EB] font-semibold mt-3">
              Full staff directory →
            </button>
          )}
        </div>
      </div>

      {/* Team directory — the contacts an admin typed in. Admin-only. */}
      {admin && (
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Phone size={15} className="text-[#15926A]" /> Team Directory ({contacts.length})
          </div>
          <button onClick={() => onNav("settings")} className="text-xs text-[#2563EB] font-semibold">
            Manage →
          </button>
        </div>
        {contacts.length === 0 ? (
          <div className="text-[#5A6472] text-sm italic">
            No contacts yet — add staff numbers in Settings → Staff Directory.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {contacts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-[11px] text-[#5A6472] truncate">
                    {p.role ? `${p.role} · ` : ""}<span className="font-mono text-[#1B2430]">{p.phone}</span>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#2563EB]">{p.dept}</div>
                </div>
                <a href={`tel:+${p.wa}`} className="p-1.5 rounded-md bg-[#2563EB22] text-[#2563EB] hover:bg-[#2563EB] hover:text-white transition-colors shrink-0" title={`Call ${p.name}`}>
                  <Phone size={14} />
                </a>
                <a href={`https://wa.me/${p.wa}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md bg-[#15926A22] text-[#15926A] hover:bg-[#15926A] hover:text-white transition-colors shrink-0" title={`WhatsApp ${p.name}`}>
                  <MessageCircle size={14} />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Recent activity — who sold, added or adjusted what. Admin-only. */}
      {admin && (
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Bell size={15} className="text-[#2563EB]" /> Recent Activity
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#7C5CD6] bg-[#7C5CD622] rounded px-1.5 py-0.5">
              Admin only
            </span>
            <button onClick={() => onNav("notify")} className="text-xs text-[#2563EB] font-semibold">
              View all
            </button>
          </div>
        </div>
        {notifications.length === 0 && <div className="text-[#5A6472] text-sm italic">No activity yet.</div>}
        <div className="space-y-2">
          {notifications.slice(0, 5).map((n) => (
            <NotifRow key={n.id} n={n} compact />
          ))}
        </div>
      </div>
      )}

      {/* The instruction box used to sit here. It lives in Staff Feed now, next
          to the team's own chat, because that is where somebody goes to ask
          something — the home screen is for reading figures, not typing. */}
    </div>
  );
}

/* ======================= SEARCH ======================= */

/* Long-press (press-and-hold) detection that works on phone and desktop.
   Returns props to spread on an element; after ~500ms of holding it fires
   onLongPress and suppresses the click that would otherwise follow. */
function useLongPress(onLongPress, ms = 500) {
  const timer = React.useRef(null);
  const fired = React.useRef(false);

  const start = () => {
    fired.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { fired.current = true; onLongPress(); }, ms);
  };
  const cancel = () => clearTimeout(timer.current);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onMouseDown: (e) => { if (e.button === 0) start(); },
    onMouseUp: cancel,
    onMouseLeave: cancel,
    // Stop the browser's own text-selection / context menu on a long hold.
    onContextMenu: (e) => { e.preventDefault(); if (!fired.current) { cancel(); fired.current = true; onLongPress(); } },
    onClickCapture: (e) => { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; } },
  };
}

/* ======================= WHERE DID IT GO? =======================
   Deleting a part used to ask "are you sure?" and record nothing but a
   name. The head office's real question is where the stock went, so this
   sheet asks it: sold, given to a credit customer, moved to another
   shop, damaged - and then who has it now and who carried it there.

   Nothing is deleted until Confirm is pressed. */
export function DeleteItemSheet({ item, onClose, onConfirm }) {
  const [disposal, setDisposal] = useState("");
  const [takenBy, setTakenBy] = useState("");
  const [logistics, setLogistics] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const chosen = api.DISPOSALS.find((d) => d.key === disposal);

  const go = async () => {
    if (!disposal) { setErr("Please say where the stock went."); return; }
    if (!takenBy.trim()) { setErr(chosen.asks); return; }
    setBusy(true);
    setErr("");
    try {
      await onConfirm({
        disposal,
        takenBy: takenBy.trim(),
        logistics: logistics.trim(),
        reason: reason.trim(),
      });
      onClose();
    } catch (e) {
      setErr(e.message || "Couldn't remove that part.");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl bp-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#DEE3E9]">
          <div className="text-[#DC3B2E] text-[11px] font-bold tracking-[0.2em] uppercase mb-1">
            Removing stock
          </div>
          <div className="font-bold text-[#1B2430] leading-snug">{item.name || item.code}</div>
          <div className="text-[11px] text-[#5A6472] font-mono mt-0.5">{item.code}</div>
          <div className="text-[11px] text-[#5A6472] mt-0.5">{item.qty} in stock right now</div>
        </div>

        <div className="p-4">
          <div className="text-xs text-[#5A6472] mb-3 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3">
            This takes the part off the shelf list for good. The record of where it went stays in the
            ledger forever — so please say where it actually went.
          </div>

          <Field label="Where did the stock go?">
            <div className="grid grid-cols-1 gap-1.5">
              {api.DISPOSALS.map((d) => {
                const on = disposal === d.key;
                return (
                  <button
                    key={d.key}
                    onClick={() => { setDisposal(d.key); setErr(""); }}
                    className={`text-left text-sm rounded-md border px-3 py-2.5 font-medium transition-colors ${
                      on
                        ? "border-[#2563EB] bg-[#2563EB0F] text-[#2563EB]"
                        : "border-[#DEE3E9] text-[#5A6472] hover:border-[#C2CAD3]"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {chosen && (
            <>
              <Field label={chosen.asks}>
                <input
                  autoFocus
                  value={takenBy}
                  onChange={(e) => setTakenBy(e.target.value)}
                  placeholder={
                    disposal === "branch"
                      ? "Jeyden Auto Spares"
                      : disposal === "credit"
                      ? "Mwangi Motors"
                      : "Name"
                  }
                  className={inputCls}
                  list={disposal === "branch" ? "shop-list" : undefined}
                />
                {disposal === "branch" && (
                  <datalist id="shop-list">
                    {SHOPS.map((s) => <option key={s.name} value={s.name} />)}
                  </datalist>
                )}
              </Field>

              <Field
                label="Who carried it? (logistics) — optional"
                hint="The rider, driver or courier — or leave blank if it was collected in person."
              >
                <input
                  value={logistics}
                  onChange={(e) => setLogistics(e.target.value)}
                  placeholder="e.g. Kevin (boda) · Wells Fargo · collected in person"
                  className={inputCls}
                />
              </Field>

              <Field label="Anything else worth recording? — optional">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Delivery note number, condition on leaving…"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {err && (
            <div className="text-[#DC3B2E] text-sm mb-3 flex items-center gap-1.5">
              <AlertTriangle size={14} /> {err}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="flex-1 border border-[#DEE3E9] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#5A6472] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={go}
              disabled={busy}
              className="flex-1 bg-[#DC3B2E] text-white font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {busy ? "Removing…" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* The action sheet shown after a long-press on a search result. */
function ItemActionSheet({ item, categories, onClose, actions }) {
  const cat = categories.find((c) => c.key === item.cat);
  // Each action keeps its own colour; on dark it is brightened just enough
  // for the icon to read against its tinted circle.
  const mode = useThemeMode();
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl bp-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#DEE3E9] flex items-start gap-3">
          <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: cat?.color || "#5A6472" }} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-[#1B2430] leading-snug">{item.name || item.code}</div>
            <div className="text-[11px] text-[#5A6472] font-mono mt-0.5">{item.code}</div>
            <div className="text-[11px] text-[#5A6472] mt-0.5">
              KSh {Number(item.price).toLocaleString()} · {item.qty} in stock
            </div>
          </div>
          <button onClick={onClose} className="text-[#5A6472] p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-2">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => { onClose(); a.run(); }}
              disabled={a.disabled}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-left hover:bg-[#EEF2F6] transition-colors disabled:opacity-40"
            >
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: readableOnDark(a.color, mode) + "22", color: readableOnDark(a.color, mode) }}>
                <a.icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#1B2430]">{a.label}</span>
                <span className="block text-[11px] text-[#5A6472] leading-tight">
                  {a.disabled ? a.disabledNote || "Not available" : a.desc}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button onClick={onClose} className="w-full py-3 text-sm font-semibold text-[#5A6472] border-t border-[#DEE3E9] hover:bg-[#EEF2F6]">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SearchTab({ items, categories, onDelete, onPick, canEdit = false, initialQuery = "" }) {
  // Step 1: pick a category (or "All"). Step 2: search within it.
  // null = nothing chosen yet (show the category picker first).
  /* Arriving with words already typed — the assistant sending somebody here
     because it wasn't sure what they meant — skips step one and searches
     everything. Making them choose a category first would be asking them to
     narrow a search they haven't seen the results of yet. */
  const [cat, setCat] = useState(initialQuery ? "__all__" : null); // "__all__" | category key | null
  const [query, setQuery] = useState(initialQuery);
  // The result being long-pressed, if any — drives the action sheet.
  const [held, setHeld] = useState(null);
  // The part being removed — the sheet asks where the stock went first.
  const [removing, setRemoving] = useState(null);

  // How many items sit in each category, for the picker counts.
  const counts = useMemo(() => {
    const m = {};
    for (const it of items) m[it.cat] = (m[it.cat] || 0) + 1;
    return m;
  }, [items]);

  const results = useMemo(() => {
    let base = items;
    if (cat && cat !== "__all__") base = items.filter((i) => i.cat === cat);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => matchesQuery(i, categories.find((c) => c.key === i.cat), q));
  }, [items, categories, cat, query]);

  /* ---------- Step 1: choose a category ---------- */
  if (cat === null) {
    return (
      <div className="bp-fade-up">
        <SectionTitle eyebrow="Find a part" title="Search Inventory" />
        <div className="text-[#5A6472] text-sm mb-4">
          Choose a category to search in — or search across everything.
        </div>

        <button
          onClick={() => { setCat("__all__"); setQuery(""); }}
          className="w-full flex items-center gap-3 bg-[#2563EB] text-white rounded-lg p-4 mb-3 font-semibold hover:brightness-110 transition"
        >
          <Search size={18} />
          <span className="flex-1 text-left">Search all categories</span>
          <span className="text-xs opacity-80">{items.length} item(s)</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => { setCat(c.key); setQuery(""); }}
              className="flex items-center gap-2 bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 text-left hover:border-[#2563EB] transition"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[#1B2430] truncate">{c.label}</span>
                <span className="block text-[11px] text-[#5A6472]">{counts[c.key] || 0} item(s)</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- Step 2: search within the chosen category ---------- */
  const chosen = cat === "__all__" ? null : categories.find((c) => c.key === cat);
  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Find a part" title={chosen ? chosen.label : "Search — all categories"} />

      <button
        onClick={() => { setCat(null); setQuery(""); }}
        className="flex items-center gap-1 text-[#2563EB] font-semibold text-sm hover:underline mb-4"
      >
        <ArrowLeft size={16} /> Change category
      </button>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={chosen ? `Search ${chosen.label}…` : "e.g. Toyota Axela 2018 Front Bumper, or FBM-MZD..."}
          className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-md pl-10 pr-9 py-3 text-[#1B2430] placeholder-[#5A6472] outline-none focus:border-[#2563EB]"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6472]">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[#5A6472] text-xs">
          {results.length} result{results.length !== 1 ? "s" : ""}
        </div>
        {results.length > 0 && (
          <div className="text-[#5A6472] text-[11px] italic">Press and hold a part for options</div>
        )}
      </div>
      <div className="space-y-2">
        {results.map((it) => (
          <SearchResultRow
            key={it.code}
            item={it}
            categories={categories}
            onDelete={onDelete ? setRemoving : undefined}
            onHold={() => setHeld(it)}
          />
        ))}
        {results.length === 0 && (
          <div className="text-[#5A6472] text-sm py-8 text-center">No part matches that search.</div>
        )}
      </div>

      {held && (
        <ItemActionSheet
          item={held}
          categories={categories}
          onClose={() => setHeld(null)}
          actions={[
            {
              label: "Sell this part",
              desc: "Record a sale — opens Sell Item with this part ready.",
              icon: ShoppingCart,
              color: "#15926A",
              disabled: held.qty === 0,
              disabledNote: "Out of stock — add stock first.",
              run: () => onPick?.("sell", held),
            },
            {
              label: "Add to a quotation",
              desc: "Open Quotation with this part as the first line.",
              icon: FileText,
              color: "#2563EB",
              run: () => onPick?.("quote", held),
            },
            {
              label: "Edit this part",
              desc: "Change the name, price, vehicle and other details.",
              icon: Pencil,
              color: "#7C5CD6",
              disabled: !canEdit,
              disabledNote: "Admin only — ask the admin to grant Edit parts.",
              run: () => onPick?.("edit", held),
            },
            {
              label: "Add information",
              desc: "Add notes, photos, location or supplier to this part.",
              icon: ImagePlus,
              color: "#B45309",
              disabled: !canEdit,
              disabledNote: "Admin only — ask the admin to grant Edit parts.",
              run: () => onPick?.("info", held),
            },
            {
              label: "Add new stock",
              desc: "Increase the quantity held for this part.",
              icon: PackagePlus,
              color: "#0E7490",
              run: () => onPick?.("stock", held),
            },
            {
              label: "View its history",
              desc: "Every add, sale and adjustment for this part.",
              icon: Layers,
              color: "#5A6472",
              run: () => onPick?.("ledger", held),
            },
          ]}
        />
      )}

      {removing && (
        <DeleteItemSheet
          item={removing}
          onClose={() => setRemoving(null)}
          onConfirm={(info) => onDelete(removing.code, info)}
        />
      )}
    </div>
  );
}

/* One search result — a normal card that opens the action sheet when held. */
function SearchResultRow({ item, categories, onDelete, onHold }) {
  const press = useLongPress(onHold);
  return (
    <div {...press} className="select-none" style={{ WebkitTouchCallout: "none" }}>
      <ItemCard item={item} categories={categories} onDelete={onDelete} />
    </div>
  );
}

/* ======================= INVENTORY ======================= */
export function InventoryTab({ items, categories, onDelete, onOpenLedger, canEdit = false, onBulkDelete, onBulkAddStock }) {
  // Two-level view: pick a category first, then see that section's list.
  const [openCat, setOpenCat] = useState(null);
  // Multi-select mode: a Set of selected item codes within the open section.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  // The part being removed, or a list of them — the sheet asks where the
  // stock went before anything is deleted.
  const [removing, setRemoving] = useState(null);

  const grouped = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.key] = [];
    for (const it of items) (map[it.cat] = map[it.cat] || []).push(it);
    return map;
  }, [items, categories]);

  /* Sections the app can't name, but which hold parts anyway.

     This screen only ever drew a tile per known category, so a part filed under
     anything else was invisible here while the dashboard still counted it — which
     is exactly how the parts total stopped matching what Inventory showed, and
     there was nothing on screen to explain the gap. It happens whenever a custom
     section was added in Settings but supabase/part_categories.sql hasn't been
     run on this database, so the section list comes back without it.

     The parts are real and on a shelf, so they get a tile. The three-letter code
     prefix is the only name available, and it beats hiding them. */
  const unnamed = useMemo(() => {
    const known = new Set(categories.map((c) => c.key));
    return Object.keys(grouped)
      .filter((k) => !known.has(k) && (grouped[k] || []).length > 0)
      .sort()
      .map((k) => ({
        key: k,
        label: k ? `Section ${k}` : "No section",
        shelf: "—",
        color: "#6B7480",
        unnamed: true,
      }));
  }, [grouped, categories]);

  // Every tile this screen can show, named or not. Used for the tiles, and for
  // resolving the open section's heading.
  const sections = useMemo(() => [...categories, ...unnamed], [categories, unnamed]);

  const lowCount = (list) =>
    list.filter(isLowStock).length;

  // Leaving a section (or toggling select off) always clears the selection.
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const openSection = (key) => { setOpenCat(key); exitSelect(); };
  const toggle = (code) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  /* ---------- Level 2: a single category's item list ---------- */
  if (openCat) {
    const cat = sections.find((c) => c.key === openCat) || {};
    const list = grouped[openCat] || [];
    const allSelected = list.length > 0 && list.every((it) => selected.has(it.code));
    const selCount = selected.size;
    const canBulk = onBulkDelete || onBulkAddStock;

    /* Several parts leaving together - a whole box to another shop, say.
       They share one answer, so ask once and apply it to all of them. */
    const bulkDelete = () => {
      const chosen = list.filter((it) => selected.has(it.code));
      if (!chosen.length) return;
      setRemoving({
        item: {
          code: `${chosen.length} parts`,
          name: `${chosen.length} selected part${chosen.length !== 1 ? "s" : ""}`,
          qty: chosen.reduce((s, it) => s + Number(it.qty || 0), 0),
        },
        codes: chosen.map((it) => it.code),
      });
    };
    const bulkAdd = () => {
      const codes = list.filter((it) => selected.has(it.code)).map((it) => it.code);
      if (!codes.length) return;
      const raw = prompt(`Add how many units to each of the ${codes.length} selected item(s)?`, "1");
      const amount = Number(raw);
      if (amount > 0) {
        onBulkAddStock?.(codes, amount);
        exitSelect();
      }
    };

    return (
      <div className="bp-fade-up">
        <SectionTitle eyebrow="Inventory · section" title={cat.label || "Section"} />
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <button
            onClick={() => openSection(null)}
            className="flex items-center gap-1 text-[#2563EB] font-semibold text-sm hover:underline"
          >
            <ArrowLeft size={16} /> All categories
          </button>
          {canBulk && list.length > 0 && (
            selectMode ? (
              <button onClick={exitSelect} className="text-[#5A6472] font-semibold text-sm hover:underline">
                Cancel
              </button>
            ) : (
              <button onClick={() => setSelectMode(true)} className="flex items-center gap-1 text-[#2563EB] font-semibold text-sm hover:underline">
                <CheckSquare size={15} /> Select
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2 mb-3 text-[#5A6472] text-xs">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
          <span>Shelf {cat.shelf}</span>
          <span>· {list.length} item(s)</span>
          {lowCount(list) > 0 && (
            <span className="text-[#DC3B2E] font-semibold">· {lowCount(list)} low</span>
          )}
        </div>

        {/* A section with no name behind it. The parts are fine — it's the
            section list that's missing an entry, and saying so beats leaving
            somebody to wonder what "Section BTL" is. */}
        {cat.unnamed && (
          <div className="mb-3 border border-[#E0A400] bg-[#E0A40012] rounded-md p-3 text-xs text-[#5A6472]">
            <span className="font-semibold text-[#1B2430]">This section has no name yet.</span>{" "}
            The parts below are counted in your totals, but the app doesn't know what
            <span className="font-mono"> {cat.key}</span> stands for. Add it under
            Settings → Categories to give it a name, a shelf and a colour.
          </div>
        )}

        {/* Select-all row while in multi-select mode */}
        {selectMode && list.length > 0 && (
          <button
            onClick={() => setSelected(allSelected ? new Set() : new Set(list.map((it) => it.code)))}
            className="flex items-center gap-2 text-sm font-semibold text-[#2563EB] mb-2"
          >
            {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            {allSelected ? "Unselect all" : "Select all"}
          </button>
        )}

        <div className={`space-y-2 ${selCount ? "pb-20" : ""}`}>
          {list.length === 0 && (
            <div className="text-[#5A6472] text-sm italic pl-1">No items yet in this section.</div>
          )}
          {list.map((it, idx) => {
            const on = selected.has(it.code);
            // 1…N counting number within this category, for stock-taking.
            const num = (
              <span className="w-7 shrink-0 text-center text-xs font-bold text-[#5A6472] tabular-nums pt-3">
                {idx + 1}
              </span>
            );
            if (selectMode) {
              return (
                <button
                  key={it.code}
                  onClick={() => toggle(it.code)}
                  className={`w-full text-left flex items-center gap-2 rounded-md transition-colors ${on ? "ring-2 ring-[#2563EB] bg-[#2563EB0A]" : ""}`}
                >
                  <span className="pl-1 text-[#2563EB] shrink-0">
                    {on ? <CheckSquare size={20} /> : <Square size={20} className="text-[#5A6472]" />}
                  </span>
                  <span className="flex-1 min-w-0 pointer-events-none">
                    <ItemCard item={it} categories={categories} />
                  </span>
                </button>
              );
            }
            return (
              <div key={it.code} className="relative group flex items-start gap-1">
                {num}
                <button onClick={() => onOpenLedger?.(it.code)} className="flex-1 min-w-0 text-left" title="View movement history">
                  <ItemCard item={it} categories={categories} />
                </button>
                {canEdit && onDelete && (
                  <button
                    onClick={() => setRemoving({ item: it, codes: [it.code] })}
                    className="absolute top-2 right-2 p-1.5 rounded bg-[#EEF2F6] text-[#5A6472] hover:text-[#DC3B2E] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove item — record where it went"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Floating bulk-action bar (appears when items are selected) */}
        {selectMode && selCount > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#FFFFFF] border border-[#DEE3E9] shadow-lg rounded-full pl-4 pr-2 py-2 bp-pop">
            <span className="text-sm font-semibold text-[#1B2430]">{selCount} selected</span>
            {onBulkAddStock && (
              <button onClick={bulkAdd} className="flex items-center gap-1.5 bg-[#15926A] text-white text-sm font-semibold rounded-full px-3 py-1.5">
                <PackagePlus size={15} /> Add stock
              </button>
            )}
            {onBulkDelete && (
              <button onClick={bulkDelete} className="flex items-center gap-1.5 bg-[#DC3B2E] text-white text-sm font-semibold rounded-full px-3 py-1.5">
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
        )}

        {removing && (
          <DeleteItemSheet
            item={removing.item}
            onClose={() => setRemoving(null)}
            onConfirm={async (info) => {
              if (removing.codes.length > 1) {
                await onBulkDelete?.(removing.codes, info);
                exitSelect();
              } else {
                await onDelete?.(removing.codes[0], info);
              }
            }}
          />
        )}
      </div>
    );
  }

  /* ---------- Level 1: the category tiles ---------- */
  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Tap a section to view its parts" title="Inventory" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sections.map((cat) => {
          const list = grouped[cat.key] || [];
          const low = lowCount(list);
          const pieces = list.reduce((s, i) => s + Number(i.qty || 0), 0);
          return (
            <button
              key={cat.key}
              onClick={() => openSection(cat.key)}
              className={`text-left bg-[#FFFFFF] border rounded-lg p-4 hover:border-[#2563EB] active:scale-[0.99] transition-all flex items-center gap-3 ${
                cat.unnamed ? "border-[#E0A400]" : "border-[#DEE3E9]"
              }`}
            >
              <span className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold uppercase tracking-wide text-sm truncate">{cat.label}</div>
                <div className="text-[#5A6472] text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>Shelf {cat.shelf}</span>
                  {/* Parts and pieces both, because the dashboard shows both and
                      one number here would look like it disagreed with one there. */}
                  <span>· {list.length} part(s)</span>
                  <span>· {pieces} piece(s)</span>
                  {cat.unnamed && <span className="text-[#E0A400] font-semibold">· unnamed section</span>}
                  {low > 0 && (
                    <span className="text-[#DC3B2E] font-semibold flex items-center gap-0.5">
                      <AlertCircle size={11} /> {low} low
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={18} className="text-[#5A6472] shrink-0" />
            </button>
          );
        })}
      </div>

      {/* The totals, spelled out. The dashboard shows two numbers that never
          match each other — parts against pieces — and with no statement of
          which is which that read as the system contradicting itself. Adding up
          the tiles here should give exactly these two figures; if it doesn't,
          something really is wrong and it's worth saying so. */}
      <div className="mt-4 text-xs text-[#5A6472] border-t border-[#DEE3E9] pt-3">
        <span className="font-semibold text-[#1B2430]">{items.length}</span> different part
        {items.length === 1 ? "" : "s"} across{" "}
        <span className="font-semibold text-[#1B2430]">
          {sections.filter((c) => (grouped[c.key] || []).length > 0).length}
        </span>{" "}
        section{sections.filter((c) => (grouped[c.key] || []).length > 0).length === 1 ? "" : "s"},{" "}
        <span className="font-semibold text-[#1B2430]">
          {items.reduce((s, i) => s + Number(i.qty || 0), 0)}
        </span>{" "}
        piece{items.reduce((s, i) => s + Number(i.qty || 0), 0) === 1 ? "" : "s"} on the shelves in
        total. One part can be several pieces — eight headlights of the same kind are one
        part and eight pieces — so these two figures are meant to differ.
      </div>
    </div>
  );
}

/* ======================= LOW STOCK (own module) ======================= */
// A dedicated screen for parts at or below their reorder level, moved off the
// dashboard so it reads like Inventory — its own module in the sidebar.
export function LowStockTab({ items, categories, onOpenLedger }) {
  const [query, setQuery] = useState("");
  /* Which sections to show, and how urgent. A reorder list of everything is a
     list nobody acts on: the person going to buy bumpers wants the bumpers, and
     the owner deciding what to pay for first wants the parts that are actually
     finished. Empty = everything, so the screen still opens on something. */
  const [pickedCats, setPickedCats] = useState([]);
  const [urgency, setUrgency] = useState("all");

  const catLabel = (key) => categories.find((c) => c.key === key)?.label || key;

  // Everything at or below its own reorder level, worst first.
  const allLow = useMemo(
    () =>
      items
        .filter(isLowStock)
        .sort((a, b) => Number(a.qty) - Number(b.qty)),
    [items]
  );

  const lowStock = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLow.filter((i) => {
      if (pickedCats.length && !pickedCats.includes(i.cat)) return false;
      if (urgency === "out" && Number(i.qty) !== 0) return false;
      if (urgency === "left" && Number(i.qty) === 0) return false;
      if (!q) return true;
      return matchesQuery(i, categories.find((c) => c.key === i.cat), q);
    });
  }, [allLow, categories, pickedCats, urgency, query]);

  // Only sections that actually have something low: pills for empty ones would
  // be a row of dead buttons hiding the two that matter.
  const catPills = useMemo(
    () =>
      categories
        .map((c) => ({ key: c.key, label: c.label, count: allLow.filter((i) => i.cat === c.key).length }))
        .filter((p) => p.count > 0),
    [categories, allLow]
  );
  const outCount = allLow.filter((i) => Number(i.qty) === 0).length;
  const filtering = Boolean(query.trim() || pickedCats.length || urgency !== "all");

  /* The reorder list on paper. This is the one report that leaves the building —
     it goes to the market with whoever is buying — so unlike the customer stock
     list it DOES print the quantity: the whole question being answered is how
     many are left and how many to bring back. */
  const printList = () => {
    const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
    const scope = pickedCats.length
      ? pickedCats.map(catLabel).join(" + ")
      : "All sections";
    const urgencyLabel =
      urgency === "out"
        ? "Finished only"
        : urgency === "left"
        ? "Running low (still some left)"
        : "Finished, or at a reorder level set on the part";
    const rows = lowStock
      .map(
        (i, idx) => `<tr>
          <td class="c">${idx + 1}</td>
          <td class="mono">${escapeHtml(i.code)}</td>
          <td>${escapeHtml(i.name || `${i.brand || ""} ${i.model || ""}`)}</td>
          <td>${escapeHtml(catLabel(i.cat))}</td>
          <td>${escapeHtml(i.location || "")}</td>
          <td class="c ${Number(i.qty) === 0 ? "out" : ""}">${Number(i.qty)}</td>
          <td class="c">${reorderLevel(i) || "finished"}</td>
          <td class="c"></td>
        </tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Reorder List</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#1B2430; margin:0; padding:28px; }
  .wrap { max-width: 900px; margin:0 auto; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #DC3B2E; padding-bottom:12px; margin-bottom:10px; }
  .brand { font-size:22px; font-weight:800; text-transform:uppercase; letter-spacing:1px; }
  .sub { color:#5A6472; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:700; }
  .doc { text-align:right; }
  .doc .t { font-size:16px; font-weight:800; color:#DC3B2E; text-transform:uppercase; letter-spacing:1px; }
  .doc .m { color:#5A6472; font-size:12px; margin-top:3px; }
  table { width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; }
  th { background:#EEF2F6; text-align:left; padding:7px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#5A6472; border-bottom:1px solid #DEE3E9; }
  td { padding:6px 8px; border-bottom:1px solid #EEF2F6; }
  th.c, td.c { text-align:center; }
  td.mono { font-family: ui-monospace, monospace; color:#2563EB; white-space:nowrap; }
  td.out { color:#DC3B2E; font-weight:800; }
  .empty { color:#5A6472; padding:40px; text-align:center; }
  .foot { margin-top:28px; color:#5A6472; font-size:11px; border-top:1px solid #DEE3E9; padding-top:10px; }
  tr { break-inside: avoid; }
  @media print { body { padding:0; } .wrap { max-width:none; } th { -webkit-print-color-adjust:exact; print-color-adjust:exact; } td.out { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div><div class="sub">Jaspare Auto · Main Shop</div><div class="brand">Bypass Shop</div></div>
    <div class="doc"><div class="t">Reorder List</div><div class="m">${today}</div><div class="m">${lowStock.length} part(s) to buy</div></div>
  </div>
  <div style="font-size:12px;color:#5A6472">${escapeHtml(scope)} · ${escapeHtml(urgencyLabel)}${query.trim() ? ` · matching “${escapeHtml(query.trim())}”` : ""}</div>
  ${lowStock.length
      ? `<table><thead><tr>
      <th class="c">#</th><th>Code</th><th>Item</th><th>Section</th><th>Location</th>
      <th class="c">Left</th><th class="c">Reorder at</th><th class="c">Bought</th>
    </tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">Nothing is finished, and nothing has reached a reorder level set on it.</div>`}
  <div class="foot">“Left” is what the system held on ${today} — check the shelf before buying. The last column is for writing in how many were actually brought back.</div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to open the printable list."); return; }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Parts to reorder"
        title="Low Stock"
        right={
          <button
            onClick={printList}
            disabled={lowStock.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#DC3B2E] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide disabled:opacity-50"
            title="Print this list to take to the market"
          >
            <Printer size={14} /> Print list
          </button>
        }
      />
      <div className="text-[#5A6472] text-xs mb-3">
        {filtering ? (
          <>
            <span className="font-semibold text-[#1B2430]">{lowStock.length}</span> of {allLow.length}{" "}
            item{allLow.length !== 1 ? "s" : ""} shown.
          </>
        ) : (
          <>
            <span className="text-[#DC3B2E] font-semibold">{outCount} finished</span>
            {allLow.length > outCount ? (
              <>
                , {allLow.length - outCount} at the reorder level set on{" "}
                {allLow.length - outCount === 1 ? "it" : "them"}
              </>
            ) : ""}
            .
          </>
        )}{" "}
        Tap any row to view its history.
      </div>

      {/* What this screen will and won't tell you. Worth stating: it used to
          list nearly every part in the shop, because each one carried a reorder
          level of 3 that nobody had chosen, and a list that long got ignored. */}
      <div className="text-[11px] text-[#5A6472] mb-3">
        A part appears here when it is <span className="font-semibold text-[#1B2430]">finished</span>,
        or when it reaches a <span className="font-semibold text-[#1B2430]">Low-stock at</span> number
        typed on the part itself. One piece on the shelf is full stock for a body part, so it is not
        listed — set that number on a fast mover if you want warning earlier.
      </div>

      {allLow.length > 0 && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 mb-4 space-y-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search code, part, vehicle or shelf…"
          />
          <Pills
            options={[
              { key: "all", label: "Everything", count: allLow.length },
              { key: "out", label: "Finished", count: outCount },
              { key: "left", label: "Running low", count: allLow.length - outCount },
            ]}
            value={urgency}
            onChange={setUrgency}
            size="xs"
          />
          {catPills.length > 1 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-1.5">
                Sections — tap as many as you like
              </div>
              <Pills options={catPills} value={pickedCats} onChange={setPickedCats} multi size="xs" />
            </div>
          )}
          {filtering && (
            <button
              onClick={() => { setQuery(""); setPickedCats([]); setUrgency("all"); }}
              className="text-[11px] font-semibold text-[#2563EB]"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {allLow.length > 0 && lowStock.length === 0 && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-6 text-center">
          <Search size={20} className="text-[#5A6472] mx-auto mb-2" />
          <div className="text-sm text-[#5A6472]">
            Nothing low matches that. {allLow.length} item{allLow.length !== 1 ? "s" : ""} are low in total.
          </div>
        </div>
      )}

      {allLow.length === 0 ? (
        <div className="bg-[#E6F6EF] border border-[#15926A55] rounded-lg p-6 text-center">
          <Check size={22} className="text-[#15926A] mx-auto mb-2" />
          <div className="text-sm font-semibold text-[#15926A]">All good</div>
          <div className="text-xs text-[#5A6472] mt-1">
            Nothing is finished, and nothing has reached a reorder level you set.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {lowStock.map((i) => (
            <button
              key={i.code}
              onClick={() => onOpenLedger?.(i.code)}
              className="w-full flex items-center gap-3 text-left bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 hover:border-[#DC3B2E] transition-colors"
              title="View this item's history"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: categories.find((c) => c.key === i.cat)?.color || "#DC3B2E" }} />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-[#2563EB]">{i.code}</div>
                <div className="text-sm text-[#1B2430] truncate">{i.name}</div>
                <div className="text-[10px] text-[#5A6472] uppercase tracking-wide">{catLabel(i.cat)}</div>
              </div>
              <StockBadge item={i} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ======================= PRINT STOCK (PDF by category) ======================= */
// Pick a category (Wings, Side Mirrors, Bumpers…) and print/save a PDF listing
// of every existing item in it. Uses the browser's built-in "Save as PDF".
export function PrintStockTab({ items, categories }) {
  /* Which categories to print, as a set of category keys. A set rather than a
     single choice because the usual ask is a combination - "bumpers and side
     mirrors" - and picking one at a time meant printing twice and stapling.

     Empty set = the whole shop, so the screen opens on something useful
     instead of an empty list and a disabled button. */
  const [picked, setPicked] = useState(() => new Set());
  const groups = useMemo(() => categoryGroups(categories), [categories]);

  const everything = picked.size === 0;
  // The categories to print, always in the shop's own category order so the
  // pages come out the same way however they were tapped.
  const chosenCats = useMemo(
    () => (everything ? categories : categories.filter((c) => picked.has(c.key))),
    [categories, picked, everything]
  );
  const chosenKeys = useMemo(() => chosenCats.map((c) => c.key), [chosenCats]);

  const toggleCat = (key) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  /* A family button adds every kind at once. If the whole family is already on
     it takes them all off again, so the same button undoes what it did. */
  const familyOn = (g) => g.keys.every((k) => picked.has(k));
  const toggleFamily = (g) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const on = g.keys.every((k) => next.has(k));
      for (const k of g.keys) (on ? next.delete(k) : next.add(k));
      return next;
    });
  // Date filter on when the item was ADDED: all | today | week | month | day.
  const [dateMode, setDateMode] = useState("all");
  const [onDay, setOnDay] = useState(""); // yyyy-mm-dd for the "specific day" option

  // Start-of-window timestamp (ms) for the chosen date mode; null = no limit.
  const windowStart = () => {
    if (dateMode === "today") { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (dateMode === "week") return Date.now() - 7 * 86400000;
    if (dateMode === "month") return Date.now() - 30 * 86400000;
    return null;
  };

  // Does an item fall inside the current date filter (by created-at)?
  const inDate = (i) => {
    if (dateMode === "all") return true;
    const t = i.createdAt ? new Date(i.createdAt).getTime() : null;
    if (dateMode === "day") {
      if (!onDay || !t) return false;
      const start = new Date(onDay + "T00:00:00").getTime();
      return t >= start && t < start + 86400000;
    }
    const start = windowStart();
    return t !== null && start !== null && t >= start;
  };

  // Apply BOTH filters (category is handled where used).
  const filtered = useMemo(
    () => items.filter((i) => chosenKeys.includes(i.cat) && inDate(i)),
    [items, chosenKeys, dateMode, onDay]
  );
  const countFor = (key) => items.filter((i) => i.cat === key && inDate(i)).length;
  const countForKeys = (keys) => items.filter((i) => keys.includes(i.cat) && inDate(i)).length;

  /* What the printed list calls itself. With a few picked it names them, so the
     page in someone's hand says what it is. Past that, naming eight categories
     would be a paragraph rather than a heading, so it counts them instead.

     A whole family that is fully picked is named as the family - "Side Mirrors"
     reads better on a page than "Side Mirrors - With Indicator + Side Mirrors -
     Plain", and it is what was asked for. */
  const headline = () => {
    if (everything) return "Full Stock List";
    const covered = new Set();
    const parts = [];
    for (const g of groups) {
      if (g.keys.every((k) => picked.has(k))) {
        parts.push(g.label);
        g.keys.forEach((k) => covered.add(k));
      }
    }
    for (const c of chosenCats) if (!covered.has(c.key)) parts.push(c.label);
    if (parts.length === 0) return "Stock List";
    if (parts.length > 3) return `${parts.length} categories — Stock List`;
    return `${parts.join(" + ")} — Stock List`;
  };

  const dateLabel = () => {
    if (dateMode === "today") return "Added today";
    if (dateMode === "week") return "Added in last 7 days";
    if (dateMode === "month") return "Added in last 30 days";
    if (dateMode === "day") return onDay ? `Added on ${onDay}` : "Added on (pick a day)";
    return "All dates";
  };

  const fmtAdded = (i) =>
    i.createdAt
      ? new Date(i.createdAt).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })
      : "—";

  const openPdf = () => {
    const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });

    /* Quantity and price are deliberately NOT printed. This is the list of what
       the shop has, and it gets handed to customers and taken to other branches
       - what each part sells for is the shop's business, and a quantity printed
       on paper is out of date the moment something sells. Both are still on
       screen, where they are live. */
    /* One table of rows, with the number restarting per block so a block torn
       off on its own still counts from 1. */
    const tableFor = (list, cat) =>
      `<table>
          <thead><tr>
            <th class="c">#</th><th>Code</th><th>Item</th><th>Side</th><th>Color</th>
            <th>Location</th><th>Date added</th>
          </tr></thead>
          <tbody>${list
            .map((i, idx) => {
              const { hand } = splitSide(cat, i.side);
              return `<tr>
              <td class="c">${idx + 1}</td>
              <td class="mono">${escapeHtml(i.code)}</td>
              <td>${escapeHtml(i.name || `${i.brand || ""} ${i.model || ""}`)}</td>
              <td>${escapeHtml(hand || i.side || "")}</td>
              <td>${escapeHtml(i.color || "")}</td>
              <td>${escapeHtml(i.location || "")}</td>
              <td>${escapeHtml(fmtAdded(i))}</td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>`;

    const sections = chosenCats
      .map((c) => {
        const list = filtered
          .filter((i) => i.cat === c.key)
          .sort((a, b) => String(a.code).localeCompare(String(b.code)));
        if (list.length === 0) return "";
        const shelf = `<span class="sechn">${list.length} item(s) · Shelf ${escapeHtml(c.shelf || "—")}</span>`;

        /* Doors get printed as two lists, not one. A car has four doors and the
           first thing anybody needs off the page is which end of the car —
           "Front" sitting inside a Side column, a hundred rows down, is not
           something a person finds while a customer waits. So the end of the car
           becomes the heading and the hand stays in the column: the page reads
           DOORS - FRONT, then Left, Left, Right. Which is the order the question
           is actually asked in.

           Anything with no end recorded gets its own block at the bottom, named
           for what it is rather than quietly filed under front. */
        if (POSITIONED_CATS.includes(c.key)) {
          const blocks = POSITION_ORDER.map((pos) => {
            const part = list.filter((i) => splitSide(c.key, i.side).position === pos);
            if (!part.length) return "";
            const head = pos ? `${c.label} — ${pos}` : `${c.label} — end of car not recorded`;
            return `<div class="sec">
                <div class="sech">${escapeHtml(head)} <span class="sechn">${part.length} item(s) · Shelf ${escapeHtml(c.shelf || "—")}</span></div>
                ${tableFor(part, c.key)}
              </div>`;
          }).join("");
          if (blocks) return blocks;
        }

        return `<div class="sec">
            <div class="sech">${escapeHtml(c.label)} ${shelf}</div>
            ${tableFor(list, c.key)}
          </div>`;
      })
      .join("");

    const totalItems = filtered.length;
    const title = dateMode === "all" ? headline() : `${headline()} · ${dateLabel()}`;

    const body = sections || `<div class="empty">No items match this category / date.</div>`;

    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#1B2430; margin:0; padding:28px; }
  .wrap { max-width: 900px; margin:0 auto; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #2563EB; padding-bottom:12px; margin-bottom:6px; }
  .brand { font-size:22px; font-weight:800; text-transform:uppercase; letter-spacing:1px; }
  .sub { color:#5A6472; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:700; }
  .doc { text-align:right; }
  .doc .t { font-size:16px; font-weight:800; color:#2563EB; text-transform:uppercase; letter-spacing:1px; }
  .doc .m { color:#5A6472; font-size:12px; margin-top:3px; }
  .sec { margin-top:18px; }
  .sech { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:1px; background:#2563EB; color:#fff; padding:7px 10px; border-radius:4px; }
  .sechn { font-weight:600; text-transform:none; letter-spacing:0; font-size:11px; opacity:.85; margin-left:8px; }
  table { width:100%; border-collapse:collapse; margin-top:6px; font-size:12px; }
  th { background:#EEF2F6; text-align:left; padding:7px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#5A6472; border-bottom:1px solid #DEE3E9; }
  td { padding:6px 8px; border-bottom:1px solid #EEF2F6; }
  th.c, td.c { text-align:center; } th.r, td.r { text-align:right; }
  td.mono { font-family: ui-monospace, monospace; color:#2563EB; white-space:nowrap; }
  .empty { color:#5A6472; padding:40px; text-align:center; }
  .foot { margin-top:28px; color:#5A6472; font-size:11px; border-top:1px solid #DEE3E9; padding-top:10px; }
  tr { break-inside: avoid; }
  @media print { body { padding:0; } .wrap { max-width:none; } .sech { -webkit-print-color-adjust:exact; print-color-adjust:exact; } th { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div><div class="sub">Jaspare Auto · Main Shop</div><div class="brand">Bypass Shop</div></div>
    <div class="doc"><div class="t">${escapeHtml(title)}</div><div class="m">${today}</div><div class="m">${totalItems} item(s)</div></div>
  </div>
  ${body}
  <div class="foot">Generated from Bypass Shop cloud inventory on ${today}. A list of parts held — ask the shop for prices and availability.</div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to open the PDF."); return; }
    w.document.write(html);
    w.document.close();
  };

  const dateTabs = [
    ["all", "All dates"],
    ["today", "Added today"],
    ["week", "Last 7 days"],
    ["month", "Last 30 days"],
    ["day", "Specific day"],
  ];

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Export a stock listing" title="Print Stock" />
      <div className="text-[#5A6472] text-xs mb-4">
        Print (or save as PDF) a list of the parts held. Tap as many as you want —
        <span className="font-semibold"> bumpers and side mirrors together</span>, a whole family at
        once, or the lot — and optionally only those{" "}
        <span className="font-semibold">added on a chosen date</span>.
      </div>

      <Field
        label="What to print — tap as many as you like"
        hint="A family button turns on every kind at once. Tap it again to turn them all off."
      >
        {/* Families first: it's the usual ask, and having to find the two kinds
            of mirror separately is what made people print twice. */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {groups.map((g) => {
              const on = familyOn(g);
              return (
                <button
                  key={g.key}
                  onClick={() => toggleFamily(g)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border flex items-center gap-1.5 ${
                    on
                      ? "bg-[#2563EB] text-[#F3F5F8] border-[#2563EB]"
                      : "border-[#DEE3E9] text-[#5A6472]"
                  }`}
                >
                  {on ? <CheckSquare size={13} /> : <Square size={13} />}
                  All {g.label.toLowerCase()} ({countForKeys(g.keys)})
                </button>
              );
            })}
          </div>
        )}

        <div className="border border-[#DEE3E9] rounded-md divide-y divide-[#EEF2F6] overflow-hidden">
          {categories.map((c) => {
            const on = picked.has(c.key);
            const n = countFor(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggleCat(c.key)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-sm transition-colors ${
                  on ? "bg-[#2563EB0A]" : "bg-[#FFFFFF]"
                }`}
              >
                <span className={on ? "text-[#2563EB]" : "text-[#5A6472]"}>
                  {on ? <CheckSquare size={17} /> : <Square size={17} />}
                </span>
                <span className="w-2 h-4 rounded-sm shrink-0" style={{ backgroundColor: c.color || "#6B7480" }} />
                <span className={`flex-1 min-w-0 truncate ${on ? "font-semibold text-[#1B2430]" : "text-[#5A6472]"}`}>
                  {c.label}
                </span>
                <span className="text-xs text-[#5A6472] tabular-nums shrink-0">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-[#5A6472]">
            {everything ? (
              <>Nothing ticked — the <span className="font-semibold">whole shop</span> will print.</>
            ) : (
              <>
                <span className="font-semibold text-[#1B2430]">{picked.size}</span> categor
                {picked.size === 1 ? "y" : "ies"} ticked
              </>
            )}
          </span>
          {!everything && (
            <button onClick={() => setPicked(new Set())} className="text-[#2563EB] font-semibold">
              Clear
            </button>
          )}
        </div>
      </Field>

      <Field label="Date added">
        <div className="flex flex-wrap gap-2">
          {dateTabs.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setDateMode(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                dateMode === k ? "bg-[#2563EB] text-[#F3F5F8] border-[#2563EB]" : "border-[#DEE3E9] text-[#5A6472]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      {dateMode === "day" && (
        <Field label="Pick the day">
          <input type="date" value={onDay} onChange={(e) => setOnDay(e.target.value)} className={inputCls} />
        </Field>
      )}

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[#5A6472] shrink-0">Printing</span>
          <span className="text-xs font-semibold text-[#1B2430] text-right">{headline()}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[#5A6472]">Items to be listed</span>
          <span className="font-bold text-[#2563EB]">{filtered.length}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[#5A6472]">Filter</span>
          <span className="text-xs font-semibold text-[#1B2430]">{dateLabel()}</span>
        </div>
        <p className="text-xs text-[#5A6472] mt-2 leading-relaxed">
          The PDF lists code, item, side, colour, location and date added —
          <span className="font-semibold"> no quantity and no price</span>, so it can be handed to a
          customer or sent to another branch as it is. On a phone the print dialog has a
          “Save as PDF” option you can then share on WhatsApp.
        </p>
      </div>

      {/* Nothing to print is a dead end, so say why rather than opening a blank
          page and leaving the reason to be guessed at. */}
      <button
        onClick={openPdf}
        disabled={filtered.length === 0}
        className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-50 disabled:active:scale-100"
      >
        <FileText size={18} />
        {filtered.length === 0 ? "Nothing to print" : "Generate PDF / Print"}
      </button>
      {filtered.length === 0 && (
        <p className="text-xs text-[#5A6472] mt-2 text-center">
          {everything
            ? "There is no stock in the shop yet."
            : "None of the ticked categories has anything matching this date filter."}
        </p>
      )}
    </div>
  );
}

/* ======================= STAFF APPROVALS (admin) ======================= */
// Admin approves / revokes staff accounts. New sign-ups are pending until
// approved here; they can't use the app in the meantime.
export function ApprovalsTab({ currentUserId }) {
  const [rows, setRows] = useState(null); // null = loading
  const [busy, setBusy] = useState("");   // id being changed
  const [err, setErr] = useState("");
  // Add-staff form.
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addContact, setAddContact] = useState("");
  const [addPass, setAddPass] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  const load = async () => {
    try {
      setErr("");
      setRows(await api.fetchProfiles());
    } catch (e) {
      setErr(e.message || "Couldn't load accounts. Did you run supabase/approvals.sql?");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
    // Refresh live when any profile changes (new sign-up, another admin acts).
    const ch = api.subscribeProfiles ? api.subscribeProfiles(load) : null;
    return () => { if (ch) ch(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optimistically patch one row in place after an action succeeds.
  const patch = (id, fn) => setRows((rs) => rs.map((r) => (r.id === id ? fn(r) : r)));

  const act = async (id, run, apply) => {
    setBusy(id); setErr("");
    try { await run(); if (apply) patch(id, apply); }
    catch (e) { setErr(e.message || "Action failed."); }
    finally { setBusy(""); }
  };

  const setApproved = (id, val) =>
    act(id, () => api.setUserApproved(id, val), (r) => ({ ...r, approved: val }));

  const grant = (id, perm) =>
    act(id, () => api.grantPermission(id, perm), (r) => ({
      ...r,
      permissions: [...new Set([...(r.permissions || []), perm])],
      pending: (r.pending || []).filter((p) => p !== perm),
    }));
  const revoke = (id, perm) =>
    act(id, () => api.revokePermission(id, perm), (r) => ({
      ...r,
      permissions: (r.permissions || []).filter((p) => p !== perm),
    }));
  const deny = (id, perm) =>
    act(id, () => api.denyPermissionRequest(id, perm), (r) => ({
      ...r,
      pending: (r.pending || []).filter((p) => p !== perm),
    }));
  const logout = (id, name) => {
    if (!confirm(`Log ${name} out now? They stay approved and can sign back in.`)) return;
    act(id, () => api.forceLogout(id));
  };
  const rename = (id, current) => {
    const next = prompt("New name for this account:", current);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === current) return;
    act(id, () => api.renameUser(id, name), (r) => ({ ...r, name }));
  };

  const addStaff = async () => {
    setAddMsg(""); setErr("");
    if (!addName.trim()) { setAddMsg("Enter the staff member's name."); return; }
    if (addPass.length < 6) { setAddMsg("Password must be at least 6 characters."); return; }
    setAdding(true);
    try {
      await api.adminCreateStaff({ name: addName.trim(), password: addPass, contact: addContact.trim() });
      setAddName(""); setAddContact(""); setAddPass(""); setShowAdd(false);
      await load();
    } catch (e) {
      const m = e.message || "Couldn't create the account.";
      setAddMsg(/already registered/i.test(m) ? "That name is already taken — add a phone to make it unique." : m);
    } finally {
      setAdding(false);
    }
  };

  const pending = (rows || []).filter((r) => !r.approved);
  const approved = (rows || []).filter((r) => r.approved);
  // Staff (non-self, approved) with outstanding permission requests.
  const requests = approved.filter((r) => r.id !== currentUserId && (r.pending || []).length > 0);
  const capLabel = (key) => CAPABILITIES.find((c) => c.key === key)?.label || key;

  const fmt = (t) =>
    t ? new Date(t).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }) : "";

  const Avatar = ({ name }) => (
    <div className="w-9 h-9 rounded-full bg-[#EEF2F6] flex items-center justify-center text-[#2563EB] font-bold shrink-0">
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Admin · access control" title="Staff Approvals" />
      <div className="text-[#5A6472] text-xs mb-4">
        New sign-ups stay locked until you approve them once — after that they log in
        freely, no repeat approval. You can also add staff yourself (auto-approved),
        rename any account, and grant delicate powers (delete, edit, add) per person.
      </div>

      {/* Add staff directly (auto-approved) */}
      {!showAdd ? (
        <button
          onClick={() => { setShowAdd(true); setAddMsg(""); }}
          className="flex items-center gap-2 bg-[#2563EB] text-white font-semibold rounded-md px-4 py-2.5 text-sm mb-4"
        >
          <Plus size={16} /> Add staff account
        </button>
      ) : (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">New staff account</div>
          <Field label="Name">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Josphat Kamau" className={inputCls} />
          </Field>
          <Field label="Phone or email (optional — makes the login unique)">
            <input value={addContact} onChange={(e) => setAddContact(e.target.value)} placeholder="0712 345 678" className={inputCls} />
          </Field>
          <Field label="Temporary password (min 6 chars)">
            <input type="text" value={addPass} onChange={(e) => setAddPass(e.target.value)} placeholder="Share this with the staff member" className={inputCls} />
          </Field>
          {addMsg && (
            <div className="text-[#DC3B2E] text-sm mb-2 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {addMsg}
            </div>
          )}
          <div className="flex gap-2 mt-1">
            <button onClick={addStaff} disabled={adding} className="flex items-center gap-1.5 bg-[#15926A] text-white font-semibold rounded-md px-4 py-2.5 text-sm disabled:opacity-60">
              <UserCheck size={15} /> {adding ? "Creating…" : "Create & approve"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddMsg(""); }} className="text-[#5A6472] font-semibold text-sm px-3">
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-[#5A6472] mt-2">
            They can log in immediately with this name and password — no approval wait.
            Ask them to change the password later if you like.
          </p>
        </div>
      )}

      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-4 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {rows === null && <div className="text-[#5A6472] text-sm">Loading accounts…</div>}

      {rows !== null && (
        <>
          {/* Permission requests waiting on the admin */}
          {requests.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2 text-sm font-bold uppercase tracking-wide text-[#2563EB]">
                <Send size={15} /> Permission requests
              </div>
              <div className="space-y-2">
                {requests.flatMap((r) =>
                  (r.pending || []).map((perm) => (
                    <div key={r.id + perm} className="bg-[#EAF1FF] border border-[#2563EB55] rounded-lg p-3 flex items-center gap-3">
                      <Avatar name={r.name} />
                      <div className="flex-1 min-w-0 text-sm">
                        <span className="font-semibold text-[#1B2430]">{r.name}</span>
                        <span className="text-[#5A6472]"> requests </span>
                        <span className="font-semibold text-[#1B2430]">“{capLabel(perm)}”</span>
                      </div>
                      <button
                        onClick={() => grant(r.id, perm)}
                        disabled={busy === r.id}
                        className="flex items-center gap-1 bg-[#15926A] text-white text-xs font-semibold rounded-md px-2.5 py-1.5 disabled:opacity-60"
                      >
                        <Check size={13} /> Grant
                      </button>
                      <button
                        onClick={() => deny(r.id, perm)}
                        disabled={busy === r.id}
                        className="flex items-center gap-1 border border-[#DC3B2E] text-[#DC3B2E] text-xs font-semibold rounded-md px-2.5 py-1.5 disabled:opacity-60"
                      >
                        <X size={13} /> Deny
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Pending account approvals */}
          <div className="flex items-center gap-2 mb-2 text-sm font-bold uppercase tracking-wide text-[#DC3B2E]">
            <Clock size={15} /> Pending sign-ups ({pending.length})
          </div>
          {pending.length === 0 ? (
            <div className="text-[#5A6472] text-sm italic mb-6">No accounts waiting for approval.</div>
          ) : (
            <div className="space-y-2 mb-6">
              {pending.map((r) => (
                <div key={r.id} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 flex items-center gap-3">
                  <Avatar name={r.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#1B2430] truncate flex items-center gap-1.5">
                      {r.name}
                      {/* Whether the email was proved by a code. Worth seeing
                          before approving: a confirmed address means there is
                          a real person behind the sign-up who can be reached. */}
                      {r.emailVerified && (
                        <span title="Email confirmed by code" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-[#15926A] bg-[#E7F6EF] border border-[#15926A55] rounded px-1 py-0.5">
                          <CheckCircle2 size={10} /> Email confirmed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#5A6472]">Joined {fmt(r.createdAt)}</div>
                  </div>
                  <button
                    onClick={() => setApproved(r.id, true)}
                    disabled={busy === r.id}
                    className="flex items-center gap-1.5 bg-[#15926A] text-white text-sm font-semibold rounded-md px-3 py-2 disabled:opacity-60"
                  >
                    <UserCheck size={15} /> {busy === r.id ? "…" : "Approve"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Approved accounts + their per-action permissions */}
          <div className="flex items-center gap-2 mb-2 text-sm font-bold uppercase tracking-wide text-[#15926A]">
            <ShieldCheck size={15} /> Approved ({approved.length})
          </div>
          {approved.length === 0 ? (
            <div className="text-[#5A6472] text-sm italic">No approved accounts yet.</div>
          ) : (
            <div className="space-y-2">
              {approved.map((r) => {
                const self = r.id === currentUserId;
                return (
                  <div key={r.id} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-[#1B2430] truncate">
                          {r.name} {self && <span className="text-[10px] text-[#5A6472]">(you)</span>}
                        </div>
                        <div className="text-xs text-[#5A6472]">Joined {fmt(r.createdAt)}</div>
                      </div>
                      {self ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => rename(r.id, r.name)}
                            disabled={busy === r.id}
                            className="p-2 rounded-md border border-[#DEE3E9] text-[#5A6472] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-60"
                            title="Rename your account"
                          >
                            <Pencil size={15} />
                          </button>
                          <span className="text-xs font-bold text-[#2563EB] bg-[#2563EB22] px-2 py-1 rounded">Admin · all access</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => rename(r.id, r.name)}
                            disabled={busy === r.id}
                            className="p-2 rounded-md border border-[#DEE3E9] text-[#5A6472] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-60"
                            title="Rename this account"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => logout(r.id, r.name)}
                            disabled={busy === r.id}
                            className="flex items-center gap-1.5 border border-[#DEE3E9] text-[#5A6472] text-sm font-semibold rounded-md px-3 py-2 hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-60"
                            title="End their current session (they can log back in)"
                          >
                            <LogOut size={15} /> Log out
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Revoke access for ${r.name}? They'll be locked out until re-approved.`))
                                setApproved(r.id, false);
                            }}
                            disabled={busy === r.id}
                            className="flex items-center gap-1.5 border border-[#DC3B2E] text-[#DC3B2E] text-sm font-semibold rounded-md px-3 py-2 disabled:opacity-60"
                          >
                            <UserX size={15} /> Revoke
                          </button>
                        </div>
                      )}
                    </div>

                    {!self && (
                      <div className="mt-3 pt-3 border-t border-[#EEF2F6]">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-2">Permissions</div>
                        <div className="flex flex-wrap gap-2">
                          {CAPABILITIES.map((c) => {
                            const has = (r.permissions || []).includes(c.key);
                            const req = (r.pending || []).includes(c.key);
                            return (
                              <button
                                key={c.key}
                                onClick={() => (has ? revoke(r.id, c.key) : grant(r.id, c.key))}
                                disabled={busy === r.id}
                                title={c.desc}
                                className={`flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 border transition-colors disabled:opacity-60 ${
                                  has
                                    ? "bg-[#15926A] text-white border-[#15926A]"
                                    : req
                                    ? "bg-[#EAF1FF] text-[#2563EB] border-[#2563EB]"
                                    : "bg-[#F3F5F8] text-[#5A6472] border-[#DEE3E9]"
                                }`}
                              >
                                {has ? <Check size={12} /> : req ? <Send size={12} /> : <Lock size={12} />}
                                {c.label}{req && !has ? " · requested" : ""}
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-[10px] text-[#5A6472] mt-2">Tap a permission to grant; tap a green one to revoke.</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ======================= MY PERMISSIONS (staff) ======================= */
// Staff see what they can do and can REQUEST a delicate capability. The
// request goes to the admin's Staff Approvals screen for a decision.
export function MyPermissionsTab({ userId }) {
  const [state, setState] = useState(null); // { permissions, pending }
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    setState(await api.getMyPermissions(userId));
  };

  useEffect(() => {
    load();
    const ch = api.subscribeProfiles ? api.subscribeProfiles(load) : null;
    return () => { if (ch) ch(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (perm, run, optimistic) => {
    setBusy(perm); setErr("");
    try { await run(); setState((s) => optimistic(s)); }
    catch (e) { setErr(e.message || "Action failed."); }
    finally { setBusy(""); }
  };
  const request = (perm) =>
    act(perm, () => api.requestPermission(perm), (s) => ({
      ...s, pending: [...new Set([...(s?.pending || []), perm])],
    }));
  const cancel = (perm) =>
    act(perm, () => api.cancelPermissionRequest(perm), (s) => ({
      ...s, pending: (s?.pending || []).filter((p) => p !== perm),
    }));

  const has = (k) => (state?.permissions || []).includes(k);
  const req = (k) => (state?.pending || []).includes(k);

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Your access" title="My Permissions" />
      <div className="text-[#5A6472] text-xs mb-4">
        You can view, sell and create quotations by default. Delicate actions need
        an admin's approval — request one below and an admin at Jaspare Auto will decide.
      </div>

      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-4 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {state === null ? (
        <div className="text-[#5A6472] text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {CAPABILITIES.map((c) => {
            const granted = has(c.key);
            const requested = req(c.key);
            return (
              <div key={c.key} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${granted ? "bg-[#E6F6EF] text-[#15926A]" : "bg-[#EEF2F6] text-[#5A6472]"}`}>
                  {granted ? <ShieldCheck size={18} /> : <Lock size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-[#1B2430]">{c.label}</div>
                  <div className="text-xs text-[#5A6472]">{c.desc}</div>
                </div>
                {granted ? (
                  <span className="text-xs font-bold text-[#15926A] bg-[#E6F6EF] px-2.5 py-1.5 rounded-md">Granted</span>
                ) : requested ? (
                  <button
                    onClick={() => cancel(c.key)}
                    disabled={busy === c.key}
                    className="flex items-center gap-1.5 border border-[#2563EB] text-[#2563EB] text-sm font-semibold rounded-md px-3 py-2 disabled:opacity-60"
                  >
                    <Clock size={14} /> Requested · cancel
                  </button>
                ) : (
                  <button
                    onClick={() => request(c.key)}
                    disabled={busy === c.key}
                    className="flex items-center gap-1.5 bg-[#2563EB] text-white text-sm font-semibold rounded-md px-3 py-2 disabled:opacity-60"
                  >
                    <Send size={14} /> Request
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ======================= THE ASSISTANT =======================
   A box where the shop talks to the app in its own words. Two halves, one
   field, because the person typing does not think of them as two things:

     TELLING it            adding a category, setting quantities or prices
                           across many parts at once

     ASKING it             what sales were made today, whether a premio front
                           bumper is on the shelf and everything known about it,
                           who owes money, what is low on stock

     SENDING you           "generate a report for last month" opens Reports
                           already set to last month; "write a receipt" opens the
                           receipt screen. The box does not try to build the
                           document itself — the screens that do it properly
                           already exist, and half-building one somewhere else is
                           how two versions of the same paper start to disagree.

   src/lib/ask.js reads questions and journeys, src/lib/command.js reads orders,
   and readInstruction() tries the question side FIRST. That order is a safety
   rule, not a preference: "what is the price of a premio bumper" reads to the
   order side as a price change, and the number it finds is the "a" in "a premio"
   — so it would offer to reprice every Premio bumper to one shilling. Nobody
   should be shown that button for having asked a question.

   Nothing an order describes happens until it is confirmed. The description
   lists every part and what each one changes from and to, because an
   instruction acting on its own first guess would one day read "set all bumpers
   to 2" as the wrong bumpers with nobody having seen the list.

   Everything said either way is kept, cut into days — see src/lib/chatLog.js.
   One long transcript is a wall of grey nobody scrolls, so only today is open
   and an older day is a single line until it is tapped.
*/
function AnswerBody({ m, onGo }) {
  return (
    <div className="text-xs text-[#1B2430] space-y-1">
      {m.title && <div className="font-bold">{m.title}</div>}
      {(m.lines || []).map((l, i) => (
        <p key={i} className="text-[#5A6472] leading-relaxed">{l}</p>
      ))}

      {/* A single part, every field it has. A field nobody filled in is still
          listed, as "not recorded" — a blank row is a job to do, and leaving the
          row out is what makes it invisible. */}
      {m.facts && (
        <div className="mt-1.5 border-t border-[#DEE3E9] pt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          {m.facts.map((f) => (
            <React.Fragment key={f.k}>
              <span className="text-[11px] text-[#5A6472]">{f.k}</span>
              <span className="text-[11px] font-semibold break-words">{f.v}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {m.rows?.length > 0 && (
        <div className="mt-1.5 border-t border-[#DEE3E9] pt-1.5 max-h-60 overflow-y-auto">
          {m.rows.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-2 py-0.5">
              <div className="min-w-0">
                <div className="flex gap-1.5">
                  {r.a && <span className="text-[11px] font-mono text-[#2563EB] shrink-0">{r.a}</span>}
                  <span className={`text-[11px] font-semibold break-words ${r.tone === "warn" ? "text-[#B45309]" : ""}`}>{r.b}</span>
                </div>
                {r.note && <div className="text-[10px] text-[#5A6472] break-words">{r.note}</div>}
              </div>
              {r.c && <span className="text-[11px] font-bold shrink-0">{r.c}</span>}
            </div>
          ))}
        </div>
      )}

      {m.more && <p className="text-[11px] text-[#5A6472] italic">{m.more}</p>}
      {m.footer && (
        <p className="text-[10px] text-[#5A6472] leading-relaxed border-t border-[#DEE3E9] pt-1.5 mt-1.5">
          {m.footer}
        </p>
      )}

      {onGo && (m.go || m.goAlt) && (
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          {[m.go, m.goAlt].filter(Boolean).map((g, i) => (
            <button
              key={g.tab + i}
              onClick={() => onGo(g.tab, g.options || {})}
              className={`text-[11px] font-bold uppercase tracking-wide rounded-md px-2.5 py-1.5 flex items-center gap-1 active:scale-[0.98] ${
                i === 0
                  ? "bg-[#2563EB] text-[#F3F5F8]"
                  : "border border-[#DEE3E9] text-[#5A6472] bg-[#F3F5F8]"
              }`}
            >
              {g.label} <ChevronRight size={13} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* fill is for the Staff Feed, where this box is the whole screen rather than a
   panel at the bottom of one: it stretches to the height it is given, and the
   conversation takes whatever is left over after the composer, exactly as the
   team chat beside it does. Everywhere else it stays a panel. */
function CommandBox({ items, categories, sales = [], salesReady = true, user, admin = false, canEdit = false, onChanged, onGo, fill = false }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [chat, setChat] = useState([]);
  /* Day headings whose open/shut state has been flipped from the default. Held
     as the flip rather than as "open" so the default can be "today only" without
     the list needing rewriting when the date changes overnight. */
  const [toggled, setToggled] = useState([]);
  const scroller = React.useRef(null);

  useEffect(() => { setChat(loadChat()); }, []);

  /* Down to the newest message on arrival and on load. Not smooth — a slide is
     for something you are meant to watch, and this is a thing you want to have
     already happened by the time you look. */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, toggled]);

  /* One instant for the whole box, so a question about "today" and the day
     headings in the transcript agree with each other. Keyed on the date so a
     phone left open overnight stops calling yesterday "Today". */
  const dayStamp = new Date().toDateString();
  const now = useMemo(() => new Date(), [dayStamp]);

  /* Re-read on every keystroke. It is text work over lists already in memory —
     no database, no network — so there is nothing to debounce, and watching the
     reading form as you type is what teaches the wording. */
  const intent = useMemo(
    () => readInstruction(text, { items, categories, sales, salesReady, now }),
    [text, items, categories, sales, salesReady, now]
  );

  const isAnswer = intent.kind === "answer";
  const actionable = ["addSection", "renameSection", "setField"].includes(intent.kind);
  /* Adding or renaming a section is an admin job — it changes the shape of the
     whole shop's stock list, and its 3-letter code can never be changed after
     the first part is filed under it. Bulk quantity and price only need edit
     rights, which is the same permission the Edit Parts screen asks for.
     Questions need neither: reading what is on the shelf changes nothing. */
  const allowed = intent.kind === "setField" ? canEdit : admin;
  const blocked = actionable && !allowed;

  const groups = useMemo(() => groupByDay(chat, now.getTime()), [chat, now]);
  const isOpen = (g) => (toggled.includes(g.key) ? !g.isToday : g.isToday);
  const flipDay = (key) =>
    setToggled((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]));

  /* Stamped out here rather than inside the updater: React runs an updater twice
     in development to check it is pure, and minting ids in there would hand out
     two sets. The save is left inside because appending needs the previous list,
     and writing the same list twice costs nothing. */
  const push = (msgs) => {
    const base = Date.now();
    const stamped = msgs.map((m, i) => ({ id: newId(base + i), ts: base + i, ...m }));
    setChat((prev) => saveChat([...prev, ...stamped]));
  };

  /* Ask it. The answer goes into the transcript rather than under the box,
     because that is where it stays readable while the next thing is typed. */
  const askIt = () => {
    const t = text.trim();
    /* Only a question it actually read is sent. Wording it didn't follow is
       explained under the box instead and the words are left in the field to be
       fixed — filing "I didn't follow that" into the day's transcript and
       emptying the box would lose the sentence and record nothing worth
       keeping. */
    if (!t || !isAnswer) return;
    push([
      { role: "you", text: t },
      {
        role: "shop",
        kind: "answer",
        title: intent.title,
        lines: intent.lines,
        facts: intent.facts,
        rows: intent.rows,
        more: intent.more,
        footer: intent.footer,
        go: intent.go,
        goAlt: intent.goAlt,
      },
    ]);
    setText("");
    setErr("");
  };

  const run = async () => {
    setBusy(true);
    setErr("");
    /* Tracked in a local, not read back off state. `err` inside this function is
       the value from the render that created it — setErr above hasn't landed yet
       — so testing it would have cleared the box on a half-failed change and
       thrown away the wording that needs retrying. */
    let problem = "";
    let told = "";
    const typed = intent.raw || text.trim();
    try {
      if (intent.kind === "addSection") {
        await api.addPartCategory(
          { key: intent.key, label: intent.label, shelf: intent.shelf, color: intent.color },
          user
        );
        told = `Section “${intent.label}” created, code ${intent.key}.`;
      } else if (intent.kind === "renameSection") {
        await api.updatePartCategory(intent.key, { label: intent.to });
        told = `Renamed to “${intent.to}”. Its code is still ${intent.key}.`;
      } else if (intent.kind === "setField") {
        const reason = `Instruction: ${typed}`;
        /* One at a time, and the failures are counted rather than swallowed.
           A bulk change that half-worked and reported success is how a stock
           list stops matching the shelf. */
        const changed = [];
        const failed = [];
        for (const c of intent.changes) {
          try {
            /* batch: true so neither call announces itself. Each part still
               gets its own ledger line — the movement is the record of what
               happened to that part and is never summarised away. */
            if (intent.field === "qty") {
              await api.adjustQty(c.code, intent.value, reason, user, { batch: true });
            } else {
              await api.updateItem(c.code, { price: intent.value }, user, {
                batch: true,
                reason: `Price set to ${intent.value} — ${reason}`,
              });
            }
            changed.push({ code: c.code, name: c.name, qty: intent.field === "qty" ? intent.value : null });
          } catch (e) {
            failed.push(c.code);
          }
        }
        /* One notification for the whole change, not one per part. A batch of
           forty individually-announced adjustments buries everything else that
           happened today. */
        if (changed.length) {
          try {
            await api.addBatchNotification({
              type: "adjust",
              by_name: user,
              parts: changed,
              /* `name` is the column the feed prints as the summary line, and
                 the notifications table has no free-text column to put the
                 instruction in — so the instruction IS the summary. Overriding
                 it rather than adding a field keeps this working on a database
                 that hasn't had any migration run. */
              extra: {
                name: `${changed.length} part${changed.length === 1 ? "" : "s"} — ${
                  intent.field === "qty" ? "quantity" : "price"
                } set to ${intent.value} (“${typed}”)`,
                /* On a stock batch `qty` means "this many pieces came in". An
                   adjustment adds nothing, so a number here would be read as
                   stock arriving that never did. The figure is in the summary
                   line above, where it can't be mistaken for an intake. */
                qty: null,
              },
            });
          } catch {
            /* The change itself went through; a missing summary line is not
               worth telling the shop the change failed. */
          }
        }
        const ok = changed.length;
        if (failed.length) {
          problem = `${ok} of ${intent.changes.length} changed. These didn't: ${failed.join(", ")}. Nothing else was touched — read the list again and retry.`;
          setErr(problem);
        } else {
          told = `${ok} part${ok === 1 ? "" : "s"} changed. ${
            intent.field === "qty" ? "Each one is in the ledger as an adjustment." : ""
          }`;
        }
      }
      if (onChanged) await onChanged();
      /* Written into the transcript either way. What was changed on Tuesday, and
         what half-failed on Wednesday, is exactly what somebody comes back
         looking for — and a toast that faded an hour ago cannot tell them. */
      push([
        { role: "you", text: typed },
        problem
          ? { role: "shop", kind: "note", title: "Partly done", lines: [problem] }
          : { role: "shop", kind: "done", title: "Done", lines: [told] },
      ]);
      // Keep what was typed when something failed, so it can be retried as-is.
      if (!problem) setText("");
    } catch (e) {
      /* The message from the database is shown as it comes. api.js already
         turns the ones that matter into readable English (a duplicate code, a
         table that hasn't been created yet), and inventing a friendlier
         sentence here would hide which of those it was. */
      setErr(e?.message || "That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const canSend = isAnswer;

  return (
    <div
      className={`bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3 ${
        fill ? "flex-1 min-h-0 flex flex-col" : "mt-6"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Wand2 size={16} className="text-[#2563EB]" />
        <span className="font-bold uppercase tracking-wide text-xs text-[#1B2430]">
          Ask or tell the system
        </span>
        {chat.length > 0 && (
          <button
            onClick={() => { setChat(clearChat()); setToggled([]); }}
            className="ml-auto text-[10px] text-[#5A6472] flex items-center gap-1"
          >
            <Trash2 size={11} /> Clear chat
          </button>
        )}
      </div>
      {/* The description is what teaches the box, so it stays until there is a
          conversation to read instead. In the Staff Feed it would otherwise eat
          the height the transcript needs. */}
      {(!fill || chat.length === 0) && (
        <p className="text-xs text-[#5A6472] mb-2">
          Ask what sold, what is on the shelf or who owes money — or how any part of this app
          works. Tell it to add a section, set quantities and prices across many parts, or open
          the screen that makes a report, statement or receipt. Anything that changes stock
          shows you the full list first.
        </p>
      )}

      {/* ---- the conversation, cut into days ----
           Capped and scrolling, because a day of a busy shop asking things would
           otherwise push the box itself off the bottom of the phone. It is scrolled
           to the newest message whenever one arrives — an answer that lands out of
           sight reads as nothing having happened. */}
      {(groups.length > 0 || fill) && (
        <div
          ref={scroller}
          className={`mb-3 space-y-2 overflow-y-auto ${
            fill ? "flex-1 min-h-0" : "max-h-[26rem]"
          }`}
        >
          {fill && groups.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[#5A6472] gap-1.5 py-6">
              <Wand2 size={22} className="text-[#DEE3E9]" />
              <span>Nothing asked yet. Type a question, or tap one below.</span>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <button
                onClick={() => flipDay(g.key)}
                className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-[#5A6472] border-b border-[#DEE3E9] pb-1"
              >
                {isOpen(g) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {g.label}
                <span className="font-normal normal-case tracking-normal ml-auto">
                  {daySummary(g)}
                </span>
              </button>
              {isOpen(g) && (
                <div className="space-y-2 pt-2">
                  {g.items.map((m) =>
                    m.role === "you" ? (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[88%] bg-[#2563EB] text-[#F3F5F8] rounded-md rounded-br-none px-2.5 py-1.5 text-xs break-words">
                          {m.text}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={m.id}
                        className={`border rounded-md rounded-tl-none p-2.5 ${
                          m.kind === "done"
                            ? "border-[#1E9E6A]/40 bg-[#1E9E6A]/[0.06]"
                            : "border-[#DEE3E9] bg-[#F3F5F8]"
                        }`}
                      >
                        <AnswerBody m={m} onGo={onGo} />
                        <div className="text-[9px] text-[#5A6472] mt-1">
                          {new Date(m.ts).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Everything from here down is the composer, held together so it keeps its
          own height when this box is stretched to fill a screen — a preview of
          forty parts about to change must never squeeze the button off the
          bottom. */}
      <div className={fill ? "shrink-0" : ""}>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setErr(""); }}
        onKeyDown={(e) => {
          /* Enter sends, Shift+Enter makes a new line. A question is one line
             nine times out of ten, and reaching for a button after every one is
             what stops people asking a second. */
          if (e.key === "Enter" && !e.shiftKey && canSend) {
            e.preventDefault();
            askIt();
          }
        }}
        rows={2}
        placeholder="e.g. what sales were made today"
        className={`${inputCls} resize-none`}
      />

      {/* Examples, tappable. A box with no examples gets typed into once,
          misunderstood once, and never used again — so they cover both halves,
          or it teaches the shop it only does one of them. */}
      {!text.trim() && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {ASK_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="text-[11px] px-2 py-1 rounded-full border border-[#DEE3E9] text-[#5A6472] bg-[#F3F5F8] active:scale-[0.98]"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* What an ORDER would do, shown before there is anything to press.
          Answers are not previewed here — they go into the conversation above
          when they are asked, so they stay readable while the next thing is
          typed. */}
      {actionable && (
        <div className="mt-3 border border-[#2563EB]/30 bg-[#2563EB]/[0.04] rounded-md p-2.5">
          <ul className="text-xs text-[#1B2430] space-y-1">
            {intent.lines.map((l, i) => (
              <li key={i} className="flex gap-1.5">
                <Check size={13} className="text-[#2563EB] mt-0.5 shrink-0" /> <span>{l}</span>
              </li>
            ))}
          </ul>

          {/* Every part it would change, named, with the old figure beside the
              new one. This is the list that makes a wrong reading obvious. */}
          {intent.kind === "setField" && (
            <div className="mt-2 max-h-52 overflow-y-auto border-t border-[#DEE3E9] pt-2">
              {intent.changes.map((c) => (
                <div key={c.code} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
                  <span className="font-mono text-[#2563EB] shrink-0">{c.code}</span>
                  <span className="text-[#5A6472] truncate flex-1">{c.name}</span>
                  <span className="text-[#1B2430] shrink-0">
                    {intent.field === "price" ? `KES ${c.from.toLocaleString()}` : c.from}
                    {" → "}
                    <span className="font-bold">
                      {intent.field === "price" ? `KES ${c.to.toLocaleString()}` : c.to}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {intent.heavy && (
            <div className="mt-2 text-[11px] text-[#B45309] flex gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                That is {intent.changes.length} parts at once — nearly the whole list. Read it
                through before you press.
              </span>
            </div>
          )}

          {intent.needsMigration && (
            <div className="mt-2 text-[11px] text-[#5A6472]">
              Sections are stored in the database. If this comes back saying the table is
              missing, the one-off <span className="font-mono">part_categories.sql</span> hasn't
              been run yet.
            </div>
          )}
        </div>
      )}

      {/* Understood, but nothing would change — worth saying, because silence
          reads as "it didn't understand me". */}
      {intent.kind === "nothingToDo" && (
        <div className="mt-3 text-xs text-[#5A6472] flex gap-1.5">
          <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#1E9E6A]" />
          <span>{intent.why}</span>
        </div>
      )}

      {/* Didn't understand, and says why. Never a blank box. */}
      {intent.kind === "unknown" && (
        <div className="mt-3 text-xs text-[#5A6472] flex gap-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-[#B45309]" />
          <span>{intent.why}</span>
        </div>
      )}

      {blocked && (
        <div className="mt-2 text-xs text-[#B45309] flex gap-1.5">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>
            {intent.kind === "setField"
              ? "Changing many parts at once needs edit rights. Ask an admin."
              : "Only an admin can add or rename a section — its code is stamped into every part filed there."}
          </span>
        </div>
      )}

      {err && (
        <div className="mt-2 text-xs text-[#DC3B2E] flex gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span>{err}</span>
        </div>
      )}

      {/* One button, because the person typing does not think of asking and
          telling as two different tools. Its wording is the difference: "Ask"
          reads nothing back, and "Change 12 parts" says exactly how many. */}
      {(canSend || (actionable && !blocked)) && (
        <button
          onClick={actionable ? run : askIt}
          disabled={busy}
          className="mt-3 w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-2.5 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : actionable ? <Check size={16} /> : <Send size={16} />}
          {busy ? "Working…" : actionable ? intent.confirm : "Ask"}
        </button>
      )}
      </div>
    </div>
  );
}

/* ======================= ADD ITEM ======================= */
export function AddItemTab({ items, categories, sales = [], salesReady = true, onAdd, user, admin = false, canEdit = false, onChanged, onGo }) {
  const [cat, setCat] = useState(categories[0]?.key || "");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [series, setSeries] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [side, setSide] = useState(SIDES[0]);
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  /* Blank, not "3". A pre-filled 3 was never a decision anybody made — it just
     sat in the box — and it put every one-off body part into the reorder list for
     ever. Blank means "warn me when it's finished", which is right for a part the
     shop holds one of. Type a number only for something that has to be reordered
     before it runs out. */
  const [min, setMin] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [rack, setRack] = useState("");
  const [shelf, setShelf] = useState("");
  const [bin, setBin] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState([]); // data URLs
  const [err, setErr] = useState("");

  const brandModels = BRANDS.find((b) => b.name.toLowerCase() === brand.toLowerCase())?.models || [];
  /* The side belongs in the preview because it belongs in the saved code. Left
     out, the label staff were shown ("DOR-HON-CRV-XX-0293") was not the label
     that got printed ("DOR-HON-CRV-XX-FL-0293"). */
  const previewCode = generateCode({ cat, brand, model, yearFrom, side }, items);
  const previewLoc = formatLocation({ warehouse, rack, shelf, bin });

  const onFiles = (fileList) => {
    const files = Array.from(fileList).slice(0, 4);
    Promise.all(files.map(readImageCompressed)).then((urls) =>
      setImages((prev) => [...prev, ...urls].slice(0, 4))
    );
  };

  const submit = () => {
    // Only need something to identify the part — brand or model. Everything
    // else (price, quantity, year, colour…) is optional and can be filled later.
    if (!brand.trim() && !model.trim()) {
      setErr("Enter at least a brand or a model so the part can be identified.");
      return;
    }
    /* The one detail that is not optional, and only for the sections that need
       it. A door saved as just "Left" does not say which of the two left doors
       it is - the shop has 90 filed that way already and no way to tell them
       apart on the shelf. Everything else here can be filled in later; this
       can't, because nobody will remember. */
    const needs = sideMissing(cat, side);
    if (needs.length) {
      setErr(`Say ${needs.join(" and ")} for this part - it is the only thing that tells it from the other one.`);
      return;
    }
    setErr("");
    const catLabel = categories.find((c) => c.key === cat)?.label || "";
    const nameParts = [brand.trim(), model.trim()].filter(Boolean).join(" ");
    onAdd({
      cat,
      brand: brand.trim(),
      model: model.trim(),
      series: series.trim(),
      // Unknown stays unknown. This used to default to the current year,
      // which quietly recorded every yearless part as a brand-new model.
      yearFrom: Number(yearFrom) || null,
      yearTo: Number(yearTo) || Number(yearFrom) || null,
      condition,
      side,
      color: color.trim(),
      name:
        `${catLabel}${nameParts ? " — " + nameParts : ""}${
          color.trim() ? ` (${color.trim()})` : ""
        }`.trim(),
      price: Number(price) || 0,
      /* A part being written into the system is a part the shop is holding, so
         one is the smallest true quantity. Blank used to save as 0, and "0 in
         stock" on a shelf that has the part on it reads as sold out - staff
         turned customers away over it. Only a sale or a deduction reaches zero. */
      qty: Math.max(1, Number(qty) || 0),
      /* Blank stays blank rather than becoming a number — see reorderLevel() in
         data.js. Left empty, the part is only flagged once it's finished, which
         is what "one bonnet on the shelf" needs. */
      min: min.trim() === "" ? null : Number(min) || LOW_STOCK_THRESHOLD,
      location: previewLoc,
      notes: notes.trim(),
      images,
      status: "Active",
    });
    // reset
    setBrand(""); setModel(""); setSeries(""); setYearFrom(""); setYearTo("");
    setColor(""); setPrice(""); setQty(""); setNotes(""); setImages([]);
    setWarehouse(""); setRack(""); setShelf(""); setBin("");
  };

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="New part" title="Add New Item" />

      <div className="text-[#5A6472] text-xs mb-4 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3">
        Only a <span className="font-semibold text-[#1B2430]">brand or model</span> is required.
        Fill in whatever else you know now — price, year, colour and photos can all be
        added or edited later from Edit Parts and Add Stock. Quantity starts at{" "}
        <span className="font-semibold text-[#1B2430]">1</span> if you leave it blank: the part
        is here, so it is in stock.
      </div>

      <Field label="Category / section">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls}>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} — Shelf {c.shelf}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Vehicle brand">
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Toyota"
              list="brand-list"
              className={inputCls}
            />
            <datalist id="brand-list">
              {BRANDS.map((b) => (
                <option key={b.name} value={b.name} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Model">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Axela"
              list="model-list"
              className={inputCls}
            />
            <datalist id="model-list">
              {brandModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Series (optional)">
            <input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="BM" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Year from">
            <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="leave blank if unknown" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Year to">
            <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2018" className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Condition">
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Side">
            <select value={side} onChange={(e) => setSide(e.target.value)} className={inputCls}>
              {sidesFor(cat, side).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Color">
            <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Silver" className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Price (KES) — optional">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Add later if unknown" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Starting qty">
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Low-stock at" hint="Leave blank to be warned when it's finished. Set a number only for a fast mover you reorder early.">
            <input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} placeholder="when finished" className={inputCls} />
          </Field>
        </div>
      </div>

      <Field label="Location (Warehouse / Rack / Shelf / Bin)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="A" className={inputCls} />
          <input value={rack} onChange={(e) => setRack(e.target.value)} placeholder="Rack 03" className={inputCls} />
          <input value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="Shelf 02" className={inputCls} />
          <input value={bin} onChange={(e) => setBin(e.target.value)} placeholder="Bin 05" className={inputCls} />
        </div>
      </Field>

      <Field label="Images (main / back / damage / extra — up to 4)">
        <label className="flex items-center gap-2 cursor-pointer bg-[#FFFFFF] border border-dashed border-[#DEE3E9] rounded-md px-3 py-3 text-[#5A6472] hover:border-[#2563EB]">
          <ImagePlus size={16} /> <span className="text-sm">Take or upload images</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {images.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt="" className="w-16 h-16 object-cover rounded border border-[#DEE3E9]" />
                <button
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-[#DC3B2E] text-white rounded-full w-5 h-5 flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any extra detail…" className={inputCls} />
      </Field>

      <div className="text-xs text-[#5A6472] mb-3 bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
        Auto-generated code:{" "}
        <span className="font-mono text-[#2563EB]">{previewCode}</span>
        <br />
        Location: <span className="font-mono text-[#2563EB]">{previewLoc}</span>
      </div>

      {err && (
        <div className="text-[#DC3B2E] text-sm mb-3 flex items-center gap-1.5">
          <AlertTriangle size={14} /> {err}
        </div>
      )}

      <button
        onClick={submit}
        className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
      >
        <Plus size={18} /> Add to inventory
      </button>

      {/* Down at the bottom of the adding screen, which is where the need comes
          up: you go to file a part, there is no section for it, and rather than
          stopping to ask somebody you say so here. */}
      <CommandBox
        items={items}
        categories={categories}
        sales={sales}
        salesReady={salesReady}
        user={user}
        admin={admin}
        canEdit={canEdit}
        onChanged={onChanged}
        onGo={onGo}
      />
    </div>
  );
}

/* ======================= BULK ENTRY =======================
   Paste a list the way it was written - on WhatsApp, in a notebook,
   in a supplier's message - and the shop reads it. Every line becomes
   a row you can correct before anything is saved. Nothing is written
   to the inventory until the Save button is pressed.
*/
export function BulkAddTab({ items, categories, sales = [], salesReady = true, onAddMany, onStockMany, user, admin = false, canEdit = false, onChanged, onGo }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState(null); // null = still on the paste step
  const [openId, setOpenId] = useState(null); // which row is expanded for editing
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { added, stocked, failed }
  /* Rows the person has overruled: "no, this one really is a separate part".
     Kept as ids rather than a flag on the row, because re-reading the list
     rebuilds the rows and a decision about the shelf should survive that. */
  const [asNew, setAsNew] = useState(() => new Set());
  /* Which contradicted fields they have agreed to take from the list, per row.
     Nothing is taken by default — see planRow. */
  const [takeClash, setTakeClash] = useState({});

  const read = () => {
    // The shop's own sections are passed in, so "boot light - Toyota Premio"
    // files itself instead of coming back asking which category it is.
    const parsed = parsePartsList(text, categories);
    setRows(parsed);
    setOpenId(null);
    setDone(null);
  };

  const patch = (id, changes) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...changes };
        // Recalculate what is still missing as they fill things in.
        const miss = [];
        if (!next.cat) miss.push("category");
        if (!next.brand) miss.push("brand");
        if (!next.model) miss.push("model");
        // No year is fine - see parsePartLine. It saves as unknown.
        // One rule for the side, shared with the reader - see sideMissing.
        miss.push(...sideMissing(next.cat, next.side));
        return { ...next, missing: miss };
      })
    );

  const drop = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const ready = (rows || []).filter((r) => r.missing.length === 0);
  const needsWork = (rows || []).filter((r) => r.missing.length > 0);

  /* Every ready line put beside the stock already on the shelf. A pasted list is
     usually half things the shop already holds, and every line used to be
     inserted as a brand new part with a brand new code — so the same door ended
     up living under two codes, with the pieces counted on one and the customer
     shown the other. See planRows. */
  const plans = useMemo(
    () => new Map(planRows(ready, items, categories).map((p) => [p.id, p])),
    [ready, items, categories]
  );
  /* What each row will actually do, once the person's own overrules are applied. */
  const planFor = (r) => {
    const p = plans.get(r.id) || { action: "add", item: rowToNewItem(r, categories), fills: [], clashes: [] };
    return asNew.has(r.id) ? { ...p, action: "add" } : p;
  };
  const toStock = ready.filter((r) => planFor(r).action === "stock");
  const toAdd = ready.filter((r) => planFor(r).action === "add");

  const setClash = (id, field, on) =>
    setTakeClash((prev) => {
      const set = new Set(prev[id] || []);
      if (on) set.add(field); else set.delete(field);
      return { ...prev, [id]: set };
    });

  const save = async () => {
    setSaving(true);
    /* The parts already on the shelf first. If something fails half way, the
       shop is left with stock added to real parts rather than a pile of fresh
       duplicate codes, which is the easier of the two to make sense of. */
    let stocked = 0, failed = 0, firstError = "";
    /* No silent fallback if the handler is missing. Adding these as new parts
       instead would be the exact duplicate-code fault this screen exists to stop,
       and it would look like a success. */
    if (toStock.length && !onStockMany) {
      setSaving(false);
      setDone({ added: 0, stocked: 0, failed: toStock.length, firstError: "Restocking isn't wired up on this screen." });
      return;
    }
    if (toStock.length) {
      const res = await onStockMany(
        toStock.map((r) => {
          const p = planFor(r);
          const taken = takeClash[r.id] || new Set();
          /* Blanks get filled, because filling a blank takes nothing away.
             A field that disagrees is only taken if it was ticked. */
          const patch = {};
          for (const f of p.fills) patch[f.field] = p.item[f.field];
          for (const c of p.clashes) if (taken.has(c.field)) patch[c.field] = p.item[c.field];
          return {
            code: p.existing.code,
            name: p.existing.name,
            addQty: p.item.qty,
            patch,
            /* The note is added to, never replaced — the part may have carried a
               note for a year and the new line is one more thing known about it,
               not a correction of what was there. */
            appendNote: p.item.notes,
          };
        })
      );
      stocked = res.stocked; failed += res.failed; firstError = firstError || res.firstError;
    }
    let added = 0;
    if (toAdd.length) {
      const res = await onAddMany(toAdd.map((r) => planFor(r).item));
      added = res.added; failed += res.failed; firstError = firstError || res.firstError;
    }
    setSaving(false);
    setDone({ added, stocked, failed, firstError });
    // Keep only the rows that still need attention, so the screen shows
    // exactly what is left to do.
    setRows(needsWork);
    setAsNew(new Set());
    setTakeClash({});
  };

  /* ---------- step 1: paste ---------- */
  if (rows === null) {
    return (
      <div className="bp-fade-up">
        <SectionTitle eyebrow="Bulk entry" title="Paste a List of Parts" />

        <div className="text-[#5A6472] text-xs mb-4 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3 leading-relaxed">
          Write or paste the parts the way you normally say them — one per line. The shop works
          out the <span className="font-semibold text-[#1B2430]">category, vehicle, year and side</span>{" "}
          by itself, and shows you everything for checking before it saves.
          <div className="mt-2 font-mono text-[11px] text-[#1B2430] bg-white border border-[#DEE3E9] rounded p-2 leading-relaxed">
            Left-hand side side mirror - Honda Fit (2010 model)<br />
            Left-hand side front door - Mazda CX-5 (2012-2016 model)<br />
            Front bumper - Lexus IS 250 (2008 model)<br />
            Rear bumper - Toyota Harrier (2016 model)<br />
            Left-hand side headlight - Toyota Prado 150 (2016 model)
          </div>
          <div className="mt-2">
            <span className="font-semibold text-[#1B2430]">Write everything you know</span> — it all
            gets kept. Price <span className="font-mono">@ 8500</span>, quantity{" "}
            <span className="font-mono">x2</span>, colour <span className="font-mono">silver</span>,
            shelf <span className="font-mono">shelf D-01</span>, where it came from{" "}
            <span className="font-mono">from Ex Japan</span>, and words like{" "}
            <span className="font-mono">brand new</span>, <span className="font-mono">xenon</span>.
            Anything the shop has no field for — “with bracket”, “small crack on the corner” — is
            saved onto the part as a note rather than dropped. Everything is shown for checking on
            the next screen.
          </div>
          <div className="mt-2">
            <span className="font-semibold text-[#1B2430]">A part already in stock is not written
            twice.</span> If a line is a part the shop holds — same section, same vehicle, same side,
            same condition — the pieces go onto the part that exists and anything new the line says
            is filled in. You are shown which lines those are, and you can say a line is a separate
            part if it really is.
          </div>
        </div>

        <Field label="Your list">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"Left-hand side headlight - Toyota Premio 2016\nRear bumper - Nissan Note 2014\n..."}
            className={inputCls + " font-mono text-sm"}
          />
        </Field>

        <button
          onClick={read}
          disabled={!text.trim()}
          className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          <Wand2 size={18} /> Read the list
        </button>

        {/* On this screen too, because pasting a list is exactly when you find
            out a whole family of parts has no section to go in. */}
        <CommandBox
          items={items}
          categories={categories}
          sales={sales}
          salesReady={salesReady}
          user={user}
          admin={admin}
          canEdit={canEdit}
          onChanged={onChanged}
          onGo={onGo}
        />
      </div>
    );
  }

  /* ---------- step 2: check and save ---------- */
  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Bulk entry"
        title="Check Before Saving"
        right={
          <button
            onClick={() => { setRows(null); setDone(null); }}
            className="text-xs font-bold uppercase tracking-wide text-[#2563EB] border border-[#DEE3E9] rounded-md px-3 py-2 hover:border-[#2563EB]"
          >
            Back to the list
          </button>
        }
      />

      {done && (
        <div className={`rounded-md p-3 text-sm mb-4 flex items-start gap-2 border ${
          done.failed ? "bg-[#FBEAE8] border-[#DC3B2E] text-[#DC3B2E]" : "bg-[#E6F6EF] border-[#15926A] text-[#15926A]"
        }`}>
          {done.failed ? <AlertTriangle size={15} className="mt-0.5" /> : <Check size={15} className="mt-0.5" />}
          <div>
            <div className="font-semibold">
              {/* Said as two numbers because they are two different things. "12
                  parts saved" hides the fact that 9 of them went onto parts
                  already on the shelf, which is the bit somebody checking the
                  shelf count needs to know. */}
              {[
                done.added ? `${done.added} new part${done.added !== 1 ? "s" : ""} added` : "",
                done.stocked ? `${done.stocked} part${done.stocked !== 1 ? "s" : ""} you already had got more stock` : "",
              ].filter(Boolean).join(", ") || "Nothing was saved"}.
            </div>
            {done.failed > 0 && (
              <div className="text-xs mt-0.5">
                {done.failed} could not be saved — {done.firstError || "please try those again"}.
              </div>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center text-[#5A6472] text-sm bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-6">
          Nothing left to check.
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4 text-xs flex-wrap">
            {toAdd.length > 0 && (
              <span className="bg-[#15926A22] text-[#15926A] font-bold rounded px-2 py-1">
                {toAdd.length} new part{toAdd.length !== 1 ? "s" : ""}
              </span>
            )}
            {toStock.length > 0 && (
              <span className="bg-[#2563EB22] text-[#2563EB] font-bold rounded px-2 py-1">
                {toStock.length} already in stock
              </span>
            )}
            {needsWork.length > 0 && (
              <span className="bg-[#DC3B2E22] text-[#DC3B2E] font-bold rounded px-2 py-1">
                {needsWork.length} need{needsWork.length === 1 ? "s" : ""} a detail
              </span>
            )}
          </div>

          {toStock.length > 0 && (
            <div className="text-xs text-[#5A6472] mb-3 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3 leading-relaxed">
              <span className="font-semibold text-[#2563EB]">{toStock.length}</span> of these
              {toStock.length === 1 ? " is a part" : " are parts"} the shop already has. The pieces
              go <span className="font-semibold text-[#1B2430]">onto the part that already exists</span>,
              and anything the line says that the part didn't say is filled in — so you get one part
              with the right count, not the same part under two codes. Tap a blue row to see exactly
              what it will do, or to say it is a separate part after all.
            </div>
          )}

          <div className="space-y-2 mb-4">
            {rows.map((r) => (
              <BulkRow
                key={r.id}
                row={r}
                categories={categories}
                items={items}
                plan={r.missing.length === 0 ? planFor(r) : null}
                forcedNew={asNew.has(r.id)}
                onForceNew={(on) =>
                  setAsNew((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(r.id); else next.delete(r.id);
                    return next;
                  })
                }
                taken={takeClash[r.id] || EMPTY_SET}
                onTake={(field, on) => setClash(r.id, field, on)}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                onPatch={(c) => patch(r.id, c)}
                onDrop={() => drop(r.id)}
              />
            ))}
          </div>

          {needsWork.length > 0 && (
            <div className="text-xs text-[#5A6472] mb-3 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3">
              The rows marked in red are missing something. Tap one to fill it in — or leave them and
              save the rest now.
            </div>
          )}

          <button
            onClick={save}
            disabled={saving || ready.length === 0}
            className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-transform"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            {saving
              ? "Saving…"
              : /* The button says what it is about to do, split the way it will
                   actually happen. "Save 12 parts" on a list where 9 are restocks
                   is a promise of 12 new codes, and that is not what happens. */
                [
                  toAdd.length ? `Add ${toAdd.length} new part${toAdd.length !== 1 ? "s" : ""}` : "",
                  toStock.length ? `restock ${toStock.length}` : "",
                ].filter(Boolean).join(" · ") || "Nothing ready to save"}
          </button>
        </>
      )}
    </div>
  );
}

/* Shared so the default `taken` prop is not a fresh Set on every render, which
   would make BulkRow think its props changed on every keystroke. */
const EMPTY_SET = new Set();

/* One parsed line, collapsed to a summary until tapped. */
function BulkRow({ row, categories, items, plan = null, forcedNew = false, onForceNew, taken = EMPTY_SET, onTake, open, onToggle, onPatch, onDrop }) {
  const cat = categories.find((c) => c.key === row.cat);
  const bad = row.missing.length > 0;
  const known = plan?.action === "stock" ? plan.existing : null;
  const brandModels =
    BRANDS.find((b) => b.name.toLowerCase() === String(row.brand).toLowerCase())?.models || [];
  // What the code will look like, so staff recognise it on the shelf label.
  const preview =
    row.cat && (row.brand || row.model)
      ? generateCode(
          { cat: row.cat, brand: row.brand, model: row.model, yearFrom: row.yearFrom, side: row.side, variant: row.variant },
          items
        ).replace(/-\d+$/, "-####")
      : "";

  return (
    <div className={`bg-[#FFFFFF] border rounded-md overflow-hidden ${
      bad ? "border-[#DC3B2E]" : known ? "border-[#2563EB]" : "border-[#DEE3E9]"
    }`}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-start gap-2">
        <span
          className="w-1.5 self-stretch rounded-full shrink-0"
          style={{ background: bad ? "#DC3B2E" : known ? "#2563EB" : cat?.color || "#DEE3E9" }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1B2430] truncate">
            {cat?.label || "No category yet"}
            {row.brand || row.model ? ` — ${[row.brand, row.model].filter(Boolean).join(" ")}` : ""}
          </div>
          <div className="text-[11px] text-[#5A6472] truncate">
            {[
              row.series && `Series ${row.series}`,
              row.yearFrom
                ? (row.yearTo && row.yearTo !== row.yearFrom ? `${row.yearFrom}-${row.yearTo}` : row.yearFrom)
                : "year not known",
              row.side,
              row.variant,
              row.condition,
              row.color,
              // Blank means 1, not 0 — the part is here. Say so on the line so
              // nobody is surprised by what gets saved.
              `${Math.max(1, Number(row.qty) || 0)} pc${Math.max(1, Number(row.qty) || 0) !== 1 ? "s" : ""}`,
              row.price ? `KES ${Number(row.price).toLocaleString()}` : "",
              row.location && `Shelf ${row.location}`,
              row.supplier && `from ${row.supplier}`,
            ]
              .filter(Boolean)
              .join(" · ") || row.raw}
          </div>
          {/* The words that didn't belong to any field. Shown here because a
              note the person typed and can't see is a note they assume was
              lost — which is exactly what used to happen. */}
          {row.extra && (
            <div className="text-[11px] text-[#2563EB] truncate mt-0.5" title={row.extra}>
              Also noted: {row.extra}
            </div>
          )}
          {/* What this line will DO, on the collapsed row, because that is the
              only thing on this screen somebody has to check. A line that reads
              correctly but silently makes a second copy of a part already on the
              shelf looks identical to one that doesn't. */}
          {known && (
            <div className="text-[11px] text-[#2563EB] font-semibold mt-0.5 truncate">
              Already in stock — {known.code} has {Number(known.qty) || 0}, adding{" "}
              {plan.item.qty} → {(Number(known.qty) || 0) + plan.item.qty}
              {plan.fills.length ? ` · filling in ${plan.fills.map((f) => f.label).join(", ")}` : ""}
              {plan.clashes.length
                ? ` · ${plan.clashes.length} thing${plan.clashes.length !== 1 ? "s" : ""} disagree${plan.clashes.length === 1 ? "s" : ""}`
                : ""}
            </div>
          )}
          {plan && plan.action === "add" && forcedNew && (
            <div className="text-[11px] text-[#5A6472] font-semibold mt-0.5">
              Saving as a separate part, on your say-so
            </div>
          )}
          {bad && (
            <div className="text-[11px] text-[#DC3B2E] font-semibold mt-0.5">
              Still needs: {row.missing.join(", ")}
            </div>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`text-[#5A6472] shrink-0 mt-1 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-[#DEE3E9] pt-3">
          <div className="text-[11px] text-[#5A6472] mb-3 italic">You wrote: “{row.raw}”</div>

          {/* The one decision on this row that cannot be undone by editing a
              field afterwards: whether this is a part the shop already holds or
              a second one. Getting it wrong the "new part" way leaves two codes
              for one part, which nobody notices until a stock count. */}
          {(known || forcedNew) && (
            <div className="mb-3 rounded-md border border-[#2563EB] bg-[#2563EB0D] p-3">
              {known ? (
                <>
                  <div className="text-xs font-bold text-[#2563EB] uppercase tracking-wide mb-1">
                    We already have this one
                  </div>
                  <div className="text-[11px] text-[#1B2430] leading-relaxed">
                    <span className="font-mono">{known.code}</span> — {known.name}
                    {known.location && known.location !== "Unassigned" ? ` · Shelf ${known.location}` : ""}
                    <br />
                    {Number(known.qty) || 0} on the shelf, this line adds {plan.item.qty} →{" "}
                    <span className="font-bold">{(Number(known.qty) || 0) + plan.item.qty}</span>
                  </div>

                  {plan.fills.length > 0 && (
                    <div className="text-[11px] text-[#15926A] mt-2 leading-relaxed">
                      Filling in what the part didn't say:{" "}
                      {plan.fills.map((f) => `${f.label} → ${f.to}`).join(", ")}
                    </div>
                  )}

                  {plan.clashes.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[11px] font-bold text-[#B7791F] leading-relaxed">
                        Your line says something different. Nothing here changes unless you tick it —
                        a price somebody set on purpose is not something a pasted list should quietly
                        rewrite.
                      </div>
                      {plan.clashes.map((c) => (
                        <label key={c.field} className="flex items-center gap-2 mt-1.5 text-[11px] text-[#1B2430] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={taken.has(c.field)}
                            onChange={(e) => onTake?.(c.field, e.target.checked)}
                            className="accent-[#2563EB]"
                          />
                          <span>
                            {c.label}: <span className="line-through text-[#5A6472]">{String(c.from)}</span>{" "}
                            → <span className="font-bold">{String(c.to)}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-[#5A6472] leading-relaxed">
                  This matched a part already in stock, and you said it is a separate one.
                </div>
              )}

              <button
                type="button"
                onClick={() => onForceNew?.(!forcedNew)}
                className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[#2563EB] border border-[#2563EB] rounded px-2 py-1.5 hover:bg-[#2563EB] hover:text-white transition-colors"
              >
                {forcedNew ? "No — add the stock to the one we have" : "This is a separate part — give it its own code"}
              </button>
            </div>
          )}

          <Field label="Category / section">
            <select value={row.cat} onChange={(e) => onPatch({ cat: e.target.value })} className={inputCls}>
              <option value="">— choose —</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>{c.label} — Shelf {c.shelf}</option>
              ))}
            </select>
          </Field>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Brand">
                <input value={row.brand} onChange={(e) => onPatch({ brand: e.target.value })} list="brand-list" className={inputCls} />
                <datalist id="brand-list">
                  {BRANDS.map((b) => <option key={b.name} value={b.name} />)}
                </datalist>
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Model">
                <input value={row.model} onChange={(e) => onPatch({ model: e.target.value })} list={`bm-${row.id}`} className={inputCls} />
                <datalist id={`bm-${row.id}`}>
                  {brandModels.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Series">
                <input value={row.series} onChange={(e) => onPatch({ series: e.target.value })} placeholder="150" className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Year from">
                <input type="number" value={row.yearFrom} onChange={(e) => onPatch({ yearFrom: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Year to">
                <input type="number" value={row.yearTo} onChange={(e) => onPatch({ yearTo: e.target.value })} className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Side">
                <select value={row.side} onChange={(e) => onPatch({ side: e.target.value })} className={inputCls}>
                  <option value="">— none —</option>
                  {sidesFor(row.cat, row.side).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Condition">
                <select value={row.condition} onChange={(e) => onPatch({ condition: e.target.value })} className={inputCls}>
                  <option value="">Genuine Used</option>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Price (KES) — optional">
                <input type="number" value={row.price} onChange={(e) => onPatch({ price: e.target.value })} placeholder="Later is fine" className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Quantity">
                <input type="number" min="1" value={row.qty} onChange={(e) => onPatch({ qty: e.target.value })} placeholder="1" className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Colour">
                <input value={row.color || ""} onChange={(e) => onPatch({ color: e.target.value })} placeholder="Silver" className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Shelf / location">
                <input value={row.location || ""} onChange={(e) => onPatch({ location: e.target.value })} placeholder="Unassigned" className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Supplier">
                <input value={row.supplier || ""} onChange={(e) => onPatch({ supplier: e.target.value })} placeholder="Ex Japan" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Anything else the line said, kept as written and editable. It is
              saved onto the part, so what the person typed survives even when
              the shop has no field for it. */}
          <Field
            label="Anything else written on the line"
            hint="Saved onto the part as a note. Nothing you typed is thrown away."
          >
            <textarea
              value={row.extra || ""}
              onChange={(e) => onPatch({ extra: e.target.value })}
              rows={2}
              placeholder="e.g. with bracket, small crack on the corner"
              className={inputCls}
            />
          </Field>

          {preview && (
            <div className="text-xs text-[#5A6472] mb-3">
              Code will be <span className="font-mono text-[#2563EB]">{preview}</span>
            </div>
          )}

          <button
            onClick={onDrop}
            className="text-xs font-bold uppercase tracking-wide text-[#DC3B2E] border border-[#DEE3E9] rounded-md px-3 py-2 flex items-center gap-1.5 hover:border-[#DC3B2E]"
          >
            <Trash2 size={13} /> Remove this line
          </button>
        </div>
      )}
    </div>
  );
}

/* ======================= ADD STOCK ======================= */
export function AddStockTab({ items, categories, onAddStock, initialCode = "" }) {
  const [query, setQuery] = useState("");
  // A part long-pressed in Search arrives already chosen.
  const [selected, setSelected] = useState(
    () => (initialCode ? items.find((i) => i.code === initialCode) || null : null)
  );
  const [amount, setAmount] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((i) => matchesQuery(i, categories.find((c) => c.key === i.cat), q)).slice(0, 8);
  }, [items, categories, query]);

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Restock" title="Add New Stock" />
      {!selected ? (
        <>
          <Field label="Find the part">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Code, name, or vehicle…" className={inputCls} autoFocus />
          </Field>
          <div className="space-y-2">
            {matches.map((it) => (
              <button key={it.code} onClick={() => setSelected(it)} className="w-full text-left">
                <ItemCard item={it} categories={categories} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <ItemCard item={selected} categories={categories} />
          </div>
          <Field label="Quantity to add">
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus />
          </Field>
          <div className="flex gap-3">
            <button
              onClick={() => { setSelected(null); setAmount(""); setQuery(""); }}
              className="flex-1 border border-[#DEE3E9] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#5A6472]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const n = Number(amount);
                if (n > 0) {
                  onAddStock(selected.code, n);
                  setSelected(null); setAmount(""); setQuery("");
                }
              }}
              className="flex-1 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2"
            >
              <PackagePlus size={18} /> Confirm
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ======================= EDIT PARTS (admin) ======================= */
// Admin-only: browse the list, pick a part, edit its details & price.
// Quantity is intentionally NOT editable here — that stays with Add Stock / Sell.
export function EditPartsTab({ items, categories, onSave, initialCode = "", focusInfo = false }) {
  const [query, setQuery] = useState("");
  // A part long-pressed in Search arrives already open for editing.
  const [selected, setSelected] = useState(
    () => (initialCode ? items.find((i) => i.code === initialCode) || null : null)
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((i) => matchesQuery(i, categories.find((c) => c.key === i.cat), q))
      : items;
    return list.slice(0, 20);
  }, [items, categories, query]);

  if (selected) {
    return (
      <EditPartForm
        key={selected.code}
        item={selected}
        categories={categories}
        focusInfo={focusInfo}
        onCancel={() => setSelected(null)}
        onSave={async (patch) => {
          const ok = await onSave(selected.code, patch);
          if (ok !== false) setSelected(null);
        }}
      />
    );
  }

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Admin · manage parts" title="Edit Parts" />
      <div className="text-[#5A6472] text-xs mb-3">
        Pick a part to edit its details and price. To change quantity, use Add New Stock or Sell Item.
      </div>
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a part by code, name, vehicle…"
          className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-md pl-10 pr-9 py-3 text-[#1B2430] placeholder-[#5A6472] outline-none focus:border-[#2563EB]"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6472]">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {matches.map((it) => (
          <button key={it.code} onClick={() => setSelected(it)} className="w-full text-left">
            <ItemCard item={it} categories={categories} />
          </button>
        ))}
        {matches.length === 0 && (
          <div className="text-[#5A6472] text-sm py-8 text-center">No part matches that search.</div>
        )}
      </div>
    </div>
  );
}

function EditPartForm({ item, categories, onCancel, onSave, focusInfo = false }) {
  const [cat, setCat] = useState(item.cat || categories[0]?.key || "");
  const [brand, setBrand] = useState(item.brand || "");
  const [model, setModel] = useState(item.model || "");
  const [series, setSeries] = useState(item.series || "");
  const [yearFrom, setYearFrom] = useState(item.yearFrom || "");
  const [yearTo, setYearTo] = useState(item.yearTo || "");
  const [condition, setCondition] = useState(item.condition || CONDITIONS[0]);
  const [side, setSide] = useState(item.side || SIDES[0]);
  const [color, setColor] = useState(item.color || "");
  const [name, setName] = useState(item.name || "");
  const [price, setPrice] = useState(item.price ?? "");
  /* A stored 3 shows as blank, because a stored 3 is the old column default that
     nobody typed — showing it would invite somebody to save it back as a real
     choice and put the part in the reorder list for good. */
  const [min, setMin] = useState(reorderLevel(item) || "");
  const [location, setLocation] = useState(item.location || "");
  const [supplier, setSupplier] = useState(item.supplier || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [images, setImages] = useState(Array.isArray(item.images) ? item.images.filter(Boolean) : []);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  /* The stock list is fetched without photos so it loads fast, which means
     the photos may not have arrived yet when this form opens. Pull the full
     row so saving can't blank out photos the form never had. */
  React.useEffect(() => {
    let alive = true;
    if (!api.fetchItem) return;
    api.fetchItem(item.code)
      .then((full) => {
        if (!alive) return;
        const got = Array.isArray(full.images) ? full.images.filter(Boolean) : [];
        // Don't clobber photos the user has just added or removed.
        setImages((prev) => (prev.length === 0 && got.length ? got : prev));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [item.code]);

  // "Add information" from the search long-press jumps straight to the
  // location / supplier / notes / photos block.
  const infoRef = React.useRef(null);
  React.useEffect(() => {
    if (focusInfo && infoRef.current) {
      infoRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusInfo]);

  const brandModels = BRANDS.find((b) => b.name.toLowerCase() === brand.toLowerCase())?.models || [];

  // Read picked files as data URLs (compressed) and add to the gallery (max 4).
  const onFiles = (fileList) => {
    const files = Array.from(fileList).slice(0, 4);
    Promise.all(files.map(readImageCompressed)).then((urls) =>
      setImages((prev) => [...prev, ...urls].slice(0, 4))
    );
  };

  const submit = async () => {
    if (!brand.trim() || !model.trim() || price === "") {
      setErr("Brand, model and price are required.");
      return;
    }
    setErr("");
    setSaving(true);
    try {
      await onSave({
        cat,
        brand: brand.trim(),
        model: model.trim(),
        series: series.trim(),
        // Emptying the box means "we don't actually know" and must stick.
        // It used to fall back to the stored year, so a wrong year could
        // never be cleared - only overwritten with another guess.
        yearFrom: Number(yearFrom) || null,
        yearTo: Number(yearTo) || Number(yearFrom) || null,
        condition,
        side,
        color: color.trim(),
        name: name.trim(),
        price: Number(price),
        // Blank stays blank: warn only when the part is finished.
        min: String(min).trim() === "" ? null : Number(min) || LOW_STOCK_THRESHOLD,
        location: location.trim(),
        supplier: supplier.trim(),
        notes: notes.trim(),
        images,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Admin · editing"
        title="Edit Part"
        right={
          <button onClick={onCancel} className="flex items-center gap-1 text-[#2563EB] font-semibold text-sm rounded-md px-2 py-1 hover:bg-[#EEF2F6]">
            <ArrowLeft size={16} /> Back to list
          </button>
        }
      />

      <div className="text-xs text-[#5A6472] mb-3 bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
        Code: <span className="font-mono text-[#2563EB]">{item.code}</span>
        <span className="mx-2">·</span>
        In stock: <span className="font-semibold text-[#1B2430]">{item.qty}</span>
        <span className="text-[#5A6472]"> (change via Add Stock / Sell)</span>
      </div>

      <Field label="Category / section">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls}>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Vehicle brand">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} list="edit-brand-list" className={inputCls} />
            <datalist id="edit-brand-list">{BRANDS.map((b) => <option key={b.name} value={b.name} />)}</datalist>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Model">
            <input value={model} onChange={(e) => setModel(e.target.value)} list="edit-model-list" className={inputCls} />
            <datalist id="edit-model-list">{brandModels.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Series (optional)"><input value={series} onChange={(e) => setSeries(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex-1">
          <Field label="Year from"><input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex-1">
          <Field label="Year to"><input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} className={inputCls} /></Field>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Condition">
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Side">
            <select value={side} onChange={(e) => setSide(e.target.value)} className={inputCls}>
              {sidesFor(cat, side).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Color"><input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} /></Field>
        </div>
      </div>

      <Field label="Display name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Price (KES)"><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex-1">
          <Field label="Low-stock at" hint="Blank means warn when it's finished.">
            <input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} placeholder="when finished" className={inputCls} />
          </Field>
        </div>
      </div>

      <div ref={infoRef} className={focusInfo ? "scroll-mt-20 rounded-lg ring-2 ring-[#B45309] ring-offset-2 p-3 -m-1 mb-2" : ""}>
        {focusInfo && (
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#B45309] mb-2">
            Extra information
          </div>
        )}
        <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A / Rack 03 / Shelf 02 / Bin 05" className={inputCls} /></Field>
        <Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>

      <Field label="Photos (up to 4 — helps staff identify the part)">
        <label className="flex items-center gap-2 cursor-pointer bg-[#FFFFFF] border border-dashed border-[#DEE3E9] rounded-md px-3 py-3 text-[#5A6472] hover:border-[#2563EB]">
          <ImagePlus size={16} /> <span className="text-sm">{images.length ? "Add / change photos" : "Take or upload photos"}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {images.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt="" className="w-16 h-16 object-cover rounded border border-[#DEE3E9]" />
                <button
                  type="button"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-[#DC3B2E] text-white rounded-full w-5 h-5 flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>
      </div>

      {err && (
        <div className="text-[#DC3B2E] text-sm mb-3 flex items-center gap-1.5">
          <AlertTriangle size={14} /> {err}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 border border-[#DEE3E9] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#5A6472]">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-60"
        >
          <Check size={18} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/* ======================= SELL ======================= */
export function SellTab({ items, categories, onSell, onAddStock, initialCode = "" }) {
  const [query, setQuery] = useState("");
  // A part long-pressed in Search arrives already chosen.
  const [picked, setPicked] = useState(
    () => (initialCode ? items.find((i) => i.code === initialCode) || null : null)
  );
  /* Always the live row, not the copy taken when it was tapped. The count can
     change under us — another phone sells one, or the count is corrected right
     here — and a stale copy would price and cap the sale against a number that
     is no longer true. */
  const selected = useMemo(
    () => (picked ? items.find((i) => i.code === picked.code) || picked : null),
    [items, picked]
  );
  const setSelected = setPicked;
  /* Correcting a wrong count from this screen, without leaving the sale.
     A part the system says it holds none of but which is sitting on the shelf
     used to be a dead end here: the row greyed out with nothing to tap, so the
     sale went in the exercise book instead and the system fell further behind. */
  const [fixQty, setFixQty] = useState("");
  const [fixing, setFixing] = useState(false);
  const [qty, setQty] = useState("1");
  /* What it actually sold for, per piece. Parts get haggled over and sold at a
     discount or above the shelf price, and the sale was being recorded at the
     list price regardless — so the money in the drawer never matched the sales
     figure, and every profit number downstream was wrong. Blank means the
     shelf price, so the ordinary sale is still one less thing to type. */
  const [unitPrice, setUnitPrice] = useState("");
  const [buyer, setBuyer] = useState("");
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState("Paid");
  /* Which pot the money went into. The cash book keeps Cash, M-Pesa and Bank
     apart so the drawer can be counted against the Cash column — without this
     every sale would land in Cash and the count would never agree. */
  const [method, setMethod] = useState("Cash");
  const [deduct, setDeduct] = useState(true);        // true = sold from THIS branch (reduce stock)
  const [sourceBranch, setSourceBranch] = useState("");// where it came from when not deducting
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((i) => matchesQuery(i, categories.find((c) => c.key === i.cat), q)).slice(0, 8);
  }, [items, categories, query]);

  // When deducting from this branch we cap at our stock; when the goods come
  // from another branch there is no local cap.
  const cap = deduct ? (selected ? selected.qty : 0) : Infinity;
  const n = selected ? Math.max(1, Math.min(Number(qty) || 1, cap)) : 0;
  const listPrice = selected ? Number(selected.price) || 0 : 0;
  /* A typed 0 is honoured — a part genuinely given away free is a real thing
     and pretending it sold at list price would put money in the cash book that
     never arrived. Only a BLANK box falls back to the shelf price. */
  const typedPrice = unitPrice.trim() === "" ? null : Number(unitPrice);
  const effectivePrice = typedPrice !== null && isFinite(typedPrice) && typedPrice >= 0 ? typedPrice : listPrice;
  const total = selected ? n * effectivePrice : 0;
  const priceChanged = selected && effectivePrice !== listPrice;
  /* Nothing to deduct and nothing said about where it came from: the sale would
     record against stock that isn't there. Correcting the count or marking it as
     another branch's goods both clear it. */
  const blocked = Boolean(selected && deduct && selected.qty === 0);
  const reset = () => { setSelected(null); setQty("1"); setUnitPrice(""); setBuyer(""); setPhone(""); setQuery(""); setDeduct(true); setSourceBranch(""); setMethod("Cash"); };

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Record a sale" title="Sell Item" />
      {!selected ? (
        <>
          <Field label="Find the part sold">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Code, name, or vehicle…" className={inputCls} autoFocus />
          </Field>
          <div className="space-y-2">
            {/* A part showing none in stock is still tappable. It may be on the
                shelf with the count wrong, or it may be coming from another
                branch — both are real sales, and refusing the tap meant the only
                way to record either was on paper. What to do about the zero is
                asked on the next screen, where the part is in front of us. */}
            {matches.map((it) => (
              <button key={it.code} onClick={() => setSelected(it)} className="w-full text-left">
                <ItemCard item={it} categories={categories} />
                {it.qty === 0 && (
                  <div className="text-[11px] text-[#B45309] pl-1 pt-0.5">
                    System says none left — tap if you have it, or it came from another branch.
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <ItemCard item={selected} categories={categories} />
          </div>
          <Field label="Where do the goods come from?">
            <div className="flex gap-3">
              {[
                { on: true, title: "This branch", sub: "Deduct from our stock" },
                { on: false, title: "Another branch", sub: "Don't deduct here" },
              ].map((opt) => {
                const active = deduct === opt.on;
                return (
                  <button
                    key={String(opt.on)}
                    onClick={() => { setDeduct(opt.on); if (opt.on) setSourceBranch(""); }}
                    className={`flex-1 rounded-md py-2.5 px-2 text-sm border text-left ${
                      active ? "bg-[#2563EB18] border-[#2563EB] text-[#2563EB]" : "border-[#DEE3E9] text-[#5A6472]"
                    }`}
                  >
                    <div className="font-semibold">{opt.title}</div>
                    <div className="text-[11px] opacity-80">{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </Field>
          {!deduct && (
            <Field label="Which branch supplied it? (optional)">
              <input value={sourceBranch} onChange={(e) => setSourceBranch(e.target.value)} placeholder="e.g. Jaspare Auto Main" className={inputCls} />
            </Field>
          )}
          {/* The count says none, but the part is here. Put the real number in
              from this screen: sending the person to Add New Stock to fix it and
              back again to sell is two screens too many while a customer waits,
              and what happened instead was that the sale never got typed in. */}
          {selected.qty === 0 && deduct && (
            <div className="mb-4 rounded-md border border-[#D4A72C] bg-[#D4A72C14] p-3">
              <div className="text-[13px] font-semibold text-[#B45309] mb-1">
                The system says there are none of these left.
              </div>
              <div className="text-[12px] text-[#5A6472] mb-2">
                If it is on the shelf the count is wrong — type how many are actually
                there and it is corrected before the sale. If it came from another
                branch, choose <b>Another branch</b> above instead.
              </div>
              {onAddStock ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={fixQty}
                    onChange={(e) => setFixQty(e.target.value)}
                    placeholder="How many are on the shelf?"
                    className={inputCls + " flex-1"}
                  />
                  <button
                    onClick={async () => {
                      const n = Number(fixQty);
                      if (!(n > 0)) return;
                      setFixing(true);
                      try {
                        /* No optimistic bump: the count shown comes from `items`,
                           so it moves only when the write really landed. A save
                           that failed leaves the banner up, which is the truth. */
                        await onAddStock(selected.code, n);
                        setFixQty("");
                      } finally {
                        setFixing(false);
                      }
                    }}
                    disabled={fixing || !(Number(fixQty) > 0)}
                    className="px-4 rounded-md bg-[#B45309] text-[#F3F5F8] font-bold uppercase text-xs tracking-wide disabled:opacity-50"
                  >
                    {fixing ? "Saving…" : "Correct it"}
                  </button>
                </div>
              ) : (
                <div className="text-[12px] text-[#B45309]">
                  Ask someone who can add stock to correct the count, or record it as
                  supplied by another branch.
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label={deduct && selected.qty > 0 ? `Quantity sold (max ${selected.qty})` : "Quantity sold"}>
                <input type="number" min="1" max={deduct && selected.qty > 0 ? selected.qty : undefined} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field
                label="Price each (KES)"
                hint={
                  listPrice
                    ? `Shelf price is ${listPrice.toLocaleString()}. Change it if it sold for something else.`
                    : "This part has no price on the shelf — type what it sold for."
                }
              >
                <input
                  type="number"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder={listPrice ? String(listPrice) : "0"}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
          {/* A changed price is worth saying out loud: it is what goes on the
              receipt and into the cash book, and a mistyped figure here is a
              figure nobody can reconcile later. */}
          {priceChanged && (
            <div className="text-xs mb-4 -mt-2 flex items-start gap-1.5 text-[#B45309]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                Selling at{" "}
                <span className="font-semibold">KES {effectivePrice.toLocaleString()}</span> each
                {listPrice ? (
                  <>
                    {" "}instead of the shelf price of {listPrice.toLocaleString()} —{" "}
                    {effectivePrice < listPrice
                      ? `${(listPrice - effectivePrice).toLocaleString()} less`
                      : `${(effectivePrice - listPrice).toLocaleString()} more`}
                    . The shelf price itself is unchanged.
                  </>
                ) : "."}
              </span>
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Customer name">
                <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="e.g. James" className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Phone (optional)">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" className={inputCls} />
              </Field>
            </div>
          </div>
          <Field label="Payment status">
            <div className="flex gap-3">
              {PAYMENT.map((p) => {
                const active = payment === p;
                const paid = p === "Paid";
                return (
                  <button
                    key={p}
                    onClick={() => setPayment(p)}
                    className={`flex-1 rounded-md py-2.5 font-semibold text-sm border ${
                      active
                        ? paid
                          ? "bg-[#15926A22] border-[#15926A] text-[#15926A]"
                          : "bg-[#DC3B2E22] border-[#DC3B2E] text-[#DC3B2E]"
                        : "border-[#DEE3E9] text-[#5A6472]"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </Field>
          {/* Only asked when the money actually came in. A pending sale has
              nothing to put in a pot yet — it reaches the cash book on the day
              it is paid, not today. */}
          {payment === "Paid" && (
            <Field label="How did they pay?">
              <div className="flex gap-3">
                {["Cash", "M-PESA", "Bank"].map((m) => {
                  const active = method === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`flex-1 rounded-md py-2.5 font-semibold text-sm border ${
                        active
                          ? "bg-[#2563EB18] border-[#2563EB] text-[#2563EB]"
                          : "border-[#DEE3E9] text-[#5A6472]"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          <div className="text-sm text-[#5A6472] mb-3">
            Total:{" "}
            <span className="text-[#2563EB] font-bold">KES {total.toLocaleString()}</span>{" "}
            ({n} × {effectivePrice.toLocaleString()})
            {!deduct && (
              <div className="mt-1 text-[12px] text-[#B45309]">
                Stock here will NOT change — recorded as supplied by {sourceBranch || "another branch"}.
              </div>
            )}
            {blocked && (
              <div className="mt-1 text-[12px] text-[#B45309]">
                Correct the count above, or mark it as supplied by another branch, before confirming.
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 border border-[#DEE3E9] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#5A6472]"
            >
              Cancel
            </button>
            {/* Selling from a count of none would deduct nothing and leave the
                sale sitting against stock we never had. Either the count gets
                corrected above, or it is recorded as another branch's goods. */}
            <button
              onClick={() => {
                onSell({ code: selected.code, qty: n, buyer, phone, paid: payment === "Paid",
                         total, method, deduct, sourceBranch });
                reset();
              }}
              disabled={blocked}
              className="flex-1 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShoppingCart size={18} /> Confirm sale
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ======================= NOTIFICATIONS ======================= */
/* The part codes behind a bulk summary. Collapsed by default - the whole
   point of the summary is that the feed isn't a wall of codes - but one tap
   away, because "which parts exactly?" is a fair question. */
function BatchCodes({ codes }) {
  const [open, setOpen] = useState(false);
  if (!codes || codes.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-semibold text-[#2563EB] flex items-center gap-1"
      >
        {open ? "Hide the part codes" : `Show the ${codes.length} part codes`}
        <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {codes.map((c) => (
            <span key={c} className="font-mono text-[10px] bg-[#EEF2F6] border border-[#DEE3E9] rounded px-1.5 py-0.5 text-[#5A6472]">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, compact, onUndo }) {
  const typeMeta = {
    sale: { label: "Sold", cls: "bg-[#DC3B2E22] text-[#DC3B2E]" },
    stock: { label: "Stock added", cls: "bg-[#15926A22] text-[#15926A]" },
    new_item: { label: "New item", cls: "bg-[#2E86DE22] text-[#2E86DE]" },
    adjust: { label: "Adjusted", cls: "bg-[#2E86DE22] text-[#2E86DE]" },
    delete: { label: "Deleted", cls: "bg-[#6B748022] text-[#5A6472]" },
    login: { label: "Login", cls: "bg-[#7C5CD622] text-[#7C5CD6]" },
    return: { label: "Returned", cls: "bg-[#7C5CD622] text-[#7C5CD6]" },
  }[n.type] || { label: n.type, cls: "bg-[#6B748022] text-[#5A6472]" };

  // Login events have no part code/qty — render a simpler card.
  if (n.type === "login") {
    return (
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{n.name} signed in</span>
          <span className="text-[#5A6472] text-xs">{compact ? timeAgo(n.ts) : fmtDateTime(n.ts)}</span>
        </div>
        <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${typeMeta.cls}`}>
          {typeMeta.label}
        </span>
      </div>
    );
  }

  // One entry standing for a whole bulk action. Shown as a single line so
  // the feed stays readable, with the part codes a tap away.
  const batch = Number(n.batchCount) > 1;

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs sm:text-sm text-[#2563EB]">
          {batch ? (
            <span className="inline-flex items-center gap-1 font-sans font-bold">
              <Layers size={13} /> {n.batchCount} parts together
            </span>
          ) : (
            n.code
          )}
        </span>
        <span className="text-[#5A6472] text-xs">{compact ? timeAgo(n.ts) : fmtDateTime(n.ts)}</span>
      </div>
      <p className="text-sm mt-1">
        {n.name}
        {n.qty ? <span className="text-[#5A6472]"> {batch ? `· ${n.qty} units in total` : `× ${n.qty}`}</span> : null}
      </p>
      {batch && <BatchCodes codes={n.batchCodes} /> }
      {n.type === "sale" && (
        <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
          <span className="text-[#5A6472]">Customer: {n.buyer}</span>
          {n.phone ? <span className="text-[#5A6472]">· {n.phone}</span> : null}
          {n.total ? <span className="text-[#2563EB]">· KES {Number(n.total).toLocaleString()}</span> : null}
          <span className={`px-2 py-0.5 rounded font-semibold ${n.paid ? "bg-[#15926A22] text-[#15926A]" : "bg-[#DC3B2E22] text-[#DC3B2E]"}`}>
            {n.paid ? "Paid" : "Pending"}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${typeMeta.cls}`}>
          {typeMeta.label}
        </span>
        <span className="text-[#5A6472] text-xs">by {n.by}</span>
      </div>
      {n.remaining !== undefined && n.remaining !== null && (
        <div className="text-xs text-[#5A6472] mt-1">Remaining stock: {n.remaining}</div>
      )}

      {/* A part taken off the books - where it went, and who moved it. */}
      {n.type === "delete" && n.disposal && (
        <div className="mt-2 text-[11px] bg-[#EEF2F6] border border-[#DEE3E9] rounded px-2 py-1.5 text-[#5A6472] leading-relaxed">
          <span className="font-bold uppercase tracking-wide text-[#1B2430]">
            {api.disposalLabel(n.disposal)}
          </span>
          {n.takenBy ? <span> — {n.takenBy}</span> : null}
          {n.logistics ? (
            <div>
              Carried by <span className="text-[#1B2430] font-semibold">{n.logistics}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* A sale that was brought back. The sale itself stays on record. */}
      {n.returnedAt && (
        <div className="mt-2 text-[11px] font-semibold text-[#7C5CD6] bg-[#7C5CD611] border border-[#7C5CD644] rounded px-2 py-1">
          Returned {fmtDateTime(n.returnedAt)}
          {n.returnedBy ? ` by ${n.returnedBy}` : ""} — back in stock
        </div>
      )}

      {/* Undo: the part came back, so put it back. Admin-only, and only
          for a sale that hasn't already been undone. */}
      {onUndo && n.type === "sale" && !n.returnedAt && (
        <button
          onClick={() => onUndo(n)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 border border-[#DEE3E9] rounded-md py-2 text-[11px] font-bold uppercase tracking-wide text-[#5A6472] hover:border-[#7C5CD6] hover:text-[#7C5CD6]"
        >
          <RotateCcw size={13} /> Undo — item was returned
        </button>
      )}
    </div>
  );
}

/* ======================= WHO DID WHAT =======================
   One person at a time: every sale, new item, edit, deletion and
   restock they've made. Admin-only — this is the accountability
   trail the head office reads. */

/* Ask before undoing, and let the admin say why. */
function UndoSaleSheet({ sale, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await onConfirm({ reason: reason.trim(), restock });
      onClose();
    } catch (e) {
      setErr(e.message || "Couldn't undo that sale.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1 text-[#1B2430] font-bold">
          <RotateCcw size={17} className="text-[#7C5CD6]" /> Undo this sale
        </div>
        <p className="text-[#5A6472] text-xs leading-relaxed mb-4">
          The part goes back into stock today. The original sale of{" "}
          <span className="font-semibold text-[#1B2430]">{fmtDateTime(sale.ts)}</span>{" "}
          stays on record, marked as returned — nothing is erased.
        </p>

        <div className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3 mb-4 text-sm">
          <div className="font-mono text-xs text-[#2563EB]">{sale.code}</div>
          <div className="font-semibold">{sale.name} <span className="text-[#5A6472]">× {sale.qty}</span></div>
          {sale.buyer && <div className="text-xs text-[#5A6472] mt-0.5">Customer: {sale.buyer}</div>}
          <div className="text-xs text-[#5A6472]">Sold by {sale.by || sale.by_name}</div>
        </div>

        <Field label="Why is it coming back? (optional)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong part, customer returned it"
            className={inputCls}
            autoFocus
          />
        </Field>

        <button
          onClick={() => setRestock((v) => !v)}
          className="flex items-start gap-2 text-left w-full mb-4"
        >
          {restock ? <CheckSquare size={17} className="text-[#2563EB] mt-0.5 shrink-0" /> : <Square size={17} className="text-[#5A6472] mt-0.5 shrink-0" />}
          <span className="text-xs text-[#5A6472] leading-relaxed">
            <span className="font-semibold text-[#1B2430]">Put it back into our stock.</span>{" "}
            Untick only if the part was supplied by another branch, so it was
            never counted here in the first place.
          </span>
        </button>

        {err && (
          <div className="text-[#DC3B2E] text-sm mb-3 flex items-start gap-1.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {err}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-[#DEE3E9] rounded-md py-2.5 text-sm font-semibold text-[#5A6472]">
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy}
            className="flex-1 bg-[#7C5CD6] text-white rounded-md py-2.5 text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            Undo
          </button>
        </div>
      </div>
    </div>
  );
}

/* Everything one person has done. */
function PersonActivity({ person, onBack, onChanged }) {
  const [rows, setRows] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [undoing, setUndoing] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [acts, sls] = await Promise.all([
        api.fetchActivityBy(person),
        api.fetchSalesBy(person),
      ]);
      setRows(acts);
      setSales(sls);
    } catch (e) {
      setErr(e.message || "Couldn't load that person's activity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [person]);

  /* Match a notification to its sale row so Undo knows which sale to
     reverse. Same part, within two minutes — they're written together. */
  const saleFor = (n) =>
    sales.find(
      (s) => s.code === n.code && !s.returned_at && Math.abs(new Date(s.ts).getTime() - n.ts) < 120000
    ) || null;

  const doUndo = async ({ reason, restock }) => {
    const sale = undoing;
    await api.undoSale(sale.id, person, reason, restock);
    await load();
    onChanged?.();
  };

  /* Counts PARTS, not feed entries: one bulk summary stands for its whole
     batch, so twenty parts added together must still report as twenty. */
  const counts = useMemo(() => {
    const c = { sale: 0, new_item: 0, adjust: 0, delete: 0, stock: 0, return: 0 };
    for (const r of rows) if (c[r.type] !== undefined) c[r.type] += api.notifWeight(r);
    return c;
  }, [rows]);

  const revenue = useMemo(
    () => sales.filter((s) => !s.returned_at).reduce((t, s) => t + Number(s.total || 0), 0),
    [sales]
  );

  const filtered = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  const chips = [
    ["all", `All (${rows.reduce((s, r) => s + api.notifWeight(r), 0)})`],
    ["sale", `Sales (${counts.sale})`],
    ["new_item", `Items added (${counts.new_item})`],
    ["adjust", `Changes (${counts.adjust})`],
    ["delete", `Deleted (${counts.delete})`],
    ["stock", `Restocks (${counts.stock})`],
    ["return", `Returns (${counts.return})`],
  ];

  return (
    <div className="bp-fade-up">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[#2563EB] text-sm font-semibold mb-3">
        <ArrowLeft size={15} /> Back to everyone
      </button>

      <SectionTitle eyebrow="Everything this person has done" title={person} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={ShoppingCart} label="Sales" value={counts.sale} tone="green" />
        <StatCard icon={DollarSign} label="Revenue" value={`KES ${revenue.toLocaleString()}`} tone="gold" />
        <StatCard icon={Plus} label="Items Added" value={counts.new_item} tone="blue" />
        <StatCard icon={Trash2} label="Items Deleted" value={counts.delete} tone="red" />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {chips.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap border ${
              filter === k ? "bg-[#2563EB] text-[#F3F5F8] border-[#2563EB]" : "border-[#DEE3E9] text-[#5A6472]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-[#5A6472] text-sm py-8 text-center">Loading…</div>}
      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-3">{err}</div>
      )}
      {!loading && !err && filtered.length === 0 && (
        <div className="text-[#5A6472] text-sm py-8 text-center italic">Nothing recorded here.</div>
      )}

      <div className="space-y-2">
        {filtered.map((n) => {
          const sale = n.type === "sale" && !n.returnedAt ? saleFor(n) : null;
          return (
            <NotifRow
              key={n.id}
              n={n}
              onUndo={sale ? () => setUndoing({ ...sale, by: person }) : undefined}
            />
          );
        })}
      </div>

      {undoing && (
        <UndoSaleSheet
          sale={{ ...undoing, ts: new Date(undoing.ts).getTime() }}
          onClose={() => setUndoing(null)}
          onConfirm={doUndo}
        />
      )}
    </div>
  );
}

/* The list of people. Tap one to see everything they've done. */
export function StaffActivityTab({ onChanged }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      setPeople(await api.fetchStaffActivity());
    } catch (e) {
      setErr(
        /function|does not exist|schema/i.test(e.message || "")
          ? "Run supabase/undo_and_activity.sql in the Supabase SQL editor to switch this on."
          : e.message || "Couldn't load the activity summary."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (picked) {
    return (
      <PersonActivity
        person={picked}
        onBack={() => { setPicked(null); load(); }}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Admin only" title="Who Did What" />

      {loading && <div className="text-[#5A6472] text-sm py-8 text-center">Loading…</div>}
      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-3">{err}</div>
      )}
      {!loading && !err && people.length === 0 && (
        <div className="text-[#5A6472] text-sm py-8 text-center italic">
          Nobody has recorded any activity yet.
        </div>
      )}

      <div className="space-y-2">
        {people.map((p) => {
          let hue = 0;
          for (const ch of p.person || "") hue = (hue * 31 + ch.charCodeAt(0)) % 360;
          return (
            <button
              key={p.person}
              onClick={() => setPicked(p.person)}
              className="w-full text-left bg-white border border-[#DEE3E9] rounded-lg p-3.5 hover:border-[#2563EB] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
                >
                  {(p.person || "?").charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#1B2430] truncate">{p.person}</div>
                  <div className="text-[11px] text-[#5A6472]">
                    Last active {p.last_seen ? timeAgo(new Date(p.last_seen).getTime()) : "—"}
                  </div>
                </div>
                <ChevronRight size={17} className="text-[#5A6472] shrink-0" />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                <MiniStat label="Sales" value={p.sales} />
                <MiniStat label="Revenue" value={`KES ${Number(p.revenue || 0).toLocaleString()}`} />
                <MiniStat label="Added" value={p.items_added} />
                <MiniStat label="Changed" value={p.items_edited} />
                <MiniStat label="Deleted" value={p.items_deleted} tone={Number(p.items_deleted) > 0 ? "red" : undefined} />
              </div>
              {Number(p.returns) > 0 && (
                <div className="text-[11px] text-[#7C5CD6] font-semibold mt-2">
                  {p.returns} {Number(p.returns) === 1 ? "return" : "returns"} undone
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div className="bg-[#EEF2F6] rounded-md px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-wide text-[#5A6472]">{label}</div>
      <div className={`text-sm font-bold truncate ${tone === "red" ? "text-[#DC3B2E]" : "text-[#1B2430]"}`}>
        {value ?? 0}
      </div>
    </div>
  );
}

export function NotifyTab({ notifications, admin = false, onChanged }) {
  // "everyone" = the running feed; "people" = one person at a time.
  const [view, setView] = useState("everyone");
  const [filter, setFilter] = useState("all");
  /* The feed is the shop's day in one long list, and by afternoon it is too
     long to read. A search box and a row of names turn it into "what happened
     to that Harrier bumper" and "what did James and Mary do today" without
     anybody scrolling past two hundred rows to find out. Empty = everybody. */
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const tabs = [
    ["all", "All"],
    ["sale", "Sales"],
    ["stock", "Restocks"],
    ["new_item", "New items"],
    ["return", "Returns"],
  ];

  /* Names taken from the whole feed, not the filtered one, so ticking a name
     never removes the others from the row — a filter you can't undo without
     remembering what was there is a trap. */
  const peoplePills = useMemo(() => {
    const map = {};
    for (const n of notifications) {
      const who = n.by || "Unknown";
      map[who] = (map[who] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([person, count]) => ({ key: person, label: person, count }));
  }, [notifications]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notifications.filter((n) => {
      if (filter !== "all" && n.type !== filter) return false;
      if (people.length && !people.includes(n.by || "Unknown")) return false;
      if (!q) return true;
      // Everything written on the row, so one box finds a code, a part name, a
      // customer or a phone number without knowing which field it lives in.
      return [n.code, n.name, n.by, n.buyer, n.phone, n.takenBy, n.logistics]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [notifications, filter, people, query]);

  const filtering = Boolean(query.trim() || people.length || filter !== "all");

  if (view === "people") {
    return (
      <div className="bp-fade-up">
        <button
          onClick={() => setView("everyone")}
          className="flex items-center gap-1.5 text-[#2563EB] text-sm font-semibold mb-3"
        >
          <ArrowLeft size={15} /> Back to all activity
        </button>
        <StaffActivityTab onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Sent to Jaspare Auto · Main Shop" title="Notifications" />

      {/* Drill into one person's record. Admin-only. */}
      {admin && (
        <button
          onClick={() => setView("people")}
          className="w-full flex items-center gap-3 bg-white border border-[#DEE3E9] rounded-lg p-3.5 mb-4 hover:border-[#2563EB] transition-colors text-left"
        >
          <span className="w-9 h-9 rounded-md bg-[#7C5CD622] text-[#7C5CD6] flex items-center justify-center shrink-0">
            <UserCheck size={17} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm text-[#1B2430]">Who did what</span>
            <span className="block text-[11px] text-[#5A6472]">
              Pick a person to see their sales, items and changes
            </span>
          </span>
          <ChevronRight size={17} className="text-[#5A6472] shrink-0" />
        </button>
      )}

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search the feed — part, code, customer, phone…"
        />
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-1.5">What happened</div>
            <Pills options={tabs.map(([k, label]) => ({ key: k, label }))} value={filter} onChange={setFilter} size="xs" />
          </div>
          {peoplePills.length > 1 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-1.5">
                Who — tick as many as you like
              </div>
              <Pills options={peoplePills} value={people} onChange={setPeople} multi size="xs" />
            </div>
          )}
        </div>
        {filtering && (
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap border-t border-[#DEE3E9] pt-3">
            <span className="text-[11px] text-[#5A6472]">
              Showing <span className="font-bold text-[#1B2430]">{filtered.length}</span> of{" "}
              {notifications.length}
            </span>
            <button
              onClick={() => { setQuery(""); setPeople([]); setFilter("all"); }}
              className="text-[11px] font-bold uppercase tracking-wide text-[#DC3B2E]"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
      {filtered.length === 0 && (
        <div className="text-[#5A6472] text-sm py-8 text-center">
          {filtering ? "Nothing matches these filters." : "No activity recorded yet."}
        </div>
      )}
      <div className="space-y-2">
        {filtered.map((n) => (
          <NotifRow key={n.id} n={n} />
        ))}
      </div>
    </div>
  );
}

/* ======================= REPORTS ======================= */
export function ReportsTab({
  items, notifications, categories, admin = false, onChanged, onNav,
  salesRegister = [], registerReady = false, initialTarget = null,
}) {
  /* The assistant can send somebody here already pointed at the window it just
     answered about — "generate a report for last month" arrives as
     {range:"lastMonth"}, "sales on 18 august" as a custom range, "who owes us"
     as {pay:"pending"}. Read once, into the initial state, so the screen opens
     showing the right figures instead of flashing today's and then changing. */
  const [range, setRange] = useState(initialTarget?.range || "today");
  const [custom, setCustom] = useState({
    from: initialTarget?.from || "",
    to: initialTarget?.to || "",
  });
  // Drill-down: the individual sales behind the totals.
  const [showSales, setShowSales] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const [byPerson, setByPerson] = useState(null);
  /* Filters over the sales in the chosen period. The totals above follow them,
     which is the point: "what did James and Mary sell this week" and "what is
     still unpaid" were questions the screen couldn't answer, so people added the
     figures up on paper from the feed and got them wrong. Empty = everybody. */
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState(initialTarget?.people || []);
  const [payFilter, setPayFilter] = useState(initialTarget?.pay || "all");

  /* One instant for the whole screen, so the totals, the trend and the printed
     page are all measured against the same moment — recomputing per useMemo can
     straddle midnight and make them disagree with each other.

     Keyed on the date rather than held forever: a phone left open on this screen
     overnight would otherwise still call yesterday "Today". */
  const dayStamp = new Date().toDateString();
  const now = useMemo(() => new Date(), [dayStamp]);
  const period = useMemo(() => rpt.periodRange(range, now, custom), [range, now, custom]);
  const prevPeriod = useMemo(() => rpt.previousRange(range, period, now), [range, period, now]);

  /* The money comes from the sales register, not the activity feed.

     The feed is capped at 200 rows so it loads fast. That's right for "what
     happened today" and quietly wrong for "what did we take this year": past a
     couple of weeks of trading, a month and a year read the same figures off
     the same handful of days, with nothing on screen to say so. The register is
     the full record. If it can't be read we fall back to the feed and say so,
     rather than showing a screen of zeros as though nothing had been sold. */
  const source = registerReady ? salesRegister : notifications.filter((n) => n.type === "sale");
  const inWindow = (list, w) => list.filter((s) => s.ts >= w.from && s.ts < w.to && !s.returnedAt);
  const allSales = useMemo(() => inWindow(source, period), [source, period]);
  const prevSales = useMemo(() => inWindow(source, prevPeriod), [source, prevPeriod]);

  /* Who sold anything in this period, for the pills. Built from the unfiltered
     list so picking one person never makes the others disappear from the row -
     a filter you can't undo without knowing what was there is a trap. */
  const peoplePills = useMemo(() => {
    const map = {};
    for (const n of allSales) {
      const who = n.by || "Unknown";
      map[who] = (map[who] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([person, count]) => ({ key: person, label: person, count }));
  }, [allSales]);

  /* The same filter applied to both windows, so a comparison of "James this
     month vs James last month" compares like with like. Comparing a filtered
     figure against an unfiltered one would read as a collapse in sales. */
  const applyFilters = (list) => {
    const q = query.trim().toLowerCase();
    return list.filter((n) => {
      if (people.length && !people.includes(n.by || "Unknown")) return false;
      if (payFilter === "paid" && !n.paid) return false;
      if (payFilter === "pending" && n.paid) return false;
      if (!q) return true;
      /* Everything written on the sale, so one box answers "that Harrier
         bumper", "James", "0722…" and a part code without the person having to
         know which field the word lives in. */
      return [n.code, n.name, n.by, n.buyer, n.phone]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  };
  const sales = useMemo(() => applyFilters(allSales), [allSales, query, people, payFilter]);
  const before = useMemo(() => applyFilters(prevSales), [prevSales, query, people, payFilter]);

  const filtering = Boolean(query.trim() || people.length || payFilter !== "all");
  const t = useMemo(() => rpt.totals(sales), [sales]);
  const tBefore = useMemo(() => rpt.totals(before), [before]);
  const { units: unitsSold, revenue, paidRevenue, pending } = t;

  /* What the shop earned, by the owner's own rule — three times the VAT inside
     a sale. Revenue on its own gets read as earnings, which is how a good month
     of turnover turns into a bad month of profit without anyone noticing. Same
     arithmetic the financial statements use, so the two screens agree, and
     labelled an estimate everywhere because the shop doesn't record what it
     paid for each part. */
  const profit = useMemo(() => estimatedProfit(revenue), [revenue]);
  const profitBefore = useMemo(() => estimatedProfit(tBefore.revenue), [tBefore.revenue]);

  const topSelling = useMemo(() => rpt.topSelling(sales, items), [sales, items]);
  const sections = useMemo(() => rpt.bySection(sales, categories), [sales, categories]);
  const grain = rpt.trendGrain(period);
  const trendPoints = useMemo(() => rpt.trend(sales, period, grain), [sales, period, grain]);
  // The day that carried the period, and how many days did nothing at all.
  const best = useMemo(
    () => trendPoints.reduce((b, p) => (b && b.value >= p.value ? b : p), null),
    [trendPoints]
  );
  const quietDays = useMemo(() => trendPoints.filter((p) => p.value === 0).length, [trendPoints]);

  /* Stock counts, deliberately NOT touched by the sales filters above: "how
     many bumpers are on the shelf" doesn't change because you asked what James
     sold. */
  const lowStock = items.filter(isLowStock);
  const outOfStock = lowStock.filter((i) => Number(i.qty) === 0).length;
  const inventoryValue = items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);

  // Who sold what, over the chosen range.
  const sellers = useMemo(() => rpt.sellers(sales), [sales]);

  /* Stock taken off the books in this period, grouped by where it went.
     This is the answer to "the part is gone, who has it?" - and it is the
     one report the head office asks for when a count comes up short.

     This one does read the feed: removals are only ever written there. It is
     capped at 200 rows, so on a long period it can be short — the panel says
     so rather than letting a quiet gap read as "nothing went missing". */
  const removed = useMemo(
    () => notifications.filter((n) => n.type === "delete" && n.ts >= period.from && n.ts < period.to),
    [notifications, period]
  );
  const removedGroups = useMemo(() => {
    const map = {};
    for (const n of removed) {
      const key = n.disposal || "unrecorded";
      map[key] = map[key] || { key, rows: [], units: 0, parts: 0 };
      map[key].rows.push(n);
      map[key].units += Number(n.qty || 0);
      // A bulk removal is one row but several parts - count the parts.
      map[key].parts += api.notifWeight(n);
    }
    return Object.values(map).sort((a, b) => b.parts - a.parts);
  }, [removed]);

  /* Real calendar periods. "Monthly" used to mean the last rolling 30 days,
     which on the 20th covered half of one month and half of another — a figure
     the owner could not check against the books, so it never got used. */
  const ranges = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "week7", label: "Last 7 days" },
    { key: "month", label: "This month" },
    { key: "lastMonth", label: "Last month" },
    { key: "year", label: "This year" },
    { key: "custom", label: "Pick dates" },
  ];
  const rangeLabel = period.label;
  // ISO yyyy-mm-dd for the date inputs' max, so nobody reports on next week.
  const todayISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);

  /* The sales report on paper, exactly as filtered on screen. The filters are
     printed in the header on purpose: a page of figures with no statement of
     what it covers gets filed, found next month, and read as the whole month's
     takings. */
  const printSales = () => {
    const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
    const who = people.length ? people.join(", ") : "Everybody";
    const pay = payFilter === "paid" ? "Paid only" : payFilter === "pending" ? "Pending only" : "Paid and pending";
    const rows = sales
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .map(
        (n, idx) => `<tr>
          <td class="c">${idx + 1}</td>
          <td>${escapeHtml(fmtDateTime(n.ts))}</td>
          <td class="mono">${escapeHtml(n.code || "")}</td>
          <td>${escapeHtml(n.name || "")}</td>
          <td class="c">${Number(n.qty || 0)}</td>
          <td>${escapeHtml(n.buyer || "—")}</td>
          <td>${escapeHtml(n.phone || "")}</td>
          <td>${escapeHtml(n.by || "")}</td>
          <td class="r">${Number(n.total || 0).toLocaleString()}</td>
          <td class="c ${n.paid ? "ok" : "due"}">${n.paid ? "Paid" : "Pending"}</td>
        </tr>`
      )
      .join("");
    const perPerson = sellers
      .map(
        (s) => `<tr>
          <td>${escapeHtml(s.person)}</td>
          <td class="c">${s.count}</td>
          <td class="c">${s.units}</td>
          <td class="r">${s.revenue.toLocaleString()}</td>
          <td class="r ${s.pending ? "due" : ""}">${s.pending ? s.pending.toLocaleString() : "—"}</td>
        </tr>`
      )
      .join("");
    const perSection = sections
      .map(
        (s) => `<tr>
          <td>${escapeHtml(s.label)}</td>
          <td class="c">${s.count}</td>
          <td class="c">${s.units}</td>
          <td class="r">${s.revenue.toLocaleString()}</td>
          <td class="r">${revenue > 0 ? Math.round((s.revenue / revenue) * 100) : 0}%</td>
        </tr>`
      )
      .join("");
    // "vs the period before" in words, or nothing at all when there is nothing
    // to compare against — a printed "+100%" against a zero misleads.
    const vs = (nowV, beforeV) => {
      const c = rpt.change(nowV, beforeV);
      if (!c) return "";
      if (c.first) return ` <span class="up">(new)</span>`;
      const cls = c.pct >= 0 ? "up" : "down";
      return ` <span class="${cls}">(${c.pct >= 0 ? "+" : ""}${Math.round(c.pct)}% vs before)</span>`;
    };
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Sales Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#1B2430; margin:0; padding:28px; }
  .wrap { max-width: 980px; margin:0 auto; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #2563EB; padding-bottom:12px; margin-bottom:10px; }
  .brand { font-size:22px; font-weight:800; text-transform:uppercase; letter-spacing:1px; }
  .sub { color:#5A6472; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:700; }
  .doc { text-align:right; }
  .doc .t { font-size:16px; font-weight:800; color:#2563EB; text-transform:uppercase; letter-spacing:1px; }
  .doc .m { color:#5A6472; font-size:12px; margin-top:3px; }
  .scope { font-size:12px; color:#5A6472; margin-bottom:4px; }
  .scope b { color:#1B2430; }
  .tot { display:flex; gap:10px; margin:14px 0 4px; flex-wrap:wrap; }
  .tot div { border:1px solid #DEE3E9; border-radius:5px; padding:8px 12px; min-width:130px; }
  .tot .k { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#5A6472; font-weight:700; }
  .tot .v { font-size:15px; font-weight:800; margin-top:2px; }
  h3 { font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:20px 0 0; color:#5A6472; }
  table { width:100%; border-collapse:collapse; margin-top:6px; font-size:11.5px; }
  th { background:#EEF2F6; text-align:left; padding:6px 7px; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#5A6472; border-bottom:1px solid #DEE3E9; }
  td { padding:5px 7px; border-bottom:1px solid #EEF2F6; }
  th.c, td.c { text-align:center; } th.r, td.r { text-align:right; }
  td.mono { font-family: ui-monospace, monospace; color:#2563EB; white-space:nowrap; }
  td.ok { color:#15926A; font-weight:700; } td.due { color:#DC3B2E; font-weight:700; }
  .up { color:#15926A; font-size:10px; font-weight:700; } .down { color:#DC3B2E; font-size:10px; font-weight:700; }
  .note { font-size:10px; color:#5A6472; font-style:italic; margin-top:3px; }
  .cols { display:flex; gap:18px; align-items:flex-start; }
  .cols > div { flex:1; min-width:0; }
  tfoot td { font-weight:800; border-top:2px solid #1B2430; }
  .empty { color:#5A6472; padding:40px; text-align:center; }
  .foot { margin-top:24px; color:#5A6472; font-size:11px; border-top:1px solid #DEE3E9; padding-top:10px; }
  tr { break-inside: avoid; }
  @media print { body { padding:0; } .wrap { max-width:none; } th { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div><div class="sub">Jaspare Auto · Main Shop</div><div class="brand">Bypass Shop</div></div>
    <div class="doc"><div class="t">Sales Report</div><div class="m">${today}</div><div class="m">${sales.length} sale(s)</div></div>
  </div>
  <div class="scope">Period: <b>${escapeHtml(rangeLabel)}</b> · Sold by: <b>${escapeHtml(who)}</b> · <b>${escapeHtml(pay)}</b>${query.trim() ? ` · matching <b>“${escapeHtml(query.trim())}”</b>` : ""}</div>
  <div class="tot">
    <div><div class="k">Units sold</div><div class="v">${unitsSold}${vs(unitsSold, tBefore.units)}</div></div>
    <div><div class="k">Revenue</div><div class="v">KES ${revenue.toLocaleString()}${vs(revenue, tBefore.revenue)}</div></div>
    <div><div class="k">Paid</div><div class="v" style="color:#15926A">KES ${paidRevenue.toLocaleString()}</div></div>
    <div><div class="k">Pending</div><div class="v" style="color:#DC3B2E">KES ${pending.toLocaleString()}</div></div>
    ${admin ? `<div><div class="k">Profit (estimate)</div><div class="v">KES ${Math.round(profit).toLocaleString()}${vs(profit, profitBefore)}</div></div>` : ""}
  </div>
  <div class="note">“vs before” compares this period with the one of the same length immediately before it${admin ? `. Profit is an estimate — ${PROFIT_VAT_MULTIPLE}× the VAT inside a sale, the shop's own rule — because what each part cost is not recorded` : ""}.</div>
  <div class="cols">
    ${sellers.length > 1 ? `<div><h3>By person</h3><table><thead><tr><th>Person</th><th class="c">Sales</th><th class="c">Pcs</th><th class="r">Revenue</th><th class="r">Unpaid</th></tr></thead><tbody>${perPerson}</tbody></table></div>` : ""}
    ${sections.length > 1 ? `<div><h3>By section</h3><table><thead><tr><th>Section</th><th class="c">Sales</th><th class="c">Pcs</th><th class="r">Revenue</th><th class="r">Share</th></tr></thead><tbody>${perSection}</tbody></table></div>` : ""}
  </div>
  <h3>Every sale</h3>
  ${sales.length
      ? `<table><thead><tr>
      <th class="c">#</th><th>When</th><th>Code</th><th>Part</th><th class="c">Qty</th>
      <th>Customer</th><th>Phone</th><th>Sold by</th><th class="r">Total (KES)</th><th class="c">Status</th>
    </tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="8">Total</td><td class="r">${revenue.toLocaleString()}</td><td></td></tr></tfoot></table>`
      : `<div class="empty">No sales match this filter.</div>`}
  <div class="foot">Generated from Bypass Shop on ${today}. Pending totals are money not yet received. Undone sales are excluded — the goods came back.</div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to open the printable report."); return; }
    w.document.write(html);
    w.document.close();
  };

  // One person's full record, opened from the seller list.
  if (byPerson) {
    return (
      <PersonActivity person={byPerson} onBack={() => setByPerson(null)} onChanged={onChanged} />
    );
  }

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Business summary"
        title="Reports"
        right={
          <button
            onClick={printSales}
            disabled={sales.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#2563EB] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide disabled:opacity-50"
            title="Print this report exactly as filtered"
          >
            <Printer size={14} /> Print report
          </button>
        }
      />

      <div className="mb-3">
        <Pills options={ranges} value={range} onChange={setRange} />
        <div className="text-[11px] text-[#5A6472] mt-1.5">
          Showing <span className="font-semibold text-[#1B2430]">{period.label}</span>
        </div>
      </div>

      {/* Any two dates. The pills cover what gets asked for daily; this covers
          "the week of the Nakuru job" and the odd stretch the books need. */}
      {range === "custom" && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 mb-4 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-1">From</label>
            <input
              type="date"
              value={custom.from}
              max={todayISO}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className={inputCls + " w-auto"}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-1">To</label>
            <input
              type="date"
              value={custom.to}
              max={todayISO}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className={inputCls + " w-auto"}
            />
          </div>
          <span className="text-[11px] text-[#5A6472] pb-2.5">
            {custom.from
              ? "Both days are counted, start and end."
              : "Pick a start date. Leave the end blank for “up to today”."}
          </span>
        </div>
      )}

      {/* The register is where the money lives. If it can't be read, the screen
          says the figures are short rather than passing off ten days of feed as
          a year's trading. */}
      {!registerReady && (
        <div className="bg-[#FFF7E6] border border-[#E0A40055] rounded-lg p-3 mb-4 text-[11px] text-[#5A6472] leading-relaxed">
          <span className="font-bold uppercase tracking-wide text-[#1B2430]">Figures may be short.</span>{" "}
          The sales register could not be read, so these totals come from the activity feed, which
          only keeps the most recent 200 entries. Today and this week are right; a month or a year
          may be missing older sales.
        </div>
      )}

      {/* Filters. Everything below — the totals, the trend, the charts, the
          by-person list and the printed page — follows them, so the numbers
          always belong to what the pills say and never to a wider period. */}
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search sales — part, code, customer, phone, who sold it…"
        />
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-1.5">Money</div>
            <Pills
              options={[
                { key: "all", label: "All" },
                { key: "paid", label: "Paid" },
                { key: "pending", label: "Pending" },
              ]}
              value={payFilter}
              onChange={setPayFilter}
              size="xs"
            />
          </div>
          {peoplePills.length > 1 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-1.5">
                Sold by — tick as many as you like
              </div>
              <Pills options={peoplePills} value={people} onChange={setPeople} multi size="xs" />
            </div>
          )}
        </div>
        {filtering && (
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap border-t border-[#DEE3E9] pt-3">
            <span className="text-[11px] text-[#5A6472]">
              Showing <span className="font-bold text-[#1B2430]">{sales.length}</span> of {allSales.length} sale
              {allSales.length !== 1 ? "s" : ""} — every total below counts only these.
            </span>
            <button
              onClick={() => { setQuery(""); setPeople([]); setPayFilter("all"); }}
              className="text-[11px] font-bold uppercase tracking-wide text-[#DC3B2E]"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* The totals, each against the same-length period before it. A figure on
          its own says nothing — "KES 84,000" is only good or bad next to last
          week — and it was the one thing the owner had to work out on paper. */}
      <div className={`grid grid-cols-2 gap-3 mb-4 ${admin ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatCard icon={ShoppingCart} label="Units Sold" value={unitsSold} tone="green"
          sub={<Delta now={unitsSold} before={tBefore.units} />} />
        <StatCard icon={DollarSign} label="Revenue" value={`KES ${revenue.toLocaleString()}`} tone="gold"
          sub={<Delta now={revenue} before={tBefore.revenue} />} />
        <StatCard icon={Check} label="Paid" value={`KES ${paidRevenue.toLocaleString()}`} tone="green"
          sub={<Delta now={paidRevenue} before={tBefore.paidRevenue} />} />
        <StatCard icon={AlertTriangle} label="Pending" value={`KES ${pending.toLocaleString()}`} tone="red"
          sub={
            pending > 0
              ? `${sales.filter((s) => !s.paid).length} unpaid sale${sales.filter((s) => !s.paid).length !== 1 ? "s" : ""}`
              : "Everything collected"
          } />
        {/* Admin only, to match the financial statements: turnover is everyone's
            business, what the shop earns is the owner's. */}
        {admin && (
          <StatCard icon={TrendingUp} label="Profit (est.)" value={`KES ${Math.round(profit).toLocaleString()}`} tone="purple"
            sub={<Delta now={profit} before={profitBefore} />} />
        )}
      </div>
      {admin && (
        <p className="text-[11px] text-[#5A6472] -mt-2 mb-4">
          Profit is an <span className="font-semibold text-[#1B2430]">estimate</span> — {PROFIT_VAT_MULTIPLE}× the
          VAT inside a sale, the shop's own rule — because what each part cost is not recorded. Same
          figure the financial statements use.
        </p>
      )}

      {/* Which days carried the period. A flat total hides that Tuesday was
          dead and Saturday was everything. */}
      {trendPoints.length > 1 && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="text-sm font-bold uppercase tracking-wide">
              Sales {grain === "month" ? "by month" : "by day"}
            </div>
            <span className="text-[11px] text-[#5A6472]">
              {best && best.value > 0 ? (
                <>Best: <span className="font-semibold text-[#1B2430]">{rpt.fmtDay(best.ts)}</span> — {best.value} pcs</>
              ) : null}
            </span>
          </div>
          <TrendChart points={trendPoints} />
          {quietDays > 0 && (
            <div className="text-[11px] text-[#5A6472] mt-1">
              {quietDays} {grain === "month" ? "month" : "day"}{quietDays !== 1 ? "s" : ""} with no sales at all.
            </div>
          )}
        </div>
      )}

      {/* The individual sales behind those totals. */}
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <button
          onClick={() => setShowSales((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Receipt size={15} className="text-[#2563EB]" /> Individual Sales ({sales.length})
          </div>
          <ChevronRight
            size={16}
            className={`text-[#5A6472] shrink-0 transition-transform ${showSales ? "rotate-90" : ""}`}
          />
        </button>

        {!showSales && (
          <div className="text-[11px] text-[#5A6472] mt-2">
            Tap to see every sale in this period, one by one.
          </div>
        )}

        {showSales && (
          <div className="mt-3">
            {sales.length === 0 ? (
              <div className="text-[#5A6472] text-sm italic">
                {filtering
                  ? "No sales match these filters. Clear them above to see the whole period."
                  : "No sales in this period."}
              </div>
            ) : (
              <>
                {/* Who sold what. Admins can tap through to a person. */}
                {sellers.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-2">
                      By person
                    </div>
                    <div className="space-y-1.5">
                      {sellers.map((s) => {
                        const inner = (
                          <>
                            <span className="flex-1 min-w-0 text-sm font-semibold text-[#1B2430] truncate">
                              {s.person}
                            </span>
                            <span className="text-xs text-[#5A6472] shrink-0">
                              {s.count} {s.count === 1 ? "sale" : "sales"} · {s.units} pcs
                            </span>
                            <span className="text-sm font-bold text-[#15926A] shrink-0">
                              KES {s.revenue.toLocaleString()}
                            </span>
                            {admin && <ChevronRight size={15} className="text-[#5A6472] shrink-0" />}
                          </>
                        );
                        return admin ? (
                          <button
                            key={s.person}
                            onClick={() => setByPerson(s.person)}
                            className="w-full flex items-center gap-2 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5 text-left hover:border-[#2563EB] transition-colors"
                          >
                            {inner}
                          </button>
                        ) : (
                          <div
                            key={s.person}
                            className="flex items-center gap-2 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5"
                          >
                            {inner}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] mb-2">
                  Every sale
                </div>
                <div className="space-y-2">
                  {sales.map((n) => (
                    <NotifRow key={n.id} n={n} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Stock that left the books — where it went and who took it. */}
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <button
          onClick={() => setShowGone((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Trash2 size={15} className="text-[#5A6472]" /> Where Stock Went (
            {removed.reduce((s, n) => s + api.notifWeight(n), 0)})
          </div>
          <ChevronRight
            size={16}
            className={`text-[#5A6472] shrink-0 transition-transform ${showGone ? "rotate-90" : ""}`}
          />
        </button>

        {!showGone && (
          <div className="text-[11px] text-[#5A6472] mt-2">
            Every part taken off the books in this period — sold, given on credit, moved to another
            shop — with who took it and who carried it.
          </div>
        )}

        {showGone && (
          <div className="mt-3">
            {removed.length === 0 ? (
              <div className="text-[#5A6472] text-sm italic">
                No stock was taken off the books in this period.
              </div>
            ) : (
              <div className="space-y-4">
                {removedGroups.map((g) => (
                  <div key={g.key}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472]">
                        {g.key === "unrecorded" ? "Not recorded" : api.disposalLabel(g.key)}
                      </span>
                      <span className="text-[11px] text-[#5A6472]">
                        {g.parts} part{g.parts !== 1 ? "s" : ""}
                        {g.units ? ` · ${g.units} pcs` : ""}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {g.rows.map((n) => (
                        <div
                          key={n.id}
                          className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-mono text-[#2563EB]">{n.code}</span>
                            <span className="text-[#5A6472]">{fmtDateTime(n.ts)}</span>
                          </div>
                          {n.name && <div className="text-[#1B2430] mt-0.5 truncate">{n.name}</div>}
                          {Number(n.batchCount) > 1 && <BatchCodes codes={n.batchCodes} />}
                          <div className="text-[#5A6472] mt-0.5 flex flex-wrap gap-x-3">
                            {n.takenBy ? (
                              <span>
                                Taken by <span className="text-[#1B2430] font-semibold">{n.takenBy}</span>
                              </span>
                            ) : null}
                            {n.logistics ? <span>Carried by {n.logistics}</span> : null}
                            <span>Removed by {n.by}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {removedGroups.some((g) => g.key === "unrecorded") && (
                  <div className="text-[11px] text-[#5A6472] italic">
                    “Not recorded” means the part was removed before the shop started asking where
                    stock goes. New removals always carry a reason.
                  </div>
                )}
                {/* Removals are only ever written to the activity feed, which
                    keeps the most recent 200 entries. On a long period this list
                    can be short, and a quiet gap must not read as "nothing went
                    missing". */}
                {notifications.length >= 200 && (grain === "month" || range === "month" || range === "lastMonth") && (
                  <div className="text-[11px] text-[#5A6472] italic">
                    This list comes from the activity feed, which keeps the most recent 200 entries —
                    over a long period, older removals may not appear.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Which sections earn. `categories` was already being passed into this
          screen and never used, so "do bumpers or lights make more money" — the
          question that decides what to buy next — had no answer anywhere.

          Read off the part code's own prefix, not the stock list, so a part that
          has since sold out and been removed still counts towards its section.
          That is exactly the part a report about the past is asking about. */}
      {sections.length > 1 && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">Where The Money Came From</div>
          <div className="space-y-2">
            {sections.map((s) => (
              <div key={s.key} className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm text-[#1B2430] flex-1 min-w-0 truncate">{s.label}</span>
                <span className="text-[11px] text-[#5A6472] shrink-0 tabular-nums">{s.units} pcs</span>
                <span className="text-sm font-bold text-[#1B2430] shrink-0 tabular-nums w-24 text-right">
                  {s.revenue.toLocaleString()}
                </span>
                <span className="text-[11px] text-[#5A6472] shrink-0 tabular-nums w-9 text-right">
                  {revenue > 0 ? Math.round((s.revenue / revenue) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[#5A6472] mt-2">
            Revenue in KES, and each section's share of the takings.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">Top Selling Parts</div>
          {/* Labelled with the part's name. These bars used to be captioned with
              the code — FBM-TOY-PRE-16-0042 — which nobody reads as a front
              bumper, so the one chart meant to say what is selling said nothing. */}
          {topSelling.length === 0 ? (
            <div className="text-[#5A6472] text-sm italic">No sales in this period.</div>
          ) : (
            <div className="space-y-2.5">
              {topSelling.map((p) => {
                const max = topSelling[0].units || 1;
                return (
                  <div key={p.code}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-[#1B2430] font-medium flex-1 min-w-0 truncate" title={p.label}>
                        {p.label}
                      </span>
                      <span className="text-xs font-bold text-[#1B2430] shrink-0 tabular-nums">{p.units} pcs</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-3 bg-[#EEF2F6] rounded overflow-hidden">
                        <div className="h-full rounded bg-[#2563EB]" style={{ width: `${(p.units / max) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-[#5A6472] shrink-0 tabular-nums">
                        KES {p.revenue.toLocaleString()}
                      </span>
                    </div>
                    {/* The code still earns its place — it's what you search by
                        to find the part on the shelf — just not as the label. */}
                    <div className="font-mono text-[10px] text-[#5A6472] truncate">{p.code}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">Inventory Summary</div>
          <div className="space-y-2 text-sm">
            {/* Named the way the dashboard names them — one part can be many
                pieces, and two figures that never match need to say why. */}
            <Row label="Different parts" value={items.length} />
            <Row label="Pieces on the shelf" value={items.reduce((s, i) => s + Number(i.qty), 0)} />
            <Row label="Inventory value" value={`KES ${inventoryValue.toLocaleString()}`} />
            <Row label="Finished or running low" value={lowStock.length} tone={lowStock.length ? "red" : undefined} />
          </div>
        </div>
      </div>

      {/* The reorder list itself lives on Low Stock Alert, not here. It was in
          both places, and the copy on this screen was the poorer one — no
          search, no sections, nothing to print — so whoever found it first went
          shopping off a list they couldn't narrow down. This says the number and
          points at the screen that can actually do something about it. */}
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-2 flex items-center gap-2">
          <AlertTriangle size={15} className="text-[#DC3B2E]" /> Low Stock
        </div>
        {lowStock.length === 0 ? (
          <div className="text-[#5A6472] text-sm italic">
            Nothing is finished, and nothing has reached a reorder level you set.
          </div>
        ) : (
          <>
            <p className="text-sm text-[#1B2430]">
              <span className="font-bold text-[#DC3B2E]">{outOfStock}</span> part
              {outOfStock !== 1 ? "s" : ""} finished
              {lowStock.length > outOfStock ? (
                <>
                  , <span className="font-bold text-[#DC3B2E]">{lowStock.length - outOfStock}</span>{" "}
                  at the reorder level set on {lowStock.length - outOfStock === 1 ? "it" : "them"}
                </>
              ) : null}
              .
            </p>
            <p className="text-[11px] text-[#5A6472] mt-1">
              The full reorder list — searchable, filtered by section, and printable to carry to the
              market — is on <span className="font-semibold text-[#1B2430]">Low Stock Alert</span>.
            </p>
            {onNav && (
              <button
                onClick={() => onNav("lowstock")}
                className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#DC3B2E] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide"
              >
                <AlertTriangle size={14} /> Open Low Stock Alert
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
/* "↑ 38% vs last month" under a total.

   Says nothing at all when there is nothing to compare against, rather than
   printing "+100%" against a period that had no sales — a percentage off a
   zero is arithmetic, not information, and the owner would act on it. */
function Delta({ now, before }) {
  const c = rpt.change(now, before);
  if (!c) return null;
  if (c.first) return <span className="text-[#15926A] font-semibold">first sales in this period</span>;
  const up = c.pct >= 0;
  return (
    <span className={up ? "text-[#15926A] font-semibold" : "text-[#DC3B2E] font-semibold"}>
      {up ? "↑" : "↓"} {Math.abs(Math.round(c.pct))}%{" "}
      <span className="text-[#5A6472] font-normal">vs before</span>
    </span>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#5A6472]">{label}</span>
      <span className={`font-semibold ${tone === "red" ? "text-[#DC3B2E]" : tone === "blue" ? "text-[#2563EB]" : "text-[#1B2430]"}`}>{value}</span>
    </div>
  );
}

/* ======================= SETTINGS ======================= */
/* Sister shops / suppliers. `wa` = full intl number, digits only (no + or leading 0),
   used for both tel: and wa.me links. `display` is what staff see. */
const SHOPS = [
  { name: "Jaspare Auto — Main Shop", tag: "Head office", location: "Main shop", wa: "254729695400", display: "0724 450 852 · +254 729 695 400" },
  { name: "Jeyden Auto Spares", tag: "Branch", location: "South B", wa: "254798718321", display: "+254 798 718 321" },
  { name: "Super Fix Auto", tag: "Partner", location: "", wa: "254780643828", display: "+254 780 643 828" },
];

/* Light or dark screen. The choice belongs to the device, not the account —
   the same person's phone can be dark while the shop counter laptop stays
   bright — so it's saved in this browser and takes effect immediately. */
const THEME_ICONS = { light: Sun, dark: Moon, system: Smartphone };

export function AppearanceCard() {
  const [choice, setChoice, mode] = useTheme();
  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="text-sm font-bold uppercase tracking-wide mb-1">Screen Look</div>
      <p className="text-xs text-[#5A6472] mb-3">
        Currently showing the <span className="font-semibold text-[#1B2430]">{mode === "dark" ? "dark" : "light"}</span> screen.
        This is saved on this device only.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {THEME_CHOICES.map((t) => {
          const Icon = THEME_ICONS[t.key];
          const on = choice === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setChoice(t.key)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${
                on
                  ? "border-[#2563EB] bg-[#2563EB22] text-[#2563EB]"
                  : "border-[#DEE3E9] text-[#5A6472] hover:border-[#2563EB]"
              }`}
            >
              <Icon size={20} />
              <span className="text-xs font-bold uppercase tracking-wide text-center leading-tight">{t.label}</span>
              {on && <Check size={13} />}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[#5A6472] mt-2.5">
        {THEME_CHOICES.find((t) => t.key === choice)?.hint}
      </p>
    </div>
  );
}

// Optional biometric app-lock. Auto-hides the enable button on devices with no
// biometric (e.g. desktop computers) — it's never compulsory.
function BiometricCard({ email }) {
  const [supported, setSupported] = useState(null); // null = still checking
  const [enabled, setEnabled] = useState(isLockEnabled());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { isBiometricSupported().then(setSupported); }, []);

  const turnOn = async () => {
    setMsg(""); setBusy(true);
    try {
      await enableLock(email || "staff");
      setEnabled(true);
      setMsg("Biometric unlock is on for this device.");
    } catch {
      setMsg("Couldn't set up biometric — you can try again anytime.");
    } finally { setBusy(false); }
  };
  const turnOff = () => {
    disableLock();
    setEnabled(false);
    setMsg("Biometric unlock turned off.");
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide mb-3">
        <Fingerprint size={16} className="text-[#2563EB]" /> Biometric Unlock
      </div>

      {supported === null && (
        <p className="text-xs text-[#5A6472]">Checking this device…</p>
      )}

      {supported === false && (
        <p className="text-xs text-[#5A6472] leading-relaxed">
          This device has no fingerprint or Face ID, so biometric unlock isn't available here.
          It's optional — set it up on a phone that supports it. You can still sign in normally.
        </p>
      )}

      {supported === true && (
        <>
          <p className="text-xs text-[#5A6472] leading-relaxed mb-3">
            Optional. When on, this device asks for your fingerprint / Face ID each time the app
            is opened. It only locks this device — everyone chooses their own.
          </p>
          {enabled ? (
            <button onClick={turnOff} className="w-full border border-[#DC3B2E] text-[#DC3B2E] font-semibold rounded-md py-2.5 text-sm">
              Turn off biometric unlock
            </button>
          ) : (
            <button onClick={turnOn} disabled={busy} className="w-full bg-[#2563EB] text-white font-semibold rounded-md py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              <Fingerprint size={16} /> {busy ? "Setting up…" : "Turn on biometric unlock"}
            </button>
          )}
          {msg && <p className="text-xs text-[#15926A] mt-2">{msg}</p>}
        </>
      )}
    </div>
  );
}

/* ======================= STAFF FEED (group chat + the assistant) =======================

   Two chats behind two pills, because they are the same act: you have a question
   and you type it. One is answered by whoever is holding a phone, the other by
   the system itself — and which of the two knows the answer isn't something you
   should have to decide before you start typing.

   Team is the default. The assistant is the newer thing, but the feed's own job
   is the reason somebody opens this screen, and an unread message from the shop
   floor must never be behind a tab.

   The assistant sits here rather than on the home screen because this is the
   screen for asking. The home screen is for reading figures. */
export function StaffFeedTab({
  userId,
  user,
  admin,
  /* Everything below this line belongs to the assistant pane, and is handed
      straight to CommandBox. salesReady matters: an unreadable sales register
      and an empty one look identical, and it must say it cannot see rather than
      answer "nothing sold today". */
  items = [],
  categories = [],
  sales = [],
  salesReady = true,
  canEdit = false,
  onChanged,
  onGo,
}) {
  const [pane, setPane] = useState("team"); // team | ask
  const [messages, setMessages] = useState(null); // null = loading
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const endRef = React.useRef(null);
  const scrollerRef = React.useRef(null);

  const load = async () => {
    try { setMessages(await api.fetchMessages()); setErr(""); }
    catch (e) { setErr(e.message || "Couldn't load the feed. Did you run supabase/chat.sql?"); setMessages([]); }
  };

  useEffect(() => {
    load();
    const ch = api.subscribeMessages ? api.subscribeMessages(load) : null;
    return () => { if (ch) ch(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest message in view as the feed grows.
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr("");
    try {
      await api.sendMessage({ userId, author: user, body });
      setText("");
      // Realtime will bring it in; reload as a fallback in case it's slow.
      load();
    } catch (e) { setErr(e.message || "Couldn't send. Try again."); }
    finally { setSending(false); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this message?")) return;
    try { await api.deleteMessage(id); load(); }
    catch (e) { setErr(e.message || "Couldn't delete."); }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Colour each author's avatar/name consistently from their name.
  const hue = (name) => {
    let h = 0;
    for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };
  const dayLabel = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    return same ? "Today" : d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
  };
  const clock = (ts) =>
    new Date(ts).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bp-fade-up flex flex-col" style={{ height: "calc(100vh - 8.5rem)" }}>
      <SectionTitle eyebrow="Everyone · Bypass Shop" title="Staff Feed" />

      {/* Two pills, not a menu. Which chat you are in has to be readable at a
          glance, and switching has to cost one tap — anything deeper and the
          assistant goes unused. */}
      <div className="flex gap-1.5 mb-3 shrink-0">
        {[
          { key: "team", label: "Team", icon: MessageCircle },
          { key: "ask", label: "Ask the system", icon: Wand2 },
        ].map((p) => (
          <button
            key={p.key}
            onClick={() => setPane(p.key)}
            className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide rounded-full px-3 py-1.5 active:scale-[0.98] ${
              pane === p.key
                ? "bg-[#2563EB] text-[#F3F5F8]"
                : "bg-[#F3F5F8] border border-[#DEE3E9] text-[#5A6472]"
            }`}
          >
            <p.icon size={13} /> {p.label}
          </button>
        ))}
      </div>

      {/* The feed's own error, which has nothing to do with the assistant — it
          would read as the assistant being broken if it stayed on screen while
          the other pane was open. */}
      {err && pane === "team" && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-3 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {pane === "ask" ? (
        <CommandBox
          fill
          items={items}
          categories={categories}
          sales={sales}
          salesReady={salesReady}
          user={user}
          admin={admin}
          canEdit={canEdit}
          onChanged={onChanged}
          onGo={onGo}
        />
      ) : (
      <>
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 space-y-3"
      >
        {messages === null ? (
          <div className="text-[#5A6472] text-sm">Loading feed…</div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[#5A6472] px-6">
            <MessageCircle size={30} className="text-[#2563EB] mb-2" />
            <div className="font-semibold text-[#1B2430]">No messages yet</div>
            <div className="text-xs mt-1">Say hello, ask a price, or share an enquiry with the team.</div>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.userId === userId;
            const showDay = i === 0 || dayLabel(m.ts) !== dayLabel(messages[i - 1].ts);
            const canDelete = mine || admin;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="text-center my-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#5A6472] bg-[#EEF2F6] rounded-full px-2.5 py-1">
                      {dayLabel(m.ts)}
                    </span>
                  </div>
                )}
                <div className={`flex items-start gap-2 group ${mine ? "flex-row-reverse" : ""}`}>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: `hsl(${hue(m.author)} 55% 45%)` }}
                    title={m.author}
                  >
                    {(m.author || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className={`max-w-[78%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
                    <div className={`text-[11px] text-[#5A6472] mb-0.5 ${mine ? "text-right" : ""}`}>
                      <span className="font-semibold text-[#1B2430]">{mine ? "You" : m.author}</span>
                      <span className="mx-1">·</span>{clock(m.ts)}
                    </div>
                    <div
                      className={`inline-block rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        mine
                          ? "bg-[#2563EB] text-white rounded-tr-sm"
                          : "bg-[#EEF2F6] text-[#1B2430] rounded-tl-sm"
                      }`}
                    >
                      {m.body}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => remove(m.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[#5A6472] hover:text-[#DC3B2E] mt-1 shrink-0"
                      title="Delete message"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Message the team…  (Enter to send)"
          className="flex-1 resize-none bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] max-h-32"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="flex items-center gap-1.5 bg-[#2563EB] text-white font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-50 shrink-0"
        >
          <Send size={16} /> {sending ? "…" : "Send"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}

/* Company phone directory — admin-typed, grouped by department, cloud-synced.
   Everyone can see and tap the numbers; only an admin can add or remove them. */
function StaffDirectoryCard({ admin }) {
  if (!admin) return null;
  return <StaffDirectoryCardInner admin={admin} />;
}

function StaffDirectoryCardInner({ admin }) {
  const [contacts, setContacts] = useState(null); // null = loading
  const [showAdd, setShowAdd] = useState(false);
  const [dept, setDept] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    try { setContacts(await api.fetchStaffContacts()); setErr(""); }
    catch (e) { setErr(e.message || "Couldn't load the directory. Did you run supabase/staff_directory.sql?"); setContacts([]); }
  };
  useEffect(() => {
    // The directory is admin-only, so don't fetch it for regular staff.
    if (!admin) { setContacts([]); return; }
    load();
    const unsub = api.subscribeStaffContacts ? api.subscribeStaffContacts(load) : null;
    return () => { if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  const add = async () => {
    if (!name.trim() || !phone.trim()) { setErr("Enter at least a name and a phone number."); return; }
    setBusy(true); setErr("");
    try {
      await api.addStaffContact({ dept, name, role, phone });
      setDept(""); setName(""); setRole(""); setPhone(""); setShowAdd(false);
      load();
    } catch (e) { setErr(e.message || "Couldn't save. Only an admin can add contacts."); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm("Remove this contact from the directory?")) return;
    try { await api.deleteStaffContact(id); load(); }
    catch (e) { setErr(e.message || "Couldn't remove."); }
  };

  // Group the flat list by department for display.
  const groups = useMemo(() => {
    const m = {};
    for (const c of contacts || []) (m[c.dept] = m[c.dept] || []).push(c);
    return Object.entries(m); // [ [dept, contacts[]], ... ]
  }, [contacts]);

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold uppercase tracking-wide">Staff Directory</div>
        {admin && (
          <button
            onClick={() => { setShowAdd((v) => !v); setErr(""); }}
            className="flex items-center gap-1 text-xs font-semibold text-[#2563EB] bg-[#2563EB22] rounded-md px-2.5 py-1.5 hover:bg-[#2563EB] hover:text-white transition-colors"
          >
            <Plus size={14} /> {showAdd ? "Close" : "Add contact"}
          </button>
        )}
      </div>

      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-2.5 text-xs mb-3 flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {admin && showAdd && (
        <div className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3 mb-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className={inputCls} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Store Supervisor)" className={inputCls} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone * (e.g. 0712 345 678)" className={inputCls} />
          <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Department (e.g. Store) — defaults to General" className={inputCls} />
          <button
            onClick={add}
            disabled={busy}
            className="w-full bg-[#2563EB] text-white font-semibold rounded-md py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Check size={15} /> {busy ? "Saving…" : "Add to directory"}
          </button>
        </div>
      )}

      {contacts === null ? (
        <div className="text-[#5A6472] text-sm">Loading directory…</div>
      ) : contacts.length === 0 ? (
        <div className="text-[#5A6472] text-sm italic">
          {admin ? "No contacts yet — tap “Add contact” to type in staff numbers." : "No contacts added yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([groupDept, people]) => (
            <div key={groupDept}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#2563EB] mb-2">{groupDept}</div>
              <div className="space-y-2">
                {people.map((p) => (
                  <div key={p.id} className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{p.name}</div>
                        {p.role && <div className="text-xs text-[#5A6472]">{p.role}</div>}
                      </div>
                      {admin && (
                        <button onClick={() => remove(p.id)} className="p-1.5 rounded text-[#5A6472] hover:text-[#DC3B2E]" title="Remove contact">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex-1 text-xs font-mono text-[#1B2430]">{p.phone}</span>
                      <a href={`tel:+${p.wa}`} className="p-1.5 rounded-md bg-[#2563EB22] text-[#2563EB] hover:bg-[#2563EB] hover:text-white transition-colors" title={`Call ${p.name}`}>
                        <Phone size={14} />
                      </a>
                      <a href={`https://wa.me/${p.wa}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md bg-[#15926A22] text-[#15926A] hover:bg-[#15926A] hover:text-white transition-colors" title={`WhatsApp ${p.name}`}>
                        <MessageCircle size={14} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   New-phone code — the switch, and the phones already trusted.

   A password on its own means anybody holding it can open the shop's stock and
   takings from any phone anywhere. Switched on, this asks for a 6-digit emailed
   code the first time an account is used on a phone it has not been used on
   before. Ten minutes, five wrong tries, and — chosen deliberately — no
   override, because an override is the first thing somebody who has taken a
   password goes looking for.

   That last part is why this screen is mostly a warning. On this shop, most
   accounts were created from a name, so their address was invented and has no
   inbox behind it: no code can ever arrive. Switching the policy on for
   everybody would lock those people out at the counter, permanently. So:

     - only an account whose address has PROVED it can receive a code is ever
       challenged. The rest carry on with a password, because the alternative is
       not "safer", it is "nobody gets in, ever";
     - the switch cannot be turned on until a code has actually been received on
       this phone and typed back. The database refuses otherwise, so a hopeful
       tap cannot lock the admin out of their own shop;
     - the numbers are on screen before the switch, not after.
--------------------------------------------------------- */
/* ---- SIGN IN WITH A CODE INSTEAD OF A PASSWORD ----

   Not a second lock on top of the password — a second door beside it. At the
   login screen, once an email is typed, "Email me a code" appears next to Log In,
   and a 6-digit code signs the person in with no password at all.

   Why it is worth having: the password is the part that actually goes missing.
   It gets forgotten over a weekend, written on a note by the till, or told to
   somebody who later leaves. A code lives for ten minutes in one inbox.

   Why it ships off: the button is a promise that an email will arrive. Until the
   shop has watched one arrive, that promise is a person standing at the counter
   tapping a button and getting nothing — so the switch is behind a real code
   landing on the admin's own address. */
function OtpLoginCard({ email, user, admin }) {
  const [on, setOn] = useState(null);      // null = still reading
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);    // {ok, text}
  const [testing, setTesting] = useState(false);
  const [code, setCode] = useState("");
  const [proved, setProved] = useState(false);

  const load = async () => setOn(await otpLoginAvailable());
  useEffect(() => { load(); }, []);

  const sendTest = async () => {
    setMsg(null);
    if (!String(email || "").includes("@") || /@bypassshop\.co$/i.test(String(email))) {
      setMsg({
        ok: false,
        text: "This account's address was invented from a name, so nothing can be sent to it. Sign in with a real email address to test this.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await startOtpLogin(email, user || "");
      if (res.setup) {
        /* The sender is not configured. Say what to do about it, because this is
           the one wall between the shop and having the feature at all. */
        setMsg({ ok: false, text: res.error || "Codes can't be emailed yet." });
        return;
      }
      setTesting(true);
      setCode("");
      setMsg({ ok: true, text: `Code sent to ${email}. It works for 10 minutes.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "The code could not be sent." });
    } finally {
      setBusy(false);
    }
  };

  /* Checked, not swapped for a session. The admin is already signed in — the only
     question being asked is whether the email arrived, and typing the code back
     is the answer. It also records the address as reachable, which is what the
     switch below is waiting for. */
  const confirmTest = async () => {
    setMsg(null);
    if (code.trim().length !== 6) { setMsg({ ok: false, text: "The code is 6 digits." }); return; }
    setBusy(true);
    try {
      const ok = await checkEmailCode(email, code);
      if (!ok) {
        setMsg({ ok: false, text: "That code is wrong or has expired. Send a new one." });
        return;
      }
      setTesting(false);
      setCode("");
      setProved(true);
      setMsg({ ok: true, text: "The email arrived and the code was right. You can switch this on." });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "The code could not be checked." });
    } finally {
      setBusy(false);
    }
  };

  const flip = async (next) => {
    setMsg(null);
    setBusy(true);
    try {
      await setOtpLogin(next, email, user || "");
      setMsg({
        ok: true,
        text: next
          ? "On. Anyone with a real email address can now sign in with a code instead of their password."
          : "Off. The login screen asks for a password only.",
      });
      await load();
    } catch (e) {
      // The database raises the real reason in words, and it is the useful part.
      setMsg({ ok: false, text: e.message || "The switch could not be changed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="text-sm font-bold uppercase tracking-wide mb-1 flex items-center gap-2">
        <Mail size={15} className="text-[#2563EB]" /> Log In With A Code
        <span
          className={`ml-auto text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
            on ? "bg-[#15926A22] text-[#15926A]" : "bg-[#EEF2F6] text-[#5A6472]"
          }`}
        >
          {on === null ? "…" : on ? "On" : "Off"}
        </span>
      </div>
      <p className="text-xs text-[#5A6472] mb-3 leading-relaxed">
        Switched on, the login screen offers a choice once an email is typed:
        use your password, or be emailed a 6-digit code that signs you in on its
        own. Everybody gets the choice, admin included. The code works once and
        dies after ten minutes.
      </p>

      {!admin ? (
        <p className="text-[11px] text-[#5A6472] leading-relaxed flex items-start gap-1.5">
          <Lock size={13} className="mt-0.5 shrink-0" />
          Only an admin can switch this on or off for the shop.
        </p>
      ) : (
        <div className="border-t border-[#DEE3E9] pt-3">
          {/* ---- prove an email actually arrives ---- */}
          {!testing ? (
            <button
              onClick={sendTest}
              disabled={busy}
              className="w-full border border-[#2563EB] text-[#2563EB] text-xs font-bold uppercase tracking-wide rounded-md py-2.5 mb-2 hover:bg-[#2563EB] hover:text-white transition-colors disabled:opacity-50"
            >
              {busy ? "Sending…" : proved || on ? "Send myself another test code" : "Send myself a test code"}
            </button>
          ) : (
            <div className="bg-[#F8FAFC] border border-[#DEE3E9] rounded-md p-3 mb-2">
              <Field label={`The 6 digits sent to ${email}`}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={inputCls + " text-center text-lg font-mono tracking-[0.4em]"}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setTesting(false); setCode(""); setMsg(null); }}
                  className="border border-[#DEE3E9] rounded-md py-2.5 text-xs font-bold uppercase tracking-wide text-[#5A6472]"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTest}
                  disabled={busy || code.length !== 6}
                  className="bg-[#2563EB] text-white rounded-md py-2.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                >
                  {busy ? "Checking…" : "Confirm"}
                </button>
              </div>
            </div>
          )}

          {msg && (
            <div className={`text-xs mb-2 flex items-start gap-1.5 leading-relaxed ${msg.ok ? "text-[#15926A]" : "text-[#DC3B2E]"}`}>
              {msg.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
              {msg.text}
            </div>
          )}

          <button
            onClick={() => flip(!on)}
            disabled={busy || on === null}
            className={`w-full text-white text-sm font-bold uppercase tracking-wide rounded-md py-2.5 disabled:opacity-50 ${
              on ? "bg-[#DC3B2E]" : "bg-[#15926A]"
            }`}
          >
            {on ? "Switch it off" : "Switch it on for the shop"}
          </button>

          {!on && (
            <p className="text-[11px] text-[#5A6472] mt-2 leading-relaxed flex items-start gap-1.5">
              <AlertTriangle size={13} className="text-[#B45309] mt-0.5 shrink-0" />
              Send yourself a test code first and type it back. Turning this on
              before an email has actually arrived puts a button on the login
              screen that does nothing — which is worse than not offering it,
              because the person tapping it thinks they are waiting.
            </p>
          )}

          {/* Unlike the new-phone code, this one is safe to switch on freely: it
              ADDS a way in. Nobody loses the password they already use, so
              nothing here can shut the counter. Worth saying, because the card
              above warns hard about exactly that. */}
          <p className="text-[11px] text-[#5A6472] mt-2 leading-relaxed">
            This never locks anybody out — the password keeps working either way.
            It only offers a second way in for whoever has a real email address.
          </p>
        </div>
      )}
    </div>
  );
}

function DeviceOtpCard({ email, user, admin }) {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);   // {ok, text}
  const [testing, setTesting] = useState(false);
  const [code, setCode] = useState("");
  const now = Date.now();

  const device = getDeviceId();
  /* A role login shares an address with everyone else using that role, and the
     address is invented. It can be proved and trusted like any other, but it is
     worth saying that the phone gets trusted for the role, not for the person. */
  const thisTrusted = devices.some((d) => d.device_id === device);

  const load = async () => {
    try {
      const [s, d] = await Promise.all([
        deviceOtpStatus().catch(() => null),
        myDevices().catch(() => []),
      ]);
      if (s) setStatus(s);
      setDevices(d || []);
    } catch {
      /* leave the card showing what it already had rather than blanking it */
    }
  };

  useEffect(() => { load(); }, []);

  /* Send a code to my own address and type it back. This is the only way the
     first address and the first phone get onto the lists, so it is the gate the
     switch sits behind. */
  const sendTest = async () => {
    setMsg(null);
    if (!String(email || "").includes("@")) {
      setMsg({ ok: false, text: "This account has no email address to send to." });
      return;
    }
    setBusy(true);
    try {
      const res = await sendLoginCode(email, user || "");
      if (res.setup) {
        setMsg({
          ok: false,
          text:
            (res.error || "Codes can't be emailed yet.") +
            " Until a code can actually arrive, leave this switched off — turning it on would lock the shop out.",
        });
        return;
      }
      setTesting(true);
      setCode("");
      setMsg({ ok: true, text: `Code sent to ${email}. It works for 10 minutes.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "The code could not be sent." });
    } finally {
      setBusy(false);
    }
  };

  const confirmTest = async () => {
    setMsg(null);
    if (code.trim().length !== 6) { setMsg({ ok: false, text: "The code is 6 digits." }); return; }
    setBusy(true);
    try {
      const ok = await verifyLoginCode(email, code, device, thisDeviceLabel());
      if (!ok) {
        setMsg({ ok: false, text: "That code is wrong or has expired. Send a new one." });
        return;
      }
      setTesting(false);
      setCode("");
      setMsg({
        ok: true,
        text: "Code received and this phone is now trusted. You can switch the policy on.",
      });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message || "The code could not be checked." });
    } finally {
      setBusy(false);
    }
  };

  const flip = async (on) => {
    setMsg(null);
    setBusy(true);
    try {
      await setDeviceOtp(on, email, device, user || "");
      setMsg({
        ok: true,
        text: on
          ? "On. An account whose address has been proved now needs a code on a phone it hasn't been used on."
          : "Off. A password alone opens the shop from any phone again.",
      });
      await load();
    } catch (e) {
      // The database raises the real reason, in words, and it matters — it is
      // the difference between "not set up yet" and "this would lock you out".
      setMsg({ ok: false, text: e.message || "The switch could not be changed." });
    } finally {
      setBusy(false);
    }
  };

  const drop = async (id) => {
    setBusy(true);
    try {
      await forgetDevice(id);
      await load();
      setMsg({
        ok: true,
        text: id === device
          ? "This phone was removed. You'll need a code the next time you sign in on it."
          : "That phone was removed. It needs a code next time.",
      });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "That phone could not be removed." });
    } finally {
      setBusy(false);
    }
  };

  const on = !!status?.enabled;
  const protectedCount = Number(status?.protected) || 0;
  const noInbox = Number(status?.no_inbox) || 0;
  const accounts = Number(status?.accounts) || 0;

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="text-sm font-bold uppercase tracking-wide mb-1 flex items-center gap-2">
        <Smartphone size={15} className="text-[#2563EB]" /> Code On A New Phone
        <span
          className={`ml-auto text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
            on ? "bg-[#15926A22] text-[#15926A]" : "bg-[#EEF2F6] text-[#5A6472]"
          }`}
        >
          {on ? "On" : "Off"}
        </span>
      </div>
      <p className="text-xs text-[#5A6472] mb-3 leading-relaxed">
        A password on its own opens this shop from any phone in the world. Switched
        on, the first use of an account on a phone it hasn&apos;t been used on needs a
        6-digit code emailed to that account. Ten minutes, five wrong tries, and
        no way past it.
      </p>

      {/* ---- the phones on my own account ---- */}
      <div className="mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#5A6472] mb-1.5">
          Phones this account is trusted on
        </div>
        {devices.length === 0 ? (
          <div className="text-xs text-[#5A6472] bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5 leading-relaxed">
            None yet. Nothing is wrong — no phone has ever needed a code, because
            the policy has never been on.
          </div>
        ) : (
          <div className="space-y-1.5">
            {devices.map((d) => (
              <div
                key={d.device_id}
                className="flex items-center gap-2.5 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5"
              >
                <Smartphone size={14} className="text-[#5A6472] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {d.label || "Unknown phone"}
                    {d.device_id === device && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase text-[#2563EB]">This one</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#5A6472]">
                    Last used {agoText(d.last_seen, now) || "—"}
                  </div>
                </div>
                <button
                  onClick={() => drop(d.device_id)}
                  disabled={busy}
                  className="text-[10px] font-bold uppercase text-[#DC3B2E] hover:underline shrink-0 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!admin ? (
        <p className="text-[11px] text-[#5A6472] leading-relaxed flex items-start gap-1.5">
          <Lock size={13} className="mt-0.5 shrink-0" />
          Only an admin can switch this on or off for the shop. You can still
          remove a phone above if one of them isn&apos;t yours any more.
        </p>
      ) : (
        <>
          {/* ---- the blast radius, before the switch and not after ---- */}
          <div className="border-t border-[#DEE3E9] pt-3">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { n: accounts, label: "Accounts", tone: "text-[#1B2430]" },
                { n: protectedCount, label: "Can get a code", tone: "text-[#15926A]" },
                { n: noInbox, label: "No inbox ever", tone: "text-[#B45309]" },
              ].map((b) => (
                <div key={b.label} className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2 text-center">
                  <div className={`text-lg font-extrabold leading-none ${b.tone}`}>{b.n}</div>
                  <div className="text-[10px] text-[#5A6472] mt-1 leading-tight">{b.label}</div>
                </div>
              ))}
            </div>

            {/* The thing an admin must read before touching the switch. It sits
                on this screen rather than in a manual nobody opens, because the
                consequence of getting it wrong is staff locked out mid-shift. */}
            {noInbox > 0 && (
              <div className="bg-[#FEF6E7] border border-[#E0A93B] rounded-md p-2.5 text-[11px] text-[#6B5417] leading-relaxed mb-3">
                <span className="font-bold">{noInbox} of {accounts} accounts can never receive a code.</span>{" "}
                They were created from a name, so the address on them
                (<span className="font-mono">…@bypassshop.co</span>) has no inbox
                behind it. Those accounts are left alone by this policy and keep
                working on a password — locking them out would not make the shop
                safer, it would just shut the counter. To bring one under the
                policy, that person signs in and proves a real email address.
              </div>
            )}

            {/* ---- prove a code actually arrives ---- */}
            {!testing ? (
              <button
                onClick={sendTest}
                disabled={busy}
                className="w-full border border-[#2563EB] text-[#2563EB] text-xs font-bold uppercase tracking-wide rounded-md py-2.5 mb-2 hover:bg-[#2563EB] hover:text-white transition-colors disabled:opacity-50"
              >
                {busy ? "Sending…" : thisTrusted ? "Send myself another test code" : "Send myself a test code"}
              </button>
            ) : (
              <div className="bg-[#F8FAFC] border border-[#DEE3E9] rounded-md p-3 mb-2">
                <Field label={`The 6 digits sent to ${email}`}>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={inputCls + " text-center text-lg font-mono tracking-[0.4em]"}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setTesting(false); setCode(""); setMsg(null); }}
                    className="border border-[#DEE3E9] rounded-md py-2.5 text-xs font-bold uppercase tracking-wide text-[#5A6472]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmTest}
                    disabled={busy || code.length !== 6}
                    className="bg-[#2563EB] text-white rounded-md py-2.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                  >
                    {busy ? "Checking…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}

            {msg && (
              <div className={`text-xs mb-2 flex items-start gap-1.5 leading-relaxed ${msg.ok ? "text-[#15926A]" : "text-[#DC3B2E]"}`}>
                {msg.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                {msg.text}
              </div>
            )}

            {/* ---- the switch ---- */}
            <button
              onClick={() => flip(!on)}
              disabled={busy || (!on && !thisTrusted)}
              className={`w-full text-white text-sm font-bold uppercase tracking-wide rounded-md py-2.5 disabled:opacity-50 ${
                on ? "bg-[#DC3B2E]" : "bg-[#15926A]"
              }`}
            >
              {on ? "Switch it off" : "Switch it on for the shop"}
            </button>

            {!on && !thisTrusted && (
              <p className="text-[11px] text-[#5A6472] mt-2 leading-relaxed flex items-start gap-1.5">
                <AlertTriangle size={13} className="text-[#B45309] mt-0.5 shrink-0" />
                Send yourself a test code first. Until a code has actually arrived
                on this phone, switching this on would lock you out of your own
                shop the moment you signed out — and there is nobody to let you
                back in.
              </p>
            )}
            {on && (
              <p className="text-[11px] text-[#5A6472] mt-2 leading-relaxed">
                Applies to the {protectedCount} account{protectedCount === 1 ? "" : "s"} that
                can receive a code. As more staff prove a real address, more of the
                shop is covered on its own — nothing has to be switched again.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* Role Passwords — the admin's control panel for the 4 shared logins.
   Each role starts on "<role>123"; the admin can set anything else here.
   The change runs on a throwaway Supabase client, so the admin stays
   signed in as themselves. */
function RolePasswordsCard({ admin }) {
  const [openKey, setOpenKey] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, text}

  if (!admin) return null;

  const open = (key) => {
    setOpenKey(openKey === key ? "" : key);
    setCurrent(""); setNext(""); setConfirm(""); setMsg(null);
  };

  const save = async (role) => {
    setMsg(null);
    if (!current) { setMsg({ ok: false, text: "Enter the current password for this role." }); return; }
    if (next.length < 6) { setMsg({ ok: false, text: "The new password must be at least 6 characters." }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: "The two new passwords don't match." }); return; }
    setBusy(true);
    try {
      await changeRolePassword(role, current, next);
      setMsg({ ok: true, text: `${role.label} password changed. Tell the team the new one.` });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Could not change the password." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="text-sm font-bold uppercase tracking-wide mb-1 flex items-center gap-2">
        <Lock size={15} className="text-[#2563EB]" /> Role Passwords
      </div>
      <p className="text-xs text-[#5A6472] mb-3 leading-relaxed">
        The four shared logins. Anyone who knows a role password can log in with
        it and then types their own name, so work is still stamped to the person.
        If someone forgets a password, reset it here.
      </p>

      <div className="space-y-2">
        {ROLE_ACCOUNTS.map((r) => {
          const isOpen = openKey === r.key;
          return (
            <div key={r.key} className="border border-[#DEE3E9] rounded-md overflow-hidden">
              <button
                onClick={() => open(r.key)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-[#EEF2F6] transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm">{r.label}</span>
                  <span className="block text-[11px] text-[#5A6472]">
                    Default: <span className="font-mono">{defaultRolePassword(r.key)}</span>
                  </span>
                </span>
                <ChevronRight size={16} className={`text-[#5A6472] shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-[#DEE3E9] p-3 bg-[#F8FAFC]">
                  <Field label={`Current ${r.label} password`}>
                    <input
                      type="password"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      placeholder={defaultRolePassword(r.key)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="New password (6+ characters)">
                    <input
                      type="password"
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Type the new password again">
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls}
                    />
                  </Field>

                  {msg && (
                    <div className={`text-xs mb-3 flex items-start gap-1.5 ${msg.ok ? "text-[#15926A]" : "text-[#DC3B2E]"}`}>
                      {msg.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                      {msg.text}
                    </div>
                  )}

                  <button
                    onClick={() => save(r)}
                    disabled={busy}
                    className="w-full text-white text-sm font-bold uppercase tracking-wide rounded-md py-2.5 disabled:opacity-50"
                    style={{ backgroundColor: r.color }}
                  >
                    {busy ? "Changing…" : `Change ${r.label} password`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[#5A6472] mt-3 flex items-start gap-1.5">
        <AlertTriangle size={13} className="text-[#B45309] mt-0.5 shrink-0" />
        A role password is shared by everyone using that role — change it whenever
        someone leaves the shop.
      </p>
    </div>
  );
}

/* ---- Categories, including the ones the shop adds itself ----
   The built-in thirteen never covered everything: boot lights, hinges, bulbs,
   headlight computers. A part with nowhere to go was getting filed under
   something it isn't, which then hid it from whoever went looking. */
function CategoriesCard({ categories, admin, user, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  // Whether the person has typed a code themselves. Until they do, it follows
  // the name they're typing — but it must stop the moment they take it over.
  const [keyEdited, setKeyEdited] = useState(false);
  const [shelf, setShelf] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const taken = categories.map((c) => c.key);
  const autoKey = suggestCategoryKey(label, taken);
  const finalKey = (keyEdited ? key : autoKey).toUpperCase();
  const clash = finalKey.length === 3 && taken.includes(finalKey);
  const nameClash = categories.some(
    (c) => c.label.trim().toLowerCase() === label.trim().toLowerCase()
  );

  const open = () => {
    setAdding(true);
    setLabel(""); setKey(""); setKeyEdited(false);
    setShelf(suggestShelf(categories));
    setColor(CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]);
    setErr(""); setOk("");
  };

  const save = async () => {
    if (!label.trim()) { setErr("Give the section a name."); return; }
    if (finalKey.length !== 3) { setErr("The code must be exactly 3 letters."); return; }
    if (clash) { setErr(`The code ${finalKey} is already used by another section.`); return; }
    setBusy(true); setErr("");
    try {
      await api.addPartCategory(
        { key: finalKey, label: label.trim(), shelf: shelf.trim(), color },
        user
      );
      setOk(`${label.trim()} added — parts filed here will be coded ${finalKey}-…`);
      setAdding(false);
      onChanged?.();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const custom = categories.filter((c) => c.custom);

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-sm font-bold uppercase tracking-wide">Categories</div>
        {admin && !adding && (
          <button
            onClick={open}
            className="text-xs font-bold uppercase tracking-wide text-[#2563EB] border border-[#DEE3E9] rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:border-[#2563EB]"
          >
            <Plus size={13} /> Add a category
          </button>
        )}
      </div>

      {ok && (
        <div className="text-xs bg-[#E6F6EF] border border-[#15926A] text-[#15926A] rounded-md p-2.5 mb-3 flex items-start gap-1.5">
          <Check size={13} className="mt-0.5 shrink-0" /> {ok}
        </div>
      )}

      {adding && (
        <div className="border border-[#DEE3E9] rounded-md p-3 mb-3 bg-[#EEF2F6]">
          <p className="text-xs text-[#5A6472] mb-3 leading-relaxed">
            Anything the shop stocks that doesn’t fit the sections above — boot lights,
            hinges, bulbs, headlight computers. It behaves like any other section
            afterwards: it shows up everywhere a category is chosen, and gets its own
            code prefix and shelf.
          </p>

          <Field label="What is it called?">
            <input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setErr(""); }}
              placeholder="Boot Lights"
              className={inputCls}
              autoFocus
            />
          </Field>
          {nameClash && (
            <p className="text-xs text-[#DC3B2E] -mt-2 mb-3">
              There is already a section called that.
            </p>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <Field
                label="Code prefix"
                hint="3 letters, stamped on every code this section issues. It cannot be changed later."
              >
                <input
                  value={keyEdited ? key : autoKey}
                  onChange={(e) => {
                    setKeyEdited(true);
                    setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3));
                    setErr("");
                  }}
                  placeholder="BTL"
                  maxLength={3}
                  className={inputCls + " font-mono uppercase"}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Shelf">
                <input value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="I-01" className={inputCls} />
              </Field>
            </div>
          </div>
          {clash && (
            <p className="text-xs text-[#DC3B2E] -mt-2 mb-3">
              {finalKey} is already used by{" "}
              {categories.find((c) => c.key === finalKey)?.label}.
            </p>
          )}

          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-md border-2 ${color === c ? "border-[#1B2430]" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  title={c}
                  aria-label={`Colour ${c}`}
                />
              ))}
            </div>
          </Field>

          {label.trim() && finalKey.length === 3 && (
            <div className="text-xs text-[#5A6472] mb-3">
              Codes will read{" "}
              <span className="font-mono text-[#2563EB]">{finalKey}-TOY-PRE-16-0042</span>
            </div>
          )}

          {err && (
            <div className="text-[#DC3B2E] text-xs mb-3 flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy || !label.trim() || finalKey.length !== 3 || clash}
              className="flex-1 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide text-xs rounded-md py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {busy ? "Saving…" : "Add the section"}
            </button>
            <button
              onClick={() => { setAdding(false); setErr(""); }}
              className="text-xs font-bold uppercase tracking-wide text-[#5A6472] border border-[#DEE3E9] rounded-md px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <span
            key={c.key}
            className="flex items-center gap-1.5 text-xs bg-[#EEF2F6] border border-[#DEE3E9] rounded px-2 py-1"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="font-mono">{c.key}</span> {c.label}
            {c.custom && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-[#15926A]">added</span>
            )}
          </span>
        ))}
      </div>

      <p className="text-[11px] text-[#5A6472] mt-3 leading-relaxed">
        {custom.length > 0 && (
          <>
            {custom.length} section{custom.length !== 1 ? "s" : ""} added by the shop.{" "}
          </>
        )}
        A section can’t be removed once parts are filed under it — their codes start with
        its prefix, so deleting it would leave real stock with no section to belong to.
        {!admin && " Only an admin can add one."}
      </p>
    </div>
  );
}

export function SettingsTab({ categories, user, email, admin, onCategoriesChanged }) {
  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="System" title="Settings" />

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">Signed-in Staff</div>
        <div className="space-y-2 text-sm">
          <Row label="Name" value={user} />
          <Row label="Account" value={email || "—"} />
          <Row label="Role" value={admin ? "Admin — full access" : "Staff — view, sell & quote"} tone={admin ? "blue" : undefined} />
        </div>
        <p className="text-xs text-[#5A6472] mt-2">
          {admin
            ? "You're an admin: you can add items, add stock, adjust and delete. Regular staff can view stock, sell, and make quotations only."
            : "You're signed in as staff: you can view stock, sell, and make quotations. Adding, editing or deleting stock is admin-only."}
        </p>
      </div>

      <AppearanceCard />

      <BiometricCard email={email} />

      <OtpLoginCard email={email} user={user} admin={admin} />

      <DeviceOtpCard email={email} user={user} admin={admin} />

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">Login Alerts</div>
        <p className="text-xs text-[#5A6472] leading-relaxed">
          Every login is recorded in <span className="font-semibold">Notifications</span> (who + time),
          and an email alert is sent to the owner at{" "}
          <span className="font-mono text-[#1B2430]">addamsjmk@gmail.com</span> the moment anyone signs in.
        </p>
      </div>

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">Shops &amp; Contacts</div>
        <div className="space-y-2">
          {SHOPS.map((s) => (
            <div key={s.name} className="flex items-center gap-3 bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{s.name}</div>
                <div className="text-xs text-[#5A6472] flex items-center gap-1.5 flex-wrap">
                  {s.tag && <span className="text-[10px] font-bold uppercase text-[#2563EB] bg-[#2563EB22] rounded px-1.5 py-0.5">{s.tag}</span>}
                  {s.location && <span>{s.location}</span>}
                </div>
                <div className="text-xs text-[#5A6472] mt-0.5 font-mono">{s.display}</div>
              </div>
              <a
                href={`tel:+${s.wa}`}
                className="p-2 rounded-md bg-[#2563EB22] text-[#2563EB] hover:bg-[#2563EB] hover:text-white transition-colors shrink-0"
                title={`Call ${s.name}`}
              >
                <Phone size={16} />
              </a>
              <a
                href={`https://wa.me/${s.wa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-md bg-[#15926A22] text-[#15926A] hover:bg-[#15926A] hover:text-white transition-colors shrink-0"
                title={`WhatsApp ${s.name}`}
              >
                <MessageCircle size={16} />
              </a>
            </div>
          ))}
        </div>
      </div>

      <RolePasswordsCard admin={admin} />

      <StaffDirectoryCard admin={admin} />

      <CategoriesCard
        categories={categories}
        admin={admin}
        user={user}
        onChanged={onCategoriesChanged}
      />

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">System Information &amp; Future Features</div>
        <div className="space-y-2 text-sm text-[#5A6472]">
          <Row label="System" value="Bypass Shop v2.0 (Cloud)" />
          <Row label="Developed by" value="Josphat Mbugua Kagiri" tone="blue" />
          <Row label="Reports to" value="Jaspare Auto · Main Shop" />
          <Row label="Storage" value="Supabase (cloud Postgres)" />
          <Row label="Sync" value="Realtime — instant across devices" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            "M-PESA integration",
            "Barcode / QR scanning",
            "Supplier management",
            "Customer database",
            "AI inventory predictions",
            "Purchase history",
          ].map((f) => (
            <div key={f} className="flex items-center justify-between text-xs bg-[#EEF2F6] border border-[#DEE3E9] rounded px-2.5 py-2">
              <span className="text-[#5A6472]">{f}</span>
              <span className="text-[10px] font-bold uppercase text-[#2563EB] bg-[#2563EB22] rounded px-1.5 py-0.5">Soon</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#5A6472] mt-3 flex items-start gap-1.5">
          <Check size={13} className="text-[#15926A] mt-0.5 shrink-0" />
          Authentication is now real: passwords are hashed by Supabase, sessions are server-issued,
          and every action is attributed to a signed-in account.
        </p>
      </div>
    </div>
  );
}

/* ======================= QUOTATION ======================= */
/* Staff type each line (part + qty + unit price they set manually); the
   system does the arithmetic — line totals, subtotal, discount and grand
   total — and can share the finished quote on WhatsApp or print it. */
export function QuotationTab({ items, user, initialCode = "", onMakeReceipt }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [discount, setDiscount] = useState("");
  // A part long-pressed in Search arrives as the first line, prefilled.
  const [lines, setLines] = useState(() => {
    const it = initialCode ? items.find((i) => i.code === initialCode) : null;
    if (!it) return [{ desc: "", qty: "1", price: "" }];
    return [{ desc: it.name || it.code, qty: "1", price: String(it.price || "") }];
  });
  const [savedNumber, setSavedNumber] = useState(""); // set after a successful save
  const [saving, setSaving] = useState(false);
  const [past, setPast] = useState([]);
  const [showPast, setShowPast] = useState(false);

  // Load saved quotes when the "Past quotes" panel is opened.
  useEffect(() => {
    if (!showPast) return;
    api.fetchQuotes().then(setPast).catch(() => setPast([]));
  }, [showPast]);

  const setLine = (idx, patch) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { desc: "", qty: "1", price: "" }]);
  const removeLine = (idx) => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));

  const lineTotal = (l) => (Number(l.qty) || 0) * (Number(l.price) || 0);
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const grand = subtotal - disc;

  const filledLines = lines.filter((l) => l.desc.trim() && lineTotal(l) > 0);

  const resetForm = () => {
    setCustomer(""); setPhone(""); setDiscount("");
    setLines([{ desc: "", qty: "1", price: "" }]);
  };

  const saveQuote = async () => {
    if (filledLines.length === 0 || saving) return;
    setSaving(true);
    try {
      const q = await api.saveQuote(
        { customer, phone, lines: filledLines, subtotal, discount: disc, total: grand, status: "Sent" },
        user
      );
      setSavedNumber(q.number);
      openPdf(q.number); // open the PDF straight away with the assigned number
      if (showPast) api.fetchQuotes().then(setPast).catch(() => {});
    } catch (e) {
      alert("Could not save quote: " + (e.message || e) + "\n(Did you run supabase/quotes.sql?)");
    } finally {
      setSaving(false);
    }
  };

  // Build a proper A4 quote document in a new window and open the print
  // dialog, where the user picks "Save as PDF" (built into every browser/phone).
  const openPdf = (number) => {
    const rows = filledLines
      .map(
        (l) => `<tr>
          <td>${escapeHtml(l.desc)}</td>
          <td class="c">${l.qty}</td>
          <td class="r">${Number(l.price).toLocaleString()}</td>
          <td class="r">${lineTotal(l).toLocaleString()}</td>
        </tr>`
      )
      .join("");
    const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Quotation ${number || ""}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#1B2430; margin:0; padding:32px; }
  .wrap { max-width: 720px; margin:0 auto; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #2563EB; padding-bottom:14px; }
  .brand { font-size:24px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#1B2430; }
  .sub { color:#5A6472; font-size:12px; letter-spacing:2px; text-transform:uppercase; font-weight:700; }
  .doc { text-align:right; }
  .doc .t { font-size:20px; font-weight:800; color:#2563EB; text-transform:uppercase; letter-spacing:2px; }
  .doc .m { color:#5A6472; font-size:13px; margin-top:4px; }
  .meta { display:flex; justify-content:space-between; margin:20px 0; font-size:14px; }
  .meta .lbl { color:#5A6472; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:14px; }
  th { background:#EEF2F6; text-align:left; padding:10px; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#5A6472; }
  th.c, td.c { text-align:center; } th.r, td.r { text-align:right; }
  td { padding:10px; border-bottom:1px solid #DEE3E9; }
  .totals { margin-top:16px; margin-left:auto; width:280px; font-size:14px; }
  .totals div { display:flex; justify-content:space-between; padding:6px 0; }
  .totals .grand { border-top:2px solid #1B2430; margin-top:6px; padding-top:10px; font-size:18px; font-weight:800; color:#2563EB; }
  .foot { margin-top:40px; color:#5A6472; font-size:12px; border-top:1px solid #DEE3E9; padding-top:12px; }
  .sign { margin-top:36px; display:flex; justify-content:space-between; font-size:13px; color:#5A6472; }
  .sign span { border-top:1px solid #1B2430; padding-top:6px; width:200px; text-align:center; }
  @media print { body { padding:0; } .wrap { max-width:none; } }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div>
      <div class="sub">Jaspare Auto · Main Shop</div>
      <div class="brand">Bypass Shop</div>
    </div>
    <div class="doc">
      <div class="t">Quotation</div>
      ${number ? `<div class="m">No. ${number}</div>` : ""}
      <div class="m">${today}</div>
    </div>
  </div>
  <div class="meta">
    <div><div class="lbl">Quotation for</div><div><b>${escapeHtml(customer) || "—"}</b></div>${phone ? `<div>${escapeHtml(phone)}</div>` : ""}</div>
  </div>
  <table>
    <thead><tr><th>Item / Description</th><th class="c">Qty</th><th class="r">Unit (KES)</th><th class="r">Amount (KES)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>KES ${subtotal.toLocaleString()}</span></div>
    ${disc ? `<div><span>Discount</span><span>- KES ${disc.toLocaleString()}</span></div>` : ""}
    <div class="grand"><span>Total</span><span>KES ${grand.toLocaleString()}</span></div>
  </div>
  <div class="sign"><span>Prepared by</span><span>Customer signature</span></div>
  <div class="foot">Prices valid for 14 days. Thank you for your business — Jaspare Auto · Main Shop.</div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to open the PDF."); return; }
    w.document.write(html);
    w.document.close();
  };

  const shareWhatsApp = () => {
    const rows = filledLines
      .map((l) => `• ${l.desc} — ${l.qty} × ${Number(l.price).toLocaleString()} = KES ${lineTotal(l).toLocaleString()}`)
      .join("\n");
    const msg =
      `*Bypass Shop — Quotation*${savedNumber ? ` (${savedNumber})` : ""}\nJaspare Auto · Main Shop\n\n` +
      (customer ? `Customer: ${customer}\n` : "") +
      `\n${rows}\n\nSubtotal: KES ${subtotal.toLocaleString()}` +
      (disc ? `\nDiscount: -KES ${disc.toLocaleString()}` : "") +
      `\n*Total: KES ${grand.toLocaleString()}*\n\n(A PDF copy can be sent too.)`;
    // Clean phone -> intl format for wa.me (drop 0/+, prepend 254 for local numbers).
    let p = phone.replace(/[^\d]/g, "");
    if (p.startsWith("0")) p = "254" + p.slice(1);
    const base = p ? `https://wa.me/${p}` : `https://wa.me/`;
    window.open(`${base}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Build a price quote — you set the prices"
        title="Quotation"
        right={
          <button
            onClick={() => setShowPast((v) => !v)}
            className="text-[#2563EB] text-xs font-semibold border border-[#DEE3E9] rounded-md px-3 py-1.5 hover:bg-[#EEF2F6] flex items-center gap-1.5"
          >
            <FileText size={13} /> {showPast ? "New quote" : "Past quotes"}
          </button>
        }
      />

      {showPast ? (
        <PastQuotes past={past} onMakeReceipt={onMakeReceipt} />
      ) : (
      <>
      {savedNumber && (
        <div className="bg-[#E6F6EF] border border-[#15926A] text-[#15926A] rounded-md p-3 mb-4 text-sm flex items-center gap-2">
          <Check size={15} /> Saved as <span className="font-bold font-mono">{savedNumber}</span>. Starting a fresh quote below.
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Customer name (optional)">
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. James / ABC Garage" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Phone (for WhatsApp)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="text-[#2563EB] text-[11px] font-bold tracking-[0.2em] uppercase mb-2">Items</div>

      <div className="space-y-2 mb-3">
        {lines.map((l, i) => (
          <div key={i} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
            <div className="flex items-center gap-2">
              <input
                value={l.desc}
                onChange={(e) => setLine(i, { desc: e.target.value })}
                list="quote-parts"
                placeholder="Part / description"
                className={inputCls + " flex-1"}
              />
              <button
                onClick={() => removeLine(i)}
                className="p-2 rounded text-[#5A6472] hover:text-[#DC3B2E] shrink-0"
                title="Remove line"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-20">
                <input
                  type="number" min="0" value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                  placeholder="Qty" className={inputCls + " text-center"}
                />
              </div>
              <span className="text-[#5A6472] text-sm">×</span>
              <div className="flex-1">
                <input
                  type="number" min="0" value={l.price}
                  onChange={(e) => setLine(i, { price: e.target.value })}
                  placeholder="Unit price (KES)" className={inputCls}
                />
              </div>
              <div className="w-28 text-right text-sm font-semibold text-[#1B2430] tabular-nums shrink-0">
                {lineTotal(l).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* datalist: quick-fill from existing inventory names */}
      <datalist id="quote-parts">
        {items.slice(0, 300).map((it) => (
          <option key={it.code} value={it.name || `${it.brand} ${it.model}`} />
        ))}
      </datalist>

      <button
        onClick={addLine}
        className="w-full border border-dashed border-[#2563EB] text-[#2563EB] rounded-md py-2.5 font-semibold text-sm flex items-center justify-center gap-2 mb-4 hover:bg-[#2563EB11]"
      >
        <Plus size={16} /> Add item
      </button>

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5A6472]">Subtotal</span>
          <span className="font-semibold tabular-nums">KES {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5A6472]">Discount (KES)</span>
          <input
            type="number" min="0" value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0" className={inputCls + " w-28 text-right py-1.5"}
          />
        </div>
        <div className="flex items-center justify-between border-t border-[#DEE3E9] pt-2">
          <span className="font-bold uppercase tracking-wide text-sm">Total</span>
          <span className="text-[#2563EB] font-extrabold text-xl tabular-nums">KES {grand.toLocaleString()}</span>
        </div>
      </div>

      <button
        onClick={saveQuote}
        disabled={filledLines.length === 0 || saving}
        className="w-full mt-4 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition-transform"
      >
        <FileText size={16} /> {saving ? "Saving…" : "Save quote (get number)"}
      </button>

      <div className="flex gap-3 mt-3">
        <button
          onClick={() => openPdf(savedNumber)}
          disabled={filledLines.length === 0}
          className="flex-1 border border-[#DEE3E9] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#5A6472] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileText size={16} /> PDF / Print
        </button>
        <button
          onClick={shareWhatsApp}
          disabled={filledLines.length === 0}
          className="flex-1 bg-[#15926A] text-white font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          <MessageCircle size={16} /> Send on WhatsApp
        </button>
      </div>
      </>
      )}
    </div>
  );
}

/* ======================= RECEIPT ======================= */
/* Create a proper receipt for a completed sale: shop header (branch + main
   shop contacts, email, location), line items, totals, amount paid and
   change. Save to get a number, then print/PDF or send on WhatsApp. */
export function ReceiptTab({ items, user, draft = null, onDraftUsed }) {
  /* A quotation the customer has come back to pay, or a batch of sales already
     recorded. Everything the document needs is in the draft, so this screen opens
     filled in rather than blank — see src/lib/receiptDraft.js. */
  const [customer, setCustomer] = useState(draft?.customer || "");
  const [phone, setPhone] = useState(draft?.phone || "");
  const [discount, setDiscount] = useState(draft?.discount || "");
  const [method, setMethod] = useState("Cash");
  const [paid, setPaid] = useState("");
  const [lines, setLines] = useState(
    draft?.lines?.length ? draft.lines : [{ desc: "", qty: "1", price: "" }]
  );
  /* Where the figures came from, kept so the saved receipt records it: the quote
     number goes on the row and the quote is stamped Converted, and the sale ids
     stop the same delivery being receipted twice. Held in state rather than read
     off the prop, because lines can be added by hand afterwards and the source is
     still where it started. */
  const [source, setSource] = useState(() =>
    draft ? { fromQuote: draft.fromQuote || null, fromSales: draft.fromSales || [] } : { fromQuote: null, fromSales: [] }
  );
  const [savedNumber, setSavedNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [past, setPast] = useState([]);
  const [showPast, setShowPast] = useState(false);
  /* The picker for sales already recorded. Sales are the shop's own record of
     what went out of the door — the part, how many, who bought it and what it
     came to — and the receipt was being typed by hand beside it. */
  const [showSales, setShowSales] = useState(false);
  const [recentSales, setRecentSales] = useState(null); // null = not loaded yet
  const [alreadyDone, setAlreadyDone] = useState(() => new Set());
  /* A batch this screen filled in by itself, kept so it can say so and be undone
     in one tap. Nothing is ever filled in silently. */
  const [autoFilled, setAutoFilled] = useState(null);
  const [autoTried, setAutoTried] = useState(false);
  /* Ticking parts inside one batch, for the half of a delivery being paid for
     now. Keyed by batch, so opening another does not carry the ticks over. */
  const [pickingIn, setPickingIn] = useState("");
  const [ticked, setTicked] = useState(() => new Set());
  /* Finding the quote a customer has walked back in with. Loaded when asked for,
     since most receipts are not from a quote. */
  const [showQuotes, setShowQuotes] = useState(false);
  const [quotes, setQuotes] = useState(null);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteReceipts, setQuoteReceipts] = useState(() => new Map());
  // VAT is optional (off by default). Two modes when on:
  //  - "inclusive": prices already include VAT -> back-calculate it out (total unchanged)
  //  - "exclusive": prices are pre-tax -> add VAT on top (total grows)
  const [vatOn, setVatOn] = useState(false);
  const [vatMode, setVatMode] = useState("inclusive"); // "inclusive" | "exclusive"
  const vatRate = SHOP_INFO.vatRate || 0.16;
  // What kind of document to print: a paid Receipt, an Invoice (request for
  // payment), or a Delivery Note (goods handed over, no money shown).
  const [docType, setDocType] = useState("Receipt"); // "Receipt" | "Invoice" | "Delivery Note"
  // Who the customer is — walk-in, referred by someone, or a commission job.
  const [customerType, setCustomerType] = useState("Walk-in"); // "Walk-in" | "Referred" | "Commission"

  useEffect(() => {
    if (!showPast) return;
    api.fetchReceipts().then(setPast).catch(() => setPast([]));
  }, [showPast]);

  /* Recent sales, and which of them are already on a receipt. Both are fetched
     together because offering a sale that was receipted this morning, and looking
     entirely correct doing it, is how a customer ends up with two receipts for
     one delivery. */
  useEffect(() => {
    if (recentSales) return;
    let alive = true;
    Promise.all([
      api.fetchSales(300).then((rows) => rows.map(api.rowToSale)),
      api.fetchReceipts(300).catch(() => []),
    ])
      .then(([sales, receipts]) => {
        if (!alive) return;
        setRecentSales(sales);
        setAlreadyDone(receiptedSaleIds(receipts));
        setQuoteReceipts(receiptsByQuote(receipts));
      })
      .catch(() => { if (alive) setRecentSales([]); });
    return () => { alive = false; };
  }, [recentSales]);

  /* The quotes, when somebody goes looking for one. */
  useEffect(() => {
    if (!showQuotes || quotes) return;
    let alive = true;
    api.fetchQuotes(200)
      .then((qs) => { if (alive) setQuotes(qs); })
      .catch(() => { if (alive) setQuotes([]); });
    return () => { alive = false; };
  }, [showQuotes, quotes]);

  /* Sales gathered into the receipts they would become — one per customer per
     day. `Date.now()` is read here, at the moment the list is built, rather than
     inside the pure grouping function. */
  const saleBatches = useMemo(
    () => (recentSales ? groupSalesForReceipt(recentSales, { days: 14, now: Date.now() }) : []),
    [recentSales]
  );
  /* Still to be receipted on top — that is the order somebody is working in. */
  const pickerBatches = useMemo(
    () => sortBatchesForPicker(saleBatches, alreadyDone),
    [saleBatches, alreadyDone]
  );
  /* The prices still to write. This is the work the shop said it would be doing
     by hand -- "yu will just write the prices" -- so the screen counts it and
     points at it instead of leaving somebody to scan the list for blanks. */
  const gaps = useMemo(() => priceGaps(lines), [lines]);
  /* What the shelf says, for a part that came off a sale with no money recorded
     against it. Only ever offered, never applied on its own: the shelf price is
     the asking price, and what a customer actually paid is a different fact. */
  const shelfPrices = useMemo(() => {
    const out = new Map();
    for (const g of gaps) {
      const p = suggestPrice(lines[g.index], items);
      if (p > 0) out.set(g.index, p);
    }
    return out;
  }, [gaps, lines, items]);
  const fillFromShelf = () =>
    setLines((ls) => ls.map((l, i) => (shelfPrices.has(i) ? { ...l, price: String(shelfPrices.get(i)) } : l)));

  /* The quotes matching what has been typed in the search box. */
  const quoteMatches = useMemo(() => findQuotes(quotes || [], quoteQuery), [quotes, quoteQuery]);
  const openBatches = useMemo(
    () => saleBatches.filter((b) => !b.sales.every((x) => alreadyDone.has(x.id))),
    [saleBatches, alreadyDone]
  );

  /* Nothing typed yet. Anything at all on the screen and this stops being an
     empty form somebody has just opened, and filling it in would be interfering
     with work in progress. */
  const untouched =
    !customer.trim() && !phone.trim() && !lines.some((l) => l.desc.trim() || Number(l.price) > 0);

  /* Pull a batch of sales in. It ADDS to whatever is on the screen rather than
     replacing it, so two customers' parts are never silently merged onto one
     receipt — but a blank first line is dropped, or every batch would arrive with
     an empty row above it. `only` narrows it to the parts ticked. */
  const pullBatch = (batch, only = null) => {
    const chosen = only ? batch.sales.filter((x) => only.has(x.id)) : batch.sales;
    const d = salesToDraft(chosen);
    if (!d) return;
    setLines((ls) => {
      const kept = ls.filter((l) => l.desc.trim() || Number(l.price) > 0);
      return [...kept, ...d.lines];
    });
    if (!customer && d.customer) setCustomer(d.customer);
    if (!phone && d.phone) setPhone(d.phone);
    setSource((sc) => ({ ...sc, fromSales: [...new Set([...(sc.fromSales || []), ...d.fromSales])] }));
    setShowSales(false);
    setPickingIn(""); setTicked(new Set());
  };

  /* Today's sales, already on the receipt, without anybody asking for them —
     which is what the shop actually wanted: "yu dont have to write the items
     again, they will already be there". It only happens when there is exactly one
     batch it could possibly mean (see autoFillBatch), the form is untouched, and
     the screen was not opened from a quotation. Otherwise the list is opened
     instead, so the parts are still one tap away rather than a guess. */
  useEffect(() => {
    if (draft || autoTried || !recentSales || savedNumber) return;
    if (!untouched) { setAutoTried(true); return; }
    setAutoTried(true);
    const b = autoFillBatch(saleBatches, alreadyDone, { now: Date.now() });
    if (b) { pullBatch(b); setAutoFilled(b); return; }
    if (openBatches.length) setShowSales(true);
  }, [draft, autoTried, recentSales, savedNumber, untouched, saleBatches, alreadyDone, openBatches]);

  /* "That is not the sale I am writing up." Everything the screen filled in goes,
     and it does not fill it in again. */
  const dismissAuto = () => {
    setLines([{ desc: "", qty: "1", price: "" }]);
    setCustomer(""); setPhone("");
    setSource({ fromQuote: null, fromSales: [] });
    setAutoFilled(null);
    setShowSales(true);
  };

  /* A quotation found from this screen. It REPLACES what is here, unlike a batch
     of sales: a quote is a whole agreed document, and half of one merged into
     something else is not what either side signed up to. */
  const pullQuote = (q) => {
    const d = quoteToDraft(q);
    if (!d) return;
    setCustomer(d.customer); setPhone(d.phone);
    setLines(d.lines.length ? d.lines : [{ desc: "", qty: "1", price: "" }]);
    setDiscount(d.discount);
    setSource({ fromQuote: d.fromQuote, fromSales: [] });
    setAutoFilled(null);
    setShowQuotes(false); setQuoteQuery("");
  };

  const setLine = (idx, patch) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { desc: "", qty: "1", price: "" }]);
  const removeLine = (idx) => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));

  const lineTotal = (l) => (Number(l.qty) || 0) * (Number(l.price) || 0);
  const gross = lines.reduce((s, l) => s + lineTotal(l), 0);
  const disc = Math.min(Number(discount) || 0, gross);
  const afterDisc = gross - disc;                     // price total after discount
  // VAT split depends on the mode:
  //  - inclusive: VAT sits inside afterDisc -> net = afterDisc / 1.16, grand unchanged
  //  - exclusive: VAT added on top -> net = afterDisc, grand = afterDisc + VAT
  let vat = 0, netAmount = afterDisc, grand = afterDisc;
  if (vatOn && vatMode === "inclusive") {
    vat = afterDisc - afterDisc / (1 + vatRate);
    netAmount = afterDisc - vat;
    grand = afterDisc;
  } else if (vatOn && vatMode === "exclusive") {
    netAmount = afterDisc;
    vat = afterDisc * vatRate;
    grand = afterDisc + vat;
  }
  const subtotal = gross;                             // pre-discount, kept for storage
  const paidNum = Number(paid) || 0;
  const change = paidNum > grand ? paidNum - grand : 0;
  const balance = grand > paidNum ? grand - paidNum : 0;

  // The system decides the payment stamp — staff don't type it.
  //  balance owing        -> ON CREDIT
  //  fully paid + discount -> DISCOUNTED
  //  fully paid, no disc   -> PAID
  const stamp = balance > 0 ? "ON CREDIT" : disc > 0 ? "DISCOUNTED" : "PAID";
  const stampColor = stamp === "PAID" ? "#15926A" : stamp === "DISCOUNTED" ? "#B45309" : "#DC3B2E";

  const filledLines = lines.filter((l) => l.desc.trim() && lineTotal(l) > 0);

  const resetForm = () => {
    setCustomer(""); setPhone(""); setDiscount(""); setPaid(""); setMethod("Cash");
    setLines([{ desc: "", qty: "1", price: "" }]);
    setDocType("Receipt"); setCustomerType("Walk-in");
    /* The source goes with the figures. A blank form that still remembers it came
       from QT-2026-0014 would stamp that quote Converted against a receipt for
       something else entirely. */
    setSource({ fromQuote: null, fromSales: [] });
    onDraftUsed?.();
  };

  const saveReceipt = async () => {
    if (filledLines.length === 0 || saving) return;
    setSaving(true);
    try {
      const rc = await api.saveReceipt(
        {
          customer, phone, lines: filledLines, subtotal, discount: disc,
          total: Math.round(grand), paid: paidNum, method,
          vat: vatOn ? Math.round(vat) : 0, vatRate: vatOn ? vatRate : 0,
          kraPin: vatOn ? SHOP_INFO.branch.kraPin : "",
          docType, stamp, customerType,
          /* Where this came from, on the row. See supabase/receipt_sources.sql. */
          fromQuote: source.fromQuote?.number || "",
          fromSales: source.fromSales || [],
        },
        user
      );
      setSavedNumber(rc.number);
      /* The quote is stamped Converted only now — after the receipt has actually
         saved. Doing it when the button was tapped would leave a quote marked
         Converted against a receipt that failed, and nobody would ever quote from
         it again. A failure here is not worth failing the receipt over: the money
         is recorded, and the quote's status is a label. */
      if (source.fromQuote?.id) {
        api.setQuoteStatus(source.fromQuote.id, "Converted").catch(() => {});
      }
      /* The draft has been used. Cleared so leaving and coming back to this screen
         doesn't fill it in again with a quote that has already been receipted. */
      onDraftUsed?.();
      openPdf(rc.number);
      /* The source is spent. It has to go, or a second tap on Save writes another
         receipt against the same quote and the same sales — the banner would still
         be claiming they came from QT-2026-0014 while that quote is already
         Converted against the receipt above. openPdf has already read the lines
         off state by this point, so this cannot empty the printed page. */
      setSource({ fromQuote: null, fromSales: [] });
      if (showPast) api.fetchReceipts().then(setPast).catch(() => {});
      /* The sales list is stale the moment this saves — what was pulled in is now
         receipted, and offering it again is the fault this guards against. */
      setRecentSales(null);
    } catch (e) {
      alert("Could not save receipt: " + (e.message || e) + "\n(Did you run supabase/receipts.sql?)");
    } finally {
      setSaving(false);
    }
  };

  // A4 receipt document: branch + main-shop header, items, totals, paid/change.
  const openPdf = (number) => {
    const b = SHOP_INFO.branch, m = SHOP_INFO.main;
    const isDelivery = docType === "Delivery Note"; // delivery notes hide money
    const rows = filledLines
      .map(
        (l) => `<tr>
          <td>${escapeHtml(l.desc)}</td>
          <td class="c">${l.qty}</td>
          ${isDelivery ? "" : `<td class="r">${Number(l.price).toLocaleString()}</td>
          <td class="r">${lineTotal(l).toLocaleString()}</td>`}
        </tr>`
      )
      .join("");
    const today = new Date().toLocaleString("en-KE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    // Both shop emails sit on the header so customers can reach either desk.
    const emails = [b.email, m.email].filter(Boolean).map(escapeHtml).join(" &nbsp;·&nbsp; ");
    const mainContacts = [
      m.name ? escapeHtml(m.name) : "",
      m.phone ? `Tel: ${escapeHtml(m.phone)}` : "",
      m.email ? `Email: ${escapeHtml(m.email)}` : "",
    ].filter(Boolean).join(" &nbsp;·&nbsp; ");
    // A VAT sale is always titled "Tax Invoice"; otherwise use the chosen doc type.
    const docTitle = vatOn ? "Tax Invoice" : docType;
    const vatPct = Math.round(vatRate * 100);
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${docTitle} ${number || ""}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#1B2430; margin:0; padding:32px; }
  .wrap { max-width: 720px; margin:0 auto; }
  .head { text-align:center; border-bottom:3px solid #2563EB; padding-bottom:14px; }
  .brand { font-size:26px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#1B2430; }
  .loc { font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:#2563EB; margin-top:2px; }
  .tag { color:#1B2430; font-size:12px; font-weight:600; margin-top:5px; }
  .makes { color:#5A6472; font-size:11px; margin-top:2px; }
  .parts { color:#5A6472; font-size:11px; margin-top:1px; }
  .contacts { color:#5A6472; font-size:12px; margin-top:5px; }
  .doc { display:flex; justify-content:space-between; align-items:center; margin:18px 0; }
  .doc .t { font-size:20px; font-weight:800; color:#2563EB; text-transform:uppercase; letter-spacing:2px; }
  .doc .m { color:#5A6472; font-size:13px; text-align:right; }
  .meta { font-size:14px; margin-bottom:10px; }
  .meta .lbl { color:#5A6472; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:14px; }
  th { background:#EEF2F6; text-align:left; padding:10px; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#5A6472; }
  th.c, td.c { text-align:center; } th.r, td.r { text-align:right; }
  td { padding:10px; border-bottom:1px solid #DEE3E9; }
  .totals { margin-top:16px; margin-left:auto; width:300px; font-size:14px; }
  .totals div { display:flex; justify-content:space-between; padding:6px 0; }
  .totals .grand { border-top:2px solid #1B2430; margin-top:6px; padding-top:10px; font-size:18px; font-weight:800; color:#2563EB; }
  .paidbox { margin-top:6px; background:#E6F6EF; border:1px solid #15926A; border-radius:8px; padding:8px 12px; }
  .paidbox div { display:flex; justify-content:space-between; padding:3px 0; font-size:13px; }
  .foot { margin-top:34px; color:#5A6472; font-size:12px; border-top:1px solid #DEE3E9; padding-top:12px; text-align:center; }
  .mainshop { margin-top:8px; color:#5A6472; font-size:11px; text-align:center; }
  .stamp { display:inline-block; margin-top:6px; border:3px solid ${stampColor}; color:${stampColor}; font-weight:800; font-size:20px; letter-spacing:3px; padding:4px 16px; border-radius:8px; transform:rotate(-4deg); text-transform:uppercase; }
  .ctype { color:#5A6472; font-size:12px; margin-top:2px; }
  @media print { body { padding:0; } .wrap { max-width:none; } }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div class="brand">${escapeHtml(b.name)}</div>
    ${b.location ? `<div class="loc">${escapeHtml(b.location)}</div>` : ""}
    <div class="tag">${escapeHtml(b.tagline || "")}</div>
    ${b.makes ? `<div class="makes">${escapeHtml(b.makes)}</div>` : ""}
    ${b.parts ? `<div class="parts">in ${escapeHtml(b.parts)}</div>` : ""}
    <div class="contacts"><b>Tel:</b> ${escapeHtml(b.phone || "")}</div>
    ${emails ? `<div class="contacts">${emails}</div>` : ""}
    ${vatOn && b.kraPin ? `<div class="contacts">PIN: ${escapeHtml(b.kraPin)}</div>` : ""}
  </div>
  <div class="doc">
    <div>
      <div class="t">${docTitle}</div>
      ${isDelivery ? "" : `<div class="stamp">${stamp}</div>`}
    </div>
    <div class="m">${number ? `No. ${escapeHtml(number)}<br>` : ""}${today}<br>Served by: ${escapeHtml(user || "Staff")}</div>
  </div>
  <div class="meta">
    <div class="lbl">${isDelivery ? "Delivered to" : "Received from"}</div>
    <div><b>${escapeHtml(customer) || "Walk-in customer"}</b>${phone ? ` — ${escapeHtml(phone)}` : ""}</div>
    <div class="ctype">Customer: ${escapeHtml(customerType)}</div>
  </div>
  <table>
    <thead><tr><th>Item / Description</th><th class="c">Qty</th>${isDelivery ? "" : `<th class="r">Unit (KES)</th><th class="r">Amount (KES)</th>`}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${isDelivery ? `<div class="totals"><div class="grand"><span>Total items</span><span>${filledLines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}</span></div></div>
  <div class="foot" style="margin-top:24px;text-align:left;border:none;">Received the above goods in good order:<br><br>Name: __________________________  Sign: __________________________</div>` : `<div class="totals">
    <div><span>Subtotal</span><span>KES ${gross.toLocaleString()}</span></div>
    ${disc ? `<div><span>Discount</span><span>- KES ${disc.toLocaleString()}</span></div>` : ""}
    ${vatOn ? `<div><span>${vatMode === "exclusive" ? "Amount (excl. VAT)" : "Taxable (excl. VAT)"}</span><span>KES ${Math.round(netAmount).toLocaleString()}</span></div>
    <div><span>VAT ${vatPct}%</span><span>KES ${Math.round(vat).toLocaleString()}</span></div>` : ""}
    <div class="grand"><span>Total${vatOn ? " (incl. VAT)" : ""}</span><span>KES ${Math.round(grand).toLocaleString()}</span></div>
    <div class="paidbox">
      <div><span>Paid (${escapeHtml(method || "—")})</span><span>KES ${paidNum.toLocaleString()}</span></div>
      ${change ? `<div><span>Change</span><span>KES ${change.toLocaleString()}</span></div>` : ""}
      ${balance ? `<div><span>Balance due</span><span>KES ${balance.toLocaleString()}</span></div>` : ""}
    </div>
  </div>`}
  <div class="foot">${escapeHtml(SHOP_INFO.footer || "")}</div>
  <div class="mainshop">A branch reporting to ${mainContacts}</div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to open the PDF."); return; }
    w.document.write(html);
    w.document.close();
  };

  const shareWhatsApp = () => {
    const b = SHOP_INFO.branch;
    const deliveryNote = docType === "Delivery Note";
    const rows = filledLines
      .map((l) => deliveryNote
        ? `• ${l.desc} — qty ${l.qty}`
        : `• ${l.desc} — ${l.qty} × ${Number(l.price).toLocaleString()} = KES ${lineTotal(l).toLocaleString()}`)
      .join("\n");
    const isDelivery = docType === "Delivery Note";
    const heading = vatOn ? "Tax Invoice" : docType;
    // Shop identity block repeated on every shared document.
    const sig = `\n\n${b.name}\n${b.location || ""}\nTel: ${b.phone || ""}${b.email ? `\n${b.email}` : ""}`;
    const msg = isDelivery
      ? `*${b.name} — Delivery Note*${savedNumber ? ` (${savedNumber})` : ""}\n${b.location || ""}\n\n` +
        (customer ? `Delivered to: ${customer}\n` : "") +
        `\n${rows}\n\nTotal items: ${filledLines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}` +
        `\n\nPlease confirm goods received in good order.` + sig
      : `*${b.name} — ${heading}*${savedNumber ? ` (${savedNumber})` : ""}\n${b.location || ""}\n\n` +
        (customer ? `Customer: ${customer}\n` : "") +
        `Status: ${stamp}\n` +
        `\n${rows}\n\nSubtotal: KES ${gross.toLocaleString()}` +
        (disc ? `\nDiscount: -KES ${disc.toLocaleString()}` : "") +
        (vatOn ? `\nVAT ${Math.round(vatRate * 100)}%${vatMode === "exclusive" ? " (added)" : " (incl.)"}: KES ${Math.round(vat).toLocaleString()}` : "") +
        `\n*Total${vatOn ? " (incl. VAT)" : ""}: KES ${Math.round(grand).toLocaleString()}*` +
        `\nPaid (${method}): KES ${paidNum.toLocaleString()}` +
        (change ? `\nChange: KES ${change.toLocaleString()}` : "") +
        (balance ? `\nBalance due: KES ${balance.toLocaleString()}` : "") +
        `\n\nThank you for your business.` + sig;
    let p = phone.replace(/[^\d]/g, "");
    if (p.startsWith("0")) p = "254" + p.slice(1);
    const base = p ? `https://wa.me/${p}` : `https://wa.me/`;
    window.open(`${base}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Issue a receipt for a completed sale"
        title="Receipt"
        right={
          <button
            onClick={() => setShowPast((v) => !v)}
            className="text-[#2563EB] text-xs font-semibold border border-[#DEE3E9] rounded-md px-3 py-1.5 hover:bg-[#EEF2F6] flex items-center gap-1.5"
          >
            <FileText size={13} /> {showPast ? "New receipt" : "Past receipts"}
          </button>
        }
      />

      {showPast ? (
        <PastReceipts past={past} />
      ) : (
      <>
      {savedNumber && (
        <div className="bg-[#E6F6EF] border border-[#15926A] text-[#15926A] rounded-md p-3 mb-4 text-sm flex items-center gap-2">
          <Check size={15} /> Saved as <span className="font-bold font-mono">{savedNumber}</span>. Starting a fresh receipt below.
        </div>
      )}

      {/* Where these figures came from, said plainly. Somebody handed a
          half-filled screen with no explanation assumes it is left over from
          whoever used the phone last, and clears it. */}
      {source.fromQuote?.number && (
        <div className="bg-[#EEF2F6] border border-[#2563EB] rounded-md p-3 mb-4 text-xs text-[#1B2430] leading-relaxed">
          <span className="font-bold text-[#2563EB]">From quotation {source.fromQuote.number}</span>
          {" — "}the parts, prices and discount agreed with the customer are already
          filled in below. Change anything that has moved on. The quote is marked
          <span className="font-semibold"> Converted</span> once this receipt saves.
        </div>
      )}
      {source.fromSales?.length > 0 && (
        <div className="bg-[#EEF2F6] border border-[#15926A] rounded-md p-3 mb-4 text-xs text-[#1B2430] leading-relaxed">
          <span className="font-bold text-[#15926A]">
            Built from {source.fromSales.length} recorded sale{source.fromSales.length !== 1 ? "s" : ""}
          </span>
          {" — "}the parts and what they went for are already on the receipt. They
          won't be offered again once this saves.
        </div>
      )}

      {/* The screen filled this in by itself. Said loudly, with the way out
          right next to it — a pre-filled receipt looks authoritative, and the
          figures on it are what somebody gets charged. */}
      {autoFilled && (
        <div className="bg-[#FFF7E6] border border-[#B7791F] rounded-md p-3 mb-4 text-xs text-[#1B2430] leading-relaxed">
          <div className="font-bold text-[#B7791F] mb-1">
            Filled in from today&apos;s sale to {autoFilled.buyer || "a walk-in customer"}
          </div>
          {autoFilled.sales.length} part{autoFilled.sales.length !== 1 ? "s" : ""} sold
          {" "}{fmtDateTime(autoFilled.ts)} — the only sale today not yet on a receipt,
          so it was put here for you. Check the prices and save.
          <button
            type="button"
            onClick={dismissAuto}
            className="mt-2 w-full text-[11px] font-bold uppercase tracking-wide text-[#B7791F] border border-[#B7791F] rounded py-1.5 hover:bg-[#B7791F] hover:text-white transition-colors"
          >
            Not this sale — clear it and let me choose
          </button>
        </div>
      )}

      {/* The two places a document can come from, instead of typing it again.
          Above the fields because it is the first thing to do, not an afterthought
          once the list is half typed. */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setShowSales((v) => !v); setShowQuotes(false); }}
          className={`text-[11px] font-bold uppercase tracking-wide border rounded-md py-2.5 px-2 flex items-center justify-center gap-1.5 transition-colors ${
            showSales ? "bg-[#15926A] text-white border-[#15926A]" : "text-[#15926A] border-[#15926A] hover:bg-[#15926A11]"
          }`}
        >
          <ShoppingCart size={14} className="shrink-0" />
          <span className="truncate">
            Sales{openBatches.length ? ` (${openBatches.length})` : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setShowQuotes((v) => !v); setShowSales(false); }}
          className={`text-[11px] font-bold uppercase tracking-wide border rounded-md py-2.5 px-2 flex items-center justify-center gap-1.5 transition-colors ${
            showQuotes ? "bg-[#2563EB] text-white border-[#2563EB]" : "text-[#2563EB] border-[#2563EB] hover:bg-[#2563EB11]"
          }`}
        >
          <FileText size={14} className="shrink-0" />
          <span className="truncate">Fetch a quotation</span>
        </button>
      </div>

      {/* Sales already recorded, gathered into the receipts they would become. */}
      {showSales && (
        <div className="mb-4 border border-[#DEE3E9] rounded-md p-3 bg-[#FFFFFF]">
          {recentSales === null ? (
            <div className="text-xs text-[#5A6472] flex items-center gap-2 py-2">
              <Loader2 size={13} className="animate-spin" /> Reading the sales…
            </div>
          ) : saleBatches.length === 0 ? (
            <div className="text-xs text-[#5A6472] py-2">
              No sales in the last two weeks to build a receipt from. Sell something
              on the Sell screen and it will be waiting here.
            </div>
          ) : (
            <>
              <div className="text-[11px] text-[#5A6472] mb-2 leading-relaxed">
                Sales from the last two weeks, gathered by customer and day — one tap
                puts the parts and the money on the receipt. A sale that came back is
                not listed: the goods are on the shelf and the money went with them.
              </div>
              <div className="space-y-2">
                {pickerBatches.map((b) => {
                  /* Every part in this batch already on a saved receipt. Said, not
                     blocked — a customer can genuinely need a second copy, and
                     refusing sends staff back to typing it by hand. */
                  const done = b.sales.every((x) => alreadyDone.has(x.id));
                  const picking = pickingIn === b.key;
                  const chosen = b.sales.filter((x) => ticked.has(x.id)).length;
                  return (
                    <div
                      key={b.key}
                      className={`border rounded-md p-2.5 ${done ? "border-[#DEE3E9] opacity-70" : "border-[#15926A]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#1B2430] truncate">
                          {b.buyer || "Walk-in"}
                        </span>
                        <span className="text-[#2563EB] font-bold text-sm tabular-nums shrink-0">
                          KES {Math.round(b.total).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#5A6472] mt-0.5">
                        {b.sales.length} part{b.sales.length !== 1 ? "s" : ""}
                        {b.phone ? ` · ${b.phone}` : ""} · {fmtDateTime(b.ts)}
                      </div>

                      {/* Which parts, one per line when choosing between them — a
                          customer paying for half a delivery today is normal. */}
                      {picking ? (
                        <div className="mt-2 space-y-1">
                          {b.sales.map((x) => {
                            const on = ticked.has(x.id);
                            return (
                              <button
                                key={x.id}
                                type="button"
                                onClick={() =>
                                  setTicked((t) => {
                                    const n = new Set(t);
                                    if (n.has(x.id)) n.delete(x.id);
                                    else n.add(x.id);
                                    return n;
                                  })
                                }
                                className="w-full flex items-center gap-2 text-left text-[11px] py-1"
                              >
                                {on ? (
                                  <CheckSquare size={14} className="text-[#15926A] shrink-0" />
                                ) : (
                                  <Square size={14} className="text-[#5A6472] shrink-0" />
                                )}
                                <span className="flex-1 truncate text-[#1B2430]">
                                  {x.qty} × {x.name || x.code}
                                </span>
                                <span className="text-[#5A6472] tabular-nums shrink-0">
                                  {Number(x.total) > 0 ? Math.round(x.total).toLocaleString() : "no price"}
                                </span>
                                {alreadyDone.has(x.id) && (
                                  <span className="text-[#B7791F] shrink-0">done</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#5A6472] mt-1 leading-relaxed">
                          {b.sales.map((x) => `${x.qty} × ${x.name || x.code}`).join(", ")}
                        </div>
                      )}

                      {done && (
                        <div className="text-[11px] text-[#B7791F] font-semibold mt-1">
                          Already on a receipt
                        </div>
                      )}

                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => (picking && chosen ? pullBatch(b, ticked) : pullBatch(b))}
                          className="flex-1 text-[11px] font-bold uppercase tracking-wide text-white bg-[#2563EB] rounded py-1.5 hover:opacity-90"
                        >
                          {picking && chosen
                            ? `Put ${chosen} on the receipt`
                            : done
                            ? "Put on this receipt anyway"
                            : "Put these on the receipt"}
                        </button>
                        {b.sales.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPickingIn(picking ? "" : b.key);
                              setTicked(new Set());
                            }}
                            className="text-[11px] font-bold uppercase tracking-wide text-[#5A6472] border border-[#DEE3E9] rounded py-1.5 px-2 shrink-0"
                          >
                            {picking ? "All" : "Some"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* The quotation a customer has walked back in with. Searchable, because a
          shop with a hundred quotes on file cannot scroll to find one while
          somebody waits at the counter. */}
      {showQuotes && (
        <div className="mb-4 border border-[#DEE3E9] rounded-md p-3 bg-[#FFFFFF]">
          <div className="text-[11px] text-[#5A6472] mb-2 leading-relaxed">
            Search by quote number, customer or phone. Everything agreed on the quote
            — the parts, the prices and the discount — comes across, and the quote is
            marked Converted once this receipt saves.
          </div>
          <input
            value={quoteQuery}
            onChange={(e) => setQuoteQuery(e.target.value)}
            placeholder="QT-2026-0014, or Kamau"
            className={inputCls + " mb-2"}
          />
          {quotes === null ? (
            <div className="text-xs text-[#5A6472] flex items-center gap-2 py-2">
              <Loader2 size={13} className="animate-spin" /> Reading the quotations…
            </div>
          ) : !quotes.length ? (
            <div className="text-xs text-[#5A6472] py-2">
              No quotations saved yet. Write one on the Quotation screen and it will be
              waiting here when the customer comes back to pay.
            </div>
          ) : quoteMatches.length === 0 ? (
            <div className="text-xs text-[#5A6472] py-2">Nothing matches that.</div>
          ) : (
            <div className="space-y-2">
              {quoteMatches.slice(0, 25).map((q) => {
                const rc = quoteReceipts.get(q.number);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => pullQuote(q)}
                    className={`w-full text-left border rounded-md p-2.5 hover:bg-[#2563EB11] transition-colors ${
                      rc || q.status === "Converted" ? "border-[#DEE3E9] opacity-70" : "border-[#2563EB]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[#2563EB] shrink-0">{q.number}</span>
                      <span className="text-[#1B2430] font-bold text-sm tabular-nums shrink-0">
                        KES {Math.round(q.total).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-[#1B2430] font-semibold truncate mt-0.5">
                      {q.customer || "No name"}
                    </div>
                    <div className="text-[11px] text-[#5A6472]">
                      {q.lines.length} item{q.lines.length !== 1 ? "s" : ""}
                      {q.discount > 0 ? ` · ${Math.round(q.discount).toLocaleString()} off` : ""}
                      {" · "}{fmtDateTime(q.ts)}
                    </div>
                    {/* The receipt is the evidence, not the label. A quote can read
                        Converted from an earlier attempt; naming the receipt tells
                        somebody what to go and look at. */}
                    {rc ? (
                      <div className="text-[11px] text-[#B7791F] font-semibold mt-1">
                        Already receipted as {rc} — this would be a second one
                      </div>
                    ) : q.status === "Converted" ? (
                      <div className="text-[11px] text-[#B7791F] font-semibold mt-1">
                        Marked Converted
                      </div>
                    ) : null}
                  </button>
                );
              })}
              {quoteMatches.length > 25 && (
                <div className="text-[11px] text-[#5A6472]">
                  {quoteMatches.length - 25} more — narrow the search.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document type — what to print. */}
      <Field label="Document type">
        <div className="flex gap-2">
          {["Receipt", "Invoice", "Delivery Note"].map((d) => {
            const active = docType === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDocType(d)}
                className={`flex-1 rounded-md py-2.5 text-sm font-semibold border ${active ? "bg-[#2563EB] text-white border-[#2563EB]" : "border-[#DEE3E9] text-[#5A6472]"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Customer name (optional)">
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. James / ABC Garage" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Phone (for WhatsApp)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Customer type — walk-in, referred, or a commission job. */}
      <Field label="Customer type">
        <div className="flex gap-2">
          {["Walk-in", "Referred", "Commission"].map((t) => {
            const active = customerType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setCustomerType(t)}
                className={`flex-1 rounded-md py-2 text-sm font-semibold border ${active ? "bg-[#7C5CD6] text-white border-[#7C5CD6]" : "border-[#DEE3E9] text-[#5A6472]"}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="text-[#2563EB] text-[11px] font-bold tracking-[0.2em] uppercase mb-2">Items</div>

      {/* What is left to do, in one line. A receipt cannot save with a price
          missing, and finding out at the Save button is finding out too late. */}
      {gaps.length > 0 && lines.some((l) => l.desc.trim()) && (
        <div className="bg-[#FFF7E6] border border-[#B7791F] rounded-md p-2.5 mb-2 text-[11px] text-[#1B2430] leading-relaxed">
          <span className="font-bold text-[#B7791F]">
            {gaps.length} price{gaps.length !== 1 ? "s" : ""} still to write
          </span>
          {" — "}{gaps.map((g) => g.desc).join(", ")}
          {shelfPrices.size > 0 && (
            <button
              type="button"
              onClick={fillFromShelf}
              className="mt-2 w-full text-[11px] font-bold uppercase tracking-wide text-[#B7791F] border border-[#B7791F] rounded py-1.5 hover:bg-[#B7791F] hover:text-white transition-colors"
            >
              Use the shelf price for {shelfPrices.size} of them
            </button>
          )}
        </div>
      )}
      <div className="space-y-2 mb-3">
        {lines.map((l, i) => (
          <div key={i} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
            <div className="flex items-center gap-2">
              <input
                value={l.desc}
                onChange={(e) => setLine(i, { desc: e.target.value })}
                list="receipt-parts"
                placeholder="Part / description"
                className={inputCls + " flex-1"}
              />
              <button
                onClick={() => removeLine(i)}
                className="p-2 rounded text-[#5A6472] hover:text-[#DC3B2E] shrink-0"
                title="Remove line"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-20">
                <input
                  type="number" min="0" value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                  placeholder="Qty" className={inputCls + " text-center"}
                />
              </div>
              <span className="text-[#5A6472] text-sm">×</span>
              <div className="flex-1">
                <input
                  type="number" min="0" value={l.price}
                  onChange={(e) => setLine(i, { price: e.target.value })}
                  placeholder="Unit price (KES)" className={inputCls}
                />
              </div>
              <div className="w-28 text-right text-sm font-semibold text-[#1B2430] tabular-nums shrink-0">
                {lineTotal(l).toLocaleString()}
              </div>
            </div>
            {/* This part is on the shelf at a known price and this line has none.
                Offered here, beside the empty box, rather than made to be
                remembered. */}
            {shelfPrices.has(i) && (
              <button
                type="button"
                onClick={() => setLine(i, { price: String(shelfPrices.get(i)) })}
                className="mt-2 text-[11px] font-semibold text-[#2563EB] hover:underline"
              >
                Shelf price: {shelfPrices.get(i).toLocaleString()} — use it
              </button>
            )}
          </div>
        ))}
      </div>

      <datalist id="receipt-parts">
        {items.slice(0, 300).map((it) => (
          <option key={it.code} value={it.name || `${it.brand} ${it.model}`} />
        ))}
      </datalist>

      <button
        onClick={addLine}
        className="w-full border border-dashed border-[#2563EB] text-[#2563EB] rounded-md py-2.5 font-semibold text-sm flex items-center justify-center gap-2 mb-4 hover:bg-[#2563EB11]"
      >
        <Plus size={16} /> Add item
      </button>

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5A6472]">Subtotal</span>
          <span className="font-semibold tabular-nums">KES {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5A6472]">Discount (KES)</span>
          <input
            type="number" min="0" value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0" className={inputCls + " w-28 text-right py-1.5"}
          />
        </div>
        {/* VAT toggle — optional, prices are VAT-inclusive. */}
        <div className="flex items-center justify-between border-t border-[#DEE3E9] pt-2">
          <label className="flex items-center gap-2 text-sm text-[#1B2430] cursor-pointer select-none">
            <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} className="w-4 h-4 accent-[#2563EB]" />
            Charge VAT ({Math.round(vatRate * 100)}%) — tax invoice
          </label>
        </div>
        {vatOn && (
          <>
            {/* Choose how VAT applies to the price. */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVatMode("inclusive")}
                className={`flex-1 text-xs font-semibold rounded-md py-2 border transition-colors ${vatMode === "inclusive" ? "bg-[#2563EB] text-white border-[#2563EB]" : "bg-[#FFFFFF] text-[#5A6472] border-[#DEE3E9]"}`}
              >
                VAT inside price
              </button>
              <button
                type="button"
                onClick={() => setVatMode("exclusive")}
                className={`flex-1 text-xs font-semibold rounded-md py-2 border transition-colors ${vatMode === "exclusive" ? "bg-[#2563EB] text-white border-[#2563EB]" : "bg-[#FFFFFF] text-[#5A6472] border-[#DEE3E9]"}`}
              >
                Add VAT on top
              </button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#5A6472]">{vatMode === "exclusive" ? "Amount (excl. VAT)" : "Taxable (excl. VAT)"}</span>
              <span className="tabular-nums">KES {Math.round(netAmount).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#5A6472]">VAT {Math.round(vatRate * 100)}% {vatMode === "exclusive" ? "(added)" : "(included)"}</span>
              <span className="tabular-nums">KES {Math.round(vat).toLocaleString()}</span>
            </div>
            {!SHOP_INFO.branch.kraPin && (
              <div className="text-[11px] text-[#DC3B2E] flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                No KRA PIN set — add it in src/lib/shopInfo.js for a valid tax invoice.
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between border-t border-[#DEE3E9] pt-2">
          <span className="font-bold uppercase tracking-wide text-sm">Total{vatOn ? " (incl. VAT)" : ""}</span>
          <span className="text-[#2563EB] font-extrabold text-xl tabular-nums">KES {Math.round(grand).toLocaleString()}</span>
        </div>
        {docType !== "Delivery Note" && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#5A6472] uppercase tracking-wide">Status (auto)</span>
            <span
              className="text-xs font-extrabold uppercase tracking-widest px-2.5 py-1 rounded border"
              style={{ color: stampColor, borderColor: stampColor, background: stampColor + "18" }}
            >
              {stamp}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Payment method">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            <option>Cash</option>
            <option>M-PESA</option>
            <option>Card</option>
            <option>Bank transfer</option>
            <option>Credit (unpaid)</option>
          </select>
        </Field>
        <Field label="Amount paid (KES)">
          <input
            type="number" min="0" value={paid}
            onChange={(e) => setPaid(e.target.value)}
            placeholder="0" className={inputCls}
          />
        </Field>
      </div>

      {(change > 0 || balance > 0) && (
        <div className={`rounded-md p-3 mb-2 text-sm font-semibold flex items-center justify-between ${change > 0 ? "bg-[#E6F6EF] text-[#15926A] border border-[#15926A]" : "bg-[#FBEAE8] text-[#DC3B2E] border border-[#DC3B2E]"}`}>
          <span>{change > 0 ? "Change to give" : "Balance due"}</span>
          <span className="tabular-nums">KES {(change > 0 ? change : balance).toLocaleString()}</span>
        </div>
      )}

      <button
        onClick={saveReceipt}
        disabled={filledLines.length === 0 || saving}
        className="w-full mt-3 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition-transform"
      >
        <FileText size={16} /> {saving ? "Saving…" : "Save receipt (get number)"}
      </button>

      <div className="flex gap-3 mt-3">
        <button
          onClick={() => openPdf(savedNumber)}
          disabled={filledLines.length === 0}
          className="flex-1 border border-[#DEE3E9] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#5A6472] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Printer size={16} /> PDF / Print
        </button>
        <button
          onClick={shareWhatsApp}
          disabled={filledLines.length === 0}
          className="flex-1 bg-[#15926A] text-white font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          <MessageCircle size={16} /> Send on WhatsApp
        </button>
      </div>
      </>
      )}
    </div>
  );
}

/* Read-only list of previously issued receipts. */
function PastReceipts({ past }) {
  if (past.length === 0) {
    return <div className="text-[#5A6472] text-sm py-8 text-center">No receipts issued yet.</div>;
  }
  return (
    <div className="space-y-2">
      {past.map((r) => {
        const stampCls = r.stamp === "ON CREDIT"
          ? "bg-[#DC3B2E22] text-[#DC3B2E]"
          : r.stamp === "DISCOUNTED"
          ? "bg-[#B4530922] text-[#B45309]"
          : "bg-[#15926A22] text-[#15926A]";
        return (
        <div key={r.id} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold text-[#2563EB]">{r.number}</span>
            <div className="flex items-center gap-1.5">
              {r.docType && r.docType !== "Receipt" && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-[#2563EB22] text-[#2563EB]">
                  {r.docType}
                </span>
              )}
              {r.stamp && (
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${stampCls}`}>
                  {r.stamp}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-1 text-sm">
            <span className="text-[#1B2430]">{r.customer || "Walk-in"}{r.customerType && r.customerType !== "Walk-in" ? ` · ${r.customerType}` : ""}</span>
            <span className="text-[#2563EB] font-bold tabular-nums">KES {r.total.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-[#5A6472]">
            <span>{r.lines.length} item(s){r.method ? ` · ${r.method}` : ""}{r.phone ? ` · ${r.phone}` : ""}</span>
            <span>{fmtDateTime(r.ts)}</span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

/* ======================= CREDIT ACCOUNTS =======================
   Garages that buy on credit. Taking goods raises the balance owed;
   paying (cash/cheque/paybill) lowers it. Each account has a full,
   printable statement. */
export function CreditAccountsTab({ user, admin }) {
  const [accounts, setAccounts] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);     // account whose statement is open
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", phone: "" });

  const load = () =>
    api.fetchCreditAccounts()
      .then((a) => { setAccounts(a); setErr(""); })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const unsub = api.subscribeCreditAccounts(load);
    return unsub;
  }, []);

  const totalOwed = accounts.reduce((s, a) => s + a.balance, 0);
  const open = accounts.find((a) => a.id === openId) || null;

  const addAccount = async () => {
    if (!form.name.trim()) return;
    try {
      await api.addCreditAccount(form, user);
      setForm({ name: "", contact: "", phone: "" });
      setAdding(false);
      load();
    } catch (e) {
      alert("Could not add account: " + (e.message || e) + "\n(Did you run supabase/credit_accounts.sql?)");
    }
  };

  if (open) {
    return <CreditStatement account={open} user={user} admin={admin} onBack={() => setOpenId(null)} onChanged={load} />;
  }

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Garages & customers buying on credit"
        title="Credit Accounts"
        right={
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-[#2563EB] text-xs font-semibold border border-[#DEE3E9] rounded-md px-3 py-1.5 hover:bg-[#EEF2F6] flex items-center gap-1.5"
          >
            <Plus size={13} /> {adding ? "Close" : "New account"}
          </button>
        }
      />

      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 mb-4 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Couldn't load accounts. Run <span className="font-mono mx-1">supabase/credit_accounts.sql</span> once, then reload.
        </div>
      )}

      {/* Total outstanding across all accounts. */}
      <div className="bg-[#1B2430] text-white rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={20} className="text-[#F5B301]" />
          <span className="text-sm text-[#C6CBD3]">Total owed to us</span>
        </div>
        <span className="text-2xl font-extrabold tabular-nums">KES {totalOwed.toLocaleString()}</span>
      </div>

      {adding && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4 space-y-3">
          <Field label="Garage / customer name *">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ABC Motors" className={inputCls} autoFocus />
          </Field>
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Contact person">
                <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="e.g. Peter" className={inputCls} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Phone">
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07…" className={inputCls} />
              </Field>
            </div>
          </div>
          <button
            onClick={addAccount}
            disabled={!form.name.trim()}
            className="w-full bg-[#2563EB] text-white font-bold uppercase tracking-wide rounded-md py-2.5 text-sm disabled:opacity-50"
          >
            Create account
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-[#5A6472] text-sm py-8 text-center">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="text-[#5A6472] text-sm py-8 text-center">No credit accounts yet. Add one above.</div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setOpenId(a.id)}
              className="w-full text-left bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3 hover:border-[#2563EB] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#1B2430] flex items-center gap-2">
                  <Building2 size={15} className="text-[#5A6472]" /> {a.name}
                </span>
                <span className={`font-extrabold tabular-nums ${a.balance > 0 ? "text-[#DC3B2E]" : "text-[#15926A]"}`}>
                  KES {a.balance.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1 text-xs text-[#5A6472]">
                <span>{a.contact || "—"}{a.phone ? ` · ${a.phone}` : ""}</span>
                <span>{a.balance > 0 ? "Owes us" : "Settled"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Statement for one credit account: charge/pay forms + full ledger. */
function CreditStatement({ account, user, admin, onBack, onChanged }) {
  const [txns, setTxns] = useState([]);
  const [mode, setMode] = useState(null);          // "charge" | "payment" | null
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

  const loadTxns = () => api.fetchCreditTxns(account.id).then(setTxns).catch(() => setTxns([]));
  useEffect(() => { loadTxns(); }, [account.id]);

  const post = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0 || busy) return;
    setBusy(true);
    try {
      const newBalance = await api.postCreditTxn(
        { accountId: account.id, kind: mode, amount: amt, method, reference, description },
        user
      );
      const receipt = {
        kind: mode, amount: amt, method, reference, description,
        balanceAfter: newBalance, by: user,
      };
      setLastReceipt(receipt);
      setAmount(""); setReference(""); setDescription(""); setMode(null);
      loadTxns();
      onChanged && onChanged();
    } catch (e) {
      alert("Could not save: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  // Printable A4 statement of the whole account.
  const printStatement = () => {
    const b = SHOP_INFO.branch, m = SHOP_INFO.main;
    const today = new Date().toLocaleString("en-KE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const rows = txns.slice().reverse().map((t) => `<tr>
        <td>${new Date(t.ts).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</td>
        <td>${t.kind === "charge" ? "Goods taken" : "Payment"}${t.description ? " — " + escapeHtml(t.description) : ""}${t.reference ? " (" + escapeHtml(t.reference) + ")" : ""}</td>
        <td class="r">${t.kind === "charge" ? "KES " + t.amount.toLocaleString() : ""}</td>
        <td class="r">${t.kind === "payment" ? "KES " + t.amount.toLocaleString() : ""}</td>
        <td class="r">KES ${t.balanceAfter.toLocaleString()}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Statement — ${escapeHtml(account.name)}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1B2430;margin:0;padding:32px;}
  .wrap{max-width:760px;margin:0 auto;}
  .head{text-align:center;border-bottom:3px solid #2563EB;padding-bottom:12px;}
  .brand{font-size:24px;font-weight:800;text-transform:uppercase;letter-spacing:1px;}
  .contacts{color:#5A6472;font-size:12px;margin-top:4px;}
  .doc{display:flex;justify-content:space-between;align-items:center;margin:16px 0;}
  .doc .t{font-size:18px;font-weight:800;color:#2563EB;text-transform:uppercase;letter-spacing:2px;}
  .doc .m{color:#5A6472;font-size:12px;text-align:right;}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;}
  th{background:#EEF2F6;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5A6472;}
  th.r,td.r{text-align:right;}
  td{padding:8px;border-bottom:1px solid #DEE3E9;}
  .bal{margin-top:16px;text-align:right;font-size:18px;font-weight:800;color:${account.balance > 0 ? "#DC3B2E" : "#15926A"};}
  .foot{margin-top:28px;color:#5A6472;font-size:11px;border-top:1px solid #DEE3E9;padding-top:10px;text-align:center;}
  @media print{body{padding:0;}.wrap{max-width:none;}}
</style></head>
<body><div class="wrap">
  <div class="head">
    <div class="brand">${escapeHtml(b.name)}</div>
    <div class="contacts">${b.location ? escapeHtml(b.location) : ""}${b.phone ? " · Tel: " + escapeHtml(b.phone) : ""}${b.email ? " · " + escapeHtml(b.email) : ""}</div>
  </div>
  <div class="doc">
    <div class="t">Account Statement</div>
    <div class="m">${today}<br>Prepared by: ${escapeHtml(user || "Staff")}</div>
  </div>
  <div style="font-size:14px;margin-bottom:8px;">
    <b>${escapeHtml(account.name)}</b>${account.contact ? " — " + escapeHtml(account.contact) : ""}${account.phone ? " · " + escapeHtml(account.phone) : ""}
  </div>
  <table>
    <thead><tr><th>Date</th><th>Detail</th><th class="r">Charge</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#5A6472;padding:24px;">No transactions yet.</td></tr>`}</tbody>
  </table>
  <div class="bal">Balance owing: KES ${account.balance.toLocaleString()}</div>
  <div class="foot">A branch reporting to ${escapeHtml(m.name)}${m.phone ? " · " + escapeHtml(m.phone) : ""}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to print the statement."); return; }
    w.document.write(html); w.document.close();
  };

  // Small printable slip for a single charge/payment just recorded.
  const printSlip = (t) => {
    const b = SHOP_INFO.branch;
    const today = new Date().toLocaleString("en-KE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const isPay = t.kind === "payment";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${isPay ? "Payment" : "Credit"} slip</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1B2430;margin:0;padding:28px;}
  .wrap{max-width:420px;margin:0 auto;}
  .brand{font-size:20px;font-weight:800;text-transform:uppercase;text-align:center;letter-spacing:1px;border-bottom:2px solid #2563EB;padding-bottom:10px;}
  .t{font-size:16px;font-weight:800;color:${isPay ? "#15926A" : "#DC3B2E"};text-transform:uppercase;letter-spacing:2px;text-align:center;margin:14px 0;}
  .row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;border-bottom:1px dashed #DEE3E9;}
  .lbl{color:#5A6472;}
  .big{font-size:20px;font-weight:800;}
  .foot{margin-top:20px;color:#5A6472;font-size:11px;text-align:center;}
  @media print{body{padding:0;}}
</style></head>
<body><div class="wrap">
  <div class="brand">${escapeHtml(b.name)}</div>
  <div class="t">${isPay ? "Payment Received" : "Goods on Credit"}</div>
  <div class="row"><span class="lbl">Account</span><span>${escapeHtml(account.name)}</span></div>
  <div class="row"><span class="lbl">Date</span><span>${today}</span></div>
  ${t.description ? `<div class="row"><span class="lbl">Detail</span><span>${escapeHtml(t.description)}</span></div>` : ""}
  ${isPay ? `<div class="row"><span class="lbl">Method</span><span>${escapeHtml(t.method || "—")}</span></div>` : ""}
  ${t.reference ? `<div class="row"><span class="lbl">Reference</span><span>${escapeHtml(t.reference)}</span></div>` : ""}
  <div class="row"><span class="lbl">${isPay ? "Amount paid" : "Amount taken"}</span><span class="big">KES ${t.amount.toLocaleString()}</span></div>
  <div class="row"><span class="lbl">Balance now</span><span class="big">KES ${t.balanceAfter.toLocaleString()}</span></div>
  <div class="row"><span class="lbl">Served by</span><span>${escapeHtml(t.by || "Staff")}</span></div>
  <div class="foot">Thank you. Keep this slip as your record.</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to print the slip."); return; }
    w.document.write(html); w.document.close();
  };

  return (
    <div className="bp-fade-up">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[#5A6472] text-sm font-semibold mb-3 hover:text-[#2563EB]">
        <ArrowLeft size={16} /> All accounts
      </button>

      <div className="bg-[#1B2430] text-white rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-extrabold flex items-center gap-2"><Building2 size={18} /> {account.name}</div>
            <div className="text-xs text-[#C6CBD3] mt-0.5">{account.contact || "—"}{account.phone ? ` · ${account.phone}` : ""}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[#C6CBD3] uppercase tracking-wide">Balance owing</div>
            <div className={`text-2xl font-extrabold tabular-nums ${account.balance > 0 ? "text-[#F5B301]" : "text-[#4ADE80]"}`}>
              KES {account.balance.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Just-recorded slip prompt. */}
      {lastReceipt && (
        <div className="bg-[#E6F6EF] border border-[#15926A] text-[#15926A] rounded-md p-3 mb-4 text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Check size={15} /> Recorded {lastReceipt.kind === "payment" ? "payment" : "goods"} of KES {lastReceipt.amount.toLocaleString()}.
          </span>
          <button onClick={() => printSlip(lastReceipt)} className="text-[#15926A] font-semibold border border-[#15926A] rounded px-2.5 py-1 text-xs flex items-center gap-1 hover:bg-[#15926A11]">
            <Printer size={12} /> Slip
          </button>
        </div>
      )}

      {/* Charge / Payment buttons. */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => { setMode(mode === "charge" ? null : "charge"); setAmount(""); setReference(""); setDescription(""); }}
          className={`flex-1 rounded-md py-3 font-bold uppercase tracking-wide text-sm border flex items-center justify-center gap-2 ${mode === "charge" ? "bg-[#DC3B2E] text-white border-[#DC3B2E]" : "border-[#DC3B2E] text-[#DC3B2E]"}`}
        >
          <CreditCard size={16} /> Took goods
        </button>
        <button
          onClick={() => { setMode(mode === "payment" ? null : "payment"); setAmount(""); setReference(""); setDescription(""); }}
          className={`flex-1 rounded-md py-3 font-bold uppercase tracking-wide text-sm border flex items-center justify-center gap-2 ${mode === "payment" ? "bg-[#15926A] text-white border-[#15926A]" : "border-[#15926A] text-[#15926A]"}`}
        >
          <Wallet size={16} /> Made payment
        </button>
      </div>

      {mode && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4 space-y-3">
          <Field label={mode === "charge" ? "Amount of goods taken (KES)" : "Amount paid (KES)"}>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={inputCls} autoFocus />
          </Field>
          {mode === "payment" && (
            <Field label="How did they pay?">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                <option>Cash</option>
                <option>Cheque</option>
                <option>Paybill</option>
                <option>Bank transfer</option>
              </select>
            </Field>
          )}
          <Field label={mode === "charge" ? "What was taken? (optional)" : "Reference — cheque no / paybill code (optional)"}>
            {mode === "charge" ? (
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 2 brake pads, 1 filter" className={inputCls} />
            ) : (
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Cheque 004821" className={inputCls} />
            )}
          </Field>
          <button
            onClick={post}
            disabled={(Number(amount) || 0) <= 0 || busy}
            className={`w-full font-bold uppercase tracking-wide rounded-md py-2.5 text-sm text-white disabled:opacity-50 ${mode === "charge" ? "bg-[#DC3B2E]" : "bg-[#15926A]"}`}
          >
            {busy ? "Saving…" : mode === "charge" ? "Add to balance" : "Reduce balance"}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="text-[#2563EB] text-[11px] font-bold tracking-[0.2em] uppercase">Statement</div>
        <button onClick={printStatement} className="text-[#5A6472] text-xs font-semibold border border-[#DEE3E9] rounded px-2.5 py-1 flex items-center gap-1 hover:bg-[#EEF2F6]">
          <Printer size={12} /> Print statement
        </button>
      </div>

      {txns.length === 0 ? (
        <div className="text-[#5A6472] text-sm py-8 text-center">No transactions yet.</div>
      ) : (
        <div className="space-y-2">
          {txns.map((t) => {
            const charge = t.kind === "charge";
            return (
              <div key={t.id} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${charge ? "bg-[#DC3B2E22] text-[#DC3B2E]" : "bg-[#15926A22] text-[#15926A]"}`}>
                    {charge ? "Took goods" : `Paid · ${t.method || "—"}`}
                  </span>
                  <span className={`font-bold tabular-nums ${charge ? "text-[#DC3B2E]" : "text-[#15926A]"}`}>
                    {charge ? "+" : "−"} KES {t.amount.toLocaleString()}
                  </span>
                </div>
                {(t.description || t.reference) && (
                  <div className="text-sm text-[#1B2430] mt-1">{t.description || t.reference}</div>
                )}
                <div className="flex items-center justify-between mt-1 text-xs text-[#5A6472]">
                  <span>Balance: KES {t.balanceAfter.toLocaleString()}{t.by ? ` · ${t.by}` : ""}</span>
                  <span className="flex items-center gap-2">
                    {fmtDateTime(t.ts)}
                    <button onClick={() => printSlip(t)} className="text-[#5A6472] hover:text-[#2563EB]" title="Print slip"><Printer size={13} /></button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ======================= BRANCH TRANSFERS =======================
   A plain log of stock moving between branches — taken to another
   branch, or received from one. LOG ONLY: does not change stock counts. */
export function TransfersTab({ items, user }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ direction: "out", otherBranch: "", code: "", item: "", qty: "1", note: "" });

  const load = () =>
    api.fetchTransfers()
      .then((t) => { setRows(t); setErr(""); })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const unsub = api.subscribeTransfers(load);
    return unsub;
  }, []);

  const save = async () => {
    if (!form.item.trim() || (Number(form.qty) || 0) <= 0) return;
    try {
      await api.addTransfer(form, user);
      setForm({ direction: form.direction, otherBranch: "", code: "", item: "", qty: "1", note: "" });
      setAdding(false);
      load();
    } catch (e) {
      alert("Could not save transfer: " + (e.message || e) + "\n(Did you run supabase/transfers.sql?)");
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this transfer record?")) return;
    try { await api.deleteTransfer(id); load(); } catch (e) { alert(e.message || String(e)); }
  };

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="Stock moved between branches (record only)"
        title="Branch Transfers"
        right={
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-[#2563EB] text-xs font-semibold border border-[#DEE3E9] rounded-md px-3 py-1.5 hover:bg-[#EEF2F6] flex items-center gap-1.5"
          >
            <Plus size={13} /> {adding ? "Close" : "Record transfer"}
          </button>
        }
      />

      <div className="bg-[#FFF7E6] border border-[#E0A400] text-[#8A6400] rounded-md p-3 mb-4 text-xs flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        This is a record only — it does <b className="mx-1">not</b> change your stock counts. Use “Sell” or “Add Stock” to adjust quantities.
      </div>

      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 mb-4 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Couldn't load transfers. Run <span className="font-mono mx-1">supabase/transfers.sql</span> once, then reload.
        </div>
      )}

      {adding && (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4 space-y-3">
          <Field label="Direction">
            <div className="flex gap-2">
              {[
                { v: "out", label: "Taken to another branch" },
                { v: "in", label: "Received from a branch" },
              ].map((o) => {
                const active = form.direction === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setForm({ ...form, direction: o.v })}
                    className={`flex-1 rounded-md py-2.5 text-sm font-semibold border ${active ? "bg-[#2563EB] text-white border-[#2563EB]" : "border-[#DEE3E9] text-[#5A6472]"}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={form.direction === "out" ? "Which branch received it?" : "Which branch sent it?"}>
            <input value={form.otherBranch} onChange={(e) => setForm({ ...form, otherBranch: e.target.value })} placeholder="e.g. Jaspare Auto Main" className={inputCls} />
          </Field>
          <Field label="Item / part">
            <input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} list="transfer-parts" placeholder="Part name or description" className={inputCls} />
          </Field>
          <datalist id="transfer-parts">
            {items.slice(0, 300).map((it) => (
              <option key={it.code} value={it.name || `${it.brand} ${it.model}`} />
            ))}
          </datalist>
          <div className="flex gap-3">
            <div className="w-28">
              <Field label="Quantity">
                <input type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className={inputCls + " text-center"} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Note (optional)">
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. urgent order for client" className={inputCls} />
              </Field>
            </div>
          </div>
          <button
            onClick={save}
            disabled={!form.item.trim() || (Number(form.qty) || 0) <= 0}
            className="w-full bg-[#2563EB] text-white font-bold uppercase tracking-wide rounded-md py-2.5 text-sm disabled:opacity-50"
          >
            Save record
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-[#5A6472] text-sm py-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[#5A6472] text-sm py-8 text-center">No transfers recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => {
            const out = t.direction === "out";
            return (
              <div key={t.id} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${out ? "bg-[#DC3B2E22] text-[#DC3B2E]" : "bg-[#15926A22] text-[#15926A]"}`}>
                    {out ? "Taken out" : "Received"}
                  </span>
                  <span className="font-bold tabular-nums text-[#1B2430]">Qty {t.qty}</span>
                </div>
                <div className="text-sm text-[#1B2430] mt-1 font-semibold">{t.item}</div>
                <div className="flex items-center justify-between mt-1 text-xs text-[#5A6472]">
                  <span>
                    {out ? "To" : "From"}: {t.otherBranch || "—"}{t.note ? ` · ${t.note}` : ""}{t.by ? ` · ${t.by}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {fmtDateTime(t.ts)}
                    <button onClick={() => remove(t.id)} className="text-[#5A6472] hover:text-[#DC3B2E]" title="Delete record"><Trash2 size={13} /></button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Read-only list of previously saved quotes with their status. */
function PastQuotes({ past, onMakeReceipt }) {
  const statusCls = {
    Sent: "bg-[#2E86DE22] text-[#2E86DE]",
    Accepted: "bg-[#15926A22] text-[#15926A]",
    Rejected: "bg-[#DC3B2E22] text-[#DC3B2E]",
    Converted: "bg-[#15926A22] text-[#15926A]",
    Draft: "bg-[#6B748022] text-[#5A6472]",
  };
  if (past.length === 0) {
    return <div className="text-[#5A6472] text-sm py-8 text-center">No saved quotes yet.</div>;
  }
  return (
    <div className="space-y-2">
      {past.map((q) => (
        <div key={q.id} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold text-[#2563EB]">{q.number}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${statusCls[q.status] || statusCls.Draft}`}>
              {q.status}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1 text-sm">
            <span className="text-[#1B2430]">{q.customer || "—"}</span>
            <span className="text-[#2563EB] font-bold tabular-nums">KES {q.total.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-[#5A6472]">
            <span>{q.lines.length} item(s){q.phone ? ` · ${q.phone}` : ""}</span>
            <span>{fmtDateTime(q.ts)}</span>
          </div>

          {/* The customer came back and paid. Their parts and prices were agreed
              on this quote, and typing the same list again off the printed page
              is the one moment in the day where a slip changes what somebody is
              charged. The discount comes across too — it was agreed with them,
              and dropping it charges them more than the paper they are holding.

              An already-converted quote keeps the button. A customer can come
              back for the same parts twice, and refusing would send staff back to
              typing it by hand. */}
          {onMakeReceipt && q.lines.length > 0 && (
            <button
              type="button"
              onClick={() => onMakeReceipt({ ...quoteToDraft(q), key: `quote-${q.id}` })}
              className="mt-2 w-full text-xs font-bold uppercase tracking-wide text-[#2563EB] border border-[#2563EB] rounded-md py-2 flex items-center justify-center gap-2 hover:bg-[#2563EB] hover:text-white transition-colors"
            >
              <Receipt size={14} />
              {q.status === "Converted" ? "Make another receipt from this" : "Turn this into a receipt"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
