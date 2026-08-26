/* ---------------------------------------------------------
   BYPASS SHOP — putting prices on the shelf, a group at a time

   Almost nothing in this shop has a price on it. The parts are on the shelves and
   in the system, and the money lives in somebody's head — so a quotation is typed
   from memory, a receipt is typed from memory, and the public parts list says "ask
   for the price" on nearly every line.

   Fixing that one part at a time is six hundred trips through Edit Parts, which is
   why it has not been done. But a shop does not price parts one at a time; it
   prices them in groups. "Premio headlights are twelve." So this file works out
   what the groups are, and what typing one number into one of them would actually
   change.

   IT IS PURE. Text and numbers in, a plan out. Nothing here reads the database or
   React, so the question "what is about to be overwritten" can be answered by
   reading it, and tested by running it.

   WHAT MAKES A GROUP
   Section, brand, model, condition. Not year, and not side: a shop charges the
   same for a left and a right mirror, and the same for a 2015 and a 2017 Premio
   headlight. Condition IS in the key, because a Brand New headlight and a Genuine
   Used one are different money — leaving it out is how a used part ends up priced
   as new, on a printed quotation, in front of the customer.

   NOTHING IS EVER SET TO ZERO. A blank box means "leave this group alone", and a
   typed 0 means the same thing, deliberately: zero already has a meaning in this
   app — "ask at the counter" — and a fat-fingered 0 must not be the thing that
   wipes a shelf somebody spent an evening pricing.
--------------------------------------------------------- */

/* One group's identity. Upper-cased and trimmed so "Premio" and "premio " are the
   same shelf rather than two rows that each look half-empty. */
export function groupKey(item) {
  const bit = (v) => String(v || "").trim().toUpperCase();
  return [bit(item?.cat), bit(item?.brand), bit(item?.model), bit(item?.condition)].join("|");
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* The spelling used by most rows in a group. Ties go to the one seen first, which
   is stable because the rows arrive in the order the database returned them. */
function commonest(values = []) {
  const seen = new Map();
  for (const v of values) {
    const t = String(v || "").trim();
    if (!t) continue;
    seen.set(t, (seen.get(t) || 0) + 1);
  }
  let best = "", bestN = 0;
  for (const [t, n] of seen) if (n > bestN) { best = t; bestN = n; }
  return best;
}

/* A price somebody typed, turned into either a real price or nothing.
   Commas and spaces are stripped because "12,000" and "12 000" are how the number
   is written down. Anything that is not a positive number comes back as 0, which
   every caller here reads as "leave it". */
export function readPrice(v) {
  if (v === null || v === undefined) return 0;
  const raw = String(v).trim();
  /* Checked BEFORE the strip, not after. Stripping first turned "-5" into "5" and
     sailed past the "must be positive" test below — a typed minus would have set a
     price instead of being refused. */
  if (raw.startsWith("-")) return 0;
  /* Commas and spaces come out, and then what is left has to be nothing but digits.
     A loose strip accepted "1e5" and quietly priced the shelf at 15 — a wrong price
     from a typo is worse than no price, because no price gets asked at the counter
     and a wrong one gets charged. Anything not a plain number is refused, and the
     screen marks the box rather than pretending it read it. */
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

/* Something was typed, and it is not a price. Used to mark the box: a refusal that
   looks identical to an empty box is a price somebody believes they have set. */
export function badPrice(v) {
  const raw = String(v ?? "").trim();
  return raw.length > 0 && readPrice(raw) === 0;
}

/* The years the group spans, said the way a shop says it: one year if they are all
   the same, a range if not, nothing if none are recorded. */
export function yearSpan(items = []) {
  const years = items
    .flatMap((i) => [num(i.yearFrom), num(i.yearTo)])
    .filter((y) => y > 1900);
  if (!years.length) return "";
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/* What the group is worth today: how many have a price, how many do not, and the
   spread of the ones that do. The spread is the whole reason this is shown before
   an input box — a group already priced between 9,000 and 12,000 is a group where
   one number for all of them is probably wrong, and the person typing should see
   that before they type. */
export function priceSpread(items = []) {
  const priced = items.map((i) => num(i.price)).filter((p) => p > 0);
  return {
    count: items.length,
    priced: priced.length,
    blank: items.length - priced.length,
    min: priced.length ? Math.min(...priced) : 0,
    max: priced.length ? Math.max(...priced) : 0,
  };
}

/* Every group on the shelf, with the work-to-do first.
   Sold-out and retired parts are included on purpose: a part with no stock still
   needs a price before the next one arrives, and a shop that only prices what is
   in front of it prices the same shelf again every month. */
export function priceGroups(items = [], categories = []) {
  const label = new Map((categories || []).map((c) => [c.key, c.label]));
  const by = new Map();

  for (const it of items || []) {
    if (!it || !it.code) continue;
    const k = groupKey(it);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(it);
  }

  const groups = [...by.entries()].map(([key, rows]) => {
    const first = rows[0];
    const section = label.get(first.cat) || first.cat || "Other";
    /* The spelling MOST of the group uses, not the first row's. One part typed
       "premio" in lower case would otherwise rename the whole shelf on screen, and
       a shelf that looks misspelled reads as a different shelf. */
    const what = [commonest(rows.map((r) => r.brand)), commonest(rows.map((r) => r.model))]
      .filter(Boolean).join(" ").trim();
    return {
      key,
      cat: first.cat || "",
      section,
      /* The line a person reads. Deliberately not the part code: nobody prices by
         code, and a group of eight codes needs one name. */
      label: what ? `${section} · ${what}` : section,
      condition: first.condition || "",
      years: yearSpan(rows),
      items: rows,
      codes: rows.map((r) => r.code),
      ...priceSpread(rows),
    };
  });

  /* Most unpriced first. This screen exists because of the blanks, so the blanks
     are what it opens on — an alphabetical list would put the finished work at the
     top and the job at the bottom. */
  return groups.sort(
    (a, b) => b.blank - a.blank || a.section.localeCompare(b.section) || a.label.localeCompare(b.label)
  );
}

/* Groups matching what somebody typed in the search box. Word by word against the
   whole line, so "headlight premio" finds it in either order. */
export function findGroups(groups = [], query = "") {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  return groups.filter((g) => {
    const hay = `${g.label} ${g.condition} ${g.years} ${g.cat}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/* ---------------------------------------------------------
   THE PLAN

   Turns "these boxes have these numbers in them" into the exact list of parts that
   would change, and from what to what. Nothing is written from here — the screen
   shows this back first, because a price nobody meant to change is not something
   you find out about until a customer is quoted from it.

   `onlyBlank` is the safety catch and defaults to on at the call site: with it on,
   a group of eight where three are already priced only touches the five blanks. It
   has to be possible to turn off — repricing a whole model is a real thing a shop
   does — but it must be a decision rather than the default.
--------------------------------------------------------- */
export function planPrices({ groups = [], typed = {}, onlyBlank = true } = {}) {
  const changes = [];
  const touched = [];
  let skippedPriced = 0;

  for (const g of groups) {
    const price = readPrice(typed[g.key]);
    if (!price) continue;

    let inGroup = 0;
    for (const it of g.items) {
      const was = num(it.price);
      if (onlyBlank && was > 0) { skippedPriced++; continue; }
      if (was === price) continue;          // already says that; not a change
      changes.push({
        code: it.code,
        name: it.name || "",
        group: g.label,
        from: was,
        to: price,
      });
      inGroup++;
    }
    if (inGroup) touched.push({ label: g.label, count: inGroup, price });
  }

  return {
    changes,
    /* Per-group, for the sentence shown before saving: "Headlights · Toyota Premio
       — 5 parts at 12,000". A total on its own does not let anybody check it. */
    groups: touched,
    count: changes.length,
    /* Said out loud rather than swallowed: with the catch on, this is how many parts
       were left as they were because somebody had already priced them. Silence here
       reads as "it did everything you asked". */
    skippedPriced,
  };
}

/* How much of the shelf still has no price. The headline on the screen, and the
   only number that says whether any of this is working. */
export function priceProgress(items = []) {
  const real = (items || []).filter((i) => i && i.code);
  const priced = real.filter((i) => num(i.price) > 0).length;
  return { total: real.length, priced, blank: real.length - priced };
}
