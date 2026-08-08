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
  Wand2, Sun, Moon, Smartphone, CheckCircle2,
} from "lucide-react";
import { THEME_CHOICES, useTheme, useThemeMode, readableOnDark } from "./lib/theme.js";
import { parsePartsList, rowToNewItem } from "./lib/parseParts.js";
import { CAPABILITIES } from "./lib/roles.js";
import { ROLE_ACCOUNTS, defaultRolePassword } from "./lib/roleAccounts.js";
import { changeRolePassword } from "./lib/auth.js";
import { SHOP_INFO } from "./lib/shopInfo.js";
import {
  isBiometricSupported, isLockEnabled, enableLock, disableLock,
} from "./lib/appLock.js";
import {
  CONDITIONS, SIDES, BRANDS, PAYMENT, generateCode, formatLocation,
  LOW_STOCK_THRESHOLD,
} from "./data.js";
import {
  Field, inputCls, SectionTitle, ItemCard, StatCard, StockBadge,
  timeAgo, fmtDateTime, BarChart, TrendChart, DonutChart,
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
  return [
    i.code, i.name, i.brand, i.model, i.series, i.condition, i.color,
    i.side, i.variant, i.supplier, i.location, cat?.label, ledgerText, yearText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
};

/* ======================= DASHBOARD ======================= */
export function DashboardTab({ items, notifications, categories, user, onNav, onOpenLedger, admin = false }) {
  const totalItems = items.length;
  const totalQty = items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const lowStock = items.filter((i) => i.qty <= (i.min ?? LOW_STOCK_THRESHOLD));

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
        <StatCard icon={Boxes} label="Inventory Items" value={totalItems} tone="purple" onClick={() => onNav("inventory")} />
        <StatCard icon={Layers} label="Total Stock Qty" value={totalQty} tone="blue" onClick={() => onNav("inventory")} />
        <StatCard icon={ShoppingCart} label="Items Sold Today" value={soldToday} tone="green" onClick={() => onNav("sell")} />
        <StatCard icon={DollarSign} label="Today's Sales" value={`KES ${revenueToday.toLocaleString()}`} tone="yellow" onClick={() => onNav("reports")} />
        <StatCard icon={AlertTriangle} label="Low Stock Items" value={lowStock.length} tone="red" onClick={() => onNav("reports")} />
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

export function SearchTab({ items, categories, onDelete, onPick, canEdit = false }) {
  // Step 1: pick a category (or "All"). Step 2: search within it.
  // null = nothing chosen yet (show the category picker first).
  const [cat, setCat] = useState(null); // "__all__" | category key | null
  const [query, setQuery] = useState("");
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

  const lowCount = (list) =>
    list.filter((i) => i.qty <= (i.min ?? LOW_STOCK_THRESHOLD)).length;

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
    const cat = categories.find((c) => c.key === openCat) || {};
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
        {categories.map((cat) => {
          const list = grouped[cat.key] || [];
          const low = lowCount(list);
          return (
            <button
              key={cat.key}
              onClick={() => openSection(cat.key)}
              className="text-left bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 hover:border-[#2563EB] active:scale-[0.99] transition-all flex items-center gap-3"
            >
              <span className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold uppercase tracking-wide text-sm truncate">{cat.label}</div>
                <div className="text-[#5A6472] text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>Shelf {cat.shelf}</span>
                  <span>· {list.length} item(s)</span>
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
    </div>
  );
}

/* ======================= LOW STOCK (own module) ======================= */
// A dedicated screen for parts at or below their reorder level, moved off the
// dashboard so it reads like Inventory — its own module in the sidebar.
export function LowStockTab({ items, categories, onOpenLedger }) {
  const lowStock = useMemo(
    () =>
      items
        .filter((i) => i.qty <= (i.min ?? LOW_STOCK_THRESHOLD))
        .sort((a, b) => Number(a.qty) - Number(b.qty)),
    [items]
  );
  const catLabel = (key) => categories.find((c) => c.key === key)?.label || key;

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Parts to reorder" title="Low Stock" />
      <div className="text-[#5A6472] text-xs mb-4">
        {lowStock.length} item{lowStock.length !== 1 ? "s" : ""} at or below their reorder level.
        Tap any row to view its history.
      </div>

      {lowStock.length === 0 ? (
        <div className="bg-[#E6F6EF] border border-[#15926A55] rounded-lg p-6 text-center">
          <Check size={22} className="text-[#15926A] mx-auto mb-2" />
          <div className="text-sm font-semibold text-[#15926A]">All good</div>
          <div className="text-xs text-[#5A6472] mt-1">Every item is above its reorder level.</div>
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
  // "all" prints the whole shop grouped by category.
  const [catKey, setCatKey] = useState("all");
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
    () => items.filter((i) => (catKey === "all" || i.cat === catKey) && inDate(i)),
    [items, catKey, dateMode, onDay]
  );
  const countFor = (key) => items.filter((i) => i.cat === key && inDate(i)).length;

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
    const chosen = catKey === "all" ? categories : categories.filter((c) => c.key === catKey);
    const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });

    const sections = chosen
      .map((c) => {
        const list = filtered
          .filter((i) => i.cat === c.key)
          .sort((a, b) => String(a.code).localeCompare(String(b.code)));
        if (list.length === 0) return "";
        const rows = list
          .map(
            (i, idx) => `<tr>
              <td class="c">${idx + 1}</td>
              <td class="mono">${escapeHtml(i.code)}</td>
              <td>${escapeHtml(i.name || `${i.brand || ""} ${i.model || ""}`)}</td>
              <td>${escapeHtml(i.side || "")}</td>
              <td>${escapeHtml(i.color || "")}</td>
              <td class="c">${Number(i.qty || 0)}</td>
              <td class="r">${Number(i.price) ? Number(i.price).toLocaleString() : "—"}</td>
              <td>${escapeHtml(i.location || "")}</td>
              <td>${escapeHtml(fmtAdded(i))}</td>
            </tr>`
          )
          .join("");
        const qty = list.reduce((s, i) => s + Number(i.qty || 0), 0);
        return `<div class="sec">
            <div class="sech">${escapeHtml(c.label)} <span class="sechn">${list.length} item(s) · ${qty} in stock · Shelf ${escapeHtml(c.shelf || "—")}</span></div>
            <table>
              <thead><tr>
                <th class="c">#</th><th>Code</th><th>Item</th><th>Side</th><th>Color</th>
                <th class="c">Qty</th><th class="r">Price (KES)</th><th>Location</th><th>Date added</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      })
      .join("");

    const totalItems = filtered.length;
    const catName = catKey === "all" ? "Full Stock List" : `${categories.find((c) => c.key === catKey)?.label || ""} — Stock List`;
    const title = dateMode === "all" ? catName : `${catName} · ${dateLabel()}`;

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
  <div class="foot">Generated from Bypass Shop cloud inventory on ${today}. Prices shown are current selling prices.</div>
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
        Print (or save as PDF) parts by category — Wings, Side Mirrors, Bumpers… and optionally only
        those <span className="font-semibold">added on a chosen date</span>, so you can print a report
        of newly-added stock.
      </div>

      <Field label="Category to print">
        <select value={catKey} onChange={(e) => setCatKey(e.target.value)} className={inputCls}>
          <option value="all">All categories (full stock list)</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} — {countFor(c.key)} item(s)
            </option>
          ))}
        </select>
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
        <div className="flex items-center justify-between">
          <span className="text-[#5A6472]">Items to be listed</span>
          <span className="font-bold text-[#2563EB]">{filtered.length}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[#5A6472]">Filter</span>
          <span className="text-xs font-semibold text-[#1B2430]">{dateLabel()}</span>
        </div>
        <p className="text-xs text-[#5A6472] mt-2 leading-relaxed">
          The PDF shows code, item, side, color, quantity, price, location and date added. On a phone the
          print dialog has a “Save as PDF” option you can then share on WhatsApp.
        </p>
      </div>

      <button
        onClick={openPdf}
        className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
      >
        <FileText size={18} /> Generate PDF / Print
      </button>
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

/* ======================= ADD ITEM ======================= */
export function AddItemTab({ items, categories, onAdd }) {
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
  const [min, setMin] = useState("3");
  const [warehouse, setWarehouse] = useState("");
  const [rack, setRack] = useState("");
  const [shelf, setShelf] = useState("");
  const [bin, setBin] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState([]); // data URLs
  const [err, setErr] = useState("");

  const brandModels = BRANDS.find((b) => b.name.toLowerCase() === brand.toLowerCase())?.models || [];
  const previewCode = generateCode({ cat, brand, model, yearFrom }, items);
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
      qty: Number(qty) || 0,
      min: Number(min) || LOW_STOCK_THRESHOLD,
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
        Fill in whatever else you know now — price, quantity, year, colour and photos can all be
        added or edited later from Edit Parts and Add Stock.
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
              {SIDES.map((s) => (
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
          <Field label="Starting qty — optional">
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Low-stock at">
            <input type="number" value={min} onChange={(e) => setMin(e.target.value)} className={inputCls} />
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
    </div>
  );
}

/* ======================= BULK ENTRY =======================
   Paste a list the way it was written - on WhatsApp, in a notebook,
   in a supplier's message - and the shop reads it. Every line becomes
   a row you can correct before anything is saved. Nothing is written
   to the inventory until the Save button is pressed.
*/
export function BulkAddTab({ items, categories, onAddMany }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState(null); // null = still on the paste step
  const [openId, setOpenId] = useState(null); // which row is expanded for editing
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { added, failed }

  const read = () => {
    const parsed = parsePartsList(text);
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
        if (["DOR", "HDL", "TLL", "SMI", "SMN", "WNL", "WNR"].includes(next.cat) && !next.side) {
          miss.push("side");
        }
        return { ...next, missing: miss };
      })
    );

  const drop = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const ready = (rows || []).filter((r) => r.missing.length === 0);
  const needsWork = (rows || []).filter((r) => r.missing.length > 0);

  const save = async () => {
    setSaving(true);
    const result = await onAddMany(ready.map((r) => rowToNewItem(r, categories)));
    setSaving(false);
    setDone(result);
    // Keep only the rows that still need attention, so the screen shows
    // exactly what is left to do.
    setRows(needsWork);
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
            You can add a price and quantity if you know them — <span className="font-mono">@ 8500</span>{" "}
            and <span className="font-mono">x2</span> — and words like{" "}
            <span className="font-mono">brand new</span>, <span className="font-mono">ex japan</span>,{" "}
            <span className="font-mono">xenon</span> are picked up too. Anything left out can be filled
            in on the next screen or later from Edit Parts.
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
              {done.added} part{done.added !== 1 ? "s" : ""} added to the inventory.
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
          <div className="flex gap-2 mb-4 text-xs">
            <span className="bg-[#15926A22] text-[#15926A] font-bold rounded px-2 py-1">
              {ready.length} ready
            </span>
            {needsWork.length > 0 && (
              <span className="bg-[#DC3B2E22] text-[#DC3B2E] font-bold rounded px-2 py-1">
                {needsWork.length} need{needsWork.length === 1 ? "s" : ""} a detail
              </span>
            )}
          </div>

          <div className="space-y-2 mb-4">
            {rows.map((r) => (
              <BulkRow
                key={r.id}
                row={r}
                categories={categories}
                items={items}
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
            {saving ? "Saving…" : `Save ${ready.length} part${ready.length !== 1 ? "s" : ""} to inventory`}
          </button>
        </>
      )}
    </div>
  );
}

/* One parsed line, collapsed to a summary until tapped. */
function BulkRow({ row, categories, items, open, onToggle, onPatch, onDrop }) {
  const cat = categories.find((c) => c.key === row.cat);
  const bad = row.missing.length > 0;
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
    <div className={`bg-[#FFFFFF] border rounded-md overflow-hidden ${bad ? "border-[#DC3B2E]" : "border-[#DEE3E9]"}`}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-start gap-2">
        <span
          className="w-1.5 self-stretch rounded-full shrink-0"
          style={{ background: bad ? "#DC3B2E" : cat?.color || "#DEE3E9" }}
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
              row.qty ? `${row.qty} pcs` : "",
              row.price ? `KES ${Number(row.price).toLocaleString()}` : "",
            ]
              .filter(Boolean)
              .join(" · ") || row.raw}
          </div>
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
                  {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
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
              <Field label="Quantity — optional">
                <input type="number" value={row.qty} onChange={(e) => onPatch({ qty: e.target.value })} placeholder="0" className={inputCls} />
              </Field>
            </div>
          </div>

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
  const [min, setMin] = useState(item.min ?? 3);
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
        min: Number(min) || LOW_STOCK_THRESHOLD,
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
              {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
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
          <Field label="Low-stock at"><input type="number" value={min} onChange={(e) => setMin(e.target.value)} className={inputCls} /></Field>
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
export function SellTab({ items, categories, onSell, initialCode = "" }) {
  const [query, setQuery] = useState("");
  // A part long-pressed in Search arrives already chosen.
  const [selected, setSelected] = useState(
    () => (initialCode ? items.find((i) => i.code === initialCode) || null : null)
  );
  const [qty, setQty] = useState("1");
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
  const total = selected ? n * Number(selected.price) : 0;
  const reset = () => { setSelected(null); setQty("1"); setBuyer(""); setPhone(""); setQuery(""); setDeduct(true); setSourceBranch(""); setMethod("Cash"); };

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Record a sale" title="Sell Item" />
      {!selected ? (
        <>
          <Field label="Find the part sold">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Code, name, or vehicle…" className={inputCls} autoFocus />
          </Field>
          <div className="space-y-2">
            {matches.map((it) => (
              <button
                key={it.code}
                onClick={() => it.qty > 0 && setSelected(it)}
                disabled={it.qty === 0}
                className={`w-full text-left ${it.qty === 0 ? "opacity-50" : ""}`}
              >
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
          <Field label={deduct ? `Quantity sold (max ${selected.qty})` : "Quantity sold"}>
            <input type="number" min="1" max={deduct ? selected.qty : undefined} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          </Field>
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
            ({n} × {Number(selected.price).toLocaleString()})
            {!deduct && (
              <div className="mt-1 text-[12px] text-[#B45309]">
                Stock here will NOT change — recorded as supplied by {sourceBranch || "another branch"}.
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
            <button
              onClick={() => {
                onSell({ code: selected.code, qty: n, buyer, phone, paid: payment === "Paid",
                         total, method, deduct, sourceBranch });
                reset();
              }}
              className="flex-1 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2"
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
  const filtered = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);
  const tabs = [
    ["all", "All"],
    ["sale", "Sales"],
    ["stock", "Restocks"],
    ["new_item", "New items"],
    ["return", "Returns"],
  ];

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

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {tabs.map(([k, label]) => (
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
      {filtered.length === 0 && <div className="text-[#5A6472] text-sm py-8 text-center">No activity recorded yet.</div>}
      <div className="space-y-2">
        {filtered.map((n) => (
          <NotifRow key={n.id} n={n} />
        ))}
      </div>
    </div>
  );
}

/* ======================= REPORTS ======================= */
export function ReportsTab({ items, notifications, categories, admin = false, onChanged }) {
  const [range, setRange] = useState("daily");
  // Drill-down: the individual sales behind the totals.
  const [showSales, setShowSales] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const [byPerson, setByPerson] = useState(null);

  const now = new Date();
  const startOf = {
    daily: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); },
    weekly: () => now.getTime() - 7 * 86400000,
    monthly: () => now.getTime() - 30 * 86400000,
    yearly: () => now.getTime() - 365 * 86400000,
  }[range]();

  // Undone sales don't count towards takings — the goods came back.
  const sales = notifications.filter((n) => n.type === "sale" && n.ts >= startOf && !n.returnedAt);
  const unitsSold = sales.reduce((s, n) => s + Number(n.qty || 0), 0);
  const revenue = sales.reduce((s, n) => s + Number(n.total || 0), 0);
  const paidRevenue = sales.filter((n) => n.paid).reduce((s, n) => s + Number(n.total || 0), 0);
  const pending = revenue - paidRevenue;

  const topSelling = useMemo(() => {
    const map = {};
    for (const n of sales) {
      map[n.code] = map[n.code] || { label: n.code, value: 0, color: "#2563EB" };
      map[n.code].value += Number(n.qty || 0);
    }
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [sales]);

  const lowStock = items.filter((i) => i.qty <= (i.min ?? LOW_STOCK_THRESHOLD));
  const inventoryValue = items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);

  // Who sold what, over the chosen range.
  const sellers = useMemo(() => {
    const map = {};
    for (const n of sales) {
      const who = n.by || "Unknown";
      map[who] = map[who] || { person: who, count: 0, units: 0, revenue: 0 };
      map[who].count += 1;
      map[who].units += Number(n.qty || 0);
      map[who].revenue += Number(n.total || 0);
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  /* Stock taken off the books in this period, grouped by where it went.
     This is the answer to "the part is gone, who has it?" - and it is the
     one report the head office asks for when a count comes up short. */
  const removed = useMemo(
    () => notifications.filter((n) => n.type === "delete" && n.ts >= startOf),
    [notifications, startOf]
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

  const ranges = [
    ["daily", "Daily"],
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
    ["yearly", "Yearly"],
  ];

  // One person's full record, opened from the seller list.
  if (byPerson) {
    return (
      <PersonActivity person={byPerson} onBack={() => setByPerson(null)} onChanged={onChanged} />
    );
  }

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Business summary" title="Reports" />
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {ranges.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap border ${
              range === k ? "bg-[#2563EB] text-[#F3F5F8] border-[#2563EB]" : "border-[#DEE3E9] text-[#5A6472]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={ShoppingCart} label="Units Sold" value={unitsSold} tone="green" />
        <StatCard icon={DollarSign} label="Revenue" value={`KES ${revenue.toLocaleString()}`} tone="gold" />
        <StatCard icon={Check} label="Paid" value={`KES ${paidRevenue.toLocaleString()}`} tone="green" />
        <StatCard icon={AlertTriangle} label="Pending" value={`KES ${pending.toLocaleString()}`} tone="red" />
      </div>

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
              <div className="text-[#5A6472] text-sm italic">No sales in this period.</div>
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
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">Top Selling Parts</div>
          <BarChart data={topSelling} />
        </div>
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">Inventory Summary</div>
          <div className="space-y-2 text-sm">
            <Row label="Total items" value={items.length} />
            <Row label="Total stock quantity" value={items.reduce((s, i) => s + Number(i.qty), 0)} />
            <Row label="Inventory value" value={`KES ${inventoryValue.toLocaleString()}`} />
            <Row label="Low-stock items" value={lowStock.length} tone={lowStock.length ? "red" : undefined} />
          </div>
        </div>
      </div>

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
          <AlertTriangle size={15} className="text-[#DC3B2E]" /> Low Stock Report
        </div>
        {lowStock.length === 0 && <div className="text-[#5A6472] text-sm italic">All items above their reorder level.</div>}
        <div className="space-y-1.5">
          {lowStock.map((i) => (
            <div key={i.code} className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs text-[#1B2430]">{i.code}</span>
              <span className="text-[#5A6472] truncate px-2 flex-1">{i.name}</span>
              <StockBadge item={i} />
            </div>
          ))}
        </div>
      </div>
    </div>
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

/* ======================= STAFF FEED (group chat) ======================= */
// One shop-wide group chat. Every signed-in staff member posts and reads
// here — enquiries, best-price questions, general info. Sender name + time
// show on each message; live via realtime.
export function StaffFeedTab({ userId, user, admin }) {
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

      {err && (
        <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-3 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

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

export function SettingsTab({ categories, user, email, admin }) {
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

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">Categories</div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5 text-xs bg-[#EEF2F6] border border-[#DEE3E9] rounded px-2 py-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="font-mono">{c.key}</span> {c.label}
            </span>
          ))}
        </div>
      </div>

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
export function QuotationTab({ items, user, initialCode = "" }) {
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
        <PastQuotes past={past} />
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
export function ReceiptTab({ items, user }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [paid, setPaid] = useState("");
  const [lines, setLines] = useState([{ desc: "", qty: "1", price: "" }]);
  const [savedNumber, setSavedNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [past, setPast] = useState([]);
  const [showPast, setShowPast] = useState(false);
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
        },
        user
      );
      setSavedNumber(rc.number);
      openPdf(rc.number);
      if (showPast) api.fetchReceipts().then(setPast).catch(() => {});
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
function PastQuotes({ past }) {
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
        </div>
      ))}
    </div>
  );
}
