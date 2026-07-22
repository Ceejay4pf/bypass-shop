/* ---------------------------------------------------------
   BYPASS SHOP — data layer
   Reports up to: JASPARE AUTO (main shop)

   Persistence: Supabase (cloud). Item codes are the primary key —
   uniqueness is enforced by the DB and a global serial sequence.
   This file holds constants + pure helpers (code gen, matching).
--------------------------------------------------------- */

/* Fixed starting categories. Admin can add more (stored separately,
   merged with these at runtime). Each has a 3-letter code prefix,
   a shelf prefix, and an accent color. */
export const DEFAULT_CATEGORIES = [
  { key: "WNL", label: "Wing — Left",                   shelf: "A-01", color: "#2563EB" },
  { key: "WNR", label: "Wing — Right",                  shelf: "A-02", color: "#FFA53C" },
  { key: "DOR", label: "Doors",                         shelf: "B-01", color: "#2E86DE" },
  { key: "FBM", label: "Front Bumpers",                 shelf: "C-01", color: "#DC3B2E" },
  { key: "RBM", label: "Rear Bumpers",                  shelf: "C-02", color: "#F07A4F" },
  { key: "HDL", label: "Headlights",                    shelf: "D-01", color: "#D4A72C" },
  { key: "TLL", label: "Taillights",                    shelf: "D-02", color: "#E86A6A" },
  { key: "BSK", label: "Boot Shocks",                   shelf: "E-01", color: "#8FD6A6" },
  { key: "BNT", label: "Bonnets",                       shelf: "F-01", color: "#7C5CD6" },
  { key: "BOT", label: "Boots",                         shelf: "F-02", color: "#9BB7F0" },
  { key: "SMI", label: "Side Mirrors — With Indicator", shelf: "G-01", color: "#15926A" },
  { key: "SMN", label: "Side Mirrors — Plain",          shelf: "G-02", color: "#6B7480" },
  { key: "BPS", label: "Bumper Slides",                 shelf: "H-01", color: "#DC3B2E" },
];

export const CONDITIONS = ["Brand New", "Genuine Used", "Aftermarket", "Refurbished"];
export const SIDES = ["Left", "Right", "Front", "Rear", "Pair", "Center", "Not Applicable"];
export const PAYMENT = ["Paid", "Pending"];
/* Free-text, but these power the suggestion list on Quick Transaction. */
export const VARIANTS = ["Xenon", "Non Xenon", "LED", "Halogen", "With Sensor", "No Sensor", "Sunroof", "No Sunroof"];

/* Brand -> 3-letter code + common models (used for suggestions and code gen). */
export const BRANDS = [
  { name: "Toyota",      code: "TOY", models: ["Premio", "Axio", "Fielder", "Harrier", "Wish", "Corolla", "Vitz", "Probox"] },
  { name: "Nissan",      code: "NIS", models: ["X-Trail", "Tiida", "Note", "Wingroad", "March", "Juke"] },
  { name: "Mazda",       code: "MZD", models: ["CX-5", "Demio", "Axela", "Atenza", "Premacy"] },
  { name: "Honda",       code: "HON", models: ["Fit", "CR-V", "Vezel", "Civic", "Stream"] },
  { name: "Subaru",      code: "SUB", models: ["Forester", "Legacy", "Impreza", "Outback", "XV"] },
  { name: "Mercedes",    code: "MRC", models: ["C-Class", "E-Class", "GLE", "ML", "A-Class"] },
  { name: "BMW",         code: "BMW", models: ["3 Series", "5 Series", "X3", "X5", "1 Series"] },
  { name: "Volkswagen",  code: "VWG", models: ["Golf", "Passat", "Polo", "Tiguan", "Touareg"] },
  { name: "Audi",        code: "AUD", models: ["A3", "A4", "Q5", "Q7", "A6"] },
  { name: "Isuzu",       code: "ISZ", models: ["D-Max", "MU-X", "NPR", "FRR"] },
  { name: "Mitsubishi",  code: "MIT", models: ["Outlander", "Pajero", "Lancer", "Canter", "L200"] },
  { name: "Land Rover",  code: "LRV", models: ["Discovery", "Defender", "Range Rover", "Freelander"] },
];

/* A short, filesystem-safe code fragment for any free-text value.
   "Range Rover" -> "RNG", "CX-5" -> "CX5". */
export function abbr(str, len = 3) {
  const cleaned = String(str || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "XXX".slice(0, len);
  return cleaned.slice(0, len).padEnd(len, "X");
}

export function brandCode(brandName) {
  const b = BRANDS.find((x) => x.name.toLowerCase() === String(brandName).toLowerCase());
  return b ? b.code : abbr(brandName, 3);
}

/* One-letter side code for the inventory code (L, R, F, B, P, C). */
export function sideCode(side) {
  return (
    {
      Left: "L",
      Right: "R",
      Front: "F",
      Rear: "B",
      Pair: "P",
      Center: "C",
      "Not Applicable": "N",
    }[side] || "N"
  );
}

/* Short variant tag, e.g. "Non Xenon" -> "NX", "Xenon" -> "XN". */
export function variantCode(variant) {
  const v = String(variant || "").trim();
  if (!v) return "";
  const words = v.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return abbr(v, 2);
}

/* Rich inventory code: CAT-BRND-MODL-YY[-SIDE][-VAR]-SERIAL
   e.g. HDL-TOY-AUR-10-L-NX-0008
   The serial is unique across the WHOLE shop, so every physical
   part is individually traceable even if the rest of the code repeats. */
export function generateCode({ cat, brand, model, yearFrom, side, variant }, existingItems) {
  const c = String(cat || "XXX").toUpperCase();
  const b = brandCode(brand);
  const m = abbr(model, 3);
  const yy = String(yearFrom || "").slice(-2).padStart(2, "0");
  const segs = [c, b, m, yy];
  const s = sideCode(side);
  if (s && s !== "N") segs.push(s);
  const v = variantCode(variant);
  if (v) segs.push(v);

  // Highest serial in use, shop-wide, so serials never repeat.
  let maxSerial = 0;
  for (const it of existingItems) {
    const parts = String(it.code).split("-");
    const serial = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
  }
  const serial = String(maxSerial + 1).padStart(4, "0");
  return `${segs.join("-")}-${serial}`;
}

/* Smart matching — find an existing item from described attributes,
   never from a code. Returns the best matching item or null.
   Compares brand, model, category/part, year overlap, side, condition,
   and variant, all case-insensitively and forgiving of blanks. */
const norm = (x) => String(x || "").trim().toLowerCase();
export function findMatch(desc, items) {
  const wantYear = Number(desc.yearFrom) || null;
  const candidates = items.filter((it) => {
    if (desc.cat && it.cat !== desc.cat) return false;
    if (desc.brand && norm(it.brand) !== norm(desc.brand)) return false;
    if (desc.model && norm(it.model) !== norm(desc.model)) return false;
    if (desc.side && norm(desc.side) !== "not applicable" && norm(it.side) !== norm(desc.side)) return false;
    if (desc.condition && norm(it.condition) !== norm(desc.condition)) return false;
    if (desc.variant && norm(it.variant) !== norm(desc.variant)) return false;
    if (wantYear) {
      const from = Number(it.yearFrom) || 0;
      const to = Number(it.yearTo) || from;
      if (wantYear < from - 1 || wantYear > to + 1) return false; // ±1yr tolerance
    }
    return true;
  });
  if (candidates.length === 0) return null;
  // Prefer an exact year-range match, then the one with most stock.
  candidates.sort((a, b) => {
    const aExact = wantYear && Number(a.yearFrom) <= wantYear && wantYear <= (Number(a.yearTo) || a.yearFrom) ? 1 : 0;
    const bExact = wantYear && Number(b.yearFrom) <= wantYear && wantYear <= (Number(b.yearTo) || b.yearFrom) ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return b.qty - a.qty;
  });
  return candidates[0];
}

/* Warehouse location display: A-R03-S02-B05 */
export function formatLocation({ warehouse, rack, shelf, bin }) {
  const w = String(warehouse || "").trim();
  const parts = [];
  if (w) parts.push(w.replace(/^warehouse\s*/i, "").toUpperCase() || w.toUpperCase());
  if (rack) parts.push("R" + String(rack).padStart(2, "0"));
  if (shelf) parts.push("S" + String(shelf).padStart(2, "0"));
  if (bin) parts.push("B" + String(bin).padStart(2, "0"));
  return parts.join("-") || "Unassigned";
}

export const condColor = (c) =>
  ({
    "Brand New": "#15926A",
    "Genuine Used": "#2563EB",
    Aftermarket: "#6B7480",
    Refurbished: "#7C5CD6",
  }[c] || "#6B7480");

export const LOW_STOCK_THRESHOLD = 3;

/* ---------------- seed inventory ---------------- */
export const SEED_ITEMS = [
  { code: "FBM-MZD-AXL-18-0001", cat: "FBM", brand: "Mazda", model: "Axela", series: "BM", yearFrom: 2016, yearTo: 2018, condition: "Genuine Used", side: "Front", color: "Grey", price: 8500, qty: 4, min: 3, location: "A-R03-S02-B05", notes: "", images: [], status: "Active" },
  { code: "HDL-TOY-PRE-14-0002", cat: "HDL", brand: "Toyota", model: "Premio", series: "260", yearFrom: 2014, yearTo: 2018, condition: "Brand New", side: "Right", color: "Clear", price: 12000, qty: 8, min: 3, location: "D-R01-S01-B02", notes: "", images: [], status: "Active" },
  { code: "HDL-TOY-PRE-14-0003", cat: "HDL", brand: "Toyota", model: "Premio", series: "260", yearFrom: 2014, yearTo: 2018, condition: "Brand New", side: "Left", color: "Clear", price: 12000, qty: 2, min: 3, location: "D-R01-S01-B03", notes: "Reorder soon", images: [], status: "Active" },
  { code: "DOR-NIS-XTR-15-0004", cat: "DOR", brand: "Nissan", model: "X-Trail", series: "T32", yearFrom: 2015, yearTo: 2020, condition: "Genuine Used", side: "Left", color: "White", price: 18000, qty: 3, min: 2, location: "B-R02-S01-B01", notes: "", images: [], status: "Active" },
  { code: "TLL-SUB-FOR-13-0005", cat: "TLL", brand: "Subaru", model: "Forester", series: "SJ", yearFrom: 2013, yearTo: 2018, condition: "Genuine Used", side: "Right", color: "Red", price: 6500, qty: 9, min: 3, location: "D-R02-S02-B01", notes: "", images: [], status: "Active" },
  { code: "SMI-TOY-FIE-16-0006", cat: "SMI", brand: "Toyota", model: "Fielder", series: "160", yearFrom: 2016, yearTo: 2020, condition: "Aftermarket", side: "Right", color: "Silver", price: 4500, qty: 10, min: 4, location: "G-R01-S01-B01", notes: "", images: [], status: "Active" },
  { code: "BNT-MZD-DEM-14-0007", cat: "BNT", brand: "Mazda", model: "Demio", series: "DJ", yearFrom: 2014, yearTo: 2019, condition: "Genuine Used", side: "Not Applicable", color: "Blue", price: 9000, qty: 3, min: 2, location: "F-R01-S01-B01", notes: "", images: [], status: "Active" },
  { code: "RBM-HON-FIT-13-0008", cat: "RBM", brand: "Honda", model: "Fit", series: "GK", yearFrom: 2013, yearTo: 2020, condition: "Refurbished", side: "Rear", color: "Black", price: 7000, qty: 5, min: 3, location: "C-R02-S01-B04", notes: "", images: [], status: "Active" },
  { code: "HDL-TOY-AUR-10-L-NX-0009", cat: "HDL", brand: "Toyota", model: "Auris", series: "150", yearFrom: 2010, yearTo: 2012, condition: "Genuine Used", side: "Left", variant: "Non Xenon", color: "Clear", price: 9500, qty: 7, min: 3, location: "D-R01-S02-B01", supplier: "Ex Japan", notes: "", images: [], status: "Active",
    ledger: [
      { ts: 1719878400000, type: "new_item", qty: 5, by: "John Mwangi", remaining: 5, supplier: "Ex Japan" },
      { ts: 1720137600000, type: "stock", qty: 4, by: "John Mwangi", remaining: 9, supplier: "Ex Japan" },
      { ts: 1720310400000, type: "sale", qty: 1, by: "Charles Kingori", buyer: "Auto Garage", paid: true, remaining: 8 },
      { ts: 1720483200000, type: "sale", qty: 1, by: "Charles Kingori", buyer: "Mwangi Motors", paid: false, remaining: 7 },
    ],
  },
];
