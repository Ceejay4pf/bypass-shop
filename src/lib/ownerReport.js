/* ---------------------------------------------------------
   ASKING ABOUT MANY PARTS AT ONCE, AND GETTING A REPORT

   askStock.js answers "is there a premio bumper" — one part, where is it. This
   answers the other four questions the owner asked for, which are all about groups:

     "which parts are available in this shop that this shop doesn't have"   missing
     "what parts are plenty"                                               plenty
     "what parts of a certain car model are available generally in all
      shops or a specific branch"                                          model
     and the mirror of the first one, what only one shop has                only

   IT READS THE QUESTION AND THEN SAYS WHAT IT UNDERSTOOD. That second half matters
   more than the first. No amount of pattern-matching gets typed English right every
   time, so the screen shows its reading of the question — which of the four, which
   shop, which words — as something tappable. A misread costs one tap instead of
   leaving somebody typing the same question five ways.

   IT DOES NO READING OF ITS OWN. Everything comes out of the one list of part kinds
   already fetched for the comparison screen — a thousand rows, not a hundred thousand
   — so a report is arithmetic on data that is already in the phone. That is why these
   answer instantly and why they cost nothing to ask again, and it is the reason this
   file is pure: no database, no network, no React, and every answer in it can be
   checked against a made-up shelf.
--------------------------------------------------------- */

import { askWords } from "./askStock.js";

const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/* Words in a shop's name that name no shop in particular. "Auto Spares" is in three
   of the four, so it can identify none of them, and leaving it in would mean the word
   "spares" in a question picked a shop at random. */
const GENERIC = new Set([
  "bypass", "shop", "shops", "branch", "branches", "auto", "autos", "spare",
  "spares", "autoparts", "autospares", "part", "parts", "ltd", "limited", "co",
  "company", "the", "and",
]);

/* What to type to mean this shop. The slug's first word — jaspare, surefit, jeyden,
   quickjet — plus whatever in its name is its own. Deliberately generous: "sure fit",
   "surefit" and "Sure Fit Auto Spares Ltd" all have to work, because they are all
   what somebody will type. */
export function shopTokens(shop) {
  const out = new Set();
  const key = squash(String(shop?.slug || "").split("-")[0]);
  if (key) out.add(key);
  for (const w of String(shop?.name || "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (w && !GENERIC.has(w)) out.add(w);
  }
  return out;
}

/* Which shops the question names, and where in it. Matched against the question with
   its spaces taken out, so "quick jet" and "quickjet" are the same word — which they
   are, to everybody except a computer. */
function namedShops(text, shops) {
  const flat = squash(text);
  const found = [];
  for (const s of shops || []) {
    const key = squash(String(s.slug || "").split("-")[0]);
    if (!key) continue;
    const at = flat.indexOf(key);
    if (at >= 0) found.push({ slug: s.slug, name: s.name, at });
  }
  return found.sort((a, b) => a.at - b.at);
}

/* Somebody has not got something. Every way of saying it that turns up in practice,
   including the ones with the apostrophe left out. */
/* "need" is deliberately absent, and it was in here once. "I need a premio bumper" is
   somebody asking for one part, not asking what the shop is short of — and it turned
   every ordinary request into a nine-hundred-line report. */
const NEG = /\b(does ?n[o']?t|do ?n[o']?t|dont|doesnt|has ?n[o']?t|have ?n[o']?t|no|not)\s+(have|stock|carry|got|there|available)\b|\bmissing\b|\black(?:s|ing)?\b|\bwithout\b|\bnone\b|\babsent\b|\bshort of\b/;
const ONLY = /\bonly\b|\bunique\b|\bnobody else\b|\bno one else\b|\bexclusive\b|\balone\b/;
/* "many" is deliberately absent. "How many premio bumpers are left" is a question
   about one part and must not turn into a list of the fullest shelves in the
   business — which is what it did, before this comment was the reason it does not. */
const PLENTY = /\bplenty\b|\bmost\b|\bhighest\b|\bover ?stock\w*\b|\btoo many\b|\bbiggest\b|\blargest\b|\bfullest\b|\bexcess\b|\bpiling\b/;
const REPORT = /\bwhat parts\b|\bwhich parts\b|\ball parts\b|\bevery part\b|\breport\b|\beverything\b|\bwhat do (?:i|we|you) have\b|\bbreak ?down\b|\blist (?:of|all|the)\b/;

export const INTENTS = ["find", "missing", "only", "plenty", "model"];

/* Reading the question. Returns what was asked, which shop it is about, and the words
   left over once the shop names and the question words are gone.

   `defaultShop` is the shop to assume when a comparison is asked without naming one —
   "what are we missing" is a real question and the console has no "this shop" of its
   own to be, so the screen supplies one and then says which it used. */
export function readQuestion(text, shops = [], defaultShop = "") {
  const raw = String(text || "").toLowerCase();
  const named = namedShops(raw, shops);
  const flat = squash(raw);

  let intent = "find";
  if (NEG.test(raw)) intent = "missing";
  else if (ONLY.test(raw)) intent = "only";
  else if (PLENTY.test(raw)) intent = "plenty";
  else if (REPORT.test(raw)) intent = "model";

  /* Which shop the question is ABOUT, which is not always the first one named.
     "What does Jeyden have that Quick Jet doesn't" is a question about Quick Jet —
     the shop with the hole in its shelf — and the shop sitting next to the negative
     is the one with the hole. */
  let shop = "";
  let other = "";
  if (intent === "missing") {
    const m = NEG.exec(raw);
    const negAt = m ? squash(raw.slice(0, m.index)).length : flat.length;
    const before = named.filter((s) => s.at < negAt);
    shop = (before.length ? before[before.length - 1] : named[0])?.slug || defaultShop || "";
    other = named.find((s) => s.slug !== shop)?.slug || "";
  } else if (named.length) {
    shop = named[0].slug;
    other = named[1]?.slug || "";
  }
  if ((intent === "missing" || intent === "only") && !shop) shop = defaultShop || "";

  /* The words that are left are the part. Every shop name the question used is taken
     out first: "premio parts at jeyden" is a question about premios, and searching
     for the word "jeyden" inside a part would find nothing at all. */
  const strip = new Set();
  for (const s of named) {
    const full = (shops || []).find((x) => x.slug === s.slug);
    for (const t of shopTokens(full || s)) strip.add(t);
  }
  const words = askWords(raw).filter((w) => !strip.has(squash(w)));

  return { intent, shop, other, words, named: named.map((s) => s.slug) };
}

/* ---------------------------------------------------------
   THE ARITHMETIC
--------------------------------------------------------- */

const qtyAt = (k, slug) => Number(k?.shops?.[slug]?.qty || 0);
const holders = (k) => Object.keys(k.shops || {}).filter((s) => qtyAt(k, s) > 0);

export function kindLabel(k) {
  return (
    [k.section, k.brand, k.model, k.side, k.variant]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(" ") || k.exampleName || k.cat || "?"
  );
}

const matchesWords = (k, words) => {
  if (!words.length) return true;
  const hay = `${kindLabel(k)} ${k.exampleName || ""} ${k.cat || ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
};

const nameOf = (shops, slug) =>
  (shops || []).find((s) => s.slug === slug)?.name || slug || "";

const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/* Grouped by section, biggest first, because a report of nine hundred lines is not a
   report. The sections are what somebody scans; the rows are what they read once they
   have found the section. */
function group(rows, focus) {
  const by = new Map();
  for (const k of rows) {
    const label = k.section || k.cat || "?";
    if (!by.has(label)) by.set(label, { key: label, label, rows: [], total: 0, units: 0 });
    const g = by.get(label);
    g.rows.push(k);
    g.total += 1;
    g.units += focus ? qtyAt(k, focus) : Number(k.totalQty || 0);
  }
  const out = [...by.values()];
  for (const g of out) {
    g.rows.sort(
      (a, b) =>
        (focus ? qtyAt(b, focus) - qtyAt(a, focus) : 0) ||
        Number(b.totalQty || 0) - Number(a.totalQty || 0) ||
        kindLabel(a).localeCompare(kindLabel(b))
    );
  }
  return out.sort((a, b) => b.units - a.units || b.total - a.total || a.label.localeCompare(b.label));
}

/* ---------------------------------------------------------
   THE REPORT

   One shape for all four questions, so the screen that draws it does not care which
   was asked: a sentence, a heading, and sections of rows. `units` on every row is
   counted the way the question means it — a report about one shop counts that shop's
   stock, and a report about all of them counts all of it.
--------------------------------------------------------- */
export function buildReport(read, kinds = [], shops = []) {
  const { intent, shop, other, words } = read;
  const focusName = nameOf(shops, shop);
  const otherName = nameOf(shops, other);
  const live = kinds.filter((k) => holders(k).length > 0);
  const asked = words.length ? `“${words.join(" ")}”` : "";

  let rows = [];
  let title = "";
  let sentence = "";
  let countIn = ""; // whose stock the numbers are

  if (intent === "missing") {
    rows = live.filter((k) => {
      if (!matchesWords(k, words)) return false;
      if (qtyAt(k, shop) > 0) return false;
      const h = holders(k);
      return other ? h.includes(other) : h.length > 0;
    });
    countIn = other || "";
    title = other ? `At ${otherName}, not at ${focusName}` : `Not at ${focusName}`;
    sentence =
      `${focusName} has none of ${plural(rows.length, "kind of part", "kinds of part")} that ` +
      `${other ? otherName : "another shop"} has in stock` +
      `${asked ? `, matching ${asked}` : ""}. This is the list to order, or to move across.`;
  } else if (intent === "only") {
    rows = live.filter((k) => {
      if (!matchesWords(k, words)) return false;
      const h = holders(k);
      return h.length === 1 && h[0] === shop;
    });
    countIn = shop;
    title = `Only at ${focusName}`;
    sentence =
      `${focusName} alone has ${plural(rows.length, "kind of part", "kinds of part")} in stock` +
      `${asked ? ` matching ${asked}` : ""}. No other shop can sell these, so every enquiry ` +
      `for them anywhere belongs here.`;
  } else if (intent === "plenty") {
    rows = live.filter((k) => matchesWords(k, words) && (shop ? qtyAt(k, shop) > 0 : true));
    rows.sort((a, b) =>
      shop ? qtyAt(b, shop) - qtyAt(a, shop) : Number(b.totalQty || 0) - Number(a.totalQty || 0)
    );
    rows = rows.slice(0, 60);
    countIn = shop;
    title = shop ? `Most of it at ${focusName}` : "Most of it, everywhere";
    const top = rows[0];
    sentence =
      `The ${rows.length} kinds of part there are most of${shop ? ` at ${focusName}` : " across every shop"}` +
      `${top ? `. The deepest shelf is ${kindLabel(top)} — ${shop ? qtyAt(top, shop) : top.totalQty} of them` : ""}.` +
      ` Worth knowing before ordering more, and worth a push to sell.`;
  } else {
    // "model" — everything for a car, or everything in a section, anywhere or at one shop
    rows = live.filter((k) => matchesWords(k, words) && (shop ? qtyAt(k, shop) > 0 : true));
    countIn = shop;
    title = `${words.length ? words.join(" ") : "Everything"}${shop ? ` at ${focusName}` : ""}`;
    const where = new Set();
    for (const k of rows) for (const s of holders(k)) if (!shop || s === shop) where.add(s);
    const units = rows.reduce((n, k) => n + (shop ? qtyAt(k, shop) : Number(k.totalQty || 0)), 0);
    sentence = rows.length
      ? `${plural(rows.length, "kind of part", "kinds of part")}${asked ? ` for ${asked}` : ""}` +
        `, ${plural(units, "on the shelf", "on the shelves")}` +
        `${shop ? ` at ${focusName}` : `, across ${plural(where.size, "shop", "shops")}`}.`
      : `Nothing${asked ? ` for ${asked}` : ""}${shop ? ` at ${focusName}` : " at any shop"} is in stock.`;
  }

  const units = rows.reduce(
    (n, k) => n + (countIn ? qtyAt(k, countIn) : Number(k.totalQty || 0)),
    0
  );

  return {
    intent,
    shop,
    other,
    words,
    title,
    sentence: rows.length ? sentence : emptySentence(intent, focusName, otherName, asked),
    groups: group(rows, countIn),
    kinds: rows.length,
    units,
    countIn,
  };
}

function emptySentence(intent, focusName, otherName, asked) {
  if (intent === "missing") {
    return `Nothing${asked ? ` matching ${asked}` : ""} — ${focusName} already holds everything ` +
      `${otherName || "the others have"} ${otherName ? "has" : "have"} in stock. Nothing to order across.`;
  }
  if (intent === "only") {
    return `${focusName} has nothing${asked ? ` matching ${asked}` : ""} that another shop cannot also supply.`;
  }
  if (intent === "plenty") {
    return `Nothing is in stock${focusName ? ` at ${focusName}` : ""} at all.`;
  }
  return `Nothing${asked ? ` for ${asked}` : ""} is in stock${focusName ? ` at ${focusName}` : " anywhere"}.`;
}

/* What the screen says it understood, in one line, above the buttons that change it.
   Written here so the wording and the reading can never disagree. */
export function readingOf(read, shops = []) {
  const { intent, shop, other, words } = read;
  const s = nameOf(shops, shop);
  const o = nameOf(shops, other);
  const w = words.length ? `“${words.join(" ")}”` : "anything";
  if (intent === "find") return `Looking for ${w} in every shop.`;
  if (intent === "missing") return `What ${o || "the other shops"} ${o ? "has" : "have"} and ${s} does not — ${w}.`;
  if (intent === "only") return `What only ${s} has — ${w}.`;
  if (intent === "plenty") return `The fullest shelves${shop ? ` at ${s}` : " everywhere"} — ${w}.`;
  return `Everything for ${w}${shop ? ` at ${s}` : " in every shop"}.`;
}
