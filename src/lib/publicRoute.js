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
   those paths. Rather than guessing, it asks: customer, or working here? The
   answer is kept on that device, so a storekeeper answers once and never again
   and the shop's own link behaves exactly as it always did. See `frontDoor`.

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

   A LINK ALWAYS WINS OVER A REMEMBERED ANSWER. Somebody sent /jaspare on
   WhatsApp gets the parts list even if that phone once chose "staff" — the link
   is what the sender meant, and it is the newer instruction of the two.
--------------------------------------------------------- */

export const DOOR_KEY = "bp_front_door";
export const DOORS = ["customer", "staff"];

export function frontDoor({ host = "", path = "", publicHost = "", remembered = "" } = {}) {
  if (isPublicRequest({ host, path, publicHost })) return "customer";
  if (STAFF_PATHS.includes(cleanPath(path))) return "staff";
  return DOORS.includes(remembered) ? remembered : "choose";
}

/* The device's answer. A storage object is passed in rather than reached for, so
   this is testable and so a phone with storage switched off is a caller's problem
   rather than a crash — it simply gets asked again, which is harmless. */
export function readDoor(store) {
  try {
    const v = store && store.getItem(DOOR_KEY);
    return DOORS.includes(v) ? v : "";
  } catch { return ""; }
}

export function rememberDoor(store, which) {
  if (!DOORS.includes(which)) return false;
  try { store && store.setItem(DOOR_KEY, which); return true; } catch { return false; }
}

export function forgetDoor(store) {
  try { store && store.removeItem(DOOR_KEY); return true; } catch { return false; }
}
