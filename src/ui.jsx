/* ---------------------------------------------------------
   BYPASS SHOP — shared UI primitives & helpers
--------------------------------------------------------- */
import React, { useState } from "react";
import { MapPin, Trash2, ImagePlus, X, Search, CheckSquare, Square } from "lucide-react";
import { condColor, reorderLevel, isOutOfStock, splitSide, categoryTree, extraDetails } from "./data.js";
import { useThemeMode, readableOnDark } from "./lib/theme.js";

export const inputCls =
  "w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-md px-3 py-2.5 text-[#1B2430] outline-none focus:border-[#2563EB] transition-colors";

/* ---- FILTER PILLS ----
   The same row of tappable pills used on Reports, Low Stock and Print Stock.
   They were written out three times with three slightly different looks, so a
   pill meant "on" in one place and "selected of several" in another. One piece
   now, so a pill looks and behaves the same wherever it appears.

   `multi` shows a tick box, because a row of pills gives no clue on its own
   that more than one can be on at a time - people tapped a second pill
   expecting the first to switch off. */
export function Pills({ options, value, onChange, multi = false, size = "sm" }) {
  const on = (key) => (multi ? (value || []).includes(key) : value === key);
  const pad = size === "xs" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  const toggle = (key) => {
    if (!multi) { onChange(key); return; }
    const list = value || [];
    onChange(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = on(o.key);
        return (
          <button
            key={o.key}
            onClick={() => toggle(o.key)}
            className={`${pad} rounded-md font-semibold whitespace-nowrap border flex items-center gap-1.5 transition-colors ${
              active
                ? "bg-[#2563EB] text-[#F3F5F8] border-[#2563EB]"
                : "border-[#DEE3E9] text-[#5A6472] hover:border-[#2563EB]"
            }`}
            title={o.title || o.label}
          >
            {multi && (active ? <CheckSquare size={12} /> : <Square size={12} />)}
            {o.label}
            {o.count !== undefined && (
              <span className={active ? "opacity-80" : "text-[#5A6472]"}>({o.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---- SEARCH BOX ----
   A search field with the magnifier in it and a clear button once something is
   typed. The clear button matters more than it looks: on a phone the only other
   way to empty it is holding backspace, and a box people can't easily clear is
   a filter they leave on by accident and then read the wrong numbers off. */
export function SearchBox({ value, onChange, placeholder = "Search…", autoFocus = false }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472] pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={inputCls + " pl-9" + (value ? " pr-9" : "")}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#5A6472] hover:text-[#DC3B2E]"
          title="Clear"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[#5A6472] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[#5A6472] mt-1">{hint}</p>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <div className="text-[#2563EB] text-[11px] font-bold tracking-[0.2em] uppercase mb-1">
          {eyebrow}
        </div>
        <h2 className="text-[#1B2430] text-xl font-bold uppercase tracking-wide">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function StockBadge({ item }) {
  /* Red only when the part is actually finished. It used to go amber at three
     pieces or fewer, which on a shelf of one-off body parts meant nearly every
     badge in the shop was a warning — and a warning on everything reads as
     decoration. Amber now means the part carries its own reorder level and has
     reached it, so it says something when it appears. */
  const out = isOutOfStock(item);
  const low = !out && Number(item.qty) <= reorderLevel(item);
  const cls = out
    ? "bg-[#DC3B2E22] text-[#DC3B2E]"
    : low
    ? "bg-[#2563EB22] text-[#2563EB]"
    : "bg-[#15926A22] text-[#15926A]";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>
      {out ? "None left" : `${item.qty} in stock`}
    </span>
  );
}

/* Full-screen image viewer. Pass images (array of URLs), a start index, and onClose. */
export function ImageLightbox({ images, index = 0, onClose }) {
  const [i, setI] = useState(index);
  if (!images || images.length === 0) return null;
  const many = images.length > 1;
  const go = (d) => (e) => { e.stopPropagation(); setI((p) => (p + d + images.length) % images.length); };
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white p-2" title="Close">
        <X size={28} />
      </button>
      <img
        src={images[i]}
        alt="Part"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
      />
      {many && (
        <>
          <button onClick={go(-1)} className="absolute left-4 text-white/80 hover:text-white text-4xl font-light px-3">‹</button>
          <button onClick={go(1)} className="absolute right-4 text-white/80 hover:text-white text-4xl font-light px-3">›</button>
          <div className="absolute bottom-6 text-white/80 text-sm">{i + 1} / {images.length}</div>
        </>
      )}
    </div>
  );
}

/* Compact item card used across search / stock / sell. */
export function ItemCard({ item, categories, onDelete }) {
  const cat = categories.find((c) => c.key === item.cat) || categories[0] || {};
  const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
  const [showImg, setShowImg] = useState(false);
  // The condition badge keeps its meaning-carrying colour in both modes;
  // on dark it's only brightened enough to stay readable.
  const mode = useThemeMode();
  const cond = readableOnDark(condColor(item.condition), mode);
  const { position, hand } = splitSide(item.cat, item.side);
  /* Front and rear get their own two colours rather than the section's, because
     the whole job of this badge is telling two doors in the same section apart —
     and one shared colour cannot do that. Both are brightened for dark mode the
     same way the condition badge is. */
  const sideBadge = readableOnDark(position === "Rear" ? "#B7791F" : "#1E7F4F", mode);
  return (
    <div className="group flex items-stretch bg-[#FFFFFF] border border-[#DEE3E9] rounded-md overflow-hidden hover:border-[#C2CAD3] transition-colors">
      <div className="w-2 shrink-0" style={{ backgroundColor: cat.color || "#6B7480" }} />
      {/* Photo thumbnail — tap to view full size. Placeholder if none yet. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (images.length) setShowImg(true); }}
        className={`relative w-16 sm:w-20 shrink-0 bg-[#EEF2F6] flex items-center justify-center overflow-hidden ${images.length ? "cursor-zoom-in" : "cursor-default"}`}
        title={images.length ? "View photo" : "No photo yet"}
        aria-label={images.length ? "View photo" : "No photo"}
      >
        {images.length ? (
          <>
            <img src={images[0]} alt={item.name || item.code} className="w-full h-full object-cover" />
            {images.length > 1 && (
              <span className="absolute bottom-1 right-1 text-[10px] font-bold text-white bg-black/60 px-1.5 rounded">
                +{images.length - 1}
              </span>
            )}
          </>
        ) : (
          <ImagePlus size={20} className="text-[#B4BCC7]" />
        )}
      </button>
      {showImg && <ImageLightbox images={images} onClose={() => setShowImg(false)} />}
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono text-xs sm:text-sm tracking-wider text-[#1B2430] bg-[#EEF2F6] border border-[#DEE3E9] px-2 py-0.5 rounded">
            {item.code}
          </span>
          <div className="flex items-center gap-1.5">
            <StockBadge item={item} />
            {/* Removing a part asks where the stock went, so the caller
                opens that sheet — this button only says which part. */}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                className="p-1.5 rounded bg-[#EEF2F6] text-[#5A6472] hover:text-[#DC3B2E] transition-colors"
                title="Remove item — record where it went"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        <p className="text-[#1B2430] font-medium mt-1.5 truncate">
          {item.name || `${item.brand} ${item.model}`}
        </p>
        <div className="flex items-center gap-1.5 mt-1 text-[#5A6472] text-xs flex-wrap">
          <span className="font-semibold text-[#1B2430]">
            {item.brand} {item.model}
          </span>
          {item.series ? <span>· {item.series}</span> : null}
          {/* No year on record: say so plainly rather than leaving a dangling
              separator, or printing a year nobody actually checked. */}
          {item.yearFrom ? (
            <span>
              · {item.yearFrom}
              {item.yearTo && item.yearTo !== item.yearFrom ? `–${item.yearTo}` : ""}
            </span>
          ) : (
            <span className="italic">· year not known</span>
          )}
          <span
            className="px-1.5 py-0.5 rounded font-semibold"
            style={{ backgroundColor: cond + "22", color: cond }}
          >
            {item.condition}
          </span>
          {/* Which end of the car, said loudly. A door's end is the first thing
              anybody needs — a front door and a rear door are different parts at
              different money — and as one more grey word in a row of grey words
              it read as no more important than the colour. Sections with only
              one end (a tail light is always at the back) have no badge to show,
              and their side prints plainly as before. */}
          {position ? (
            <span
              className="px-1.5 py-0.5 rounded font-bold"
              style={{ backgroundColor: sideBadge + "22", color: sideBadge }}
            >
              {position}
            </span>
          ) : null}
          {hand && hand !== "Not Applicable" ? <span>· {hand}</span> : null}
          {item.variant ? (
            <span className="px-1.5 py-0.5 rounded font-semibold bg-[#2E86DE22] text-[#2E86DE]">{item.variant}</span>
          ) : null}
          {item.color ? <span>· {item.color}</span> : null}
        </div>
        <div className="flex items-center gap-1 mt-1 text-[#5A6472] text-xs flex-wrap">
          <MapPin size={12} />
          <span>{cat.label}</span>
          <span>· {item.location || "Unassigned"}</span>
          <span className="mx-1">·</span>
          <span className="text-[#2563EB] font-semibold">KES {Number(item.price).toLocaleString()}</span>
        </div>
        {/* The typed-in details, and who it came from. Clamped to two lines with the
            whole thing on hover, because a card that grows to five lines for one part
            makes a list of six hundred unreadable — and these are details you read
            about the part you have already found, not while scrolling past it. */}
        {extraDetails(item) || item.supplier ? (
          <div className="mt-1.5 pt-1.5 border-t border-[#EEF2F6] text-xs">
            {extraDetails(item) ? (
              <p className="text-[#5A6472] leading-snug line-clamp-2" title={extraDetails(item)}>
                {extraDetails(item)}
              </p>
            ) : null}
            {item.supplier ? (
              <p className="text-[#8A93A0] mt-0.5 truncate">From {item.supplier}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* Dashboard stat card. Pass onClick to make it a tappable shortcut. */
export function StatCard({ icon: Icon, label, value, sub, tone = "gold", onClick }) {
  const tones = {
    gold: "#E0A400",
    yellow: "#E0A400",
    green: "#15926A",
    red: "#DC3B2E",
    blue: "#2563EB",
    purple: "#7C5CD6",
  };
  const mode = useThemeMode();
  const c = readableOnDark(tones[tone] || tones.blue, mode);
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      className={`bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 bp-fade-up ${
        clickable
          ? "cursor-pointer hover:border-[#2563EB] active:scale-[0.98] transition-all"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[#5A6472] text-[11px] font-bold uppercase tracking-wide">{label}</span>
        <span className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: c + "22" }}>
          <Icon size={16} style={{ color: c }} />
        </span>
      </div>
      <div className="text-2xl font-extrabold mt-2 text-[#1B2430]">{value}</div>
      {sub && <div className="text-xs text-[#5A6472] mt-0.5">{sub}</div>}
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
  const mode = useThemeMode();
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-[#5A6472] w-28 shrink-0 truncate text-right">{d[labelKey]}</span>
          <div className="flex-1 h-4 bg-[#EEF2F6] rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{
                width: `${(d[valueKey] / max) * 100}%`,
                backgroundColor: readableOnDark(d[colorKey] || "#2563EB", mode),
              }}
            />
          </div>
          <span className="text-xs text-[#1B2430] font-semibold w-8 text-right">{d[valueKey]}</span>
        </div>
      ))}
      {data.length === 0 && <div className="text-[#5A6472] text-sm italic">No data yet.</div>}
    </div>
  );
}

/* Donut/pie chart (SVG, no library). `data` = [{ label, value, color }].
   Shows each slice's share of the total, with a legend and centre total. */
export function DonutChart({ data, centerLabel = "Total" }) {
  const mode = useThemeMode();
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = 42;          // radius
  const cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.map((d) => {
    const frac = total > 0 ? d.value / total : 0;
    const seg = { ...d, frac, dash: frac * circ, offset };
    offset += frac * circ;
    return seg;
  });
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0 -rotate-90">
        {/* The empty ring behind the slices. Styled as a class, not a stroke
            attribute, so it darkens with the rest of the app. */}
        <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-[#EEF2F6]" strokeWidth="14" />
        {total > 0 && slices.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={readableOnDark(s.color || "#2563EB", mode)}
            strokeWidth="14"
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset}
          />
        ))}
        <text x={cx} y={cy} transform={`rotate(90 ${cx} ${cy})`} textAnchor="middle" dominantBaseline="central" className="fill-[#1B2430]" style={{ fontSize: 18, fontWeight: 800 }}>
          {total}
        </text>
      </svg>
      <div className="flex-1 min-w-[8rem] space-y-1.5">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: readableOnDark(s.color || "#2563EB", mode) }} />
            <span className="flex-1 min-w-0 truncate text-[#5A6472]">{s.label}</span>
            <span className="font-semibold text-[#1B2430] tabular-nums">{Math.round(s.frac * 100)}%</span>
          </div>
        ))}
        {total === 0 && <div className="text-[#5A6472] text-sm italic">No stock yet.</div>}
      </div>
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
        <path d={area} fill="#2563EB18" />
        <path d={line} fill="none" stroke="#2563EB" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-[10px] text-[#5A6472] mt-1">
        {points.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

/* ---- THE OPTIONS INSIDE A CATEGORY <select> ----
   Four screens ask which section a part belongs to, and each of them used to
   print the whole flat list. Twenty-six built-in sections plus everything the
   shop has added is a list nobody reaches the bottom of on a phone, so a section
   that sits inside another one is printed under it as a group heading.

   Written once and shared, because the whole point of putting Front Bumpers
   inside Bumpers is that it looks that way EVERYWHERE. A picker that still shows
   the flat list is a picker where the tidying appears not to have worked.

   A heading is offered as a choice as well as a heading: a section that holds
   others can still hold parts of its own, and quietly refusing to let anybody
   file a part under it would be a rule nobody was told about. */
export function CategoryOptions({ categories, shelf = false }) {
  const text = (c) => (shelf && c.shelf && c.shelf !== "—" ? `${c.label} — Shelf ${c.shelf}` : c.label);
  return categoryTree(categories).map((c) =>
    c.children.length === 0 ? (
      <option key={c.key} value={c.key}>{text(c)}</option>
    ) : (
      <optgroup key={c.key} label={c.label}>
        <option value={c.key}>{text(c)}</option>
        {c.children.map((k) => (
          <option key={k.key} value={k.key}>{text(k)}</option>
        ))}
      </optgroup>
    )
  );
}
