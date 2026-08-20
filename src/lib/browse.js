/* ---------------------------------------------------------
   BYPASS SHOP — browsing by car

   A customer does not think "I need a front bumper". They think "I need a
   bumper for my Premio". This file turns the shelf into that second question:
   the makes the shop stocks, then the models under a make, then the parts.

   It is the other half of choosing a section, not a replacement for it. Both
   narrow the same list and they combine — Toyota AND doors — because somebody
   who knows they want a Toyota door should not have to scroll past 105 doors
   for every other car.

   WHY THE MODEL NAMES NEED WORK
   The shop writes a model down as it comes off the part or off the invoice, so
   the same car arrives under several names:

     Wingroad · Wingroad Y12                    X-Trail · X-Trail NT30 · NT31 · NT32
     Serena · Serena C25 · Serena (New Shape)   Fit · Fit GD3 · Fit (New Shape)

   Left alone that is four X-Trail buttons on a customer's phone, and whichever
   one they press hides the parts under the other three. So a model is filed
   under the longest known car name it starts with: "X-Trail NT31" is an
   X-Trail. What the shop typed is never changed — this is only how it is
   grouped for someone shopping.

   "Fit Shuttle" is why the longest name has to win: it is a different car from
   a Fit, and matching the shorter name first would fold it in.

   AND WHY SOME OF THEM ARE NOT MODELS AT ALL
   A fair few say "BP5", "AE110", "NZE121", "110", "47" — chassis codes and
   scraps off a label. They mean something to the man at the counter and nothing
   to a customer, so they are gathered into one "Other models" button rather
   than given twenty buttons of their own. Nothing is hidden: the parts are all
   still there, and search reads the model text as typed.

   Pure. No React, no database, so the grouping can be tested on its own.
--------------------------------------------------------- */
import { MODEL_TO_BRAND } from "./parseParts.js";

/* ---- the makes ----
   Display spelling and a colour for each, because the shop's stock has
   "Toyota", "toyota" and "TOYOTA" in it and those are one make, not three.

   The colours are this app's own palette, not the car makers' — a shop window
   is not the place to be repainting somebody's trademark, and a tile that
   looks like an official Toyota tile is a claim the shop has not earned. */
const KNOWN_MAKES = [
  { key: "toyota",     label: "Toyota",     color: "#DC3B2E" },
  { key: "nissan",     label: "Nissan",     color: "#2563EB" },
  { key: "mazda",      label: "Mazda",      color: "#2E86DE" },
  { key: "honda",      label: "Honda",      color: "#15926A" },
  { key: "subaru",     label: "Subaru",     color: "#1B2430" },
  { key: "suzuki",     label: "Suzuki",     color: "#F07A4F" },
  { key: "mitsubishi", label: "Mitsubishi", color: "#D4A72C" },
  { key: "lexus",      label: "Lexus",      color: "#6B7480" },
  { key: "isuzu",      label: "Isuzu",      color: "#B45309" },
  { key: "daihatsu",   label: "Daihatsu",   color: "#E86A6A" },
  { key: "mercedes",   label: "Mercedes",   color: "#5A6472" },
  { key: "volkswagen", label: "Volkswagen", color: "#15618A" },
  { key: "bmw",        label: "BMW",        color: "#0F4C81" },
  { key: "ford",       label: "Ford",       color: "#1D4ED8" },
];
const MAKE_BY_KEY = new Map(KNOWN_MAKES.map((m) => [m.key, m]));

/* Japanese makes, said out loud on the front page because it is what this shop
   is: 596 of its 604 parts are for one of these. A customer with a Premio or a
   Note should be able to tell that at a glance instead of reading the list to
   find out. */
export const JAPANESE = ["toyota", "nissan", "mazda", "honda", "subaru", "suzuki", "mitsubishi", "lexus", "isuzu", "daihatsu"];

const titleCase = (s) => String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const squeeze = (s) => String(s || "").replace(/\s+/g, " ").trim();

/* A make as one thing, whatever case it was typed in. "Unknown" and a blank
   are the same answer — nobody wrote it down — and neither gets a tile. */
export function makeKey(brand) {
  const low = squeeze(brand).toLowerCase();
  if (!low || low === "unknown" || low === "n/a" || low === "-") return "";
  return low;
}

export function makeLabel(brand) {
  const key = makeKey(brand);
  if (!key) return "";
  return MAKE_BY_KEY.get(key)?.label || titleCase(key);
}

export function makeColor(brand) {
  return MAKE_BY_KEY.get(makeKey(brand))?.color || "#6B7480";
}

/* ---- the car names we can group by ----
   Taken from the reader's own model list, which is the list the shop's parts
   were filed with in the first place, plus the cars that turn up in this
   shop's stock and were never in it. One flat set: a name is a car name
   whoever it belongs to, and grouping is always within a make anyway, so a
   Nissan "Bongo" and a Mazda "Bongo" never meet. */
const EXTRA_BASES = [
  /* Toyota, as the shop writes them */
  "Passo", "Passo Sette", "Ractis", "Isis", "Noah", "Voxy", "Rumion", "Prius",
  "Caldina", "Avensis", "Ipsum", "Porte", "Spade", "TownAce", "Regius", "Aqua",
  "Sai", "Opa", "Gaia", "Nadia", "Fun Cargo", "Fan Cargo", "Mark II", "Sienta",
  "Corolla Axio", "Corolla Fielder", "Land Cruiser Prado", "Hiace", "Coaster",
  "Alphard", "Vellfire", "Estima", "Wish", "Belta", "Allion", "Premio", "Axio",
  "Fielder", "Vitz", "Probox", "Succeed", "Harrier", "Crown", "Mark X", "Blade",
  "Auris", "Rush", "Raum", "Duet", "Spacio", "Prado", "Hilux", "RAV4", "Vanguard",
  "Carina", "Verossa", "Kluger", "Funcargo", "Camry", "Corona",
  /* Nissan */
  "Note", "Tiida", "Wingroad", "March", "Juke", "X-Trail", "Teana", "Serena",
  "Dualis", "Sylphy", "Cube", "Latio", "Sunny", "Bluebird", "Skyline", "Murano",
  "Presage", "Cedric", "Fuga", "Elgrand", "Qashqai", "Patrol", "Navara",
  "Caravan", "Vanette", "NV200", "AD Van", "Bongo", "Lafesta",
  /* Mazda */
  "Demio", "Atenza", "Axela", "CX-3", "CX-5", "CX-8", "Biante", "Premacy",
  "Verisa", "Verissa", "Familia", "Carol", "Mazda 2", "Mazda 3", "Mazda 6",
  /* Honda */
  "Fit", "Fit Shuttle", "Airwave", "Insight", "CR-V", "CR-Z", "Crossroad",
  "Stream", "Freed", "Odyssey", "HR-V", "Vezel", "Civic", "Grace", "Jazz",
  "Shuttle", "Partner", "Elysion", "Legend", "Accord", "Mobilio",
  /* Subaru */
  "Legacy", "Impreza", "Exiga", "Forester", "Outback", "XV", "Levorg", "Trezia",
  "WRX", "BRZ", "Sambar", "Justy",
  /* Suzuki */
  "Swift", "Alto", "Escudo", "SX4", "Solio", "Splash", "Wagon R", "Vitara",
  "Jimny", "Ertiga", "Every", "Baleno", "Celerio",
  /* Mitsubishi */
  "Outlander", "Pajero", "RVR", "Delica", "Lancer", "ASX", "Colt", "Canter",
  "L200", "Mirage", "Airtrek", "Galant", "Montero",
  /* the odd European or American one */
  "Golf", "Polo", "Passat", "Tiguan", "Ranger", "Focus", "Fiesta",
];

/* Longest first, so "Fit Shuttle" is judged before "Fit" and "Wingroad Y12"
   before "Wingroad". Without that, a Fit Shuttle files itself as a Fit. */
const BASES = (() => {
  const set = new Set();
  for (const v of Object.values(MODEL_TO_BRAND)) if (v?.model) set.add(squeeze(v.model));
  for (const m of EXTRA_BASES) set.add(m);
  return [...set]
    .filter(Boolean)
    .map((label) => ({ label, low: label.toLowerCase() }))
    .sort((a, b) => b.low.length - a.low.length || a.low.localeCompare(b.low));
})();
const BASE_LOWS = new Set(BASES.map((b) => b.low));

/* ---- codes that are not car names, and the two kinds of them ----

   A CHASSIS CODE IS WORTH A BUTTON. BP5, BR9, GP5, SG9, AE110, NZE121, RD5 —
   half this shop's Subarus are filed under nothing else, and in Kenya a chassis
   code is how a used Subaru is spoken about: somebody asks for a BP5 headlight,
   not a 2005 Legacy headlight. Pooling those out of sight would hide 22 of the
   37 Subarus from the customer who knew exactly what they wanted.

   A SCRAP IS NOT. "110", "47", "12", "FL", "SH", "WI" — a number off a label or
   two letters of something. Those go into one "Other models" button, because
   twenty buttons saying "47" help nobody.

   Only the FIRST word is judged, because the shop writes "BR9 Saloon", "GP5
   Station Left", "AE110 Mchingo" — a code with a note after it, which is still
   that code. So all three BR9 rows land on one BR9 button.

   Judged only after the known car names, so Suzuki's SX4 and Mazda's CX-5 —
   shaped exactly like chassis codes — stay cars, and so does Toyota's IST. */
const CHASSIS_CODE = /^[a-z]{1,4}\d{1,4}[a-z]?$/;   // bp5, ae110, nze121, m14
const SCRAP = /^(?:\d{1,4}|[a-z]{1,3})$/;           // 110, 47, fl, sh, wi, tj
const firstWord = (low) => low.split(/[\s.\-/]+/).filter(Boolean)[0] || "";

/* Which car a written model belongs to.
   `named` is false when nothing recognisable was written — those are gathered
   under one button instead of littering the list with codes. */
export function modelOf(model) {
  const raw = squeeze(model);
  if (!raw) return { key: "", label: "", named: false };
  const low = raw.toLowerCase();
  if (BASE_LOWS.has(low)) {
    const exact = BASES.find((b) => b.low === low);
    return { key: exact.low, label: exact.label, named: true };
  }
  for (const b of BASES) {
    if (low.length <= b.low.length) continue;
    if (!low.startsWith(b.low)) continue;
    /* The next character has to end the name. Otherwise "Notebook" would file
       itself under "Note" and "Fitting" under "Fit". */
    const next = low[b.low.length];
    if (/[a-z0-9]/.test(next)) continue;
    return { key: b.low, label: b.label, named: true };
  }
  const head = firstWord(low);
  if (CHASSIS_CODE.test(head)) return { key: head, label: head.toUpperCase(), named: true };
  if (SCRAP.test(head)) return { key: "", label: raw, named: false };
  /* Something written down that we do not know as a car — a model too new for
     the list, or a scribble. It keeps a button of its own under its first word:
     the shop wrote it for a reason, a customer may well recognise it, and
     grouping on the first word puts "Llagon L MO.100" and "Llagon R 2012"
     together the way two of anything else would be. */
  return { key: head, label: titleCase(head), named: true };
}

/* ---- what the screens ask for ---- */

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hasPhoto = (it) => Boolean(it && it.photo);

/* The makes to choose from, biggest first.

   `count` is how many DIFFERENT parts there are — a variety, not a stock
   level. What the shop holds of any one part is nobody's business but the
   shop's, and it is not in the numbers here or in the data behind them. */
export function makeCards(items = []) {
  const map = new Map();
  for (const it of items || []) {
    if (!it || !it.code) continue;
    const key = makeKey(it.brand);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: makeLabel(it.brand),
        color: makeColor(it.brand),
        count: 0,
        models: new Set(),
        photo: "",
        japanese: JAPANESE.includes(key),
      });
    }
    const g = map.get(key);
    g.count += 1;
    const m = modelOf(it.model);
    if (m.named && m.key) g.models.add(m.key);
    if (!g.photo && hasPhoto(it)) g.photo = it.photo;
  }
  return [...map.values()]
    .map((g) => ({ ...g, models: g.models.size }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* The models under one make, biggest first, with the unnamed ones gathered at
   the end so the list reads as cars rather than as part numbers. */
export const OTHER_MODELS = "__other";

export function modelChips(items = [], make = "") {
  const want = makeKey(make);
  const map = new Map();
  let other = 0;
  for (const it of items || []) {
    if (!it || !it.code) continue;
    if (want && makeKey(it.brand) !== want) continue;
    const m = modelOf(it.model);
    if (!m.named || !m.key) { other += 1; continue; }
    if (!map.has(m.key)) map.set(m.key, { key: m.key, label: m.label, count: 0 });
    map.get(m.key).count += 1;
  }
  const named = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (other > 0) named.push({ key: OTHER_MODELS, label: "Other models", count: other });
  return named;
}

/* ---- the filters the listing screen runs ----
   Written as their own tiny functions so the screen never has to know how a
   model was grouped, and so a customer picking "X-Trail" gets the NT30s, the
   NT31s and the NT32s in one list. */
export const inMake = (item, make) => !makeKey(make) || makeKey(item?.brand) === makeKey(make);

export function inModel(item, model) {
  if (!model) return true;
  const m = modelOf(item?.model);
  if (model === OTHER_MODELS) return !m.named || !m.key;
  return m.key === String(model).toLowerCase();
}

/* One line naming what is being looked at, for the top of a filtered list:
   "Toyota Premio · Front Bumpers". Said in words rather than left to the
   customer to work out from three highlighted buttons. */
export function browseTitle({ make = "", model = "", sectionLabel = "" } = {}) {
  const bits = [];
  const mk = makeLabel(make);
  if (mk) bits.push(mk);
  if (model && model !== OTHER_MODELS) {
    /* The key is a model string in its own right, so the same reader names it:
       "bp5" comes back "BP5" and "x-trail" comes back "X-Trail". */
    bits.push(modelOf(model).label || titleCase(model));
  } else if (model === OTHER_MODELS) {
    bits.push("other models");
  }
  const head = bits.join(" ");
  if (head && sectionLabel) return `${head} · ${sectionLabel}`;
  return head || sectionLabel || "";
}
