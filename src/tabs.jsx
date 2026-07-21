/* ---------------------------------------------------------
   BYPASS SHOP — feature screens
--------------------------------------------------------- */
import React, { useMemo, useState } from "react";
import {
  Search, Plus, PackagePlus, ShoppingCart, Bell, Boxes, X, Check,
  AlertTriangle, TrendingUp, DollarSign, Package, Layers, ImagePlus,
  Trash2, Download, Upload, Settings as SettingsIcon, MapPin, Phone, FileText,
} from "lucide-react";
import {
  CONDITIONS, SIDES, BRANDS, PAYMENT, generateCode, formatLocation,
  LOW_STOCK_THRESHOLD,
} from "./data.js";
import {
  Field, inputCls, SectionTitle, ItemCard, StatCard, StockBadge,
  timeAgo, fmtDateTime, BarChart, TrendChart,
} from "./ui.jsx";

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
export function DashboardTab({ items, notifications, categories, user, onNav }) {
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
        <StatCard icon={Boxes} label="Inventory Items" value={totalItems} tone="gold" />
        <StatCard icon={Layers} label="Total Stock Qty" value={totalQty} tone="blue" />
        <StatCard icon={ShoppingCart} label="Items Sold Today" value={soldToday} tone="green" />
        <StatCard icon={DollarSign} label="Today's Sales" value={`KES ${revenueToday.toLocaleString()}`} tone="green" />
        <StatCard icon={AlertTriangle} label="Low Stock Items" value={lowStock.length} tone="red" />
        <StatCard icon={Bell} label="Total Activity" value={notifications.length} tone="purple" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
            <Layers size={15} className="text-[#FFC72C]" /> Stock by Category
          </div>
          <BarChart data={byCategory} />
        </div>
        <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wide">
            <TrendingUp size={15} className="text-[#FFC72C]" /> Sales Trend (7 days)
          </div>
          <TrendChart points={trend} />
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-[#2A1E1B] border border-[#E8483A55] rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-bold uppercase tracking-wide text-[#E8483A]">
            <AlertTriangle size={15} /> Low Stock Summary
          </div>
          <div className="space-y-1.5">
            {lowStock.slice(0, 6).map((i) => (
              <div key={i.code} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-[#ECE8E1]">{i.code}</span>
                <span className="text-[#8B8F94] truncate px-2 flex-1">{i.name}</span>
                <span className="text-[#E8483A] font-semibold">{i.qty} left</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Bell size={15} className="text-[#FFC72C]" /> Recent Activity
          </div>
          <button onClick={() => onNav("notify")} className="text-xs text-[#FFC72C] font-semibold">
            View all
          </button>
        </div>
        {notifications.length === 0 && <div className="text-[#8B8F94] text-sm italic">No activity yet.</div>}
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
export function SearchTab({ items, categories }) {
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
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8F94]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Toyota Axela 2018 Front Bumper, or FBM-MZD..."
          className="w-full bg-[#1F2226] border border-[#33373C] rounded-md pl-10 pr-9 py-3 text-[#ECE8E1] placeholder-[#8B8F94] outline-none focus:border-[#FFC72C]"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8F94]">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="text-[#8B8F94] text-xs mb-2">
        {results.length} result{results.length !== 1 ? "s" : ""}
      </div>
      <div className="space-y-2">
        {results.map((it) => (
          <ItemCard key={it.code} item={it} categories={categories} />
        ))}
        {results.length === 0 && (
          <div className="text-[#8B8F94] text-sm py-8 text-center">No part matches that search.</div>
        )}
      </div>
    </div>
  );
}

/* ======================= INVENTORY ======================= */
export function InventoryTab({ items, categories, onDelete, onOpenLedger }) {
  const grouped = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.key] = [];
    for (const it of items) (map[it.cat] = map[it.cat] || []).push(it);
    return map;
  }, [items, categories]);

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Full stock, by section" title="Inventory" />
      <div className="space-y-6">
        {categories.map((cat) => (
          <div key={cat.key}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
              <span className="text-sm font-bold uppercase tracking-wide">{cat.label}</span>
              <span className="text-[#8B8F94] text-xs">· Shelf {cat.shelf}</span>
              <span className="text-[#8B8F94] text-xs">· {(grouped[cat.key] || []).length} item(s)</span>
            </div>
            <div className="space-y-2">
              {(grouped[cat.key] || []).length === 0 && (
                <div className="text-[#8B8F94] text-xs italic pl-1">No items yet in this section.</div>
              )}
              {(grouped[cat.key] || []).map((it) => (
                <div key={it.code} className="relative group">
                  <button onClick={() => onOpenLedger?.(it.code)} className="w-full text-left" title="View movement history">
                    <ItemCard item={it} categories={categories} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${it.code} — ${it.name}? This cannot be undone.`)) onDelete(it.code);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded bg-[#16181B99] text-[#8B8F94] hover:text-[#E8483A] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
        <label className="flex items-center gap-2 cursor-pointer bg-[#1F2226] border border-dashed border-[#33373C] rounded-md px-3 py-3 text-[#8B8F94] hover:border-[#FFC72C]">
          <ImagePlus size={16} /> <span className="text-sm">Upload images</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {images.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt="" className="w-16 h-16 object-cover rounded border border-[#33373C]" />
                <button
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-[#E8483A] text-white rounded-full w-5 h-5 flex items-center justify-center"
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

      <div className="text-xs text-[#8B8F94] mb-3 bg-[#1F2226] border border-[#33373C] rounded-md p-3">
        Auto-generated code:{" "}
        <span className="font-mono text-[#FFC72C]">{previewCode}</span>
        <br />
        Location: <span className="font-mono text-[#FFC72C]">{previewLoc}</span>
      </div>

      {err && (
        <div className="text-[#E8483A] text-sm mb-3 flex items-center gap-1.5">
          <AlertTriangle size={14} /> {err}
        </div>
      )}

      <button
        onClick={submit}
        className="w-full bg-[#FFC72C] text-[#16181B] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
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
              className="flex-1 border border-[#33373C] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#8B8F94]"
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
              className="flex-1 bg-[#FFC72C] text-[#16181B] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2"
            >
              <PackagePlus size={18} /> Confirm
            </button>
          </div>
        </>
      )}
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
                          ? "bg-[#4FA87A22] border-[#4FA87A] text-[#4FA87A]"
                          : "bg-[#E8483A22] border-[#E8483A] text-[#E8483A]"
                        : "border-[#33373C] text-[#8B8F94]"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="text-sm text-[#8B8F94] mb-3">
            Total:{" "}
            <span className="text-[#FFC72C] font-bold">KES {total.toLocaleString()}</span>{" "}
            ({n} × {Number(selected.price).toLocaleString()})
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setSelected(null); setQty("1"); setBuyer(""); setPhone(""); setQuery(""); }}
              className="flex-1 border border-[#33373C] rounded-md py-3 font-semibold uppercase text-sm tracking-wide text-[#8B8F94]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSell({ code: selected.code, qty: n, buyer, phone, paid: payment === "Paid", total });
                setSelected(null); setQty("1"); setBuyer(""); setPhone(""); setQuery("");
              }}
              className="flex-1 bg-[#FFC72C] text-[#16181B] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2"
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
    sale: { label: "Sold", cls: "bg-[#E8483A22] text-[#E8483A]" },
    stock: { label: "Stock added", cls: "bg-[#4FA87A22] text-[#4FA87A]" },
    new_item: { label: "New item", cls: "bg-[#5FB0FF22] text-[#5FB0FF]" },
    adjust: { label: "Adjusted", cls: "bg-[#5FB0FF22] text-[#5FB0FF]" },
    delete: { label: "Deleted", cls: "bg-[#7F889022] text-[#8B8F94]" },
  }[n.type] || { label: n.type, cls: "bg-[#7F889022] text-[#8B8F94]" };

  return (
    <div className="bg-[#1F2226] border border-[#33373C] rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs sm:text-sm text-[#FFC72C]">{n.code}</span>
        <span className="text-[#8B8F94] text-xs">{compact ? timeAgo(n.ts) : fmtDateTime(n.ts)}</span>
      </div>
      <p className="text-sm mt-1">
        {n.name} <span className="text-[#8B8F94]">× {n.qty}</span>
      </p>
      {n.type === "sale" && (
        <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
          <span className="text-[#8B8F94]">Customer: {n.buyer}</span>
          {n.phone ? <span className="text-[#8B8F94]">· {n.phone}</span> : null}
          {n.total ? <span className="text-[#FFC72C]">· KES {Number(n.total).toLocaleString()}</span> : null}
          <span className={`px-2 py-0.5 rounded font-semibold ${n.paid ? "bg-[#4FA87A22] text-[#4FA87A]" : "bg-[#E8483A22] text-[#E8483A]"}`}>
            {n.paid ? "Paid" : "Pending"}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${typeMeta.cls}`}>
          {typeMeta.label}
        </span>
        <span className="text-[#8B8F94] text-xs">by {n.by}</span>
      </div>
      {n.remaining !== undefined && n.remaining !== null && (
        <div className="text-xs text-[#8B8F94] mt-1">Remaining stock: {n.remaining}</div>
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
              filter === k ? "bg-[#FFC72C] text-[#16181B] border-[#FFC72C]" : "border-[#33373C] text-[#8B8F94]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <div className="text-[#8B8F94] text-sm py-8 text-center">No activity recorded yet.</div>}
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
      map[n.code] = map[n.code] || { label: n.code, value: 0, color: "#FFC72C" };
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
              range === k ? "bg-[#FFC72C] text-[#16181B] border-[#FFC72C]" : "border-[#33373C] text-[#8B8F94]"
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
        <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">Top Selling Parts</div>
          <BarChart data={topSelling} />
        </div>
        <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4">
          <div className="text-sm font-bold uppercase tracking-wide mb-3">Inventory Summary</div>
          <div className="space-y-2 text-sm">
            <Row label="Total items" value={items.length} />
            <Row label="Total stock quantity" value={items.reduce((s, i) => s + Number(i.qty), 0)} />
            <Row label="Inventory value" value={`KES ${inventoryValue.toLocaleString()}`} />
            <Row label="Low-stock items" value={lowStock.length} tone={lowStock.length ? "red" : undefined} />
          </div>
        </div>
      </div>

      <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
          <AlertTriangle size={15} className="text-[#E8483A]" /> Low Stock Report
        </div>
        {lowStock.length === 0 && <div className="text-[#8B8F94] text-sm italic">All items above their reorder level.</div>}
        <div className="space-y-1.5">
          {lowStock.map((i) => (
            <div key={i.code} className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs text-[#ECE8E1]">{i.code}</span>
              <span className="text-[#8B8F94] truncate px-2 flex-1">{i.name}</span>
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
      <span className="text-[#8B8F94]">{label}</span>
      <span className={`font-semibold ${tone === "red" ? "text-[#E8483A]" : "text-[#ECE8E1]"}`}>{value}</span>
    </div>
  );
}

/* ======================= SETTINGS ======================= */
export function SettingsTab({ categories, user, email }) {
  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="System" title="Settings" />

      <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4 mb-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">Signed-in Staff</div>
        <div className="space-y-2 text-sm">
          <Row label="Name" value={user} />
          <Row label="Account" value={email || "—"} />
        </div>
        <p className="text-xs text-[#8B8F94] mt-2">
          Each staff member has their own account. Add more from the login screen (“Create an account”)
          or in the Supabase dashboard → Authentication → Users.
        </p>
      </div>

      <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4 mb-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">Categories</div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5 text-xs bg-[#26292E] border border-[#33373C] rounded px-2 py-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="font-mono">{c.key}</span> {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4">
        <div className="text-sm font-bold uppercase tracking-wide mb-3">System Information &amp; Future Features</div>
        <div className="space-y-2 text-sm text-[#8B8F94]">
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
            <div key={f} className="flex items-center justify-between text-xs bg-[#26292E] border border-[#33373C] rounded px-2.5 py-2">
              <span className="text-[#8B8F94]">{f}</span>
              <span className="text-[10px] font-bold uppercase text-[#FFC72C] bg-[#FFC72C22] rounded px-1.5 py-0.5">Soon</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#8B8F94] mt-3 flex items-start gap-1.5">
          <Check size={13} className="text-[#4FA87A] mt-0.5 shrink-0" />
          Authentication is now real: passwords are hashed by Supabase, sessions are server-issued,
          and every action is attributed to a signed-in account.
        </p>
      </div>
    </div>
  );
}
