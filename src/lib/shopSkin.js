/* ---------------------------------------------------------
   SHOP SKIN — which colour a shop wears.

   One build serves two businesses, and until now both wore the same blue. A
   customer who has seen one of the parts lists has seen the other: same blue
   masthead, same blue buttons, same blue receipt rule. Two shops that are not the
   same business should not look like one business with two addresses.

   So the shop in the address bar picks a colour, and everything follows.

   HOW IT REACHES THE SCREEN
   Not by editing four hundred and forty-four class names. `applyShopSkin` puts one
   attribute on <html>:

       <html data-shop-skin="orange">

   and src/index.css turns that into values for a handful of custom properties which
   the accent utility classes already read. That is the same trick dark mode has used
   in this app since the beginning — override the arbitrary-value Tailwind classes in
   one place rather than in every component — and it is chosen for the same reason:
   the alternative is a rename across every screen, where the one missed is a blue
   button on an orange page.

   WHAT DELIBERATELY DOES NOT CHANGE
   Only the ACCENT moves. The colours that carry meaning stay exactly where they are:
   green is money in and in stock, red is a warning, purple is a transfer, amber is a
   note. And the data colours stay too — Nissan's tile is blue in src/lib/browse.js
   because that is Nissan's colour on a chart, not because it is the app's accent. A
   shop that recoloured its charts would be a shop whose reports cannot be compared
   with the other's.

   IT IS SET FROM THE SLUG, NOT FROM THE DATABASE ROW. The slug is in the address bar
   and is known on the very first frame; the row arrives later. Waiting for the row
   would paint the page blue and then flip it, and a page that changes colour after
   you have started reading it looks broken.
--------------------------------------------------------- */

import { currentShopSlug } from "./shopScope.js";

/* The default, and what Jaspare has always worn. Named so the file reads as "these
   two shops" rather than "this shop and the exceptions". */
export const DEFAULT_SKIN = "blue";

/* slug -> skin. A shop with no entry gets the default, which is why adding a third
   shop is one line here plus one block of custom properties in index.css. */
const SKIN_BY_SLUG = {
  "jaspare-auto": "blue",
  /* Burnt orange, chosen by the owner. Warm, obviously not the blue next door, and
     far enough from the amber this app uses for notes that a warning still reads as
     a warning. */
  "surefit-autoparts": "orange",
};

/* The accent as a plain colour, for the places CSS cannot reach: the phone's
   status bar, an SVG drawn into a string, and the stylesheet of a document being
   sent to a printer. Kept beside the skin names so the two cannot drift — a receipt
   ruled in blue under an orange masthead is worse than a receipt ruled in black. */
const ACCENT = {
  blue: "#2563EB",
  orange: "#EA580C",
};

/* The second colour of the big gradient buttons — the sign-in button, the two front
   doors, the shop tiles. Blue runs to cyan; orange runs to amber, because orange to
   cyan is not a gradient, it is a collision. */
const ACCENT_TO = {
  blue: "#06B6D4",
  orange: "#F59E0B",
};

export function skinFor(slug) {
  return SKIN_BY_SLUG[String(slug || "").toLowerCase()] || DEFAULT_SKIN;
}

export function accentFor(slug) {
  return ACCENT[skinFor(slug)] || ACCENT[DEFAULT_SKIN];
}

export function accentToFor(slug) {
  return ACCENT_TO[skinFor(slug)] || ACCENT_TO[DEFAULT_SKIN];
}

/* Put the skin on <html>. Called with the slug the address bar gives, as early as
   that is known.

   The default skin clears the attribute rather than writing "blue": a stylesheet
   whose default lives in one place and whose exceptions live in another is easier to
   read than one where every shop is an exception, including the plain one. */
/* The accent for whichever shop is open, without the caller having to know which one
   that is. Used where CSS cannot go: a `style={{...}}` on a screen, an SVG built as a
   string, and the stylesheet of a document on its way to a printer. Called at the
   moment it is needed rather than read once into a constant, because a module constant
   would be fixed at import time and the shop is not known then. */
export function shopAccent() {
  return accentFor(currentShopSlug());
}
export function shopAccentTo() {
  return accentToFor(currentShopSlug());
}

export function applyShopSkin(slug, root = null) {
  const el = root || (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return DEFAULT_SKIN;
  const skin = skinFor(slug);
  if (skin === DEFAULT_SKIN) delete el.dataset.shopSkin;
  else el.dataset.shopSkin = skin;
  return skin;
}
