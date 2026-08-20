/* ---------------------------------------------------------
   BYPASS SHOP — the shop window

   What a customer sees before they have searched for anything: a strip of
   pictures, then the sections to choose from. Kept pure and out of the screen so
   the choosing can be tested, because the choosing is the whole difference
   between a shop window and a list.

   THE THING THIS FILE IS HONEST ABOUT
   A shop window is only as good as the photographs in it, and on the day this
   was written 2 of the 604 parts in stock had a photo. Two problems follow, and
   they are answered differently:

   The window itself is answered with posters — one photograph per section, of
   the kind of part that section holds, captioned with the section's name and how
   many different parts it holds. See PROMOS below.

   The individual part is not, and must not be. A part with a photo is shown as a
   photograph; a part without one is shown as a bold panel in its section's colour
   with the part named on it. Never a stock picture standing in for a part
   somebody is about to buy, and never a broken image or an empty grey box. Every
   photo added to a part in Edit Parts turns up here by itself, and beats the
   poster wherever both could show.
--------------------------------------------------------- */

/* ---- THE ADVERTISEMENTS ----

   One poster per section, in `public/ads/`. Public-domain photographs of the kind
   of part the section holds — credited in public/ads/CREDITS.md — cropped to 5:3
   and kept under 60 kB each, because this page is opened on a phone on mobile
   data and a slow shop window is a closed shop window.

   This shop sells parts off Japanese cars, so the posters are parts off Japanese
   cars wherever a free-to-use photograph of one exists — a Nissan tail light, a
   Toyota headlamp, a Toyota grille. Three do not exist and are close-ups with no
   badge in them instead; CREDITS.md says which, and where they were looked for.

   They are pictures of similar parts, not of this shop's own stock, and they are
   never captioned as anything but the section: "Taillights — 159 different ones"
   is true, and no poster claims to be a photograph of the part a customer is
   buying. A photograph added to a part in Edit Parts beats every one of these,
   and takes priority over them wherever both could show.

   AND NO POSTER, OR ANY CARD HERE, CARRIES A QUANTITY
   Every count in this file is a count of DIFFERENT PARTS — a variety, the number
   of things there are to choose from. How many of any one of them sit on the
   shelf is the shop's business, is not in the public catalogue at all, and could
   not be counted here if somebody wanted to. Everything a customer can see is in
   stock, because the view only carries what is; that is all they are told.

   To add one: drop the file in public/ads/ and add a line here.

     { image: "/ads/bumpers.jpg",
       headline: "Front bumpers in",      // optional: the section's name is used
       sub: "Premio, Wish, Fielder",      // optional: "N different ones" is used
       cat: "FBM" }                       // tapping it opens that section
                                          // or: query: "premio bumper" to search

   A poster whose section has nothing on the shelf is dropped rather than shown —
   an advert for an empty shelf is a lie and a dead end for whoever taps it. */
export const PROMOS = [
  { image: "/ads/taillights.jpg", cat: "TLL" },
  { image: "/ads/doors.jpg", cat: "DOR" },
  { image: "/ads/headlights.jpg", cat: "HDL" },
  { image: "/ads/mirrors-plain.jpg", cat: "SMN" },
  { image: "/ads/mirrors-indicator.jpg", cat: "SMI" },
  { image: "/ads/grilles.jpg", cat: "GRL" },
];

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

   Posters first — they are the only cards here with a photograph on them for
   certain, and a window opens with its best. Then parts,
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
    /* How many different parts the section it points at actually has today. A
       poster is only allowed to appear if there is something behind it, and its
       caption is that count rather than a number somebody typed here months ago.
       A count of parts, never of pieces — see the note above. */
    const held = p.cat ? (items || []).filter((it) => it && it.cat === p.cat).length : 0;
    if (p.cat && held === 0) continue;
    const sec = sectionOf(p.cat);
    cards.push({
      kind: "promo",
      image: p.image,
      headline: p.headline || sec?.label || "",
      sub: p.sub || (held ? `${held} ${held === 1 ? "to choose from" : "different ones"}` : ""),
      color: p.color || sec?.color || "#1B2430",
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

   Only sections with something in them, and a count of the different parts in
   each — twelve doors means twelve doors to choose between, all of them in stock.
   Not how many of each: that is not in the data this page is given.
   `photo` is borrowed from the first part in the section that has one,
   so a section illustrates itself when it can — and failing that, from the
   section's poster, so the front page is pictures rather than a grid of coloured
   boxes. A real part's photograph always wins: it is this shop's actual stock. */
export function sectionCards(items = [], sections = [], { promos = PROMOS } = {}) {
  const posterFor = (key) => (promos || []).find((p) => p && p.image && p.cat === key)?.image || "";
  const map = new Map();
  for (const it of items || []) {
    if (!it || !it.code) continue;
    if (!map.has(it.cat)) map.set(it.cat, { key: it.cat, count: 0, priced: 0, photo: "" });
    const g = map.get(it.cat);
    g.count += 1;
    if (n(it.price) > 0) g.priced += 1;
    if (!g.photo && hasPhoto(it)) g.photo = it.photo;
  }
  return [...map.values()]
    .map((g) => {
      const s = sections.find((x) => x.key === g.key);
      return {
        ...g,
        photo: g.photo || posterFor(g.key),
        label: s?.label || g.key,
        color: s?.color || "#6B7480",
      };
    })
    /* Biggest first. Whatever the shop has most of is what it is known for, and
       it should not be below the fold. */
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* The one line of figures on the front page. Said plainly because it is the
   thing a customer is deciding on: is it worth ringing these people. How many
   different parts, and how many sections they fall into — no pieces. */
export function catalogueCounts(items = []) {
  let parts = 0, priced = 0, photos = 0;
  for (const it of items || []) {
    if (!it || !it.code) continue;
    parts += 1;
    if (n(it.price) > 0) priced += 1;
    if (hasPhoto(it)) photos += 1;
  }
  return { parts, priced, photos, sections: new Set((items || []).map((i) => i?.cat).filter(Boolean)).size };
}
