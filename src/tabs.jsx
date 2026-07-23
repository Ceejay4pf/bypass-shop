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
} from "lucide-react";
import {
  isBiometricSupported, isLockEnabled, enableLock, disableLock,
} from "./lib/appLock.js";
import {
  CONDITIONS, SIDES, BRANDS, PAYMENT, generateCode, formatLocation,
  LOW_STOCK_THRESHOLD,
} from "./data.js";
import {
  Field, inputCls, SectionTitle, ItemCard, StatCard, StockBadge,
  timeAgo, fmtDateTime, BarChart, TrendChart,
} from "./ui.jsx";

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
  return [
    i.code, i.name, i.brand, i.model, i.series, i.condition, i.color,
    i.side, i.variant, i.supplier, i.location, cat?.label, ledgerText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
};

/* ======================= DASHBOARD ======================= */
export function DashboardTab({ items, notifications, categories, user, onNav, onOpenLedger }) {
  const totalItems = items.length;
  const totalQty = items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const lowStock = items.filter((i) => i.qty <= (i.min ?? LOW_STOCK_THRESHOLD));

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
        <StatCard icon={Boxes} label="Inventory Items" value={totalItems} tone="gold" onClick={() => onNav("inventory")} />
        <StatCard icon={Layers} label="Total Stock Qty" value={totalQty} tone="blue" onClick={() => onNav("inventory")} />
        <StatCard icon={ShoppingCart} label="Items Sold Today" value={soldToday} tone="green" onClick={() => onNav("sell")} />
        <StatCard icon={DollarSign} label="Today's Sales" value={`KES ${revenueToday.toLocaleString()}`} tone="green" onClick={() => onNav("reports")} />
        <StatCard icon={AlertTriangle} label="Low Stock Items" value={lowStock.length} tone="red" onClick={() => onNav("reports")} />
        <StatCard icon={Bell} label="Total Activity" value={notifications.length} tone="purple" onClick={() => onNav("notify")} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
            <Layers size={15} className="text-[#2563EB]" /> Stock by Category
          </div>
          <BarChart data={byCategory} />
        </div>
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
            <TrendingUp size={15} className="text-[#2563EB]" /> Sales Trend (7 days)
          </div>
          <TrendChart points={trend} />
        </div>
      </div>

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Bell size={15} className="text-[#2563EB]" /> Recent Activity
          </div>
          <button onClick={() => onNav("notify")} className="text-xs text-[#2563EB] font-semibold">
            View all
          </button>
        </div>
        {notifications.length === 0 && <div className="text-[#5A6472] text-sm italic">No activity yet.</div>}
        <div className="space-y-2">
          {notifications.slice(0, 5).map((n) => (
            <NotifRow key={n.id} n={n} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ======================= SEARCH ======================= */
export function SearchTab({ items, categories, onDelete }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => matchesQuery(i, categories.find((c) => c.key === i.cat), q));
  }, [items, categories, query]);

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Find a part" title="Search Inventory" />
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Toyota Axela 2018 Front Bumper, or FBM-MZD..."
          className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-md pl-10 pr-9 py-3 text-[#1B2430] placeholder-[#5A6472] outline-none focus:border-[#2563EB]"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6472]">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="text-[#5A6472] text-xs mb-2">
        {results.length} result{results.length !== 1 ? "s" : ""}
      </div>
      <div className="space-y-2">
        {results.map((it) => (
          <ItemCard key={it.code} item={it} categories={categories} onDelete={onDelete} />
        ))}
        {results.length === 0 && (
          <div className="text-[#5A6472] text-sm py-8 text-center">No part matches that search.</div>
        )}
      </div>
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

    const bulkDelete = () => {
      const codes = list.filter((it) => selected.has(it.code)).map((it) => it.code);
      if (!codes.length) return;
      if (confirm(`Delete ${codes.length} selected item(s)? This cannot be undone.`)) {
        onBulkDelete?.(codes);
        exitSelect();
      }
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
                    onClick={() => {
                      if (confirm(`Delete ${it.code} — ${it.name}? This cannot be undone.`)) onDelete(it.code);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded bg-[#EEF2F6] text-[#5A6472] hover:text-[#DC3B2E] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete item"
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
                <Trash2 size={15} /> Delete
              </button>
            )}
          </div>
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

  const countFor = (key) => items.filter((i) => i.cat === key).length;

  const openPdf = () => {
    const chosen = catKey === "all" ? categories : categories.filter((c) => c.key === catKey);
    const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });

    const sections = chosen
      .map((c) => {
        const list = items
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
            </tr>`
          )
          .join("");
        const qty = list.reduce((s, i) => s + Number(i.qty || 0), 0);
        return `<div class="sec">
            <div class="sech">${escapeHtml(c.label)} <span class="sechn">${list.length} item(s) · ${qty} in stock · Shelf ${escapeHtml(c.shelf || "—")}</span></div>
            <table>
              <thead><tr>
                <th class="c">#</th><th>Code</th><th>Item</th><th>Side</th><th>Color</th>
                <th class="c">Qty</th><th class="r">Price (KES)</th><th>Location</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      })
      .join("");

    const totalItems = items.filter((i) => catKey === "all" || i.cat === catKey).length;
    const title = catKey === "all" ? "Full Stock List" : `${categories.find((c) => c.key === catKey)?.label || ""} — Stock List`;

    const body = sections || `<div class="empty">No items to list for this category yet.</div>`;

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

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Export a stock listing" title="Print Stock" />
      <div className="text-[#5A6472] text-xs mb-4">
        Choose a category and print (or save as PDF) every part currently in it — Wings, Side Mirrors,
        Bumpers and so on. Choose <span className="font-semibold">All categories</span> for the full list.
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

      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[#5A6472]">Items to be listed</span>
          <span className="font-bold text-[#2563EB]">
            {catKey === "all" ? items.length : countFor(catKey)}
          </span>
        </div>
        <p className="text-xs text-[#5A6472] mt-2 leading-relaxed">
          The PDF shows code, item, side, color, quantity, price and location. On a phone the print
          dialog has a “Save as PDF” option you can then share on WhatsApp.
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
    Promise.all(
      files.map(
        (f) =>
          new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(f);
          })
      )
    ).then((urls) => setImages((prev) => [...prev, ...urls].slice(0, 4)));
  };

  const submit = () => {
    if (!brand.trim() || !model.trim() || !price || qty === "") {
      setErr("Brand, model, price and starting quantity are required.");
      return;
    }
    setErr("");
    onAdd({
      cat,
      brand: brand.trim(),
      model: model.trim(),
      series: series.trim(),
      yearFrom: Number(yearFrom) || new Date().getFullYear(),
      yearTo: Number(yearTo) || Number(yearFrom) || new Date().getFullYear(),
      condition,
      side,
      color: color.trim(),
      name:
        `${categories.find((c) => c.key === cat)?.label || ""} — ${brand.trim()} ${model.trim()}${
          color.trim() ? ` (${color.trim()})` : ""
        }`.trim(),
      price: Number(price),
      qty: Number(qty),
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
            <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2015" className={inputCls} />
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
          <Field label="Price (KES)">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="8500" className={inputCls} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Starting qty">
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" className={inputCls} />
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
          <ImagePlus size={16} /> <span className="text-sm">Upload images</span>
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

/* ======================= ADD STOCK ======================= */
export function AddStockTab({ items, categories, onAddStock }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
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
export function EditPartsTab({ items, categories, onSave }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

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

function EditPartForm({ item, categories, onCancel, onSave }) {
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
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const brandModels = BRANDS.find((b) => b.name.toLowerCase() === brand.toLowerCase())?.models || [];

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
        yearFrom: Number(yearFrom) || item.yearFrom,
        yearTo: Number(yearTo) || Number(yearFrom) || item.yearTo,
        condition,
        side,
        color: color.trim(),
        name: name.trim(),
        price: Number(price),
        min: Number(min) || LOW_STOCK_THRESHOLD,
        location: location.trim(),
        supplier: supplier.trim(),
        notes: notes.trim(),
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

      <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A / Rack 03 / Shelf 02 / Bin 05" className={inputCls} /></Field>
      <Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} /></Field>
      <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>

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
export function SellTab({ items, categories, onSell }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState("1");
  const [buyer, setBuyer] = useState("");
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState("Paid");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((i) => matchesQuery(i, categories.find((c) => c.key === i.cat), q)).slice(0, 8);
  }, [items, categories, query]);

  const n = selected ? Math.max(1, Math.min(Number(qty) || 1, selected.qty)) : 0;
  const total = selected ? n * Number(selected.price) : 0;

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
          <Field label={`Quantity sold (max ${selected.qty})`}>
            <input type="number" min="1" max={selected.qty} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
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
          <div className="text-sm text-[#5A6472] mb-3">
            Total:{" "}
            <span className="text-[#2563EB] font-bold">KES {total.toLocaleString()}</span>{" "}
            ({n} × {Number(selected.price).toLocaleString()})
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setSelected(null); setQty("1"); setBuyer(""); setPhone(""); setQuery(""); }}
              className="flex-1 border border-[#DEE3E9] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#5A6472]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSell({ code: selected.code, qty: n, buyer, phone, paid: payment === "Paid", total });
                setSelected(null); setQty("1"); setBuyer(""); setPhone(""); setQuery("");
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
function NotifRow({ n, compact }) {
  const typeMeta = {
    sale: { label: "Sold", cls: "bg-[#DC3B2E22] text-[#DC3B2E]" },
    stock: { label: "Stock added", cls: "bg-[#15926A22] text-[#15926A]" },
    new_item: { label: "New item", cls: "bg-[#2E86DE22] text-[#2E86DE]" },
    adjust: { label: "Adjusted", cls: "bg-[#2E86DE22] text-[#2E86DE]" },
    delete: { label: "Deleted", cls: "bg-[#6B748022] text-[#5A6472]" },
    login: { label: "Login", cls: "bg-[#7C5CD622] text-[#7C5CD6]" },
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

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs sm:text-sm text-[#2563EB]">{n.code}</span>
        <span className="text-[#5A6472] text-xs">{compact ? timeAgo(n.ts) : fmtDateTime(n.ts)}</span>
      </div>
      <p className="text-sm mt-1">
        {n.name} <span className="text-[#5A6472]">× {n.qty}</span>
      </p>
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
    </div>
  );
}

export function NotifyTab({ notifications }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);
  const tabs = [
    ["all", "All"],
    ["sale", "Sales"],
    ["stock", "Restocks"],
    ["new_item", "New items"],
  ];
  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Sent to Jaspare Auto · Main Shop" title="Notifications" />
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
export function ReportsTab({ items, notifications, categories }) {
  const [range, setRange] = useState("daily");

  const now = new Date();
  const startOf = {
    daily: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); },
    weekly: () => now.getTime() - 7 * 86400000,
    monthly: () => now.getTime() - 30 * 86400000,
    yearly: () => now.getTime() - 365 * 86400000,
  }[range]();

  const sales = notifications.filter((n) => n.type === "sale" && n.ts >= startOf);
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

  const ranges = [
    ["daily", "Daily"],
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
    ["yearly", "Yearly"],
  ];

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
export function QuotationTab({ items, user }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [lines, setLines] = useState([{ desc: "", qty: "1", price: "" }]);
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
