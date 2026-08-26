/* ---------------------------------------------------------
   SHOP SKIN — which colour the system wears.

   One build serves two businesses, and until recently both wore the same blue. A
   customer who had seen one of the parts lists had seen the other: same masthead,
   same buttons, same rule across the top of the receipt. Two shops that are not the
   same business should not look like one business with two addresses.

   Sure Fit now goes further than a fixed second colour: it can CHOOSE, from seven,
   the way it already chooses light or dark. The reasons that is a setting and not a
   decision made here are the ordinary ones — a shop's colour is the shop's business,
   the owner had to pick one blind, and the cost of changing their mind should be a
   tap rather than a message to me.

   Jaspare is deliberately NOT given the choice. Its colour is the one the business
   has always used and twenty-odd people are working in it today; a control that lets
   any of them repaint the system is a control nobody asked for. One line below adds a
   shop to the list if that changes.

   HOW IT REACHES THE SCREEN
   Not by editing four hundred and forty-four class names. One attribute on <html>:

       <html data-shop-skin="plum">

   and src/index.css turns that into values for a handful of custom properties which
   the accent utility classes already read. That is the same trick dark mode has used
   in this app since the beginning — override the arbitrary-value Tailwind classes in
   one place rather than in every component — chosen for the same reason: the
   alternative is a rename across every screen, where the one you miss is a blue
   button on an orange page.

   WHY THE VALUES LIVE IN THE CSS AND ONLY THREE OF THEM LIVE HERE
   The properties could all be written onto <html> from JavaScript, which would make
   this file the single source. They are not, because the CSS is read before the first
   paint and JavaScript is not: doing it here would show a blue screen for one frame
   and then the real colour, on every single load. So the split is by capability —
   the stylesheet owns everything a stylesheet can do, and this file owns the three
   values a stylesheet cannot reach:

       accent   the phone's status bar, an SVG built as a string, a printed page
       to       the far end of the big gradient buttons
       deep     the darkest stop of the wash over the login photograph

   Changing a colour therefore means changing it here AND in index.css. That is the
   one real cost of this design and it is written down here so it is not a surprise.

   WHAT DELIBERATELY DOES NOT CHANGE
   Only the ACCENT moves. The colours that carry meaning stay exactly where they are:
   green is money in and in stock, red is a warning, purple is a transfer, amber is a
   note. The seven below are chosen to stay clear of all four — there is no green and
   no red in the list, and Plum is far darker and more magenta than the transfer
   purple. And the data colours stay too — Nissan's tile is blue in src/lib/browse.js
   because that is Nissan's colour on a chart, not because it is the app's accent. A
   shop that recoloured its charts would be a shop whose reports cannot be compared
   with the other's.
--------------------------------------------------------- */
import { currentShopSlug } from "./shopScope.js";

/* The seven. `label` is what the shop sees, `hint` is why they might want it.

   `accent` is the fill, `to` the far end of a gradient button, `deep` the darkest
   stop of the wash over the login photograph — dark enough that white text on top of
   it is a masthead rather than a caption you have to squint at.

   Blue is first and is the default, because it is what the system has always been. */
export const SKINS = [
  {
    key: "blue",
    label: "Blue",
    hint: "The original — what the system has always worn",
    accent: "#2563EB",
    to: "#06B6D4",
    deep: "#0E2378",
  },
  {
    key: "orange",
    label: "Burnt Orange",
    hint: "Warm and obviously not the shop next door",
    accent: "#EA580C",
    to: "#F59E0B",
    deep: "#581C07",
  },
  {
    key: "teal",
    label: "Teal",
    hint: "Cool and quiet — easiest on the eyes all day",
    accent: "#0D9488",
    to: "#22D3EE",
    deep: "#0B3B37",
  },
  {
    key: "indigo",
    label: "Indigo",
    hint: "Deeper than the blue, and a little more formal",
    accent: "#4F46E5",
    to: "#818CF8",
    deep: "#1E1B57",
  },
  {
    key: "magenta",
    label: "Magenta",
    hint: "Bright and hard to mistake for anybody else",
    accent: "#DB2777",
    to: "#F472B6",
    deep: "#5B0B2E",
  },
  {
    key: "plum",
    label: "Plum",
    hint: "Rich and dark — strongest on a printed page",
    accent: "#86198F",
    to: "#C026D3",
    deep: "#3B0A40",
  },
  {
    key: "graphite",
    label: "Graphite",
    hint: "Almost no colour, so the parts do the talking",
    accent: "#475569",
    to: "#64748B",
    deep: "#141A22",
  },
];

/* The one the system has always been, and what any shop gets without an entry below.
   It is also the skin whose values live in the plain `html { }` block of index.css
   rather than behind an attribute, which is why choosing it CLEARS the attribute
   instead of writing "blue". */
export const DEFAULT_SKIN = "blue";

const BY_KEY = new Map(SKINS.map((s) => [s.key, s]));

export function skinByKey(key) {
  return BY_KEY.get(String(key || "").toLowerCase()) || BY_KEY.get(DEFAULT_SKIN);
}

/* What each shop starts as, before anybody chooses. Sure Fit's burnt orange was the
   owner's pick; Jaspare has no entry and so keeps the blue. */
const DEFAULT_BY_SLUG = {
  "jaspare-auto": "blue",
  "surefit-autoparts": "orange",
  /* Jeyden opens in teal — not blue and not orange, because the sign-in screens have
     to be told apart at a glance by somebody who works at two of them. Nobody has
     asked for a colour, so this is a starting point rather than a decision: the slug
     is in CHOOSABLE below, so the shop can change it itself. */
  "jeyden-autospares": "teal",
};

/* Which shops may change it. See the header for why this is not every shop: Jaspare
   is the blue the whole system has always been, and repainting the main shop is a
   different conversation from letting a new shop pick its own look. */
const CHOOSABLE = ["surefit-autoparts", "jeyden-autospares"];

export function canChooseSkin(slug) {
  return CHOOSABLE.includes(String(slug || "").toLowerCase());
}

export function defaultSkinFor(slug) {
  return DEFAULT_BY_SLUG[String(slug || "").toLowerCase()] || DEFAULT_SKIN;
}

/* ---- REMEMBERING THE CHOICE ----

   Per device and keyed by shop, both on purpose.

   Per device, because it is the same kind of setting as light or dark: it is about
   the screen in your hand, not about who you are. Nobody should have their counter
   repainted because somebody in the office prefers plum.

   Keyed by shop, because one phone is used at both shops — the shop picker exists for
   exactly that — and a colour chosen at Sure Fit must not follow you to Jaspare. That
   would undo the whole point of the two shops looking different. */
export const skinStorageKey = (slug) => `bp_shop_skin_${String(slug || "").toLowerCase()}`;

export function readSkinChoice(slug) {
  if (!canChooseSkin(slug)) return "";
  try {
    const v = localStorage.getItem(skinStorageKey(slug));
    /* Checked against the list rather than trusted: a key left behind by an older
       build, or edited by hand, must not leave the app with no colour at all. */
    return v && BY_KEY.has(v) ? v : "";
  } catch {
    /* private browsing, or storage blocked — the shop's default is still correct */
    return "";
  }
}

export function writeSkinChoice(slug, key) {
  if (!canChooseSkin(slug) || !BY_KEY.has(key)) return false;
  try {
    localStorage.setItem(skinStorageKey(slug), key);
  } catch {
    /* ignore — the colour still changes now, it just will not survive a restart */
  }
  return true;
}

/* The skin in force: what was chosen, or the shop's own colour if nothing was. */
export function skinFor(slug) {
  return readSkinChoice(slug) || defaultSkinFor(slug);
}

export function accentFor(slug) {
  return skinByKey(skinFor(slug)).accent;
}

export function accentToFor(slug) {
  return skinByKey(skinFor(slug)).to;
}

/* The colour laid over the photograph at the top of the sign-in screen. Built here
   rather than in the CSS because it is an inline style on that screen, and built from
   the table rather than written out seven times so a new skin cannot arrive without
   a hero to match.

   Three stops, darkest at the top left, and the SAME alphas for every skin — the
   photograph shows through by the same amount whichever colour is on, so choosing a
   pale skin cannot accidentally make the shop's name unreadable. */
export function heroWashFor(slug) {
  const s = skinByKey(skinFor(slug));
  return (
    `linear-gradient(135deg, ${rgba(s.deep, 0.93)} 0%, ` +
    `${rgba(s.accent, 0.82)} 48%, ${rgba(s.to, 0.55)} 100%)`
  );
}

function rgba(hex, a) {
  const h = String(hex || "").replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(0,0,0,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ---- PUTTING IT ON THE PAGE ----

   Called with the slug the address bar gives, as early as that is known. The slug is
   used rather than the shops row because the slug is there on the first frame and the
   row arrives later, and a page that changes colour once the database answers looks
   like a fault.

   The default skin clears the attribute rather than writing "blue": a stylesheet
   whose default lives in one place and whose exceptions live in another reads better
   than one where every shop is an exception, including the plain one. */
export function applyShopSkin(slug, root = null) {
  const el = root || (typeof document !== "undefined" ? document.documentElement : null);
  const skin = skinFor(slug);
  /* Written down for the little script at the top of index.html, which paints the
     attribute before the first frame. It is the ANSWER, not the choice — the choice
     alone is not enough, because a shop's own default is a fact this file holds and
     that script deliberately does not. Kept per slug so a phone used at both shops
     replays the right one at each. See the note in index.html. */
  try {
    localStorage.setItem(`bp_shop_skin_seen_${String(slug || "").toLowerCase()}`, skin);
  } catch {
    /* storage blocked — one frame of blue on each load, and nothing else */
  }
  if (!el) return skin;
  if (skin === DEFAULT_SKIN) delete el.dataset.shopSkin;
  else el.dataset.shopSkin = skin;
  return skin;
}

/* Change it, remember it, and repaint. Returns the skin actually in force, which is
   not always what was asked for — a shop that may not choose gets its own colour
   back rather than a silent success. */
export function chooseSkin(slug, key) {
  writeSkinChoice(slug, key);
  const skin = applyShopSkin(slug);
  listeners.forEach((fn) => fn(skin));
  return skin;
}

/* One shared value, so a picker in Settings and anything else watching agree. The
   same shape theme.js uses, for the same reason. */
const listeners = new Set();

export function onSkinChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---- FOR THE PLACES CSS CANNOT GO ----

   The status bar behind a phone's notch, an SVG built as a string, and the stylesheet
   of a document on its way to a printer. Called at the moment they are needed rather
   than read once into a constant, because a module constant would be fixed at import
   time and the shop is not known then. */
export function shopAccent() {
  return accentFor(currentShopSlug());
}
export function shopAccentTo() {
  return accentToFor(currentShopSlug());
}
