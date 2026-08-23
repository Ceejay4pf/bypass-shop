/* ---------------------------------------------------------
   BYPASS SHOP — which of the two front doors this is

   One build serves two different places: the shop's own system, which asks you
   to sign in, and the public parts list, which asks nothing. This decides which
   one a visitor gets.

   WHY THE CUSTOMER LINK SHOULD NOT BE THE STAFF LINK
   A customer who lands on a sign-in screen leaves. A customer who is one guessed
   path away from the shop's own system is a customer poking at it. So the two are
   given different addresses, and the best version of that is a different
   hostname altogether — spares.example.com and the system somewhere else — so
   the shop's screens are never mentioned on anything handed to a customer.

   Three ways in, in order of how good they are:
     1. VITE_PUBLIC_HOST set to the customer's hostname. Explicit, no guessing.
     2. A hostname whose first label is spares / parts / catalogue / store.
     3. One of the paths below, so a link works today with no setup at all.

   AND THE FRONT DOOR, for anybody who arrives at the bare address without one of
   those paths. Rather than guessing, it asks: customer, or working here? It asks
   EVERY time — see `frontDoor`.

   Pure and testable: it is handed a host and a path rather than reading the
   browser, because getting this wrong in either direction is serious — staff
   locked out of their own system, or the system handed to the street.
--------------------------------------------------------- */

/* The canonical customer path is first; the rest are kept working because links
   get written on paper and forwarded on WhatsApp, and a dead link is a lost
   customer.

   `/jaspare` leads because it is the one to hand out: it says the shop's name
   rather than naming a drawer in the shop's system, and it shares no word with
   the staff address, so a customer holding it has no obvious next thing to try. */
export const PUBLIC_PATHS = ["/jaspare", "/spares", "/shop", "/parts", "/catalogue", "/store"];

/* Straight to the sign-in screen, past the front door. For a staff bookmark, and
   for the shortcut on a counter phone — somebody opening the system to key in a
   sale should not be asked who they are first. */
export const STAFF_PATHS = ["/system", "/staff", "/office"];

/* Matched against the FIRST label of the hostname only, and only when there is a
   dot — so spares.jaspareauto.co.ke is the public list while bypass-shop.vercel.app
   is not, even though the word "shop" is in it. That distinction is the whole
   reason this is a list of labels and not a substring search. */
export const PUBLIC_HOST_LABELS = ["spares", "parts", "catalogue", "store", "shop"];

const cleanHost = (h) =>
  String(h || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");

const cleanPath = (p) => "/" + String(p || "").toLowerCase().trim().replace(/^\/+|\/+$/g, "");

/* The link to hand a customer. Its own hostname if the shop has one, otherwise
   this build's address and the canonical path — so the Customer Orders screen can
   show the real link to copy into a WhatsApp message rather than somebody
   remembering it. */
export function publicLink({ origin = "", publicHost = "" } = {}) {
  const want = cleanHost(publicHost);
  if (want) return `https://${want}`;
  return `${String(origin || "").replace(/\/+$/, "")}${PUBLIC_PATHS[0]}`;
}

export function isPublicRequest({ host = "", path = "", publicHost = "" } = {}) {
  const h = cleanHost(host);

  /* Told outright. Nothing else is consulted — if the shop has named the
     customer's hostname, that name decides, and a path on the staff hostname
     stays staff. */
  const want = cleanHost(publicHost);
  if (want) return h === want || h === `www.${want}` || `www.${h}` === want;

  const label = h.includes(".") ? h.split(".")[0] : "";
  if (label && PUBLIC_HOST_LABELS.includes(label)) return true;

  return PUBLIC_PATHS.includes(cleanPath(path));
}

/* ---------------------------------------------------------
   THE FRONT DOOR

   Which of the two the visitor gets, or whether to ask. Three answers:

     "customer" - the parts list, no sign-in
     "staff"    - the shop's own system
     "choose"   - neither is known, so put the question on the screen

   A LINK ALWAYS WINS. /jaspare is the parts list and /system is the sign-in
   screen, on any device, without being asked anything: somebody who sent a link
   has already answered the question on the visitor's behalf, and a shortcut on a
   counter phone must not stop to ask every morning.

   THE BARE ADDRESS ASKS EVERY TIME, AND KEEPS NOTHING.
   It used to answer once and remember, so a phone went straight through
   afterwards. That was fewer taps and it was wrong: a phone that answered
   "customer" once was on the customer page for good, and the way out was a path
   nobody had been told about. One tap on arrival is a much smaller price than
   being unable to reach the sign-in screen at all — and a shop phone that wants
   no question can be given /system, which is what a home-screen shortcut should
   point at anyway.

   Nothing about the visitor is stored, which is also one less thing on somebody's
   phone to explain.
--------------------------------------------------------- */

export const DOORS = ["customer", "staff"];

/* Kept only so old saves can be cleared off phones that answered under the
   previous behaviour — see main.jsx. Nothing writes it any more. */
export const DOOR_KEY = "bp_front_door";

export function frontDoor({ host = "", path = "", publicHost = "" } = {}) {
  if (isPublicRequest({ host, path, publicHost })) return "customer";
  if (STAFF_PATHS.includes(cleanPath(path))) return "staff";
  return "choose";
}

/* A storage object is passed in rather than reached for, so a phone with storage
   switched off is a caller's problem rather than a crash.

   True means "the old answer is gone from this phone". No storage is not that, so
   it is false: the one thing this must never do is report a clean-up it did not
   perform. */
export function forgetDoor(store) {
  if (!store) return false;
  try { store.removeItem(DOOR_KEY); return true; } catch { return false; }
}
