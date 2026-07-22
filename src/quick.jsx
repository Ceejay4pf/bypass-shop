/* ---------------------------------------------------------
   BYPASS SHOP — Quick Transaction module + Stock Movement Ledger

   One form. Staff describe the part (never a code); the system
   finds the matching item and figures out whether this is a
   New Item, Add Stock, Stock Out, or Adjustment.
--------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import {
  Zap, PackagePlus, ShoppingCart, Plus, SlidersHorizontal, Check, AlertTriangle,
  ArrowRight, History, Search, X, MapPin, Loader2,
} from "lucide-react";
import {
  CONDITIONS, SIDES, BRANDS, VARIANTS, PAYMENT, generateCode, findMatch,
  formatLocation, LOW_STOCK_THRESHOLD,
} from "./data.js";
import { Field, inputCls, SectionTitle, ItemCard, StockBadge, fmtDateTime } from "./ui.jsx";
import { fetchMovements, rowToMovement } from "./lib/api.js";

const ACTIONS = [
  { id: "add", label: "Add Stock", icon: PackagePlus, tone: "#15926A", need: "match" },
  { id: "out", label: "Stock Out", icon: ShoppingCart, tone: "#DC3B2E", need: "match" },
  { id: "adjust", label: "Adjust", icon: SlidersHorizontal, tone: "#2E86DE", need: "match" },
  { id: "new", label: "New Item", icon: Plus, tone: "#2563EB", need: "none" },
];

export function QuickTab({ items, categories, onQuick, onOpenLedger }) {
  const [action, setAction] = useState("add");
  const [cat, setCat] = useState(categories[0]?.key || "");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [side, setSide] = useState("Not Applicable");
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [variant, setVariant] = useState("");
  const [qty, setQty] = useState("1");

  // Add-stock extras
  const [supplier, setSupplier] = useState("");
  // Stock-out extras
  const [buyer, setBuyer] = useState("");
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState("Paid");
  // New-item extras
  const [price, setPrice] = useState("");
  const [color, setColor] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [rack, setRack] = useState("");
  const [shelf, setShelf] = useState("");
  const [bin, setBin] = useState("");
  // Adjust
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");

  const [msg, setMsg] = useState("");

  const desc = { cat, brand, model, yearFrom: year, side, condition, variant: variant.trim() };
  const match = useMemo(
    () => (brand.trim() && model.trim() ? findMatch(desc, items) : null),
    [items, cat, brand, model, year, side, condition, variant]
  );

  const brandModels = BRANDS.find((b) => b.name.toLowerCase() === brand.toLowerCase())?.models || [];
  const catLabel = categories.find((c) => c.key === cat)?.label || "";

  const reset = () => {
    setBrand(""); setModel(""); setYear(""); setVariant(""); setQty("1");
    setSupplier(""); setBuyer(""); setPhone(""); setPrice(""); setColor("");
    setWarehouse(""); setRack(""); setShelf(""); setBin(""); setNewQty(""); setReason("");
  };

  const submit = () => {
    setMsg("");
    // ---- NEW ITEM ----
    if (action === "new") {
      if (!brand.trim() || !model.trim() || !price || qty === "") {
        setMsg("Brand, model, price and quantity are required for a new item.");
        return;
      }
      onQuick({
        kind: "new",
        item: {
          cat, brand: brand.trim(), model: model.trim(),
          yearFrom: Number(year) || new Date().getFullYear(),
          yearTo: Number(year) || new Date().getFullYear(),
          condition, side, variant: variant.trim(), color: color.trim(),
          name: `${catLabel} — ${brand.trim()} ${model.trim()}${variant.trim() ? ` (${variant.trim()})` : ""}`,
          price: Number(price), qty: Number(qty), min: LOW_STOCK_THRESHOLD,
          location: formatLocation({ warehouse, rack, shelf, bin }),
          supplier: supplier.trim(), notes: "", images: [], status: "Active",
        },
      });
      reset();
      setMsg("New item created.");
      return;
    }

    // ---- Everything else needs a match ----
    if (!match) {
      // Offer to create it instead.
      if (confirm("No matching item found. Create it as a NEW item instead?")) {
        setAction("new");
        setMsg("Fill in price/location, then confirm to create.");
      }
      return;
    }

    if (action === "add") {
      const n = Number(qty);
      if (!(n > 0)) { setMsg("Enter a quantity to add."); return; }
      onQuick({ kind: "add", code: match.code, qty: n, supplier: supplier.trim() });
      reset();
      setMsg(`Added ${n} to ${match.code}.`);
    } else if (action === "out") {
      const n = Math.min(Number(qty) || 1, match.qty);
      if (!(n > 0)) { setMsg("Nothing in stock to take out."); return; }
      onQuick({
        kind: "out", code: match.code, qty: n,
        buyer: buyer.trim(), phone: phone.trim(), paid: payment === "Paid",
        total: n * Number(match.price),
      });
      reset();
      setMsg(`Stock out ${n} from ${match.code}.`);
    } else if (action === "adjust") {
      if (newQty === "") { setMsg("Enter the corrected stock count."); return; }
      onQuick({ kind: "adjust", code: match.code, newQty: Number(newQty), reason: reason.trim() });
      reset();
      setMsg(`Adjusted ${match.code} to ${Number(newQty)}.`);
    }
  };

  const activeAction = ACTIONS.find((a) => a.id === action);

  return (
    <div className="bp-fade-up">
      <SectionTitle
        eyebrow="One form, no codes to remember"
        title="Quick Transaction"
        right={
          <span className="flex items-center gap-1.5 text-xs text-[#5A6472]">
            <Zap size={14} className="text-[#2563EB]" /> Smart matching
          </span>
        }
      />

      {/* Action selector */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const on = action === a.id;
          return (
            <button
              key={a.id}
              onClick={() => { setAction(a.id); setMsg(""); }}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-md border text-xs font-semibold ${
                on ? "text-[#F3F5F8]" : "text-[#5A6472] border-[#DEE3E9]"
              }`}
              style={on ? { backgroundColor: a.tone, borderColor: a.tone } : {}}
            >
              <Icon size={18} />
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Describe the part */}
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="text-xs font-bold uppercase tracking-wide text-[#5A6472] mb-3">Describe the part</div>
        <Field label="Category / part">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Brand">
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Toyota" list="q-brands" className={inputCls} />
              <datalist id="q-brands">{BRANDS.map((b) => <option key={b.name} value={b.name} />)}</datalist>
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Model">
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Auris" list="q-models" className={inputCls} />
              <datalist id="q-models">{brandModels.map((m) => <option key={m} value={m} />)}</datalist>
            </Field>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Year"><input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2010" className={inputCls} /></Field>
          </div>
          <div className="flex-1">
            <Field label="Side">
              <select value={side} onChange={(e) => setSide(e.target.value)} className={inputCls}>
                {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
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
            <Field label="Variant (e.g. Xenon)">
              <input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Non Xenon" list="q-variants" className={inputCls} />
              <datalist id="q-variants">{VARIANTS.map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
          </div>
        </div>

        {/* Live match feedback */}
        {action !== "new" && brand.trim() && model.trim() && (
          <div className="mt-1">
            {match ? (
              <button onClick={() => onOpenLedger(match.code)} className="w-full text-left">
                <div className="flex items-center gap-1.5 text-xs text-[#15926A] font-semibold mb-1.5">
                  <Check size={13} /> Match found — {match.code}
                </div>
                <ItemCard item={match} categories={categories} />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-[#2563EB] font-semibold bg-[#2563EB11] border border-[#2563EB33] rounded-md p-2.5">
                <AlertTriangle size={13} /> No match yet — confirming will offer to create a new item.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action-specific fields */}
      <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-3" style={{ color: activeAction.tone }}>
          <activeAction.icon size={14} /> {activeAction.label} details
        </div>

        {action === "add" && (
          <>
            <div className="flex gap-3">
              <div className="flex-1"><Field label="Quantity added"><input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} /></Field></div>
              <div className="flex-1"><Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex Japan" className={inputCls} /></Field></div>
            </div>
          </>
        )}

        {action === "out" && (
          <>
            <div className="flex gap-3">
              <div className="flex-1"><Field label={`Quantity out${match ? ` (max ${match.qty})` : ""}`}><input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} /></Field></div>
              <div className="flex-1"><Field label="Taken by / Customer"><input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Auto Garage" className={inputCls} /></Field></div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1"><Field label="Phone (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" className={inputCls} /></Field></div>
              <div className="flex-1">
                <Field label="Payment">
                  <div className="flex gap-2">
                    {PAYMENT.map((p) => (
                      <button key={p} onClick={() => setPayment(p)}
                        className={`flex-1 rounded-md py-2.5 font-semibold text-sm border ${payment === p ? (p === "Paid" ? "bg-[#15926A22] border-[#15926A] text-[#15926A]" : "bg-[#DC3B2E22] border-[#DC3B2E] text-[#DC3B2E]") : "border-[#DEE3E9] text-[#5A6472]"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>
          </>
        )}

        {action === "adjust" && (
          <>
            <div className="flex gap-3">
              <div className="flex-1"><Field label="Corrected stock count" hint={match ? `Currently ${match.qty}` : "Find the item first"}><input type="number" min="0" value={newQty} onChange={(e) => setNewQty(e.target.value)} className={inputCls} /></Field></div>
              <div className="flex-1"><Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recount / damage / return" className={inputCls} /></Field></div>
            </div>
          </>
        )}

        {action === "new" && (
          <>
            <div className="flex gap-3">
              <div className="flex-1"><Field label="Price (KES)"><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="9500" className={inputCls} /></Field></div>
              <div className="flex-1"><Field label="Starting qty"><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} /></Field></div>
              <div className="flex-1"><Field label="Color"><input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Clear" className={inputCls} /></Field></div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1"><Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex Japan" className={inputCls} /></Field></div>
            </div>
            <Field label="Location (Warehouse / Rack / Shelf / Bin)">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="D" className={inputCls} />
                <input value={rack} onChange={(e) => setRack(e.target.value)} placeholder="Rack 01" className={inputCls} />
                <input value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="Shelf 02" className={inputCls} />
                <input value={bin} onChange={(e) => setBin(e.target.value)} placeholder="Bin 01" className={inputCls} />
              </div>
            </Field>
            <div className="text-xs text-[#5A6472] bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5">
              Will be assigned: <span className="font-mono text-[#2563EB]">{generateCode(desc, items)}</span>
            </div>
          </>
        )}
      </div>

      {msg && (
        <div className="text-sm mb-3 flex items-center gap-1.5 text-[#2563EB]">
          <Check size={14} /> {msg}
        </div>
      )}

      <button
        onClick={submit}
        className="w-full font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform text-[#F3F5F8]"
        style={{ backgroundColor: activeAction.tone }}
      >
        <activeAction.icon size={18} /> Confirm {activeAction.label} <ArrowRight size={16} />
      </button>
    </div>
  );
}

/* ======================= STOCK MOVEMENT LEDGER ======================= */
const MOVE_META = {
  new_item: { label: "Created", sign: "+", color: "#2E86DE" },
  stock: { label: "Added Stock", sign: "+", color: "#15926A" },
  sale: { label: "Stock Out", sign: "−", color: "#DC3B2E" },
  adjust: { label: "Adjusted", sign: "=", color: "#2E86DE" },
  return: { label: "Returned", sign: "+", color: "#15926A" },
};

export function LedgerTab({ items, categories, initialCode, onBack }) {
  const [query, setQuery] = useState(initialCode || "");
  const item = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return (
      items.find((i) => i.code.toLowerCase() === q) ||
      items.find((i) =>
        [i.code, i.name, i.brand, i.model, i.variant, i.supplier, i.location]
          .filter(Boolean).join(" ").toLowerCase().includes(q)
      ) || null
    );
  }, [items, query]);

  // Movements come from the stock_movements table (survives item deletion).
  const [ledger, setLedger] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  useEffect(() => {
    if (!item) { setLedger([]); return; }
    let active = true;
    setLoadingLedger(true);
    fetchMovements(item.code)
      .then((rows) => active && setLedger(rows.map(rowToMovement)))
      .catch(() => active && setLedger([]))
      .finally(() => active && setLoadingLedger(false));
    return () => { active = false; };
  }, [item?.code]);

  return (
    <div className="bp-fade-up">
      <SectionTitle eyebrow="Complete audit trail" title="Inventory Ledger" />
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find item by code, name, vehicle, variant, supplier…"
          className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-md pl-10 pr-9 py-3 text-[#1B2430] placeholder-[#5A6472] outline-none focus:border-[#2563EB]"
        />
        {query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6472]"><X size={16} /></button>}
      </div>

      {!item && <div className="text-[#5A6472] text-sm py-8 text-center">Search for an item to see its full movement history.</div>}

      {item && (
        <>
          <div className="mb-4"><ItemCard item={item} categories={categories} /></div>
          {item.supplier ? (
            <div className="text-xs text-[#5A6472] mb-3 flex items-center gap-1.5">
              <MapPin size={12} /> Supplier: <span className="text-[#1B2430]">{item.supplier}</span>
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide mb-3">
            <History size={15} className="text-[#2563EB]" /> Movement History
          </div>

          {loadingLedger && <div className="flex items-center gap-2 text-[#5A6472] text-sm"><Loader2 size={14} className="animate-spin" /> Loading history…</div>}
          {!loadingLedger && ledger.length === 0 && <div className="text-[#5A6472] text-sm italic">No movements recorded yet for this item.</div>}

          <div className="relative pl-4">
            {ledger.map((m, i) => {
              const meta = MOVE_META[m.type] || MOVE_META.adjust;
              return (
                <div key={i} className="relative pb-4 border-l-2 border-[#DEE3E9] pl-4 last:border-transparent">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-[#F3F5F8]" style={{ backgroundColor: meta.color }} />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-xs text-[#5A6472]">{fmtDateTime(m.ts)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm">
                    <span className="font-bold" style={{ color: meta.color }}>{meta.sign}{m.type === "adjust" ? m.remaining : m.qty}</span>
                    <span className="text-[#5A6472]">→ stock now {m.remaining}</span>
                  </div>
                  <div className="text-xs text-[#5A6472] mt-0.5 flex flex-wrap gap-x-3">
                    <span>by {m.by}</span>
                    {m.buyer ? <span>Taken by: {m.buyer}</span> : null}
                    {m.supplier ? <span>Supplier: {m.supplier}</span> : null}
                    {m.reason ? <span>Reason: {m.reason}</span> : null}
                    {m.type === "sale" ? (
                      <span className={m.paid ? "text-[#15926A]" : "text-[#DC3B2E]"}>{m.paid ? "Paid" : "Pending"}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
