/* ---------------------------------------------------------
   WHICH SCREENS A SHOP HAS

   Until now every shop had every screen. Three shops, one menu, twenty-five
   entries — because all three do the same work: they buy parts, sell them, quote,
   print, chase credit and keep books.

   Quick Jet Auto Spares does not. The owner asked for it plainly: "in this one
   there isn't as many modules as the other ones, just inventory / search inventory
   / add list of parts / staff feed". So this file is the list, and it exists rather
   than being a set of `slug === "quickjet"` checks scattered through App.jsx for the
   ordinary reason: a menu and the screens the menu can reach have to agree, and they
   only agree if there is one list.

   THIS IS NOT A PERMISSION. Permissions are about a person — what this account may
   do — and they live in roles.js and in the `cap` field on NAV. This is about a
   business: a screen the shop does not use at all. The two are checked separately
   and both have to pass, which is why a Quick Jet admin still sees only these five:
   being allowed to do everything is not the same as having everywhere to do it.

   NOR IS IT SECURITY. A screen missing from a menu is a screen somebody cannot
   find, not a screen they cannot reach — the fence that actually holds is shop_id
   and row level security in the database. Hiding Financial Statements at Quick Jet
   keeps a till tidy; it is the policies in supabase/multishop/05 that keep one
   shop's money out of another shop's sight.

   ADDING A SHOP CHANGES NOTHING HERE. A slug with no entry gets every screen, which
   is what the first three have and what a fourth full shop should have too. Only a
   deliberately smaller shop needs a line.
--------------------------------------------------------- */

/* The screen ids are NAV ids from src/App.jsx. This list is only WHICH screens; what
   they are called and what order they sit in is the skin below it. */
const SCREENS_BY_SLUG = {
  /* QUICK JET AUTO SPARES — the four the owner named, and Settings.
     Settings is the one addition and it is not a fifth module so much as the door
     to the other four: it holds the shop's own password panel, its colour, light or
     dark, and the staff list. Without it nobody at Quick Jet could change the login
     password they were handed, which is not a shop that has been set up, it is a
     shop that cannot be. Take this line out and everything still works — the four
     named screens are the first four entries. */
  "quickjet-autospares": ["inventory", "bulk", "search", "feed", "settings"],
};

/* ---------------------------------------------------------
   WHAT A SHOP CALLS ITS SCREENS, AND WHAT ORDER THEY SIT IN

   The owner asked for this in the same breath as cutting Quick Jet down: "its modules
   should be arranged and named differently than the other shops, like just to give it
   a bit identity and uniqueness". So Quick Jet's five are in its own order and under
   its own names — The Shelves, not Inventory.

   AN OVERRIDE, NOT A SECOND MENU. Every id here has to exist in NAV; nothing is added
   or hidden from this map and a shop with no entry is untouched. That is deliberate:
   a menu that could invent an entry is a menu that can point at a screen which is not
   there, and the way that shows up is a blank page rather than an error.

   THE NAMES ARE THE ONLY THING THAT CHANGES — the screens behave identically. Somebody
   who has worked at Jaspare finds the same Add a List of Parts at Quick Jet, spelled
   "Book In a Delivery", so this buys identity and costs a little recognition. Worth it
   at a shop whose staff are its own, which is what the one-shop rule now guarantees.

   NO ICONS IN HERE. They would mean importing lucide-react into a file that is plain
   arithmetic on strings, and this file stays runnable by `node` without a bundler so
   that the naming can be tested. The icon still comes from NAV. */
const SKIN_BY_SLUG = {
  "quickjet-autospares": {
    /* Ordered the way the counter's day runs: what is on the shelf, what came in on
       the lorry, then looking one up for a customer. Not NAV's order, which opens on
       a dashboard Quick Jet does not have. */
    order: ["inventory", "bulk", "search", "feed", "settings"],
    labels: {
      inventory: "The Shelves",
      bulk: "Book In a Delivery",
      search: "Find a Part",
      feed: "Shop Notes",
      settings: "Shop Setup",
    },
    /* The small line above the heading on the screen itself. Renaming the menu entry
       and leaving the page calling itself Search Inventory would be worse than not
       renaming it, so a screen with a new name gets a new heading and its own eyebrow
       — see moduleScreen(). */
    eyebrows: {
      inventory: "What's on the shelf",
      bulk: "A delivery came in",
      search: "Counter lookup",
      feed: "Everyone at Quick Jet",
      settings: "This shop",
    },
  },
};

const clean = (s) => String(s || "").toLowerCase();

/* The list for a shop, or null meaning "all of them". Null rather than a copy of
   every id, so the answer to "has this shop been cut down?" is a question this file
   can answer without knowing what the full menu is. */
export function screensFor(slug) {
  return SCREENS_BY_SLUG[clean(slug)] || null;
}

export function shopHasEveryScreen(slug) {
  return screensFor(slug) === null;
}

export function screenAllowed(slug, id) {
  const list = screensFor(slug);
  return !list || list.includes(id);
}

/* What this shop calls a screen. `fallback` is NAV's own label, so a shop with no skin
   and a screen with no new name both come back as themselves — which is why every
   caller can send everything through here without asking whether it needs to. */
export function moduleLabel(slug, id, fallback = "") {
  const labels = SKIN_BY_SLUG[clean(slug)]?.labels;
  return (labels && labels[id]) || fallback;
}

/* The heading a screen wears at this shop, or null meaning "keep your own".

   Null rather than the screen's existing words because this file does not know them —
   they are written inside each screen next to the thing they describe, which is where
   they belong. A screen is handed `screen={moduleScreen(slug, id)}` and falls back to
   itself, so the shops that renamed nothing are not touched by any of this. */
export function moduleScreen(slug, id) {
  const skin = SKIN_BY_SLUG[clean(slug)];
  const name = skin?.labels?.[id];
  if (!name) return null;
  return { name, eyebrow: skin.eyebrows?.[id] || "" };
}

/* Whether this shop has its own names at all. For a screen that wants to say so. */
export function shopHasOwnNames(slug) {
  return Boolean(SKIN_BY_SLUG[clean(slug)]);
}

/* The menu in this shop's order. Anything the shop has not placed keeps the order it
   arrived in, at the end — sort is stable, so adding a screen to NAV puts it somewhere
   sensible at every shop without anybody having to come back to this file. */
export function orderScreens(slug, items = []) {
  const order = SKIN_BY_SLUG[clean(slug)]?.order;
  if (!order || !order.length) return items;
  const at = (n) => {
    const i = order.indexOf(n?.id ?? n);
    return i < 0 ? order.length : i;
  };
  return [...items].sort((a, b) => at(a) - at(b));
}

/* Where a sign-in lands, and where a screen this shop does not have falls back to.

   Not hard-coded to the dashboard any more: at Quick Jet there is no dashboard, and
   opening a screen that is not in the menu would leave somebody looking at a page
   with no way back to it. `order` is the menu as this account sees it, so the answer
   is a screen that is both in the shop and open to the person. */
export function firstScreenFor(slug, order = []) {
  const list = screensFor(slug);
  if (!list) return "dashboard";
  const ids = order.length ? order.map((n) => n.id || n) : list;
  return ids.find((id) => list.includes(id)) || list[0];
}
