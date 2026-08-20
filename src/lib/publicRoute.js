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

   Pure and testable: it is handed a host and a path rather than reading the
   browser, because getting this wrong in either direction is serious — staff
   locked out of their own system, or the system handed to the street.
--------------------------------------------------------- */

/* The canonical customer path is first; the rest are kept working because links
   get written on paper and forwarded on WhatsApp, and a dead link is a lost
   customer. */
export const PUBLIC_PATHS = ["/spares", "/shop", "/parts", "/catalogue", "/store"];

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
