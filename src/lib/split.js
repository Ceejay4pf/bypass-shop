/* ---------------------------------------------------------
   TWO SCREENS AT ONCE — the rules, kept out of the app.

   A storekeeper checking a printed list against the shelf, or pricing a
   quotation while looking at what is actually in stock, was doing it by tapping
   back and forth and holding a part number in their head. Split screen puts the
   second list beside the first instead.

   ONLY ON A WIDE SCREEN. Two panes on a phone is two unusable panes, so the
   button that turns this on is only offered from `lg` up and the panes stack
   below it. That is a CSS matter, but the DEFAULT chosen here follows it: off.

   WHAT GOES IN THE SECOND PANE IS REMEMBERED, because the pairing is habitual —
   whoever puts Low Stock next to the Dashboard on Monday wants it there on
   Tuesday. Remembered per device, like everything else here.

   Pure, so it can be checked with node: it is handed a storage object and a list
   of the screens this account may open rather than reaching for either.
--------------------------------------------------------- */

export const SPLIT_KEY = "bp_split_on";
export const SPLIT_RIGHT_KEY = "bp_split_right";

/* What the second pane opens as, when the device has no preference yet. Low
   Stock because it is the list most often wanted beside another one — what to
   order while looking at anything else. */
export const DEFAULT_RIGHT = "lowstock";

/* Tried in order when the remembered choice is one this account may not open, or
   is already the left-hand pane. Lists, all of them: the point of the second
   pane is something to read against, not a second form to type into. */
export const RIGHT_FALLBACKS = ["lowstock", "inventory", "search", "dashboard", "print", "reports"];

const ids = (allowed) =>
  (Array.isArray(allowed) ? allowed : [])
    .map((a) => (a && typeof a === "object" ? a.id : a))
    .filter(Boolean);

export function readSplit(store) {
  try { return store && store.getItem(SPLIT_KEY) === "1"; } catch { return false; }
}

export function writeSplit(store, on) {
  try { store && store.setItem(SPLIT_KEY, on ? "1" : "0"); return true; } catch { return false; }
}

export function readRightTab(store) {
  try { return String((store && store.getItem(SPLIT_RIGHT_KEY)) || ""); } catch { return ""; }
}

export function writeRightTab(store, id) {
  try { store && store.setItem(SPLIT_RIGHT_KEY, String(id || "")); return true; } catch { return false; }
}

/* The screen the second pane should show. `want` is what was remembered or
   asked for; `left` is what the first pane is on.

   Never the same screen twice. Two Dashboards side by side is a bug that looks
   like a feature, and worse, both panes would be fighting over the one lot of
   screen state — so if the left pane moves onto the right pane's screen, the
   right pane moves aside. */
export function rightScreen({ want = "", left = "", allowed = [] } = {}) {
  const open = ids(allowed);
  const ok = (id) => id && id !== left && open.includes(id);
  if (ok(want)) return want;
  for (const id of [DEFAULT_RIGHT, ...RIGHT_FALLBACKS]) if (ok(id)) return id;
  /* Nothing left that this account may open and is not already on screen — one
     pane it is. The caller reads "" as "do not split". */
  return open.find((id) => id !== left) || "";
}

/* Whether splitting is worth offering at all. An account down to one screen has
   nothing to put beside it. */
export function canSplit(allowed) {
  return ids(allowed).length > 1;
}
