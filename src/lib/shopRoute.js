/* ---------------------------------------------------------
   WHICH SHOP, AND WHICH OF ITS TWO DOORS

   One build now serves more than one business. This works out, from the address
   alone, which shop a visitor is asking for and whether they want that shop's
   parts list or its sign-in screen. It is a pure function handed a host, a path
   and the list of shops, because getting it wrong means showing one shop's stock
   under another shop's name — which is worse than showing nothing.

   THE SHAPE OF THE ADDRESSES

     /                          the shop picker: which business are you here for?
     /jaspare-auto              that shop's front door — customer, or working here?
     /jaspare-auto/login        that shop's sign-in screen
     /jaspare-auto/shop         that shop's parts list, no sign-in
     /jaspare, /spares, /shop   the old customer links, still Jaspare's parts list
     /system, /staff, /office   the old staff link, still Jaspare's sign-in

   THE OLD LINKS DO NOT MOVE. They are written on paper, forwarded on WhatsApp and
   saved as shortcuts on counter phones. A shop that renames its own front door
   loses every customer holding the old one, so `/jaspare` keeps working for ever
   and resolves to the same shop it always did.

   AN UNKNOWN SHOP IS AN ANSWER, NOT A REDIRECT. `vercel.json` rewrites every path
   to the app, so a typo cannot 404 — without this, `/sirefit-autoparts` would have
   quietly shown the picker and looked like the link was fine. It returns "unknown"
   so a page can say so.
--------------------------------------------------------- */

import { PUBLIC_PATHS, STAFF_PATHS, PUBLIC_HOST_LABELS } from "./publicRoute.js";

/* The shops this build knows about WITHOUT asking the database.

   This exists for one reason: `public.shops` does not exist until the migration
   in supabase/multishop/ has been pasted, and until then a picker that reads the
   database shows nothing at all. So the app carries the same two rows the
   migration seeds, and swaps them for the real ones the moment they are there.

   `ready` is the honest part. Jaspare is the shop all the live data belongs to,
   so it works with or without the migration. Surefit has no rows of its own yet,
   and until it does, opening it would show Jaspare's stock under Surefit's name —
   so it is listed, and blocked, and says why. A shop tile that lies about whose
   shelf you are looking at is worse than a shop tile that says "not yet". */
export const KNOWN_SHOPS = [
  {
    slug: "jaspare-auto",
    name: "Bypass Shop Jaspare Branch",
    phone: "+254729695400",
    tagline: "Main shop — body parts, lights, mirrors and glass",
    ready: true,
  },
  {
    slug: "surefit-autoparts",
    /* The name on the shop's own invoice pad, which is the name its documents must
       carry. The slug still says "surefit" and deliberately stays that way: it is a
       door number, the links have already been shared, and renaming it would break
       them for nothing. */
    name: "Sure Fit Auto Spares Ltd",
    phone: "+254791285634",
    tagline: "Industrial Area, Dunga Road — next to Impala",
    ready: true,
  },
  {
    /* THE THIRD SHOP — and it is not new to this system, which is the part worth
       knowing. Jeyden Auto Spares is already a BRANCH of Jaspare (branches.code
       'JEY', South B) and that row stays exactly where it is: the seven branches
       under Jaspare are the structure this shop has always had. What changes is that
       it now also has a front door and a shelf of its own.

       The phone number is the one already recorded against that branch, so it is the
       shop's own number rather than a guess — worth confirming with the owner, but
       not worth leaving the tile unringable over.

       `ready: false` on purpose, and it is not a placeholder to tidy up later: the
       shops row does not exist until supabase/multishop/12 is pasted, and mergeShops
       turns ready true by itself the moment the row is there. So this reads "Not on
       the system yet" until the shop really is on the system, and then stops, with
       nothing to deploy in between. */
    slug: "jeyden-autospares",
    name: "Jeyden Auto Spares",
    phone: "+254798718321",
    tagline: "Dar es Salaam Road, Industrial Area — South B",
    ready: false,
    /* The one step that finishes it, named here rather than written into the page
       that shows it, so a fourth shop names its own file instead of Jeyden's. */
    setupFile: "supabase/multishop/12_jeyden_third_shop.sql",
  },
  {
    /* THE FOURTH SHOP — and the first one that is not a copy of the others.
       Quick Jet keeps the parts list, the search, the list-paste and the staff feed,
       and none of the rest: no quotations, no receipts, no credit, no books. The
       owner asked for it that way and the list lives in src/lib/shopModules.js.

       No address and no phone number, on purpose. Nobody has given them, a blank
       column prints nothing, and nothing here invents a number for a customer to
       ring off a receipt. Both are one update on the shops row when they are known —
       the database wins over this file, so no deploy is needed for either.

       `ready: false` until supabase/multishop/14 is pasted, the same as Jeyden's
       was: mergeShops turns it true by itself the moment the row exists, so the tile
       says "Not on the system yet" and then quietly stops saying it. */
    slug: "quickjet-autospares",
    name: "Quick Jet Auto Spares",
    phone: "",
    tagline: "Parts list, stock and the staff feed",
    ready: false,
    setupFile: "supabase/multishop/14_quickjet_fourth_shop.sql",
  },
];

/* NOT A LIST OF ALL THE SHOPS THERE WILL BE. Jaspare Auto — the main shop above
   these branches — has not been created yet, and nothing here counts the entries or
   assumes there are three: the picker maps the array, mergeShops replaces it with
   whatever the table holds, and each per-shop list (skins, roles, openings) falls
   back to a default for a slug it has never seen. A fourth shop is one more entry
   here and one more paste of multishop/12, which is the point. */

/* The shop the old links belong to. Every address written before there was more
   than one shop meant this one, and always will. */
export const LEGACY_SLUG = "jaspare-auto";

/* Second segments that mean "the sign-in screen" and "the parts list". Both lists
   repeat the legacy paths without their leading slash on purpose, so somebody who
   has learned that /system is the way in can also type /surefit-autoparts/system
   and be right. */
const STAFF_SEGMENTS = ["login", "system", "staff", "office", "signin", "sign-in"];
const CUSTOMER_SEGMENTS = ["shop", "parts", "spares", "catalogue", "store", "jaspare"];

const clean = (s) => String(s || "").toLowerCase().trim();

const cleanHost = (h) =>
  clean(h).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");

/* The path split into its segments, lower-cased, with the empties dropped — so
   "/Surefit-Autoparts/Login/" and "/surefit-autoparts/login" are the same two
   words. Trailing slashes get added by hand and by link previews. */
export function segments(path) {
  return clean(path).split("/").filter(Boolean);
}

/* Does the hostname itself say "customer"? Unchanged in meaning from
   publicRoute.js — matched against the first label only, and only when there is a
   dot, so spares.jaspareauto.co.ke is the parts list while bypass-shop.vercel.app
   is not, even though the word "shop" is in it. */
function hostSaysCustomer(host, publicHost) {
  const h = cleanHost(host);
  const want = cleanHost(publicHost);
  if (want) return h === want || h === `www.${want}` || `www.${h}` === want;
  const label = h.includes(".") ? h.split(".")[0] : "";
  return Boolean(label) && PUBLIC_HOST_LABELS.includes(label);
}

export const findShop = (shops, slug) =>
  (shops || []).find((s) => clean(s.slug) === clean(slug)) || null;

/* ---------------------------------------------------------
   THE ANSWER

   Returns { view, slug, shop }, where view is one of:

     "picker"    which shop? — the landing page
     "door"      this shop, but customer or staff not yet said
     "customer"  this shop's parts list
     "staff"     this shop's sign-in screen
     "unknown"   an address naming a shop that does not exist

   `shops` is the list to resolve against — the real rows from public.shops once
   they exist, KNOWN_SHOPS until then. Passed in rather than imported so the
   caller decides, and so this can be tested without a database.
--------------------------------------------------------- */
export function resolveRoute({ host = "", path = "", publicHost = "", shops = KNOWN_SHOPS } = {}) {
  const list = shops && shops.length ? shops : KNOWN_SHOPS;
  const seg = segments(path);
  const legacy = findShop(list, LEGACY_SLUG) || list[0];

  /* A customer hostname wins over everything, including a path. If the shop has
     put its parts list on its own address, nothing typed after the slash turns
     that address into the staff sign-in screen. */
  if (hostSaysCustomer(host, publicHost)) {
    const named = seg.length ? findShop(list, seg[0]) : null;
    const shop = named || legacy;
    return { view: "customer", slug: shop?.slug || "", shop };
  }

  /* The old links, before anything is treated as a shop name. Checked first
     because "/shop" and "/parts" are both old customer links AND words that could
     look like a slug; no shop is called either, and this keeps it that way. */
  if (seg.length === 1) {
    const one = "/" + seg[0];
    if (PUBLIC_PATHS.includes(one)) return { view: "customer", slug: legacy?.slug || "", shop: legacy };
    if (STAFF_PATHS.includes(one)) return { view: "staff", slug: legacy?.slug || "", shop: legacy };
  }

  /* The bare address. One shop is one tap — asking "which shop?" when there is
     only one is a question with one possible answer, which is not a question. */
  if (seg.length === 0) {
    if (list.length === 1) return { view: "door", slug: list[0].slug, shop: list[0] };
    return { view: "picker", slug: "", shop: null };
  }

  const shop = findShop(list, seg[0]);
  if (!shop) return { view: "unknown", slug: seg[0], shop: null };

  if (seg.length === 1) return { view: "door", slug: shop.slug, shop };

  const what = seg[1];
  if (STAFF_SEGMENTS.includes(what)) return { view: "staff", slug: shop.slug, shop };
  if (CUSTOMER_SEGMENTS.includes(what)) return { view: "customer", slug: shop.slug, shop };

  /* A shop that exists, followed by a word that means nothing. The shop is the
     part worth honouring, so this lands on its front door rather than on an error
     about a segment the visitor probably did not type deliberately. */
  return { view: "door", slug: shop.slug, shop };
}

/* ---------------------------------------------------------
   BUILDING THE ADDRESSES

   One place, so a link shown on a screen and a link pushed into the browser's
   history can never drift apart.
--------------------------------------------------------- */
export function pathFor(view, slug = "") {
  const s = clean(slug);
  if (view === "picker" || !s) return "/";
  if (view === "staff") return `/${s}/login`;
  if (view === "customer") return `/${s}/shop`;
  return `/${s}`;
}

/* The link to hand a customer for one named shop. Its own hostname if the shop
   has one, otherwise this build's address and the shop's own path. */
export function customerLink({ origin = "", publicHost = "", slug = "" } = {}) {
  const want = cleanHost(publicHost);
  if (want) return `https://${want}`;
  return `${String(origin || "").replace(/\/+$/, "")}${pathFor("customer", slug)}`;
}

export function staffLink({ origin = "", slug = "" } = {}) {
  return `${String(origin || "").replace(/\/+$/, "")}${pathFor("staff", slug)}`;
}

/* ---------------------------------------------------------
   THE SHOP LIST, FROM WHICHEVER SOURCE IS REAL

   Merges the rows read from public.shops with what the app already knows. The
   database wins on name and phone — it is the thing somebody can correct without
   a deploy — but a row that came back from the database is `ready` by definition,
   because a shop with a row is a shop with somewhere to put its stock.

   A shop the app has never heard of appears too. That is the whole point of
   reading the table: adding a third shop should be an insert, not a release.

   AND IT WORKS THE OTHER WAY ROUND AS WELL, which it did not, and that was a
   reported bug: /jeyden-autospares answered "no shop called that". The table
   held two rows, this function returned those two rows and nothing else, so the
   third shop — which the build knows about, and whose door had been built and
   deployed — vanished the instant the database answered. Its tile disappeared
   from the picker too, and `ready: false` above never got the chance to say
   "Not on the system yet", because there was no tile left to say it on.

   So the two lists are UNIONED. A shop with a row is a real shop; a shop this
   build knows about with no row yet keeps its place and keeps its own `ready`,
   which is what makes the honest message possible. Nothing is invented either
   way: the database still wins every field of every shop it has.
--------------------------------------------------------- */
export function mergeShops(rows) {
  const known = KNOWN_SHOPS.map((s) => ({ ...s, fromDb: false }));
  if (!Array.isArray(rows) || rows.length === 0) return known;

  const fromDb = rows
    .filter((r) => r && r.slug)
    .map((r) => {
      const known = findShop(KNOWN_SHOPS, r.slug);
      return {
        /* The letterhead columns carried through as they came, so shopInfo.js can
           head a receipt from them. Spread first, then the fields with a fallback,
           so a null column in the database cannot beat a value the build knows. */
        ...r,
        slug: clean(r.slug),
        name: r.name || known?.name || r.slug,
        phone: r.phone || known?.phone || "",
        /* The database's own words win here — the address is the thing somebody
           should be able to correct without waiting for a deploy. */
        tagline: r.tagline || known?.tagline || "",
        ready: true,
        fromDb: true,
      };
    });

  /* The database's rows first, in the order it gave them, then whatever this
     build knows about that the table has not got to yet. */
  const have = new Set(fromDb.map((s) => s.slug));
  return [...fromDb, ...known.filter((s) => !have.has(clean(s.slug)))];
}
