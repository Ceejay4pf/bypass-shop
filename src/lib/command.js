/* ---------------------------------------------------------
   BYPASS SHOP — the instruction reader

   A box on the screen where the shop types what it wants done, in its own
   words, instead of somebody having to change the app:

     add a category for boot lights
     new section for mud flaps, shelf H
     put all quantities as one
     set every premio bumper to 2
     all side mirrors are 4500

   This file turns that sentence into an `intent` — a plain description of what
   would happen, listing exactly which parts and what each one changes from and
   to. It does NOT do anything. The screen shows the intent, the person confirms,
   and only then does the caller write to the database.

   That split is the whole design. An instruction reader that acts on its own
   first guess will one day read "set all bumpers to 2" as the wrong bumpers and
   silently rewrite the stock count of forty parts. Showing the list first costs
   one tap and makes that impossible.

   Nothing here touches the database or React. Text and the current stock in,
   a description out — so every reading can be checked by reading it.

   It is deliberately narrow. It understands the two jobs it was asked for
   (sections, and bulk quantity/price) and says plainly when it doesn't
   understand, rather than guessing. A wrong guess that looks confident is worse
   than an honest "I didn't follow that" — the person retypes and moves on.
--------------------------------------------------------- */
import { suggestCategoryKey, suggestShelf, CATEGORY_COLORS, reorderLevel, POSITIONED_CATS } from "../data.js";
import { tidy, CAT_PHRASES, AMBIGUOUS, findPhrase, has, categoryPhrases, BRAND_KEYS, BRAND_ALIASES, MODEL_KEYS, MODEL_TO_BRAND } from "./parseParts.js";

/* Words that mean "everything", so "put all quantities as one" and "put every
   quantity as one" are the same instruction. */
const ALL_WORDS = ["all", "every", "each", "the whole", "everything"];

/* How a number gets named. "as one" and "to 1" mean the same thing, and staff
   write both. Only up to twelve: past that people write digits. */
const NUMBER_WORDS = {
  zero: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  a: 1, "a single": 1, single: 1,
};

/* The words that are giving the order rather than naming a part. Anything in an
   instruction that isn't one of these, and isn't a section, make or model the
   reader knows, is a word it failed to understand — which narrows the selection
   to nothing rather than widening it to the whole shop. Kept deliberately
   generous: a word wrongly listed here is a word silently ignored. */
const INSTRUCTION_WORDS = new Set([
  "put", "set", "make", "change", "update", "mark", "adjust", "leave",
  "please", "kindly", "can", "you", "could", "i", "want", "need", "we", "also", "just",
  "quantity", "quantities", "qty", "qtys", "stock", "count", "counts", "piece", "pieces",
  "price", "prices", "pricing", "cost", "costs", "sell", "selling", "charge", "charges",
  "to", "as", "at", "of", "for", "in", "on", "into", "be", "is", "are", "am", "was", "were",
  "a", "an", "the", "and", "or", "but", "that", "this", "those", "these", "it", "them",
  "shs", "ksh", "kes", "bob", "shillings", "shilling", "money",
  ...Object.keys(NUMBER_WORDS),
]);

/* Read a number, written either way. Returns null when there isn't one, which
   the caller turns into a question rather than a default — guessing a quantity
   is guessing about stock. */
export function readNumber(text) {
  const t = String(text || "").toLowerCase();
  // Digits first, commas and all: "9,500" is one number, not two.
  const digits = t.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (digits) {
    const n = Number(digits[0].replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  for (const [word, n] of Object.entries(NUMBER_WORDS)) if (has(t, word)) return n;
  return null;
}

/* ---------- which parts an instruction is about ---------- */

/* The words in an instruction that name a part, turned into a filter over the
   stock list. "all premio bumpers" is a category AND a model; "everything" is
   no filter at all.

   Returns { codes, describe, terms } — the codes it matched, a phrase for the
   confirmation screen, and what it understood, so the screen can show its
   working. A person who can see WHY 23 parts were picked can spot the one that
   shouldn't be there. */
export function selectParts(text, items = [], categories = []) {
  /* The words that mean "everything" come out before anything is matched,
     because two of them are also vehicles. Suzuki sells a model called the
     Every, and "make every qty one" was being read as "every part that is a
     Suzuki Every" — which matched nothing, so the commonest instruction in the
     box answered "nothing in stock matches Every". */
  let low = tidy(text).toLowerCase();
  for (const w of ALL_WORDS) low = low.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  low = low.replace(/\s{2,}/g, " ").trim();
  const terms = [];

  /* Category, by any name the shop calls it, including sections it added.

     The family words come last and only if nothing more specific hit. Plain
     "bumper" is not a section — it is front OR rear — and the pasted-list
     parser keeps those in AMBIGUOUS so it can ask which. Here there is nobody
     to ask, but "set all bumper quantities to 2" plainly means both, and
     leaving the word unmatched was worse than either: no filter matched, so
     the instruction silently widened to every part in the shop, mirrors and
     headlights included. */
  const familyPhrases = Object.entries(AMBIGUOUS).flatMap(([word, a]) =>
    /* Plural too. The pasted-list parser sees one part at a time and so only
       ever needs the singular; an instruction is about many by definition, and
       "all bumper quantities" is the rarer wording than "all bumpers". */
    [word, `${word}s`].flatMap((w) => a.options.map((key) => ({ key, w, family: true })))
  );
  const catPhrases = [...categoryPhrases(categories), ...CAT_PHRASES]
    .sort((a, b) => b.w.length - a.w.length);
  const cats = new Set();
  for (const { key, w } of catPhrases) {
    if (findPhrase(low, w) === -1) continue;
    if (cats.has(key)) continue;
    cats.add(key);
    const label = categories.find((c) => c.key === key)?.label || key;
    terms.push({ kind: "section", label, word: w });
    /* Only the longest match per instruction. "front bumper" and "bumper" both
       hit, and taking both would widen the selection past what was asked for —
       the phrases are sorted longest-first, so the first one is the specific
       one. Stopping here is the conservative reading, which is the right bias
       when the next step rewrites stock counts. */
    break;
  }
  if (!cats.size) {
    for (const { w, family } of familyPhrases) {
      if (findPhrase(low, w) === -1) continue;
      // Every section in the family, named individually so the screen shows both.
      for (const { key } of familyPhrases.filter((f) => f.w === w)) {
        cats.add(key);
        const label = categories.find((c) => c.key === key)?.label || key;
        terms.push({ kind: "section", label, word: w, family });
      }
      break;
    }
  }

  // Brand and model. "premio" implies Toyota, but the person said Premio, so
  // only the model is filtered on — filtering by brand too would be inventing
  // a condition they didn't state.
  let brand = "";
  let model = "";
  for (const k of MODEL_KEYS) {
    if (findPhrase(low, k) === -1) continue;
    model = MODEL_TO_BRAND[k].model;
    terms.push({ kind: "model", label: model, word: k });
    break;
  }
  if (!model) {
    for (const k of BRAND_KEYS) {
      if (findPhrase(low, k) === -1) continue;
      brand = BRAND_ALIASES[k];
      terms.push({ kind: "make", label: brand, word: k });
      break;
    }
  }

  /* Front or rear, when the section has both. "set all front door prices to
     20000" names half the doors, and without this it named all of them — the
     phrase "front door" matches the Doors section, the word "front" was then
     spent, and every rear door in the shop went with it. That is the same
     silent-widening fault as the unrecognised-word one below, and a confirmation
     screen listing 90 doors can't save you from it either, because a list of
     every door looks exactly like a deliberate every door. */
  let position = "";
  if ([...cats].some((k) => POSITIONED_CATS.includes(k))) {
    /* "front" and "rear" only. "back" is a rear word on a pasted part line, but
       in an instruction it is usually an adverb — "put the door prices back to
       9000" is not about rear doors — and reading it as one would quietly halve
       the list the person meant. */
    for (const [side, word] of [["Front", "front"], ["Rear", "rear"]]) {
      if (findPhrase(low, word) === -1) continue;
      position = side;
      terms.push({ kind: "position", label: `${side} only`, word });
      break;
    }
  }

  const said = { cats: cats.size > 0, model: Boolean(model), brand: Boolean(brand) };

  /* Words left over after everything the reader understood is taken out. If any
     remain, the instruction named something this file doesn't know, and the one
     thing it must not then do is treat that as "no filter given" — that is how
     "set all lamborghini quantities to 2" ends up rewriting the stock count of
     every part in the shop. An unrecognised word narrows to nothing, and the
     caller says which word it was. Widening on a word we failed to read is the
     one mistake in here that can't be undone by reading the confirmation. */
  let rest = low;
  for (const t of terms) rest = rest.replace(new RegExp(`\\b${t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  const unknownWords = rest
    .replace(/\d[\d,.]*/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !INSTRUCTION_WORDS.has(w));

  const everything = !said.cats && !said.model && !said.brand && !unknownWords.length;

  const codes = unknownWords.length && !said.cats && !said.model && !said.brand
    ? []
    : items
    .filter((i) => {
      if (said.cats && !cats.has(i.cat)) return false;
      if (model && String(i.model || "").toLowerCase() !== model.toLowerCase()) return false;
      if (brand && String(i.brand || "").toLowerCase() !== brand.toLowerCase()) return false;
      /* A door whose side still says only "Left" is not counted as front OR
         rear. It hasn't said, so an instruction about front doors is not about
         it — the honest reading is to leave it alone rather than assume. */
      if (position && !String(i.side || "").startsWith(position)) return false;
      return true;
    })
    .map((i) => i.code);

  const describe = everything
    ? "every part in the shop"
    : terms.length
    ? terms.map((t) => t.label).join(" · ")
    : `“${unknownWords.join(" ")}”`;

  return { codes, describe, terms, everything, unknownWords };
}

/* ---------- reading the instruction ---------- */

/* Adding or renaming a section.
   "add a category for boot lights" / "new section called mud flaps shelf H" */
function readSection(low, raw, categories) {
  const isNew = /\b(add|create|make|new)\b/.test(low) &&
    /\b(category|categories|section|sections)\b/.test(low);
  /* Renaming doesn't need the word "section" in it. Nobody says "rename the
     section Mud Flaps to Mud Guards" — they say "rename Mud Flaps to Mud
     Guards", and requiring the word meant the natural wording fell through to
     "I didn't follow that". The old name still has to match a section that
     exists, so this can't run away with an instruction about something else. */
  const isRename = /\b(rename|change the name)\b/.test(low) ||
    (/\bcall\b/.test(low) && /\b(category|section)\b/.test(low));

  if (isRename) {
    /* "rename headlight computers to ballasts" — the old name has to match a
       section that exists, or there is nothing to rename. */
    const m = raw.match(/\b(?:rename|call)\s+(?:the\s+)?(?:category|section)?\s*["“]?(.+?)["”]?\s+(?:to|as)\s+["“]?(.+?)["”]?\s*$/i)
      || raw.match(/\brename\s+["“]?(.+?)["”]?\s+(?:to|as)\s+["“]?(.+?)["”]?\s*$/i);
    if (!m) return null;
    const from = m[1].replace(/\b(the|category|section)\b/gi, "").trim();
    const to = m[2].trim();
    const target = categories.find(
      (c) => c.label.toLowerCase() === from.toLowerCase() ||
             c.key.toLowerCase() === from.toLowerCase()
    );
    if (!target) {
      return {
        kind: "unknown",
        why: `There's no section called “${from}”. Check Settings → Categories for the exact name.`,
      };
    }
    if (!to) return null;
    /* A built-in section can be renamed on screen too, and the same rule holds:
       the 3-letter code never changes, because it is already printed inside the
       code of every part filed under it. */
    return {
      kind: "renameSection",
      key: target.key,
      from: target.label,
      to,
      lines: [
        `Rename “${target.label}” to “${to}”`,
        `Its code stays ${target.key} — it's already inside the code of every part filed there`,
      ],
      confirm: `Rename to “${to}”`,
    };
  }

  if (!isNew) return null;

  /* Strip the words that are giving the order, whatever order they come in, and
     whatever is left is the name. "put new category of spare parts for wiper
     blades" leaves "wiper blades".

     Done by removal rather than by matching after "for" or "of", because those
     little words appear more than once in a real sentence — taking the text
     after the FIRST one turned that instruction into a section called "Spare
     Parts For Wiper Blades". */
  let label = raw
    .replace(/\b(please|kindly|can you|could you|i want|i need|we need|also)\b/gi, " ")
    .replace(/\b(add|create|make|put|new|open|start)\b/gi, " ")
    .replace(/\b(category|categories|section|sections)\b/gi, " ")
    .replace(/\bspare parts?\b/gi, " ")
    .replace(/\b(for|called|named|of|to|in|as)\b/gi, " ")
    .replace(/\b(a|an|the|another|other|any)\b/gi, " ")
    .replace(/[:"“”]/g, " ")
    .trim();

  /* A shelf written into the instruction — "shelf H", "on shelf D-03". Taken
     out of the name, or the section would be called "Mud Flaps Shelf H". */
  let shelf = "";
  const sm = label.match(/[,;]?\s*\b(?:on\s+)?shelf\s+([A-Za-z](?:-?\d{1,2})?)\b/i);
  if (sm) {
    shelf = sm[1].toUpperCase();
    if (!shelf.includes("-")) shelf = `${shelf}-01`;
    label = label.replace(sm[0], " ").trim();
  }

  label = label.replace(/\s{2,}/g, " ").replace(/^[,;:\-–\s]+|[,;:\-–.\s]+$/g, "").trim();
  // Present it the way a section is written in the list: Boot Lights.
  label = label.replace(/\b[a-z]/g, (c) => c.toUpperCase());

  if (!label || label.length < 3) {
    return {
      kind: "unknown",
      why: "I couldn't tell what the section should be called. Try: add a category for boot lights",
    };
  }

  /* Compared with the spaces and punctuation taken out, because "bootlights",
     "boot lights" and "Boot-Lights" are one section, and a shop that ends up
     with two of them has split the same shelf across two code prefixes — which
     no amount of renaming afterwards puts back together. Singular and plural
     too: nobody means a second section by saying "boot light". */
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");
  const clash = categories.find((c) => norm(c.label) === norm(label));
  if (clash) {
    return {
      kind: "unknown",
      why: `There's already a section called “${clash.label}” (code ${clash.key}), so there's nothing to add — parts filed there are coded ${clash.key}-…`,
    };
  }
  /* Also check the words the reader already knows a part by. "add a category for
     headlamps" is asking for Headlights, which exists under another name. */
  const known = CAT_PHRASES.find((p) => norm(p.w) === norm(label));
  const knownCat = known && categories.find((c) => c.key === known.key);
  if (knownCat) {
    return {
      kind: "unknown",
      why: `Those already go under “${knownCat.label}” (code ${knownCat.key}) — the app knows “${label}” as that section, so nothing needs adding.`,
    };
  }

  const taken = categories.map((c) => c.key);
  const key = suggestCategoryKey(label, taken);
  if (!key) {
    return {
      kind: "unknown",
      why: `I couldn't find a free 3-letter code for “${label}”. Add it in Settings → Categories and choose one.`,
    };
  }

  return {
    kind: "addSection",
    label,
    key,
    shelf: shelf || suggestShelf(categories),
    color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
    lines: [
      `Create the section “${label}”`,
      `Code ${key} — every part filed here will be coded ${key}-…, and that can never be changed afterwards`,
      `Shelf ${shelf || suggestShelf(categories)}`,
    ],
    confirm: `Create “${label}”`,
    /* Stated because it is the one thing that stops this working, and the
       error the database gives back on its own is unreadable. */
    needsMigration: true,
  };
}

/* Setting quantities or prices across many parts at once.
   "put all quantities as one" / "set every premio bumper to 2" /
   "all side mirrors are 4500" */
function readBulk(low, raw, items, categories) {
  /* No closing \b on the stems. "quantit" is a partial word by design — it has
     to answer to both "quantity" and "quantities" — and \b after it can never
     match, because the next character is a letter. That silently made the
     commonest instruction of the lot ("put all quantities as one") unreadable. */
  const wantsQty = /\b(quantit|qty|qtys|stock count|count|counts|piece|pieces|in stock)/.test(low);
  const wantsPrice = /\b(price|pricing|cost|sell(?:ing)? (?:price|for)|charge)/.test(low);
  const isSet = /\b(put|set|make|change|update|mark|adjust|are|is|to be)\b/.test(low);
  if (!isSet || (!wantsQty && !wantsPrice)) return null;
  if (wantsQty && wantsPrice) {
    return {
      kind: "unknown",
      why: "That asks about quantity and price at once. Do them one at a time so you can check each list.",
    };
  }

  const field = wantsQty ? "qty" : "price";
  const value = readNumber(low.replace(/\bshelf\s+[a-z]-?\d*/gi, " "));
  if (value === null) {
    return {
      kind: "unknown",
      why: `I couldn't see the number. Try: put all quantities as one, or set all bumper prices to 9000`,
    };
  }
  if (value < 0) {
    return { kind: "unknown", why: "That's a negative number, which can't be a quantity or a price." };
  }
  if (field === "qty" && !Number.isInteger(value)) {
    return { kind: "unknown", why: `A quantity has to be a whole number of pieces, not ${value}.` };
  }
  if (field === "qty" && value === 0) {
    /* Refused on purpose. Zero across the board is the one bulk change that
       can't be told apart from a real sell-out afterwards, and the shop's own
       rule is that only a sale or a deduction reaches zero — which is why blank
       quantity saves as 1. Removing stock has its own screen, which asks where
       it went. */
    return {
      kind: "unknown",
      why: "Setting quantities to zero in bulk isn't something this box will do — zero should mean the part genuinely sold out. Use Sell or Remove for the parts that are gone.",
    };
  }

  const { codes, describe, everything, unknownWords } = selectParts(raw, items, categories);
  if (!codes.length) {
    /* Naming the word is the whole point of the message. "Nothing matches" sends
       somebody hunting through the stock list; "I don't know the word
       lamborghini" tells them to check the spelling or the section name. */
    if (unknownWords?.length) {
      return {
        kind: "unknown",
        why: `I don't know “${unknownWords.join(" ")}”, so I can't tell which parts you mean — and I won't change everything on a word I couldn't read. Check the spelling, or use the section name as it appears in Inventory.`,
      };
    }
    return {
      kind: "unknown",
      why: everything
        ? "There's nothing in stock to change."
        : `Nothing in stock matches ${describe}.`,
    };
  }

  const byCode = new Map(items.map((i) => [i.code, i]));
  /* Only the parts that would actually change. A list of 40 parts where 38
     already say 1 reads as a huge change and isn't one — and the confirmation
     is supposed to show what happens, not what was asked. */
  const changes = codes
    .map((code) => {
      const it = byCode.get(code);
      const from = field === "qty" ? Number(it?.qty || 0) : Number(it?.price || 0);
      return { code, name: it?.name || code, from, to: value };
    })
    .filter((c) => c.from !== value);
  const already = codes.length - changes.length;

  if (!changes.length) {
    return {
      kind: "nothingToDo",
      why: `All ${codes.length} part${codes.length !== 1 ? "s" : ""} matching ${describe} already ${
        field === "qty" ? `have ${value} in stock` : `cost KES ${value.toLocaleString()}`
      }. Nothing to change.`,
    };
  }

  const label = field === "qty" ? `${value} in stock` : `KES ${value.toLocaleString()}`;
  const lines = [
    `Set ${field === "qty" ? "the quantity" : "the price"} of ${changes.length} part${
      changes.length !== 1 ? "s" : ""
    } to ${label}`,
    `Chosen by: ${describe}`,
  ];
  if (already) lines.push(`${already} more already ${field === "qty" ? "say" : "cost"} that, so ${already === 1 ? "it is" : "they are"} left alone`);
  if (field === "qty") {
    /* Said out loud because it is the difference between a correction and a
       loss. A quantity typed here is the shelf count, and the ledger records it
       as an adjustment with a reason and your name on it. */
    lines.push("Logged as an adjustment against each part, with your name — the ledger keeps the old figure");
  }

  return {
    kind: "setField",
    field,
    value,
    changes,
    describe,
    lines,
    confirm: `Change ${changes.length} part${changes.length !== 1 ? "s" : ""}`,
    /* Big changes deserve a second look, not a block. The number is the whole
       stock list's worth: it means "you are about to rewrite everything". */
    heavy: changes.length >= 25,
  };
}

/* Things the box is deliberately not doing, answered plainly instead of
   half-attempted. Somebody who types "sell a bumper to Mwangi" should be sent
   to the screen that does it properly, not have a sale half-recorded. */
const NOT_YET = [
  { test: /\b(sell|sold|sale)\b/, say: "Recording a sale needs the customer and the payment, so it's on the Sell Item screen — this box doesn't do sales." },
  { test: /\b(delete|remove|get rid of|throw away)\b/, say: "Removing stock asks where it went, which is on Inventory (tick the parts, then Remove). This box won't delete anything." },
  { test: /\badd\b.*\b(bumper|headlight|mirror|door|bonnet|light|part)\b/, say: "Adding a part needs its vehicle and year, so use Add New Item, or paste a whole list into Add a Whole List." },
  /* There used to be a line here refusing questions outright. Questions are now
     answered — see ask.js, which is tried before this file — so anything that
     reaches here is an order, and saying "this box doesn't answer questions"
     would be untrue. */
];

/* ---------- the one entry point ---------- */

/* Read an instruction. Returns an intent describing what WOULD happen — never
   does it. `kind` is one of:
     addSection | renameSection | setField   — something to confirm
     nothingToDo                             — understood, but changes nothing
     unknown                                 — not understood, with a reason
     empty                                   — nothing typed */
export function readCommand(text, { items = [], categories = [] } = {}) {
  const raw = tidy(text);
  if (!raw) return { kind: "empty" };
  const low = raw.toLowerCase();

  const section = readSection(low, raw, categories);
  if (section) return { ...section, raw };

  const bulk = readBulk(low, raw, items, categories);
  if (bulk) return { ...bulk, raw };

  for (const { test, say } of NOT_YET) {
    if (test.test(low)) return { kind: "unknown", why: say, raw };
  }

  return {
    kind: "unknown",
    /* The list has to be a real list of what it does, in the order somebody is
       likely to want it, because this sentence is the only teaching the box gets
       once the examples have been typed over. Asking how the app works is last
       and named plainly — it is the thing nobody guesses is possible. */
    why: "I didn't follow that. I can answer questions about sales and stock, open the screen that makes a report, statement or receipt, change things — add or rename a section, set quantities or prices across many parts — and explain how any part of this app works. Try \"how do i record a sale\" or \"what is a part code made of\".",
    raw,
  };
}

/* What the box can do, in the shop's own words. Shown under the field as
   tappable examples: a box with no examples gets typed into once, misunderstood
   once, and never used again. */
export const EXAMPLES = [
  "add a category for boot lights",
  "new section for mud flaps, shelf H",
  "put all quantities as one",
  "set all bumper quantities to 2",
  "all side mirror prices are 4500",
];

/* Kept for the confirmation screen: a part's reorder level shouldn't silently
   change when its quantity does. Re-exported so the screen doesn't have to
   import from two places to explain one change. */
export { reorderLevel };
