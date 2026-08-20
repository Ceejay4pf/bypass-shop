/* ---------------------------------------------------------
   BYPASS SHOP — the shop window

   What a customer sees before they have searched for anything: a strip of
   pictures, then the sections to choose from. Kept pure and out of the screen so
   the choosing can be tested, because the choosing is the whole difference
   between a shop window and a list.

   THE THING THIS FILE IS HONEST ABOUT
   A shop window is only as good as the photographs in it, and on the day this
   was written 2 of the 604 parts in stock had a photo. So the strip never
   pretends: a part with a photo is shown as a photograph, a part without one is
   shown as a bold panel in its section's colour with the part named on it, and
   nothing is ever a broken image or an empty grey box. Every photo added to a
   part in Edit Parts turns up here by itself.
--------------------------------------------------------- */

/* ---- REAL ADVERTISEMENTS ----

   Posters the shop has made itself — a promotion, a new arrival, a photograph of
   the counter. Drop the image files in `public/ads/` and add a line here:

     { image: "/ads/bumpers.jpg",
       headline: "Front bumpers in stock",
       sub: "Premio, Wish, Fielder — genuine used",
       cat: "FBM" }          // tapping it opens that section
                             // or: query: "premio bumper" to open a search

   Empty by default, and empty is fine: the strip then builds itself out of the
   parts on the shelf. Nothing here is fetched from anywhere, so an advert costs
   the customer nothing but the picture itself — keep them small. */
export const PROMOS = [];

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hasPhoto = (it) => Boolean(it && it.photo);

/* One card for the strip, out of a part. `kind` tells the screen whether it has a
   photograph to show or a panel to paint. */
function showcaseCard(item, section) {
  return {
    kind: hasPhoto(item) ? "photo" : "panel",
    code: item.code,
    image: item.photo || "",
    headline: item.name || item.code,
    sub: [section?.label, item.condition].filter(Boolean).join(" · "),
    color: section?.color || "#2563EB",
    cat: item.cat,
    price: n(item.price),
  };
}

/* The strip, in the order it is shown.

   Real posters first — somebody went to the trouble of making them. Then parts,
   photographed ones before unphotographed ones, and never two from the same
   section in a row until every section has had a turn: a window showing four
   bumpers tells a customer this is a bumper shop, and it isn't.

   Deterministic on purpose. A window that reshuffles on every reload means a
   customer can't go back to the thing they just saw. */
export function pickShowcase(items = [], sections = [], { max = 8, promos = PROMOS } = {}) {
  const cards = [];
  const sectionOf = (key) => sections.find((s) => s.key === key);

  for (const p of promos || []) {
    if (!p || !p.image) continue;
    cards.push({
      kind: "promo",
      image: p.image,
      headline: p.headline || "",
      sub: p.sub || "",
      color: p.color || "#1B2430",
      cat: p.cat || "",
      query: p.query || "",
    });
  }

  /* Parts grouped by section, each group in the order the catalogue gave them
     but with the photographed ones brought to the front. */
  const bySection = new Map();
  for (const it of items || []) {
    if (!it || !it.code) continue;
    if (!bySection.has(it.cat)) bySection.set(it.cat, []);
    bySection.get(it.cat).push(it);
  }
  for (const list of bySection.values()) {
    list.sort((a, b) => (hasPhoto(b) ? 1 : 0) - (hasPhoto(a) ? 1 : 0));
  }

  /* Biggest sections first, then one part from each in turn. */
  const order = [...bySection.entries()].sort((a, b) => b[1].length - a[1].length);
  let round = 0;
  while (cards.length < max) {
    let added = 0;
    for (const [key, list] of order) {
      if (cards.length >= max) break;
      const it = list[round];
      if (!it) continue;
      cards.push(showcaseCard(it, sectionOf(key)));
      added += 1;
    }
    if (!added) break;      // every section exhausted
    round += 1;
  }
  return cards.slice(0, max);
}

/* The sections to choose from — the front page of the catalogue.

   Only sections with something in them. A count of parts AND of pieces, because
   "Doors · 12 parts" and "Doors · 12 parts, 30 on the shelf" are different
   promises. `photo` is borrowed from the first part in the section that has one,
   so a section illustrates itself when it can. */
export function sectionCards(items = [], sections = []) {
  const map = new Map();
  for (const it of items || []) {
    if (!it || !it.code) continue;
    if (!map.has(it.cat)) map.set(it.cat, { key: it.cat, count: 0, pieces: 0, priced: 0, photo: "" });
    const g = map.get(it.cat);
    g.count += 1;
    g.pieces += Math.max(n(it.qty), 0);
    if (n(it.price) > 0) g.priced += 1;
    if (!g.photo && hasPhoto(it)) g.photo = it.photo;
  }
  return [...map.values()]
    .map((g) => {
      const s = sections.find((x) => x.key === g.key);
      return { ...g, label: s?.label || g.key, color: s?.color || "#6B7480" };
    })
    /* Biggest first. Whatever the shop has most of is what it is known for, and
       it should not be below the fold. */
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* The one line of figures on the front page. Said plainly because it is the
   thing a customer is deciding on: is it worth ringing these people. */
export function catalogueCounts(items = []) {
  let parts = 0, pieces = 0, priced = 0, photos = 0;
  for (const it of items || []) {
    if (!it || !it.code) continue;
    parts += 1;
    pieces += Math.max(n(it.qty), 0);
    if (n(it.price) > 0) priced += 1;
    if (hasPhoto(it)) photos += 1;
  }
  return { parts, pieces, priced, photos, sections: new Set((items || []).map((i) => i?.cat).filter(Boolean)).size };
}
