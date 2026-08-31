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

/* The screen ids are NAV ids from src/App.jsx. Order does not matter — the menu is
   drawn in NAV's order, so the menu reads the same at every shop and somebody who
   works at two of them finds Inventory in the same place in both. */
const SCREENS_BY_SLUG = {
  /* QUICK JET AUTO SPARES — the four the owner named, and Settings.
     Settings is the one addition and it is not a fifth module so much as the door
     to the other four: it holds the shop's own password panel, its colour, light or
     dark, and the staff list. Without it nobody at Quick Jet could change the login
     password they were handed, which is not a shop that has been set up, it is a
     shop that cannot be. Take this line out and everything still works — the four
     named screens are the first four entries. */
  "quickjet-autospares": ["inventory", "search", "bulk", "feed", "settings"],
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
