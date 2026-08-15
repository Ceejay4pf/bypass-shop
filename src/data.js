/* ---------------------------------------------------------
   BYPASS SHOP — data layer
   Reports up to: JASPARE AUTO (main shop)

   Persistence: Supabase (cloud). Item codes are the primary key —
   uniqueness is enforced by the DB and a global serial sequence.
   This file holds constants + pure helpers (code gen, matching).
--------------------------------------------------------- */

/* The categories the shop starts with. An admin adds more in Settings;
   those live in the `part_categories` table and are merged with these at
   runtime by mergeCategories() below. Each has a 3-letter code prefix,
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
  /* The rest of what is actually on the shelves. These are built in rather than
     added through Settings so they are simply there — waiting on a migration to
     be run meant a real shelf of bulbs had nowhere to be filed. Anything still
     missing an admin adds in Settings → Categories. */
  { key: "BTL", label: "Boot Lights",                   shelf: "I-01", color: "#D4A72C" },
  { key: "FGL", label: "Fog Lights",                    shelf: "I-02", color: "#F07A4F" },
  { key: "IND", label: "Indicators",                    shelf: "I-03", color: "#FFA53C" },
  { key: "BLB", label: "Bulbs",                         shelf: "I-04", color: "#E86A6A" },
  { key: "HLC", label: "Headlight Computers",           shelf: "I-05", color: "#7C5CD6" },
  { key: "HNG", label: "Hinges",                        shelf: "J-01", color: "#6B7480" },
  /* No "Fenders" here on purpose: a fender IS a wing, and the two Wing
     sections already hold them. A second name for the same shelf would split
     the same parts across two codes. */
  { key: "GRL", label: "Grilles",                       shelf: "K-01", color: "#2E86DE" },
  { key: "RDT", label: "Radiators",                     shelf: "L-01", color: "#15926A" },
  { key: "ENG", label: "Engine Parts",                  shelf: "M-01", color: "#8FD6A6" },
  { key: "SUS", label: "Suspension",                    shelf: "N-01", color: "#2563EB" },
  { key: "INT", label: "Interior Parts",                shelf: "O-01", color: "#7C5CD6" },
  { key: "GLS", label: "Glass & Windscreens",           shelf: "P-01", color: "#9BB7F0" },
  { key: "OTH", label: "Other Parts",                   shelf: "Z-01", color: "#6B7480" },
];

/* ---- FAMILIES OF PARTS ----
   A printed list is usually wanted for a whole family, not one shelf of it:
   "all side mirrors", not "side mirrors with indicator" and then again for the
   plain ones. Categories are kept split because the shelf and the code prefix
   differ, so the families are worked out here instead of being a second list
   that someone has to remember to update.

   Most of it is automatic: anything labelled "X - Y" belongs to family X, so
   Wing - Left / Wing - Right become "Wings" and the two kinds of side mirror
   become "Side Mirrors". That also covers any category an admin adds later,
   as long as it is named the same way.

   These few don't follow the pattern and are named by hand. Bumper Slides is
   deliberately absent: it is a bracket, not a bumper, and printing it under
   "all bumpers" would put the wrong parts on the list. */
const EXTRA_FAMILIES = {
  FBM: "Bumpers",
  RBM: "Bumpers",
  HDL: "Lights",
  TLL: "Lights",
  BTL: "Lights",
  FGL: "Lights",
  IND: "Lights",
  /* Bulbs and headlight computers are deliberately NOT lights. Someone asking
     for "all lights" wants light units to sell, not a box of bulbs and a shelf
     of ballasts — the same reason Bumper Slides is not a bumper. */
};

export function categoryGroups(categories = DEFAULT_CATEGORIES) {
  const buckets = new Map();
  for (const c of categories) {
    const label = String(c.label || "").trim();
    if (!label) continue;
    // Split on a dash with spaces around it, whichever dash was typed.
    const head = label.split(/\s+[—–-]\s+/)[0].trim();
    // "Wing - Left" gives the family "Wing", but the option reads as a group,
    // so it is printed as "Wings". Anything already plural is left alone.
    const family = head && head !== label
      ? (/s$/i.test(head) ? head : head + "s")
      : EXTRA_FAMILIES[c.key];
    if (!family) continue;
    const slug = family.toLowerCase();
    if (!buckets.has(slug)) buckets.set(slug, { family, keys: [] });
    buckets.get(slug).keys.push(c.key);
  }
  // A family of one is just the category itself - offering both would be two
  // options that print exactly the same thing.
  return [...buckets.entries()]
    .filter(([, g]) => g.keys.length > 1)
    .map(([slug, g]) => ({
      key: `grp:${slug.replace(/[^a-z0-9]+/g, "-")}`,
      label: g.family,
      keys: g.keys,
    }));
}

/* ---- CATEGORIES THE SHOP ADDS ITSELF ----
   The starting thirteen do not cover everything that gets bought and sold -
   boot lights, hinges, bulbs, headlight computers, bumper slides for shapes
   nobody listed. A part with nowhere to go got filed under something it
   isn't, which then hid it from whoever went looking, so any category the
   shop needs can be created in Settings.

   An added category is an ordinary category from then on: it appears in every
   picker, gets its own code prefix, its own shelf and its own colour. */

/* A 3-letter code prefix from the name, avoiding the ones already taken.
   "Boot Lights" -> BTL, "Hinges" -> HNG, "Headlight Computers" -> HLC.
   The prefix is stamped into every code that category ever issues, so it
   must be unique and it must never change afterwards. */
export function suggestCategoryKey(label, taken = []) {
  const used = new Set(taken.map((k) => String(k).toUpperCase()));
  const words = String(label || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";

  const letters = (w) => w.replace(/[^A-Z]/g, "");
  const candidates = [];
  // First letter of each of the first three words: "Boot Light Cover" -> BLC.
  if (words.length >= 3) candidates.push(words.slice(0, 3).map((w) => w[0]).join(""));
  /* Two words: first letter of each, plus a consonant from the first word so
     "Boot Lights" reads as BTL rather than the bare BL. */
  if (words.length === 2) {
    const a = letters(words[0]);
    const b = letters(words[1]);
    const mid = a.slice(1).replace(/[AEIOU]/g, "")[0] || a[1] || b[1] || "X";
    candidates.push((a[0] || "") + mid + (b[0] || ""));
    candidates.push((a[0] || "") + (b[0] || "") + (b[1] || "X"));
  }
  // One word: its consonants, then its plain first three letters.
  const first = letters(words[0]);
  const consonants = first[0] + first.slice(1).replace(/[AEIOU]/g, "");
  candidates.push(consonants.slice(0, 3));
  candidates.push(first.slice(0, 3));
  candidates.push(words.join("").slice(0, 3));

  for (const c of candidates) {
    const key = String(c || "").replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "X");
    if (key.length === 3 && !used.has(key)) return key;
  }
  /* Everything sensible is taken. Walk a digit through the last slot rather
     than hand back a duplicate - a repeated prefix would put two different
     kinds of part under one code, which no amount of renaming later fixes. */
  const stem = (candidates[0] || "CAT").replace(/[^A-Z0-9]/g, "").slice(0, 2).padEnd(2, "X");
  for (let i = 1; i <= 9; i++) if (!used.has(stem + i)) return stem + i;
  return "";
}

/* The next free shelf letter, so a new category lands somewhere of its own
   instead of sharing a shelf label with an existing one. */
export function suggestShelf(categories = DEFAULT_CATEGORIES) {
  const used = new Set(
    categories.map((c) => String(c.shelf || "").trim().charAt(0).toUpperCase()).filter(Boolean)
  );
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return `${letter}-01`;
  }
  return "Z-01";
}

/* Colours offered for a new category. Kept to the shop's own palette so an
   added section looks like it always belonged. */
export const CATEGORY_COLORS = [
  "#2563EB", "#15926A", "#DC3B2E", "#D4A72C", "#7C5CD6",
  "#F07A4F", "#2E86DE", "#E86A6A", "#8FD6A6", "#6B7480",
];

/* The starting categories plus whatever the shop has added, in one list.
   Added ones come last so the built-in order (and every shelf label printed
   on it) stays exactly where staff expect it. A saved category whose key
   collides with a built-in one is dropped: the built-in wins, because parts
   are already coded under it. */
export function mergeCategories(extra = [], base = DEFAULT_CATEGORIES) {
  const seen = new Set(base.map((c) => c.key));
  const added = [];
  for (const c of extra) {
    const key = String(c?.key || "").toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push({
      key,
      label: String(c.label || key).trim(),
      shelf: String(c.shelf || "").trim() || "—",
      color: String(c.color || "#6B7480"),
      custom: true,
    });
  }
  return [...base, ...added];
}

export const CONDITIONS = ["Brand New", "Genuine Used", "Aftermarket", "Refurbished"];
/* A door is named by two things at once and the shop says both: which end of
   the car it came off, and which hand it is. "Front Left" and "Rear Left" are
   different parts that do not interchange, so they are different sides, not one
   side with a note. The plain values stay for everything that only needs one
   answer, and for the parts already filed under them. */
export const SIDES = [
  "Left", "Right",
  "Front Left", "Front Right", "Rear Left", "Rear Right",
  "Front", "Rear", "Pair", "Center", "Not Applicable",
];

/* Sections where the side is worth asking about at all: these are the parts
   that come in twos, and a left one will not fit the right. One list, shared by
   the pasted-list reader and the review screen — they each kept their own and
   the two had already drifted apart, so a fog light the reader called
   incomplete was counted as ready the moment somebody edited the row. */
export const SIDED_CATS = ["DOR", "HDL", "TLL", "SMI", "SMN", "WNL", "WNR", "BTL", "FGL", "IND", "HNG", "GLS"];

/* Sections where front and rear is a SECOND question on top of left and right.
   Doors are the reason: DOR covers both ends of the car, so "front" is the only
   thing that tells a front door from a rear one — and dropping it left 90 doors
   on the shelf that all read the same. A front bumper is not in here: it is
   already its own section (FBM), so the word adds nothing. */
export const POSITIONED_CATS = ["DOR", "HNG", "GLS", "INT"];

/* The sides worth offering for a section, so the dropdown asks the question the
   shop would actually answer. `current` is passed so a part already saved with
   some other value still shows its own side instead of silently reading as
   something else. */
export function sidesFor(cat, current = "") {
  const both = ["Front Left", "Front Right", "Rear Left", "Rear Right", "Left", "Right", "Pair", "Not Applicable"];
  const hand = ["Left", "Right", "Pair", "Not Applicable"];
  const list = POSITIONED_CATS.includes(cat) ? both : SIDED_CATS.includes(cat) ? hand : SIDES;
  return !current || list.includes(current) ? list : [...list, current];
}

/* The two halves of a side, back apart again: "Front Left" -> Front, and Left.
   Only for the sections that have two ends — a tail light reading "Left" has no
   end to pull off, and a bumper's section already is the end.

   Used wherever the end of the car has to be read FIRST and the hand second: the
   printed stock list puts all the front doors under their own heading before the
   rear ones, and the card on screen shows the end as a badge rather than as one
   more word in a run of grey text. On a page of 105 doors, "Front" buried in the
   middle of a Side column is not something anybody finds. */
export function splitSide(cat, side) {
  const s = String(side || "").trim();
  const m = POSITIONED_CATS.includes(cat) ? /^(Front|Rear)(?: (Left|Right))?$/.exec(s) : null;
  return m ? { position: m[1], hand: m[2] || "" } : { position: "", hand: s };
}

/* Front doors before rear ones, and unsaid ones last so they stand out as the
   rows still needing an answer rather than hiding among the rear. */
export const POSITION_ORDER = ["Front", "Rear", ""];

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

/* Side code for the inventory code (L, R, F, B, P, C), or two letters when the
   part is named by both ends and hands: FL, FR, BL, BR. B is rear throughout,
   because R was already taken by right.

   Doors filed before this existed keep the single letter in their code — a code
   is printed on the shelf label and is never rewritten, so DOR-HON-CRV-XX-L-0293
   stays as it is even after its side reads "Front Left". The letter is still
   true, just less exact; the fields are what the shop reads off the screen. */
export function sideCode(side) {
  return (
    {
      Left: "L",
      Right: "R",
      Front: "F",
      Rear: "B",
      Pair: "P",
      Center: "C",
      "Front Left": "FL",
      "Front Right": "FR",
      "Rear Left": "BL",
      "Rear Right": "BR",
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
   part is individually traceable even if the rest of the code repeats.

   When the year isn't known the slot reads "XX" - HDL-TOY-AUR-XX-0008.
   It used to read "00", which looked like a real year (1900? 2000?) and
   told nobody it was simply unknown. */
export function generateCode({ cat, brand, model, yearFrom, side, variant }, existingItems) {
  const c = String(cat || "XXX").toUpperCase();
  const b = brandCode(brand);
  const m = abbr(model, 3);
  const yy = Number(yearFrom) ? String(yearFrom).slice(-2).padStart(2, "0") : "XX";
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
      // A part with no year on record can't be ruled out - we simply don't
      // know. Excluding it would hide real stock from the counter, so it
      // stays a candidate and just ranks below a genuine year match.
      if (from && (wantYear < from - 1 || wantYear > to + 1)) return false; // +/-1yr tolerance
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

/* When to warn that a part is running out.

   Zero. Not three.

   Three was wrong for this shop. A body part is held as one piece — one Premio
   bonnet, one Harrier bumper — and one piece is full stock, not a shortage. With
   the level at 3 and the test being "at or below", every single-piece part on the
   shelves was permanently in the reorder list, so the list named nearly the whole
   inventory and told the owner nothing. An alert that is always on is not an
   alert.

   Zero means the warning fires when the part is actually finished, which is the
   moment there is something to do about it. A part that genuinely needs reordering
   earlier — fast-moving bulbs, say — gets its own level typed in on the part
   itself ("Low-stock at"), and that per-part number always wins over this one. */
export const LOW_STOCK_THRESHOLD = 0;

/* Every part already in the database carries min_qty = 3, because that was the
   old column default and the old pre-filled form value — so it was stamped on
   parts automatically, never chosen by anybody. Read literally, those parts stay
   in the reorder list for ever and the change above fixes nothing that is
   actually on the shelves today.

   So a stored 3 is read as "nobody set this" and falls back to the level above.
   supabase/low_stock_reset.sql makes it permanent in the database; until it is
   run, this keeps the alert honest anyway — a fix that needs a migration the
   shop hasn't run is a fix the shop doesn't have.

   The cost, stated plainly: a reorder level of exactly 3 can't be asked for by
   hand. Type 2 or 4. Everything else means what it says. */
const LEGACY_MIN = 3;

export function reorderLevel(item) {
  const m = item?.min;
  if (m === null || m === undefined || m === "" || Number(m) === LEGACY_MIN) return LOW_STOCK_THRESHOLD;
  return Number(m) || LOW_STOCK_THRESHOLD;
}

/* The two states worth telling apart. Finished means it cannot be sold at all;
   low means it is above zero but at or under its own level. */
export const isOutOfStock = (item) => Number(item?.qty || 0) <= 0;
export const isLowStock = (item) => Number(item?.qty || 0) <= reorderLevel(item);

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
