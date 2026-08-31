import React, { useState, useCallback, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Shopfront from "./shopfront.jsx";
import FrontDoor from "./FrontDoor.jsx";
import ShopPicker from "./ShopPicker.jsx";
import OwnerConsole from "./OwnerConsole.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { forgetDoor } from "./lib/publicRoute.js";
import {
  KNOWN_SHOPS, resolveRoute, pathFor, mergeShops, findShop,
} from "./lib/shopRoute.js";
import { setShop } from "./lib/shopScope.js";
import { applyShopSkin } from "./lib/shopSkin.js";
import { fetchShops } from "./lib/api.js";
import "./index.css";

/* WHICH SHOP, THEN WHICH DOOR.

   One build now serves more than one business, so opening the link asks two
   questions in order: which shop are you here for, and are you a customer or do you
   work here? The shop comes first because it decides everything after it — the
   parts list, the sign-in screen, and every row either of them can see.

     /                          which shop?
     /jaspare-auto              that shop: customer, or working here?
     /jaspare-auto/login        that shop's sign-in
     /jaspare-auto/shop         that shop's parts list
     /jaspare, /shop, /system   the old links, unchanged, still Jaspare
     /owner                     the owner's console — all the shops, and no shop

   THE CONSOLE IS THE ONE VIEW WITH NO SHOP, and it is above this whole question
   rather than inside it. Every screen below asks "which shop?" first and narrows
   everything to the answer; that one is for the person who needs to see across them,
   and the account that opens it is a member of none of them. See OwnerConsole.jsx.

   THE OLD LINKS DO NOT MOVE and they skip both questions, exactly as they always
   have. They are written on paper, forwarded on WhatsApp and saved on counter
   phones; a shop that renames its own front door loses every customer holding the
   old one. The rules live in src/lib/shopRoute.js, where they can be tested —
   sending staff to the customer page, or one shop's stock out under another shop's
   name, are both serious.

   IT ASKS EVERY TIME AND KEEPS NOTHING. The address bar is the only memory: it
   survives a reload, it can be read by the person using it, and it can be shared.
   A remembered answer is how a phone that once tapped "customer" ends up unable to
   reach the sign-in screen at all. */
function Root() {
  const publicHost = import.meta.env.VITE_PUBLIC_HOST || "";

  /* Starts from the two shops the app itself knows, so the picker is drawn on the
     first frame with no database round trip — and still works on a database that has
     never had supabase/multishop/ pasted into it. Replaced by the real rows the
     moment they arrive. */
  const [shops, setShops] = useState(KNOWN_SHOPS);
  const [loadingShops, setLoadingShops] = useState(true);

  /* What the address currently means. Used on arrival, when the real shop list
     lands, and on the back button — the three moments where the browser, not a tap,
     is the one saying where we are. */
  const read = useCallback(
    (list) =>
      resolveRoute({
        host: window.location.hostname,
        path: window.location.pathname,
        publicHost,
        shops: list,
      }),
    [publicHost]
  );

  const [route, setRoute] = useState(() => read(KNOWN_SHOPS));

  /* Whatever the database says, once. A shop added later should be an insert, not a
     release — and a failure here is not fatal, because fetchShops returns [] and
     mergeShops falls back to what the build already knows. */
  useEffect(() => {
    let alive = true;
    fetchShops()
      .then((rows) => {
        if (!alive) return;
        const merged = mergeShops(rows);
        setShops(merged);
        /* Re-resolved against the real list, because the address may name a shop
           this build has never heard of — which is "unknown" until the rows land
           and a real shop the moment they do. */
        setRoute(read(merged));
      })
      .finally(() => { if (alive) setLoadingShops(false); });
    return () => { alive = false; };
  }, [read]);

  /* The chosen shop, told to the query layer as soon as it is known. The id is not
     set here — it arrives with the account's membership after sign-in (see ShopGate
     in App.jsx), because the public shop list carries a name, a slug and a phone and
     deliberately no internal ids. Until then the slug is enough: it is what the
     customer page filters the catalogue by. */
  useEffect(() => {
    /* The whole shop row, not just the slug and name: the rest is the letterhead
       that heads every receipt and quotation (see lib/shopInfo.js). Spread first so
       slug always wins — route.slug is what the address bar says, and that is the
       shop whose rows are about to be read. */
    setShop({ ...(route.shop || {}), slug: route.slug || "", name: route.shop?.name || "" });
    /* And the colour it wears, from the slug rather than the row. The row is what
       says the shop's NAME, and it arrives a moment later; the colour cannot wait
       that long, because a page that is blue while you start reading it and orange
       once the database answers looks like a fault. Re-applied on every change of
       address so walking between the two shops repaints. */
    applyShopSkin(route.slug || "");
  }, [route.slug, route.shop]);

  /* Moving between the views is a real navigation: the address changes, and the
     phone's back button and gesture walk back through it. Without pushState,
     "choose again" would leave the address bar saying /surefit-autoparts while the
     picker was on screen, and a reload would land somewhere else entirely. */
  const goto = useCallback(
    (view, slug = "") => {
      const path = pathFor(view, slug);
      try {
        if (window.location.pathname !== path) window.history.pushState({ view, slug }, "", path);
      } catch { /* a browser that refuses history still gets the right screen */ }
      /* The tap decides the screen; the address is updated to the nearest link that
         means the same thing. Deliberately NOT re-resolved from the path — on a
         shop with its own customer hostname every address resolves to the parts
         list, so re-reading would make "choose again" and the back link do nothing
         at all. A page with no way back off it is the bug that was reported. */
      setRoute({ view, slug, shop: findShop(shops, slug) });
    },
    [shops]
  );

  useEffect(() => {
    const onPop = () => setRoute(read(shops));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read, shops]);

  /* Clears the answer the old build saved per device, so a phone that chose once
     under the previous version is not carrying a setting nothing reads any more. */
  useEffect(() => { forgetDoor(window.localStorage); }, []);

  const pickShop = useCallback((s) => goto("door", s.slug), [goto]);
  const toPicker = useCallback(() => goto("picker"), [goto]);
  const pickDoor = useCallback(
    (which) => goto(which === "customer" ? "customer" : "staff", route.slug),
    [goto, route.slug]
  );
  /* Back to the customer-or-staff question for THIS shop, not to the shop list.
     Somebody who answered wrongly got the shop right; making them choose it again
     would be a second question they have already answered. */
  const toDoor = useCallback(() => goto("door", route.slug), [goto, route.slug]);
  const toOwner = useCallback(() => goto("owner"), [goto]);

  /* Offer "choose a different shop" only where there is a choice to make. With one
     shop on the system the picker is a question with one answer, and a link to it
     is a link to nowhere. */
  const chooseShop = shops.length > 1 ? toPicker : null;

  if (route.view === "unknown") {
    return <NoSuchShop slug={route.slug} shops={shops} onPick={pickShop} />;
  }
  /* A real shop of ours whose rows do not exist yet. This catches all three of its
     addresses at once — the front door, /login and /shop — because every one of
     them would otherwise lead somewhere that cannot work: a sign-in with no
     members to match, or a parts list filtered to a shop_id that isn't there,
     which shows an empty shelf as though the shop had nothing on it.

     Said here rather than in resolveRoute() on purpose. The router's job is what
     the address MEANS, and it means Jeyden either way; whether Jeyden can be
     opened yet is a fact about the database, and it changes without the address
     changing. */
  if (route.shop && route.shop.ready === false) {
    /* Not until the table has actually answered. On the first frame the list is the
       one compiled into the build, where this shop is not ready BY DEFINITION —
       telling somebody the shop isn't on the system and then opening it half a
       second later would make the true message look like a glitch, and this is the
       screen that has to be believed on the day it is right. */
    if (loadingShops) {
      return (
        <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
          <p className="text-[#5A6472] text-sm">Opening {route.shop.name}…</p>
        </div>
      );
    }
    return <NotOnTheSystemYet shop={route.shop} shops={shops} onPick={pickShop} />;
  }
  /* Before the picker, and it does not go through the "is this shop ready?" check
     above, because it has no shop to be ready. It is also the one screen that stays
     reachable when every shop is having a bad day — which is exactly when the person
     who can fix it needs to look at all four of them at once. */
  if (route.view === "owner") {
    return <OwnerConsole onLeave={toPicker} />;
  }
  if (route.view === "picker") {
    return (
      <ShopPicker shops={shops} onPick={pickShop} loading={loadingShops} onOwner={toOwner} />
    );
  }
  if (route.view === "door") {
    return <FrontDoor onPick={pickDoor} shop={route.shop} onChooseShop={chooseShop} />;
  }
  if (route.view === "customer") {
    return <Shopfront onLeave={toDoor} onChooseShop={chooseShop} shop={route.shop} />;
  }
  return <App onLeave={toDoor} onChooseShop={chooseShop} shop={route.shop} />;
}

/* An address naming a shop that does not exist.

   It needs saying out loud. vercel.json rewrites every path to this app so nothing
   can 404, which means a mistyped slug would otherwise show the picker and look as
   though the link were fine — and whoever sent it would never hear that it was
   wrong. */
function NoSuchShop({ slug, shops, onPick }) {
  return (
    <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-white text-xl font-extrabold uppercase tracking-wide">
          No shop called that
        </h1>
        <p className="text-[#9FB3CC] text-sm mt-2 leading-relaxed">
          Nothing here is named <span className="font-mono text-[#67E8F9]">{slug}</span>.
          Check the link, or pick a shop below.
        </p>
        <div className="mt-5 text-left">
          <ShopButtons shops={shops} onPick={onPick} />
        </div>
      </div>
    </div>
  );
}

/* A shop of ours that has a door, a name and a phone number here, and no rows of
   its own in the database yet.

   This is a different message from "no shop called that" and the difference is the
   whole point: one says the link is wrong, this one says the link is right and the
   shop is not open yet. Whoever typed it needs to know which, because only one of
   the two is worth re-checking with the person who sent it.

   It names the step that finishes it, in the words of the thing that has to happen,
   so the owner can forward this screen to whoever runs the database. */
function NotOnTheSystemYet({ shop, shops, onPick }) {
  const others = (shops || []).filter((s) => s.slug !== shop.slug);
  return (
    <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-white text-xl font-extrabold uppercase tracking-wide">
          {shop.name}
        </h1>
        {shop.tagline && (
          <p className="text-[#67E8F9] text-xs mt-1">{shop.tagline}</p>
        )}
        <p className="text-[#9FB3CC] text-sm mt-3 leading-relaxed">
          The link is right — this shop just isn't on the system yet. Its own shelf,
          its staff and its counter still have to be created in the database, and
          until they are there is nothing here to sign in to and no parts list to
          show.
        </p>
        <p className="text-[#5A6472] text-xs mt-3 leading-relaxed">
          Whoever looks after the database finishes it by pasting{" "}
          {shop.setupFile ? (
            <span className="font-mono text-[#9FB3CC]">{shop.setupFile}</span>
          ) : (
            <>this shop&apos;s step in <span className="font-mono text-[#9FB3CC]">supabase/multishop/</span></>
          )}{" "}
          into the SQL editor and pressing run. Nothing in it needs editing, and
          nothing needs deploying afterwards — this page turns into the shop the
          moment the row exists.
        </p>
        {shop.phone && (
          <p className="text-[#9FB3CC] text-sm mt-4">
            <a href={`tel:${shop.phone}`} className="font-semibold text-[#67E8F9]">{shop.phone}</a>
          </p>
        )}
        {others.length > 0 && (
          <div className="mt-6 text-left">
            <p className="text-[10px] uppercase tracking-wide text-[#5A6472] mb-2 text-center">
              The shops that are open
            </p>
            <ShopButtons shops={others} onPick={onPick} />
          </div>
        )}
      </div>
    </div>
  );
}

/* The shop tiles, one list used by both messages above. A shop with no rows yet is
   shown and not openable — a tile that lies about whose shelf you are looking at is
   worse than a tile that says "not yet", and leaving it out altogether is how
   somebody concludes the shop was never built. */
function ShopButtons({ shops, onPick }) {
  return (
    <>
      {shops.map((s) => (
        <button
          key={s.slug}
          onClick={() => onPick(s)}
          disabled={s.ready === false}
          className={`w-full rounded-2xl p-3.5 mb-2 font-bold text-left ${
            s.ready === false
              ? "bg-[#0C1424] ring-1 ring-white/10 text-[#5A6472]"
              : "bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white"
          }`}
        >
          {s.name}
          {s.ready === false && (
            <span className="block text-[11px] font-normal mt-0.5">Not on the system yet</span>
          )}
        </button>
      ))}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
