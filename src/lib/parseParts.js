/* ---------------------------------------------------------
   BYPASS SHOP — plain-English part reader

   Staff write parts the way they say them:

     Left-hand side side mirror - Honda Fit (2010 model)
     Front bumper - Lexus IS 250 (2008 model)
     Rear bumper - Toyota Harrier (2016 model)

   This file turns each of those lines into the fields the
   inventory needs: category, brand, model, year range, side.
   Nothing here touches the database or React — it is pure
   text in, fields out, so it can be tested by reading it.

   It is deliberately forgiving: a line it only half
   understands still comes back, with `missing` listing what
   the person needs to fill in. It never guesses a brand it
   has not been told about.
--------------------------------------------------------- */
import { BRANDS, DEFAULT_CATEGORIES } from "../data.js";

/* ---------- category words ---------- */
/* Every way we have heard a category asked for, in the shop and on
   WhatsApp. Longest phrases are matched first (see CAT_PHRASES below),
   so "front bumper" wins over the bare word "bumper". A `catch` entry
   is the fallback when a phrase names a part family but not which one
   (e.g. plain "bumper" - could be front or rear). */
const CATEGORY_WORDS = {
  WNL: ["left wing", "left fender", "left hand wing", "left hand fender", "l/h wing", "lh wing", "front wing left"],
  WNR: ["right wing", "right fender", "right hand wing", "right hand fender", "r/h wing", "rh wing", "front wing right"],
  DOR: ["door", "doors", "front door", "rear door", "back door", "sliding door", "door shell"],
  FBM: ["front bumper", "front bumpers", "f bumper", "front buffer", "front bamper"],
  RBM: ["rear bumper", "rear bumpers", "back bumper", "r bumper", "rear buffer", "rear bamper"],
  HDL: ["headlight", "headlights", "head light", "head lights", "headlamp", "headlamps", "head lamp"],
  TLL: ["taillight", "taillights", "tail light", "tail lights", "taillamp", "tail lamp", "rear light", "rear lights", "back light"],
  BSK: ["boot shock", "boot shocks", "boot strut", "boot struts", "tailgate shock", "tailgate strut", "gas strut", "boot damper"],
  BNT: ["bonnet", "bonnets", "hood", "hoods", "engine cover"],
  BOT: ["boot", "boots", "boot lid", "boot door", "tailgate", "trunk", "trunk lid", "back door boot"],
  SMI: ["side mirror with indicator", "mirror with indicator", "side mirror indicator", "indicator mirror", "mirror with signal"],
  SMN: ["side mirror", "side mirrors", "door mirror", "wing mirror", "mirror", "mirrors", "plain mirror", "side mirror plain"],
  BPS: ["bumper slide", "bumper slides", "bumper support", "bumper bracket", "bumper slider"],
};

/* Part families that need a second word before we know the category.
   Matching one of these sets `needsSide`, so the review screen can ask. */
const AMBIGUOUS = {
  bumper: { options: ["FBM", "RBM"], ask: "front or rear bumper?" },
  wing: { options: ["WNL", "WNR"], ask: "left or right wing?" },
  fender: { options: ["WNL", "WNR"], ask: "left or right wing?" },
};

/* Flattened and sorted longest-first so multi-word phrases win. */
const CAT_PHRASES = Object.entries(CATEGORY_WORDS)
  .flatMap(([key, words]) => words.map((w) => ({ key, w })))
  .sort((a, b) => b.w.length - a.w.length);

/* ---------- side words ---------- */
/* "Left-hand side", "L/H", "nearside" - all the same thing. Again
   longest-first, because "left hand side" contains "left". */
const SIDE_WORDS = [
  { side: "Left", words: ["left hand side", "left-hand side", "left hand", "l/h/s", "lhs", "l/h", "nearside", "near side", "left side", "left"] },
  { side: "Right", words: ["right hand side", "right-hand side", "right hand", "r/h/s", "rhs", "r/h", "offside", "off side", "right side", "right"] },
  { side: "Front", words: ["front"] },
  { side: "Rear", words: ["rear", "back"] },
  { side: "Pair", words: ["pair", "both sides", "both", "set of two", "set"] },
  { side: "Center", words: ["center", "centre", "middle"] },
];
const SIDE_PHRASES = SIDE_WORDS.flatMap(({ side, words }) => words.map((w) => ({ side, w })))
  .sort((a, b) => b.w.length - a.w.length);

/* ---------- extra brands & aliases ---------- */
/* data.js BRANDS drives code generation. These are brands the shop also
   sees plus the everyday nicknames, mapped onto a proper brand name.
   A brand not listed in data.js still works - brandCode() abbreviates it. */
const BRAND_ALIASES = {
  toyota: "Toyota", toyot: "Toyota", tyt: "Toyota",
  nissan: "Nissan", nissa: "Nissan", datsun: "Nissan",
  mazda: "Mazda", matsuda: "Mazda",
  honda: "Honda",
  subaru: "Subaru", subari: "Subaru",
  mercedes: "Mercedes", "mercedes benz": "Mercedes", benz: "Mercedes", merc: "Mercedes",
  bmw: "BMW",
  volkswagen: "Volkswagen", vw: "Volkswagen",
  audi: "Audi",
  isuzu: "Isuzu", izuzu: "Isuzu",
  mitsubishi: "Mitsubishi", mitsu: "Mitsubishi",
  "land rover": "Land Rover", landrover: "Land Rover", landcruiser: "Toyota",
  lexus: "Lexus",
  suzuki: "Suzuki",
  ford: "Ford",
  hyundai: "Hyundai",
  kia: "Kia",
  jeep: "Jeep",
  peugeot: "Peugeot",
  volvo: "Volvo",
  chevrolet: "Chevrolet", chevy: "Chevrolet",
  daihatsu: "Daihatsu",
  porsche: "Porsche",
};

/* Models we can name a brand from, so "Harrier (2016)" alone still
   files itself under Toyota. Includes the data.js model lists plus the
   ones that turn up on the shop floor. */
const MODEL_TO_BRAND = {};
for (const b of BRANDS) {
  for (const m of b.models) MODEL_TO_BRAND[m.toLowerCase()] = { brand: b.name, model: m };
}
const EXTRA_MODELS = [
  ["Toyota", ["Prado", "Land Cruiser", "Hilux", "RAV4", "Allion", "Belta", "Ractis", "Rush", "Voxy", "Noah", "Alphard", "Succeed", "Sienta", "Passo", "Mark X", "Crown", "Camry", "Auris", "IST", "Isis", "Hiace", "Dyna", "Coaster", "Spacio", "Raum", "Bb", "Duet", "Funcargo", "Kluger", "Vanguard", "Blade", "Verossa"]],
  ["Lexus", ["IS 250", "IS 350", "IS 300", "RX 300", "RX 350", "RX 450", "GS 300", "LX 570", "NX 200", "ES 350", "LS 460", "GX 460", "CT 200"]],
  ["Nissan", ["Sylphy", "Bluebird", "Teana", "Dualis", "Qashqai", "Serena", "Navara", "Patrol", "Latio", "Sunny", "Caravan", "Vanette", "AD Van", "Skyline", "Murano", "Elgrand", "Cube"]],
  ["Mazda", ["CX-3", "CX-7", "CX-8", "CX-9", "Bongo", "BT-50", "Familia", "Verisa", "Biante", "Carol", "MPV", "Tribute", "Mazda 2", "Mazda 3", "Mazda 6"]],
  ["Honda", ["Freed", "Insight", "Airwave", "Odyssey", "Accord", "HR-V", "Shuttle", "Fit Shuttle", "Grace", "Jazz", "Legend", "Elysion", "Partner"]],
  ["Subaru", ["Exiga", "Trezia", "Levorg", "WRX", "BRZ", "Sambar", "Justy"]],
  ["Mitsubishi", ["ASX", "Colt", "Delica", "RVR", "Fuso", "Montero", "Galant", "Airtrek", "Mirage"]],
  ["Isuzu", ["Forward", "Elf", "Trooper", "Bighorn", "Wizard"]],
  ["Volkswagen", ["Jetta", "Caddy", "Amarok", "Sharan", "Beetle", "Up"]],
  ["Suzuki", ["Swift", "Alto", "Escudo", "Vitara", "Jimny", "Wagon R", "Ertiga", "Every", "Baleno", "SX4", "Solio"]],
  ["Ford", ["Ranger", "Ecosport", "Everest", "Focus", "Fiesta", "Kuga", "Escape"]],
  ["Land Rover", ["Evoque", "Velar", "Sport"]],
  ["Mercedes", ["C200", "C180", "E200", "E250", "GLA", "GLC", "GLK", "Vito", "Sprinter", "Actros", "B-Class", "S-Class"]],
  ["BMW", ["X1", "X4", "X6", "320i", "318i", "520i", "530i", "7 Series", "2 Series", "4 Series"]],
  ["Audi", ["A1", "A5", "A7", "A8", "Q3", "Q2", "TT"]],
  ["Hyundai", ["Tucson", "Santa Fe", "i10", "i20", "i30", "Creta", "Elantra", "Accent"]],
  ["Kia", ["Sportage", "Sorento", "Rio", "Picanto", "Cerato", "Carens", "Soul"]],
  ["Toyota", ["Vellfire", "Estima", "Wish"]],
  ["Peugeot", ["206", "207", "208", "301", "3008", "308", "508"]],
  ["Volvo", ["XC60", "XC90", "V40", "S60"]],
  ["Jeep", ["Wrangler", "Cherokee", "Grand Cherokee", "Compass"]],
  ["Daihatsu", ["Terios", "Mira", "Move", "Hijet", "Boon"]],
  ["Chevrolet", ["Spark", "Cruze", "Captiva", "Trailblazer"]],
];
for (const [brand, models] of EXTRA_MODELS) {
  for (const m of models) {
    const k = m.toLowerCase();
    if (!MODEL_TO_BRAND[k]) MODEL_TO_BRAND[k] = { brand, model: m };
  }
}
/* Staff write "xtrail", "crv", "cx5", "is250" as often as the proper
   spelling, so register the run-together form of every model too - it
   still resolves to the properly-spelt name. */
for (const key of Object.keys(MODEL_TO_BRAND)) {
  const squashed = key.replace(/[^a-z0-9]/g, "");
  if (squashed && squashed !== key && !MODEL_TO_BRAND[squashed]) {
    MODEL_TO_BRAND[squashed] = MODEL_TO_BRAND[key];
  }
}

/* Longest model names first: "Land Cruiser" before "Cruiser", "IS 250"
   before "IS", "Grand Cherokee" before "Cherokee". */
const MODEL_KEYS = Object.keys(MODEL_TO_BRAND).sort((a, b) => b.length - a.length);
const BRAND_KEYS = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);

/* ---------- variant words ---------- */
const VARIANT_WORDS = [
  { variant: "Non Xenon", words: ["non xenon", "non-xenon", "no xenon", "halogen bulb"] },
  { variant: "Xenon", words: ["xenon", "hid"] },
  { variant: "LED", words: ["led"] },
  { variant: "Halogen", words: ["halogen"] },
  { variant: "With Sensor", words: ["with sensor", "with sensors", "with pdc", "sensor holes"] },
  { variant: "No Sensor", words: ["no sensor", "without sensor", "no sensors", "no pdc"] },
  { variant: "Sunroof", words: ["with sunroof", "sunroof"] },
  { variant: "No Sunroof", words: ["no sunroof", "without sunroof"] },
];
const VARIANT_PHRASES = VARIANT_WORDS.flatMap(({ variant, words }) => words.map((w) => ({ variant, w })))
  .sort((a, b) => b.w.length - a.w.length);

/* ---------- condition words ---------- */
const CONDITION_WORDS = [
  { condition: "Brand New", words: ["brand new", "new", "bnew", "b/new"] },
  { condition: "Genuine Used", words: ["genuine used", "genuine", "ex japan", "ex-japan", "used", "second hand", "2nd hand", "tokunbo"] },
  { condition: "Aftermarket", words: ["aftermarket", "after market", "china", "taiwan", "replica", "copy"] },
  { condition: "Refurbished", words: ["refurbished", "refurb", "repaired", "reconditioned"] },
];
const CONDITION_PHRASES = CONDITION_WORDS.flatMap(({ condition, words }) => words.map((w) => ({ condition, w })))
  .sort((a, b) => b.w.length - a.w.length);

/* ---------- helpers ---------- */

/* Normalise text the way a person reads it, not the way it was typed:
   smart quotes, en/em dashes and non-breaking spaces all become plain
   ASCII so one set of patterns handles every paste. Line breaks survive —
   they are how a pasted list separates one part from the next. */
export function tidy(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[‐-―−﹘﹣－]/g, "-") // all dash shapes
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[  -​  　]/g, " ")
    .replace(/[^\S\n]+/g, " ") // squeeze spaces, but never the line breaks
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/* Whole-word-ish search. Part names contain "/" and "-" so the usual \b
   is no help; we check the characters either side instead. */
function findPhrase(hay, needle) {
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) return -1;
    const before = at === 0 ? " " : hay[at - 1];
    const after = at + needle.length >= hay.length ? " " : hay[at + needle.length];
    const isWordChar = (c) => /[a-z0-9]/.test(c);
    if (!isWordChar(before) && !isWordChar(after)) return at;
    from = at + 1;
  }
}
const has = (hay, needle) => findPhrase(hay, needle) !== -1;

/* Strip the leading "1." / "1)" / "- " / bullet a pasted list carries. */
function stripBullet(line) {
  return line.replace(/^\s*(?:[-*•·>]+|\(?\d{1,3}[.)\]]|\d{1,3}\s*[-:])\s*/, "").trim();
}

/* ---------- year ---------- */
/* Pull a year or year range out of a line, and say which characters it
   used so the model name can avoid them. Handles "2010", "(2010 model)",
   "2012-2016", "2012 to 2016", "2012/16", and a bare "'08". */
function readYears(text) {
  const now = new Date().getFullYear();
  const plausible = (y) => y >= 1970 && y <= now + 2;

  // A range first: 2012-2016, 2012 to 2016, 2012/2016, 2012-16
  const range =
    text.match(/\b(19\d{2}|20\d{2})\s*(?:-|to|thru|through|till|until|\/)\s*(19\d{2}|20\d{2})\b/i) ||
    text.match(/\b(19\d{2}|20\d{2})\s*(?:-|\/)\s*(\d{2})\b/);
  if (range) {
    const from = Number(range[1]);
    let to = Number(range[2]);
    if (to < 100) to = Number(String(from).slice(0, 2) + String(to).padStart(2, "0"));
    if (plausible(from) && plausible(to) && to >= from) {
      return { yearFrom: from, yearTo: to, at: range.index, len: range[0].length };
    }
  }

  /* A single year. Careful: model names carry numbers too ("IS 250",
     "Prado 150", "Peugeot 206"). Only take a 4-digit 19xx/20xx, and
     prefer one that is actually written as a year - inside brackets,
     or next to the word "model"/"year". */
  const singles = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)].filter((m) => plausible(Number(m[1])));
  if (singles.length) {
    const scored = singles.map((m) => {
      const around = text.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12).toLowerCase();
      let score = 0;
      if (/\(|\)/.test(around)) score += 2;
      if (/model|year|yr|\bmdl\b/.test(around)) score += 3;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].m;
    const y = Number(best[1]);
    return { yearFrom: y, yearTo: y, at: best.index, len: best[0].length };
  }

  // Last resort: an apostrophe year, '08 or `16.
  const short = text.match(/['`](\d{2})\b/);
  if (short) {
    const n = Number(short[1]);
    const y = n <= (now % 100) + 2 ? 2000 + n : 1900 + n;
    if (plausible(y)) return { yearFrom: y, yearTo: y, at: short.index, len: short[0].length };
  }
  return null;
}

/* ---------- price / qty ---------- */
/* "@ 8500", "ksh 8,500", "x2", "qty 3", "2 pcs" - written the way a
   supplier's list is written. Prices need a marker so a model number is
   never mistaken for money. */
function readPrice(text) {
  const m =
    text.match(/(?:@|ksh?|kes|shs?|price|=)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/([\d,]{4,})\s*(?:\/=|\/-|bob|shillings?)/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/,/g, ""));
  if (!isFinite(n) || n <= 0) return null;
  return { price: n, at: m.index, len: m[0].length };
}
function readQty(text) {
  const m =
    text.match(/\b(?:qty|quantity)\s*[:=]?\s*(\d{1,4})\b/i) ||
    text.match(/\bx\s?(\d{1,3})\b/i) ||
    text.match(/\b(\d{1,3})\s*(?:pcs?|pieces?|units?|off)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!n) return null;
  return { qty: n, at: m.index, len: m[0].length };
}

/* ---------- one line ---------- */

/* Read a single written line into inventory fields.
   Returns null for a line with nothing in it (blank, or a heading like
   "Here's your list written clearly:"). */
export function parsePartLine(rawLine) {
  const raw = tidy(rawLine);
  if (!raw) return null;
  const line = stripBullet(raw);
  if (!line) return null;

  // A heading, not a part: no letters that could be a part, ends in a colon.
  if (/^[^:]{0,60}:$/.test(line) && !CAT_PHRASES.some((c) => has(line.toLowerCase(), c.w))) {
    return null;
  }

  const low = line.toLowerCase();
  const out = {
    raw: line,
    cat: "",
    catAsk: "",
    brand: "",
    model: "",
    series: "",
    yearFrom: "",
    yearTo: "",
    side: "",
    variant: "",
    condition: "",
    price: "",
    qty: "",
    missing: [],
  };

  /* --- side, read before the category so "Left-hand side side mirror"
         does not lose its "side" to the mirror phrase --- */
  let sideSpan = null;
  for (const { side, w } of SIDE_PHRASES) {
    const at = findPhrase(low, w);
    if (at === -1) continue;
    /* "front bumper" / "rear bumper" / "front door": the word is naming the
       part, not the side. Take it as a side only if no category phrase
       starting at the same place claims it. */
    const claimedByCat = CAT_PHRASES.some((c) => c.w.startsWith(w + " ") && findPhrase(low, c.w) === at);
    if (claimedByCat && (side === "Front" || side === "Rear")) continue;
    out.side = side;
    sideSpan = { at, len: w.length };
    break;
  }

  /* --- category --- */
  let catSpan = null;
  for (const { key, w } of CAT_PHRASES) {
    const at = findPhrase(low, w);
    if (at === -1) continue;
    out.cat = key;
    catSpan = { at, len: w.length };
    break;
  }
  /* A plain "bumper" or "wing" with no front/rear, left/right: use the
     side if we have one, otherwise flag it for the person to choose. */
  if (!out.cat) {
    for (const [word, info] of Object.entries(AMBIGUOUS)) {
      if (!has(low, word)) continue;
      catSpan = { at: findPhrase(low, word), len: word.length };
      const bySide = { Front: "FBM", Rear: "RBM", Left: "WNL", Right: "WNR" }[out.side];
      if (bySide && info.options.includes(bySide)) out.cat = bySide;
      else out.catAsk = info.ask;
      break;
    }
  }
  /* Wing categories carry the side in the category itself. */
  if (out.cat === "WNL" && !out.side) out.side = "Left";
  if (out.cat === "WNR" && !out.side) out.side = "Right";
  /* A mirror is only "with indicator" if the line says so; SMN otherwise,
     already handled by phrase order. Doors, bumpers and lights all take
     the side we found; nothing else needs one. */

  /* --- years --- */
  const years = readYears(line);
  if (years) {
    out.yearFrom = years.yearFrom;
    out.yearTo = years.yearTo;
  }

  /* --- price / qty --- */
  const price = readPrice(line);
  if (price) out.price = price.price;
  const qty = readQty(line);
  if (qty) out.qty = qty.qty;

  /* --- variant / condition --- */
  for (const { variant, w } of VARIANT_PHRASES) {
    if (has(low, w)) { out.variant = variant; break; }
  }
  for (const { condition, w } of CONDITION_PHRASES) {
    if (has(low, w)) { out.condition = condition; break; }
  }

  /* --- brand --- */
  /* Blank out the parts of the line we have already understood, so a
     category or side word can never be read as a model name. */
  const blanks = [catSpan, sideSpan, years && { at: years.at, len: years.len },
                  price && { at: price.at, len: price.len }, qty && { at: qty.at, len: qty.len }]
    .filter(Boolean);
  let rest = low;
  for (const b of blanks) rest = rest.slice(0, b.at) + " ".repeat(b.len) + rest.slice(b.at + b.len);
  /* Keep the original casing alongside, for pulling out a model we do not
     already know by name. */
  let restRaw = line;
  for (const b of blanks) restRaw = restRaw.slice(0, b.at) + " ".repeat(b.len) + restRaw.slice(b.at + b.len);

  let brandSpan = null;
  for (const k of BRAND_KEYS) {
    const at = findPhrase(rest, k);
    if (at === -1) continue;
    out.brand = BRAND_ALIASES[k];
    brandSpan = { at, len: k.length };
    break;
  }

  /* --- model --- */
  /* A known model first - it also tells us the brand if the line left it
     out ("Harrier (2016)" is a Toyota). */
  let modelSpan = null;
  for (const k of MODEL_KEYS) {
    const at = findPhrase(rest, k);
    if (at === -1) continue;
    const known = MODEL_TO_BRAND[k];
    // Don't let a model drag in a brand that contradicts one written down.
    if (out.brand && known.brand !== out.brand) {
      // e.g. "Toyota Fit" - trust the written brand, keep the model text.
      out.model = known.model;
      modelSpan = { at, len: k.length };
      break;
    }
    out.brand = out.brand || known.brand;
    out.model = known.model;
    modelSpan = { at, len: k.length };
    break;
  }

  /* A body code written straight after a known model is the generation,
     not a stray number - "Prado 150", "X-Trail T32", "Fit GK5". It goes
     in Series, where the shop already keeps it, and it stays out of the
     model name so "Prado" files with every other Prado. */
  if (modelSpan && !out.series) {
    const after = restRaw.slice(modelSpan.at + modelSpan.len).match(/^\s*([A-Za-z]{0,3}\d{2,3}[A-Za-z]?)\b/);
    if (after) out.series = after[1].toUpperCase();
  }

  /* No known model. Whatever words are left after the brand are very
     likely the model - "Toyota Ipsum 240" -> "Ipsum 240". */
  if (!out.model) {
    let tail = restRaw;
    if (brandSpan) tail = tail.slice(brandSpan.at + brandSpan.len);
    const words = tail
      .replace(/[()\[\]{}]/g, " ")
      .split(/[\s,;:\-–]+/)
      .map((w) => w.trim())
      .filter((w) => w && !/^(model|year|yr|for|the|a|of|and|with|hand|side|type|shape|series|new|used|pc|pcs)$/i.test(w))
      .filter((w) => /[a-z0-9]/i.test(w));
    if (words.length) out.model = words.slice(0, 3).join(" ");
  }

  /* A model that ends in a body-code number is worth keeping whole -
     "Prado 150", "Premio 260" - so the code and the shelf label match
     what the mechanic asks for. Also lift a trailing code into series
     when it reads like one ("Fit GK5" -> model Fit, series GK5). */
  if (out.model) {
    const m = out.model.match(/^(.*?)\s+([A-Z]{1,3}\d{1,3}[A-Z]?)$/);
    if (m && MODEL_TO_BRAND[m[1].toLowerCase()]) {
      out.model = MODEL_TO_BRAND[m[1].toLowerCase()].model;
      out.series = m[2].toUpperCase();
    }
    out.model = out.model.replace(/\s+/g, " ").trim();
    // Present it the way the shop writes it, not lowercased from the match.
    if (!MODEL_TO_BRAND[out.model.toLowerCase()]) {
      out.model = out.model.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }
  }

  /* --- what still needs a human --- */
  if (!out.cat) out.missing.push(out.catAsk || "category");
  if (!out.brand) out.missing.push("brand");
  if (!out.model) out.missing.push("model");
  if (!out.yearFrom) out.missing.push("year");
  /* Side matters for the parts that come in twos. Bumpers, bonnets and
     boots don't, so we don't nag about them. */
  const SIDED = ["DOR", "HDL", "TLL", "SMI", "SMN", "WNL", "WNR"];
  if (SIDED.includes(out.cat) && !out.side) out.missing.push("side");

  return out;
}

/* ---------- a whole pasted list ---------- */

/* Split on new lines, and also on ";" or " / " so a list pasted as one
   long paragraph still comes apart. Returns one row per part, each with
   an id so the review screen can edit them independently. */
export function parsePartsList(text) {
  const chunks = tidy(String(text || ""))
    // A numbered list pasted as one line: put the numbers back on their own.
    .replace(/\s+(\d{1,3})[.)]\s+/g, "\n$1. ")
    .split(/\n|;|(?:\s+\/\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const rows = [];
  for (const chunk of chunks) {
    const row = parsePartLine(chunk);
    if (row) rows.push({ id: `r${rows.length}`, ...row });
  }
  return rows;
}

/* Turn a reviewed row into the item shape AddItemTab / handleAddItem use,
   so bulk-added parts are identical to hand-added ones. */
export function rowToNewItem(row, categories = DEFAULT_CATEGORIES) {
  const catLabel = categories.find((c) => c.key === row.cat)?.label || "";
  const nameParts = [row.brand, row.model].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
  const thisYear = new Date().getFullYear();
  const from = Number(row.yearFrom) || thisYear;
  return {
    cat: row.cat,
    brand: String(row.brand || "").trim(),
    model: String(row.model || "").trim(),
    series: String(row.series || "").trim(),
    yearFrom: from,
    yearTo: Number(row.yearTo) || from,
    condition: row.condition || "Genuine Used",
    side: row.side || "Not Applicable",
    variant: String(row.variant || "").trim(),
    color: "",
    name: `${catLabel}${nameParts ? " - " + nameParts : ""}`.trim(),
    price: Number(row.price) || 0,
    qty: Number(row.qty) || 0,
    min: 3,
    location: "Unassigned",
    notes: row.raw && row.raw !== nameParts ? `From bulk entry: ${row.raw}` : "",
    images: [],
    status: "Active",
  };
}
