/* ---------------------------------------------------------
   THE LAST PARTS LIST THIS PHONE SAW

   Installing the app put the app on the phone. It did not put the shop's stock
   there — open it in a dead spot and you got an empty list, which looks exactly
   like a shop with nothing in it.

   So the parts list is kept on the phone after every successful read, and used
   for ONE purpose: when the network read fails and there is otherwise nothing to
   show. Never as a head start over a live read, because a price or a quantity
   from an hour ago, shown as though it were current, is how a part gets sold at
   last month's price or sold twice. The rule is: live if we can reach it, the
   phone's copy only if we can't, and never silently — whatever is drawn from
   here is labelled with when it was taken.

   PHOTOS ARE STRIPPED. They are the bulk of a row by a wide margin and would
   blow past the roughly 5MB a browser allows localStorage in a few dozen parts,
   at which point the write throws and nothing is kept at all. A cached list with
   no pictures still answers "have we got one, how many, what does it cost".

   Nothing here writes to the shop. It cannot: it is one string in one phone.
--------------------------------------------------------- */

export const CACHE_KEY = "bp_stock_cache";

/* Keeping the whole list matters — a stock list truncated at some round number
   is a list that quietly says "we have none" about real parts on the shelf. This
   cap exists only to stop an absurd row count from throwing on write. */
export const MAX_ROWS = 5000;

/* Fields worth keeping. Whitelisted rather than deleting `images`, so a column
   added to inventory later can't creep into the cache and burst it. */
const KEEP = [
  "code", "name", "category", "qty", "price", "min_qty", "shop",
  "side", "model", "year_from", "year_to", "notes", "location",
];

export function packItems(items) {
  const rows = Array.isArray(items) ? items.slice(0, MAX_ROWS) : [];
  return rows.map((it) => {
    const out = {};
    for (const k of KEEP) if (it?.[k] !== undefined && it[k] !== null) out[k] = it[k];
    return out;
  });
}

/* Save. `at` is passed in rather than read from the clock here so this stays a
   plain function of its inputs and can be tested. */
export function writeCache(storage, items, at) {
  try {
    const payload = { at, items: packItems(items) };
    storage?.setItem(CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Out of room, or a browser refusing storage. Not worth a word to anybody:
    // the only cost is that a dead spot shows an empty list, as it did before.
    return false;
  }
}

/* Read. Returns null for anything it doesn't fully trust — no entry, unparseable,
   wrong shape, or empty. A half-understood cache is worse than none. */
export function readCache(storage) {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.items) || p.items.length === 0) return null;
    return { at: Number(p.at) || 0, items: p.items };
  } catch {
    return null;
  }
}

export function clearCache(storage) {
  try { storage?.removeItem(CACHE_KEY); } catch { /* nothing to do */ }
}

/* How old, in words somebody would say. Deliberately vague past a day: "3 days
   ago" is the honest precision, and "72 hours ago" only sounds precise. */
export function cacheAge(at, now) {
  const ms = Number(now) - Number(at);
  if (!Number.isFinite(ms) || ms < 0) return "an unknown time ago";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "moments ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
