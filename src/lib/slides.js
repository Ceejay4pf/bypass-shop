/* ---------------------------------------------------------
   THE SLIDE SHOW — what it shows and how it turns.

   One list, used twice: behind the staff login board before anybody has signed
   in (src/LoginGate.jsx) and on the way in afterwards (src/EntryDoors.jsx). One
   list because the two screens should not drift apart, and because a photograph
   added here then appears in both places without being remembered twice.

   THE ORDER MATTERS MORE THAN IT LOOKS. A slide show only downloads the slides
   it actually reaches — see `isMounted` below — so whatever sits at the top of
   this list is what a phone on mobile data pays for. The five brands the shop
   was asked to show are therefore first, one per make, before the six general
   posters. Somebody who glances at the login screen for ten seconds sees Prado,
   LC300 and Subaru; somebody who waits sees the lot.

   Kept out of the screens so it can be checked with plain node: "does the show
   come back round to the beginning?" and "does slide nine stay unfetched until
   somebody gets to slide nine?" are worth being sure about.
--------------------------------------------------------- */

/* Every picture is a free-to-use (CC0) photograph — see public/ads/CREDITS.md.
   `car` is the car the part came off, and is left empty where the photograph
   does not show one: a close-up of a door handle names no make, and inventing
   one would be a lie printed on the shop's own login screen. */
export const SLIDES = [
  {
    image: "/ads/prado-front.jpg",
    part: "Grilles & Headlights",
    car: "Land Cruiser Prado 150",
    sub: "Chrome grille bars, headlamp unit and bonnet trim",
  },
  {
    image: "/ads/lc300-front.jpg",
    part: "Body & Front End",
    car: "Land Cruiser 300",
    sub: "Grille, LED headlamp, bumper and fog lamp surround",
  },
  {
    image: "/ads/subaru-impreza-front.jpg",
    part: "Grilles & Headlights",
    car: "Subaru Impreza",
    sub: "Badge grille, headlamp and lower bumper",
  },
  {
    image: "/ads/mazda-cx5-front.jpg",
    part: "Grilles & Headlights",
    car: "Mazda CX-5",
    sub: "Front grille, headlamp and fog lamp panel",
  },
  {
    image: "/ads/subaru-forester-front.jpg",
    part: "Grilles & Headlights",
    car: "Subaru Forester",
    sub: "Grille mesh, headlamp and wing panel",
  },
  {
    image: "/ads/headlights.jpg",
    part: "Headlights",
    car: "Toyota 86",
    sub: "Left and right, halogen and LED",
  },
  {
    image: "/ads/taillights.jpg",
    part: "Tail Lights",
    car: "Nissan Note",
    sub: "Saloon, hatch and wagon",
  },
  {
    image: "/ads/grilles.jpg",
    part: "Grilles",
    car: "Toyota Alphard",
    sub: "Front grilles and mesh",
  },
  {
    image: "/ads/doors.jpg",
    part: "Doors",
    car: "",
    sub: "Front and rear, bare or dressed",
  },
  {
    image: "/ads/mirrors-plain.jpg",
    part: "Side Mirrors",
    car: "",
    sub: "Plain, no indicator",
  },
  {
    image: "/ads/mirrors-indicator.jpg",
    part: "Side Mirrors",
    car: "",
    sub: "With the indicator lamp",
  },
];

/* Long enough to actually look at the part, short enough that somebody typing a
   password sees more than one. */
export const SLIDE_MS = 4200;

/* Round and round. A remainder rather than a reset so a caller cannot land on a
   slide that is not there, whatever it passes in. */
export function nextSlide(at, count) {
  if (!count || count < 1) return 0;
  const i = Number.isInteger(at) ? at : 0;
  return (((i + 1) % count) + count) % count;
}

export function prevSlide(at, count) {
  if (!count || count < 1) return 0;
  const i = Number.isInteger(at) ? at : 0;
  return (((i - 1) % count) + count) % count;
}

/* The high-water mark: the furthest slide anybody has reached. It only ever goes
   up, which is what stops a picture being thrown away and downloaded again on
   the second lap. */
export function reachedAfter(reached, at) {
  const a = Number.isInteger(at) ? at : 0;
  const r = Number.isInteger(reached) ? reached : 0;
  return Math.max(r, a);
}

/* Is this slide in the page yet? THIS IS THE WHOLE PAYLOAD RULE. An <img> that
   is in the page is fetched even at zero opacity, so a show of eleven 90 kB
   photographs would cost a megabyte the moment the login screen appeared. Only
   the slides that have been reached are put in the page, so the cost arrives one
   picture every four seconds and stops the moment somebody signs in. */
export function isMounted(index, reached) {
  const r = Number.isInteger(reached) ? reached : 0;
  return Number.isInteger(index) && index >= 0 && index <= r;
}

/* "Grilles & Headlights — Land Cruiser Prado 150", or just the part where the
   photograph shows no particular car. */
export function slideLabel(slide) {
  if (!slide) return "";
  const part = slide.part || "";
  const car = slide.car || "";
  if (part && car) return `${part} — ${car}`;
  return part || car;
}

/* What a screen reader is told. The picture is decoration on the login board but
   information on the way in, so the caller says which it is; this only keeps the
   wording in one place. */
export function slideAlt(slide) {
  const label = slideLabel(slide);
  return label ? `${label}, a part of the kind this shop sells` : "";
}
