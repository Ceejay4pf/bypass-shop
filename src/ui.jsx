/* ---------------------------------------------------------
   BYPASS SHOP — shared UI primitives & helpers
--------------------------------------------------------- */
import React from "react";
import { MapPin } from "lucide-react";
import { condColor, LOW_STOCK_THRESHOLD } from "./data.js";

export const inputCls =
  "w-full bg-[#1F2226] border border-[#33373C] rounded-md px-3 py-2.5 text-[#ECE8E1] outline-none focus:border-[#FFC72C] transition-colors";

export function Field({ label, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[#8B8F94] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[#8B8F94] mt-1">{hint}</p>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <div className="text-[#FFC72C] text-[11px] font-bold tracking-[0.2em] uppercase mb-1">
          {eyebrow}
        </div>
        <h2 className="text-[#ECE8E1] text-xl font-bold uppercase tracking-wide">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function StockBadge({ item }) {
  const min = item.min ?? LOW_STOCK_THRESHOLD;
  const cls =
    item.qty === 0
      ? "bg-[#E8483A22] text-[#E8483A]"
      : item.qty <= min
      ? "bg-[#FFC72C22] text-[#FFC72C]"
      : "bg-[#4FA87A22] text-[#4FA87A]";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>
      {item.qty} in stock
    </span>
  );
}

/* Compact item card used across search / stock / sell. */
export function ItemCard({ item, categories }) {
  const cat = categories.find((c) => c.key === item.cat) || categories[0] || {};
  return (
    <div className="flex items-stretch bg-[#1F2226] border border-[#33373C] rounded-md overflow-hidden hover:border-[#4a4f56] transition-colors">
      <div className="w-2 shrink-0" style={{ backgroundColor: cat.color || "#7F8890" }} />
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono text-xs sm:text-sm tracking-wider text-[#ECE8E1] bg-[#26292E] border border-[#33373C] px-2 py-0.5 rounded">
            {item.code}
          </span>
          <StockBadge item={item} />
        </div>
        <p className="text-[#ECE8E1] font-medium mt-1.5 truncate">
          {item.name || `${item.brand} ${item.model}`}
        </p>
        <div className="flex items-center gap-1.5 mt-1 text-[#8B8F94] text-xs flex-wrap">
          <span className="font-semibold text-[#ECE8E1]">
            {item.brand} {item.model}
          </span>
          {item.series ? <span>· {item.series}</span> : null}
          <span>
            · {item.yearFrom}
            {item.yearTo && item.yearTo !== item.yearFrom ? `–${item.yearTo}` : ""}
          </span>
          <span
            className="px-1.5 py-0.5 rounded font-semibold"
            style={{ backgroundColor: condColor(item.condition) + "22", color: condColor(item.condition) }}
          >
            {item.condition}
          </span>
          {item.side && item.side !== "Not Applicable" ? <span>· {item.side}</span> : null}
          {item.variant ? (
            <span className="px-1.5 py-0.5 rounded font-semibold bg-[#5FB0FF22] text-[#5FB0FF]">{item.variant}</span>
          ) : null}
          {item.color ? <span>· {item.color}</span> : null}
        </div>
        <div className="flex items-center gap-1 mt-1 text-[#8B8F94] text-xs flex-wrap">
          <MapPin size={12} />
          <span>{cat.label}</span>
          <span>· {item.location || "Unassigned"}</span>
          <span className="mx-1">·</span>
          <span className="text-[#FFC72C] font-semibold">KES {Number(item.price).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

/* Dashboard stat card. */
export function StatCard({ icon: Icon, label, value, sub, tone = "gold" }) {
  const tones = {
    gold: "#FFC72C",
    green: "#4FA87A",
    red: "#E8483A",
    blue: "#5FB0FF",
    purple: "#C79BF0",
  };
  const c = tones[tone] || tones.gold;
  return (
    <div className="bg-[#1F2226] border border-[#33373C] rounded-lg p-4 bp-fade-up">
      <div className="flex items-center justify-between">
        <span className="text-[#8B8F94] text-[11px] font-bold uppercase tracking-wide">{label}</span>
        <span className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: c + "22" }}>
          <Icon size={16} style={{ color: c }} />
        </span>
      </div>
      <div className="text-2xl font-extrabold mt-2 text-[#ECE8E1]">{value}</div>
      {sub && <div className="text-xs text-[#8B8F94] mt-0.5">{sub}</div>}
    </div>
  );
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* Simple horizontal bar chart (no chart library needed). */
export function BarChart({ data, colorKey = "color", labelKey = "label", valueKey = "value" }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-[#8B8F94] w-28 shrink-0 truncate text-right">{d[labelKey]}</span>
          <div className="flex-1 h-4 bg-[#26292E] rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{ width: `${(d[valueKey] / max) * 100}%`, backgroundColor: d[colorKey] || "#FFC72C" }}
            />
          </div>
          <span className="text-xs text-[#ECE8E1] font-semibold w-8 text-right">{d[valueKey]}</span>
        </div>
      ))}
      {data.length === 0 && <div className="text-[#8B8F94] text-sm italic">No data yet.</div>}
    </div>
  );
}

/* Sales trend as a lightweight SVG sparkline/area. */
export function TrendChart({ points }) {
  const w = 320;
  const h = 90;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((p, i) => [i * step, h - (p.value / max) * (h - 12) - 4]);
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
        <path d={area} fill="#FFC72C18" />
        <path d={line} fill="none" stroke="#FFC72C" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-[10px] text-[#8B8F94] mt-1">
        {points.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}
