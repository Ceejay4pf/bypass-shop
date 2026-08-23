/* ---------------------------------------------------------
   BYPASS SHOP — the advert pages on the customer's page

   A few pages a customer can turn through: what the shop deals in, and what it
   does besides selling over the counter. It is the part of the page that answers
   "who are these people and can they help me", which the parts list alone does
   not.

   EVERY CLAIM HERE WAS CONFIRMED BY THE OWNER. That is not a formality. This is
   the shop making promises to strangers who will ring up and hold it to them, so
   nothing is inferred, rounded up, or written because it sounded good — the four
   services below were each picked from a list and the rest were left out. Adding
   one means asking first.

   The pictures are the same free-to-use photographs as the slide show
   (public/ads/CREDITS.md), so no page here downloads anything the shop window
   has not already paid for.

   Plain data, so the pages can be counted and checked without a browser.
--------------------------------------------------------- */

/* ---- page 1..n: what we deal in ----
   Drawn from the shop's own list in shopInfo.js rather than repeated here, apart
   from the picture and the line under each, so a section the shop stops carrying
   does not go on being advertised from two places.

   `sections` are the real section keys from data.js, and the card offers one
   button per section rather than a single "see what's in stock". A poster that
   covers four shelves and lands you on one of them, silently, is an advert that
   loses the other three. */
export const DEALS = [
  {
    key: "lights",
    image: "/ads/headlights.jpg",
    title: "Headlights & Taillights",
    line: "Units, lenses and indicator corners — nearside and offside.",
    hint: "Bring the old lamp or the car's year; the same model changes mid-run.",
    sections: ["HDL", "TLL", "IND", "FGL"],
  },
  {
    key: "body",
    image: "/ads/grilles.jpg",
    title: "Grilles, Bonnets & Bumpers",
    line: "Front and rear bumpers, grille assemblies, bonnets and boot lids.",
    hint: "Colour is rarely matched — most go to the sprayer after fitting.",
    sections: ["FBM", "RBM", "GRL", "BNT"],
  },
  {
    key: "doors",
    image: "/ads/doors.jpg",
    title: "Doors & Panels",
    line: "Complete doors, skins, handles and window regulators.",
    hint: "Say which door: driver's front, passenger's rear, and so on.",
    sections: ["DOR", "WNL", "WNR"],
  },
  {
    key: "mirrors",
    image: "/ads/mirrors-indicator.jpg",
    title: "Side Mirrors",
    line: "Plain, electric, and the type with the indicator in the glass.",
    hint: "Count the pins on the old plug — that is what decides which one fits.",
    sections: ["SMI", "SMN"],
  },
  {
    key: "suspension",
    image: "/ads/prado-front.jpg",
    title: "Shocks & Suspension",
    line: "Shock absorbers and struts for the makes we carry.",
    hint: "Sold as they come — always check both sides at the same time.",
    sections: ["SUS"],
  },
];

/* ---- the services page ----
   These four and only these four. Each was confirmed; see the header. */
export const SERVICES = [
  {
    key: "delivery",
    icon: "truck",
    title: "Delivery & courier",
    line: "Outside Nairobi, parts go by courier or parcel service.",
    detail:
      "Tell us the town and how you want it sent when you send your list. Carriage is paid by the customer and is quoted with the part, never added afterwards.",
  },
  {
    key: "fitting",
    icon: "wrench",
    title: "Fitting at the shop",
    line: "Most parts can be fitted here rather than just sold over the counter.",
    detail:
      "Bring the car. Lamps, mirrors, grilles and bumpers are usually done while you wait; a door or a panel is booked in. Fitting is quoted separately from the part.",
  },
  {
    key: "sourcing",
    icon: "search",
    title: "Sourcing on order",
    line: "If it is not on the shelf, it can be ordered in.",
    detail:
      "Send the part and the car anyway. What we do not hold we look for, and you are told the price and how long before anything is agreed.",
  },
  {
    key: "trade",
    icon: "handshake",
    title: "Trade prices for garages",
    line: "Better rates for mechanics and garages buying regularly.",
    detail:
      "Ring the counter and say which garage you are from. Trade rates are arranged on the phone, not on this page.",
  },
];

/* ---- how it works, as three lines ----
   Here because the commonest reason a customer does not send a basket is not
   knowing what happens next: whether they have just bought something, whether
   somebody has their number, whether they owe money. */
export const HOW_IT_WORKS = [
  { step: "Send your list", line: "Add what you need and send it with your name and number. Nothing is paid for here." },
  { step: "We ring you back", line: "Someone goes through it, confirms what is on the shelf and prices it." },
  { step: "Collect or have it sent", line: "Pick it up at the counter, have it fitted, or have it couriered to your town." },
];

/* The pages, in order, as the pager turns them. One list so the page count on
   screen and the pages that exist can never disagree. */
export const AD_PAGES = [
  { key: "deals",    title: "What we deal in" },
  { key: "services", title: "What we can do for you" },
  { key: "how",      title: "How it works" },
];

export function pageCount() {
  return AD_PAGES.length;
}

/* Turn a page, wrapping at both ends — a pager that stops dead at the last page
   reads as broken on a phone, where the only clue you have reached the end is
   that nothing happened. */
export function turn(at, by, count = AD_PAGES.length) {
  const n = Number.isFinite(Number(count)) && Number(count) > 0 ? Number(count) : 1;
  const from = Number.isFinite(Number(at)) ? Number(at) : 0;
  const step = Number.isFinite(Number(by)) ? Number(by) : 0;
  return ((from + step) % n + n) % n;
}
