/* ---------------------------------------------------------
   BYPASS SHOP — the public enquiry list

   No account, no password, no sign-up. Somebody sends a customer the link, the
   customer sees what is actually on the shelf, puts what they need in a basket
   and sends it. It arrives in the shop's Notifications with their name and their
   number, and somebody rings them back.

   HOW IT IS LAID OUT, AND WHY
   A shop window first — pictures of what is in stock — then two ways in, and a
   customer picks one before seeing any parts. Six hundred parts in one scroll is
   a warehouse, not a shop: nobody reads it, and the bumper they came for is four
   hundred rows down.

   The two ways in are the car and the part, because those are the two ways
   somebody arrives: "I have a Premio" or "I need a bumper". They narrow the same
   list and they combine — Toyota, then Wish, then Taillights — and each one can
   be crossed off on its own. Search is the exception and stays on every screen,
   because a customer who knows what they want should never have to guess which
   shelf the shop files it under.

   WHAT IT NEVER SAYS: HOW MANY
   Not one number on this page is a quantity. Every count is a count of different
   parts — what there is to choose between. Everything listed is in stock, because
   the view behind the page only carries what is; that is the whole of what a
   customer is told, and it is what they need. What the shop holds of any one part
   is the shop's business, and the link is handed to strangers. This is not done
   by hiding a figure on the screen: the column is not in the public view, so the
   number never reaches the browser and there is nothing to find in a network tab.
   See supabase/customer_enquiries.sql and src/lib/cart.js.

   WHAT THIS PAGE IS NOT
   It is not a till. It takes no money and it moves no stock — an order here is a
   request for a call, and the sale is still recorded by a person on the real
   screen. Two customers can ask for the same last bumper: that is a phone call,
   and it is much better than a stranger on the internet being able to change
   what the shop believes is on its shelves.

   WHAT IT HAD TO BE BUILT AROUND
   Most of this shelf has no price in the system — the price is given at the
   counter. So "ask for the price" is a first-class thing here, not an error
   state, and the basket total says out loud how many of its lines it could not
   include. A page that showed KES 0 for those, or hid them, would be worse than
   no page.

   It reads one narrow database view and calls one function. It cannot see a
   supplier, a cost, a shelf location or an internal note, because those columns
   are not in the view — see supabase/customer_enquiries.sql.
--------------------------------------------------------- */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, ShoppingCart, Plus, Minus, X, Send, Loader2, AlertTriangle, Phone,
  CheckCircle2, MessageCircle, MapPin, PackageSearch, ChevronRight, ChevronLeft,
  Trash2, ArrowLeft,
} from "lucide-react";
import * as api from "./lib/api.js";
import { isConfigured } from "./lib/supabase.js";
import { DEFAULT_CATEGORIES, mergeCategories, condColor } from "./data.js";
import { SHOP_INFO } from "./lib/shopInfo.js";
import { pickShowcase, sectionCards, catalogueCounts } from "./lib/storefront.js";
import {
  makeCards, modelChips, makeKey, makeLabel, inMake, inModel, browseTitle, OTHER_MODELS,
} from "./lib/browse.js";
import {
  addToCart, setCartQty, removeFromCart, cartTotals, cartFull, MAX_PER_LINE,
  loadCart, saveCart, clearCart, matchesQuery, yearText, priceText,
} from "./lib/cart.js";

const shop = SHOP_INFO.branch;

/* A part with no photo still needs something to look at, and a coloured tile
   with its section's initials reads as deliberate where a grey box reads as
   broken. Two of the shop's 604 parts have a photo, so this is the normal case,
   not the fallback. */
function Thumb({ item, section, size = 64 }) {
  if (item.photo) {
    return (
      <img
        src={item.photo}
        alt={item.name}
        loading="lazy"
        className="rounded-md object-cover bg-[#EEF2F6] shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-md flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: section?.color || "#6B7480", fontSize: size / 3.2 }}
      title={section?.label || ""}
    >
      {(item.cat || "?").slice(0, 3)}
    </div>
  );
}

/* ---- THE SHOP WINDOW ----
   A strip of what is in stock, scrolled sideways. A card is a photograph where
   there is one and a painted panel where there isn't, so the window is never a
   row of broken pictures — see src/lib/storefront.js. */
function Showcase({ cards, onPick }) {
  const rail = useRef(null);
  if (!cards.length) return null;
  const nudge = (by) => rail.current?.scrollBy({ left: by, behavior: "smooth" });

  return (
    <div className="relative -mx-4 mb-5">
      <div
        ref={rail}
        className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}
      >
        {cards.map((c, i) => (
          <button
            key={`${c.kind}-${c.code || c.headline}-${i}`}
            onClick={() => onPick(c)}
            className="snap-start shrink-0 w-[15rem] h-36 rounded-lg overflow-hidden relative text-left active:scale-[0.99]"
            style={{ backgroundColor: c.color }}
          >
            {c.image ? (
              <img src={c.image} alt={c.headline} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            ) : null}
            {/* Dark at the bottom so the words are readable over a photograph as
                well as over a flat colour. */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(27,36,48,0.85) 0%, rgba(27,36,48,0.15) 55%, rgba(27,36,48,0.05) 100%)" }}
            />
            <div className="absolute inset-x-0 bottom-0 p-3 text-[#F3F5F8]">
              <div className="font-bold text-sm leading-snug">{c.headline}</div>
              {c.sub && <div className="text-[11px] text-[#DEE3E9] mt-0.5">{c.sub}</div>}
              {c.kind !== "promo" && (
                <div className="text-[11px] font-bold mt-1">
                  {c.price > 0 ? `KES ${Number(c.price).toLocaleString()}` : "Ask for the price"}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      {/* Arrows for a laptop at the counter. A phone just swipes. */}
      {cards.length > 1 && (
        <>
          <button onClick={() => nudge(-260)} className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 bg-[#FFFFFF] border border-[#DEE3E9] rounded-full p-1.5 shadow" aria-label="Back">
            <ChevronLeft size={16} className="text-[#1B2430]" />
          </button>
          <button onClick={() => nudge(260)} className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 bg-[#FFFFFF] border border-[#DEE3E9] rounded-full p-1.5 shadow" aria-label="Forward">
            <ChevronRight size={16} className="text-[#1B2430]" />
          </button>
        </>
      )}
    </div>
  );
}

/* One section to choose from. Its own photograph if any part in it has one, its
   own colour if not, and the one count a customer is owed: how many different
   parts there are to choose between. Not how many of each — see the note about
   quantities at the top of this file. */
function SectionCard({ card, onOpen }) {
  return (
    <button
      onClick={() => onOpen(card.key)}
      className="relative h-28 rounded-lg overflow-hidden text-left active:scale-[0.99]"
      style={{ backgroundColor: card.color }}
    >
      {card.photo ? (
        <img src={card.photo} alt={card.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : null}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(27,36,48,0.88) 0%, rgba(27,36,48,0.25) 60%, rgba(27,36,48,0.1) 100%)" }}
      />
      <div className="absolute inset-x-0 bottom-0 p-2.5 text-[#F3F5F8]">
        <div className="font-bold text-[13px] leading-tight">{card.label}</div>
        <div className="text-[10px] text-[#DEE3E9] mt-0.5">
          {card.count} different {card.count === 1 ? "part" : "parts"}
        </div>
      </div>
    </button>
  );
}

/* ---- ONE CAR MAKE TO CHOOSE FROM ----
   A customer does not come in wanting "a taillight". They come in wanting a
   taillight for their Premio, and the make is the first half of that. Painted
   panels rather than badges: the colours are this app's, not the car makers' —
   see src/lib/browse.js. */
function MakeCard({ card, active, onPick }) {
  return (
    <button
      onClick={() => onPick(card.key)}
      className={`rounded-lg px-2.5 py-2 text-left active:scale-[0.99] ${active ? "ring-2 ring-[#1B2430]" : ""}`}
      style={{ backgroundColor: card.color }}
    >
      <div className="font-bold text-[13px] leading-tight text-[#F3F5F8]">{card.label}</div>
      <div className="text-[10px] text-[#DEE3E9] mt-0.5">
        {card.count} {card.count === 1 ? "part" : "parts"}
        {card.models > 1 ? ` · ${card.models} models` : ""}
      </div>
    </button>
  );
}

/* A filter that is in force, and the way off it. Three of these can be on at
   once — Toyota, Wish, Taillights — and every one of them has to be removable on
   its own, or the only way back is starting over. */
function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 bg-[#1B2430] text-[#F3F5F8] rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold">
      {label}
      <button onClick={onClear} className="p-0.5 text-[#DEE3E9]" aria-label={`Remove ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

function Row({ item, section, inCart, onAdd, onStep, highlight = false }) {
  const years = yearText(item);
  const car = [makeLabel(item.brand), item.model].filter(Boolean).join(" ").trim();
  return (
    <div className={`bg-[#FFFFFF] rounded-lg p-3 flex gap-3 border ${highlight ? "border-[#2563EB] ring-1 ring-[#2563EB]" : "border-[#DEE3E9]"}`}>
      <Thumb item={item} section={section} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm text-[#1B2430] leading-snug">{item.name || item.code}</div>
        <div className="text-[11px] text-[#5A6472] mt-0.5 flex flex-wrap gap-x-2">
          {/* The car first. It is what somebody is checking, and a part named
              "Taillight Left" tells them nothing without it. */}
          {car && <span className="font-semibold text-[#1B2430]">{car}</span>}
          {section && <span>{car ? "· " : ""}{section.label}</span>}
          {years && <span>· {years}</span>}
          {item.side && <span>· {item.side}</span>}
          {item.color && <span>· {item.color}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {item.condition && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
              style={{ backgroundColor: `${condColor(item.condition)}22`, color: condColor(item.condition) }}
            >
              {item.condition}
            </span>
          )}
          {/* That it is here means it is in stock — the public list only carries
              what is. How many are on the shelf is not shown, and is not in the
              data this page was given to show. */}
          <span className="text-[11px] text-[#15926A] font-semibold">In stock</span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-between shrink-0 gap-2">
        <div className={`text-sm font-bold ${item.price > 0 ? "text-[#1B2430]" : "text-[#5A6472] text-[11px] font-semibold text-right"}`}>
          {priceText(item.price)}
        </div>
        {inCart ? (
          /* Once it is in the basket the same spot becomes the stepper, so
             changing your mind never means going to look for the basket. */
          <div className="flex items-center gap-1.5 border border-[#2563EB] rounded-md">
            <button onClick={() => onStep(item.code, inCart.qty - 1)} className="px-2 py-1 text-[#2563EB]" aria-label="One fewer">
              <Minus size={13} />
            </button>
            <span className="text-sm font-bold text-[#1B2430] min-w-[1.2rem] text-center">{inCart.qty}</span>
            <button
              onClick={() => onStep(item.code, inCart.qty + 1)}
              /* Stops at the most one line may ask for, not at what is on the
                 shelf. A basket cannot know that any more, and the shop says so
                 on the phone if somebody asks for more than it has. */
              disabled={inCart.qty >= MAX_PER_LINE}
              className="px-2 py-1 text-[#2563EB] disabled:opacity-30"
              aria-label="One more"
            >
              <Plus size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onAdd(item)}
            className="flex items-center gap-1 bg-[#2563EB] text-[#F3F5F8] text-[11px] font-bold uppercase tracking-wide rounded-md px-2.5 py-1.5 active:scale-[0.98]"
          >
            <Plus size={13} /> Add
          </button>
        )}
      </div>
    </div>
  );
}

export default function Shopfront() {
  const [items, setItems] = useState(null);      // null = still loading
  const [sections, setSections] = useState(DEFAULT_CATEGORIES);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  /* The three ways of narrowing the list, and they combine: a make, a model
     within it, and a section. All "" on the front page. A search overrides all
     three — somebody who has typed knows what they want. */
  const [cat, setCat] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  /* The makes are shown a handful at a time. Fourteen tiles is a wall, and the
     ones after the first few hold one or two parts each. */
  const [allMakes, setAllMakes] = useState(false);
  /* The part tapped in the shop window, shown first in its section so the thing
     they pointed at is the thing they get. */
  const [focus, setFocus] = useState("");
  const [cart, setCart] = useState([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);        // the reference, once it lands
  /* How many rows are drawn. Growing as they scroll rather than making everybody
     wait for parts they will never look at. */
  const [shown, setShown] = useState(30);
  /* The photographs, which arrive AFTER the list and not with it — keyed by part
     code. The list itself only says which parts have one (`hasPhoto`), because
     photographs here are whatever came off a phone and sending 604 of them in
     the first request left this page blank for minutes on mobile data. Held
     beside the parts rather than inside them so a batch landing doesn't mean
     rewriting the shelf. */
  const [photos, setPhotos] = useState({});
  /* Codes already asked for, so scrolling back up doesn't ask twice. A ref, not
     state: nothing on the screen depends on it. */
  const askedFor = useRef(null);
  if (!askedFor.current) askedFor.current = new Set();

  useEffect(() => { setCart(loadCart()); }, []);

  useEffect(() => {
    let alive = true;
    if (!isConfigured) {
      setErr("This link isn't set up yet. Please call the shop.");
      setItems([]);
      return;
    }
    (async () => {
      try {
        const [list, extra] = await Promise.all([
          api.fetchCatalogue(),
          api.fetchCatalogueSections(),
        ]);
        if (!alive) return;
        setItems(list);
        setSections(mergeCategories(extra, DEFAULT_CATEGORIES));
        setErr("");
      } catch (e) {
        if (!alive) return;
        /* Named plainly, with the phone number underneath. A customer who
           cannot see the list must still be able to reach the shop — that is
           the whole job of this page. */
        setErr(e?.message || "The list didn't load. Please check your connection, or call the shop.");
        setItems([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const sectionOf = (key) => sections.find((s) => s.key === key);
  const searching = Boolean(query.trim());
  const filtered = Boolean(cat || make || model);
  const view = searching ? "results" : filtered ? "section" : "home";

  /* The shelf as the screen should see it: the parts, with any photograph that
     has landed since put onto its part. Everything below works off this, so a
     photograph arriving simply redraws the card it belongs to. */
  const shelf = useMemo(() => {
    const list = items || [];
    if (!list.length || !Object.keys(photos).length) return list;
    return list.map((it) => (photos[it.code] ? { ...it, photo: photos[it.code] } : it));
  }, [items, photos]);

  /* Room for the posters and then some real parts behind them. The strip
     scrolls, so a card nobody swipes to costs nothing but the picture — and the
     posters are the only pictures being downloaded. */
  const cards = useMemo(() => pickShowcase(shelf, sections, { max: 12 }), [shelf, sections]);
  const counts = useMemo(() => catalogueCounts(items || []), [items]);

  /* The cars the shop has parts for, biggest first, and the models under
     whichever one has been chosen. */
  const makes = useMemo(() => makeCards(items || []), [items]);
  const models = useMemo(() => (make ? modelChips(items || [], make) : []), [items, make]);

  /* Everything for the chosen car — the whole shelf when no car is chosen. The
     sections are then counted inside it, so "Doors · 4" under Toyota Premio means
     four Premio doors and not four doors in the building. */
  const carList = useMemo(
    () => shelf.filter((it) => inMake(it, make) && inModel(it, model)),
    [shelf, make, model],
  );
  const grid = useMemo(() => sectionCards(carList, sections), [carList, sections]);

  /* What the screen in front of them lists. On a section, the tapped part first. */
  const listed = useMemo(() => {
    const list = shelf;
    if (searching) {
      return list.filter((it) => matchesQuery(it, query, sectionOf(it.cat)?.label || ""));
    }
    if (!filtered) return [];
    const narrowed = cat ? carList.filter((it) => it.cat === cat) : carList;
    if (!focus) return narrowed;
    return [...narrowed].sort((a, b) => (b.code === focus ? 0 : 1) - (a.code === focus ? 0 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf, carList, sections, cat, query, searching, filtered, focus]);

  /* The parts on the screen right now that have a photograph still to come: the
     cards in the window, one part per section tile, and the rows actually drawn.
     Nothing else — a photograph nobody is looking at is somebody's bundle spent
     for nothing. */
  const wanted = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (code) => { if (code && !seen.has(code)) { seen.add(code); out.push(code); } };
    for (const c of cards) if (c.kind !== "promo") add(c.code);
    /* A section tile borrows the photograph of the first part in it that has one
       — same first part this picks, because the order is the catalogue's. */
    const done = new Set();
    for (const it of carList) {
      if (!it.hasPhoto || done.has(it.cat)) continue;
      done.add(it.cat);
      add(it.code);
    }
    for (const it of listed.slice(0, shown)) if (it.hasPhoto) add(it.code);
    return out;
  }, [cards, carList, listed, shown]);

  /* Fetching them, in batches, once the screen is already drawn.

     Failures are silent by design: a card without its photograph shows its
     coloured tile and everything else on the page still works, so there is
     nothing here worth interrupting a customer with. */
  useEffect(() => {
    const fresh = wanted.filter((c) => !askedFor.current.has(c));
    if (!fresh.length) return;
    fresh.forEach((c) => askedFor.current.add(c));
    let alive = true;
    (async () => {
      /* One batch at a time. A long scroll can want a hundred at once, and
         firing them all together is how a phone's connection gets buried. */
      for (let i = 0; i < fresh.length; i += 40) {
        const got = await api.fetchCataloguePhotos(fresh.slice(i, i + 40));
        if (!alive) return;
        if (Object.keys(got).length) setPhotos((prev) => ({ ...prev, ...got }));
      }
    })();
    return () => { alive = false; };
  }, [wanted]);

  useEffect(() => { setShown(30); }, [query, cat, make, model]);
  /* Back to the top when the screen changes. Landing halfway down a new list is
     disorienting on a phone. */
  useEffect(() => { window.scrollTo({ top: 0 }); }, [cat, make, model, searching]);

  const totals = cartTotals(cart);
  const lineFor = (code) => cart.find((l) => l.code === code) || null;

  const change = (next) => setCart(saveCart(next));
  const add = (item) => {
    if (cartFull(cart) && !lineFor(item.code)) {
      setErr("That is 40 different parts already — please send this basket, then start another.");
      return;
    }
    change(addToCart(cart, item, 1));
  };
  const step = (code, qty) => change(setCartQty(cart, code, qty));
  const drop = (code) => change(removeFromCart(cart, code));

  /* Choosing narrows what is already chosen rather than replacing it: a customer
     on Toyota who taps Doors wants Toyota doors. Only a search clears the lot,
     because a search is a fresh question. */
  const openSection = (key) => { setQuery(""); setFocus(""); setCat(key); };
  const openMake = (key) => {
    setQuery(""); setFocus("");
    /* Tapping the make you are already in backs out of it, which is what the
       highlighted tile looks like it should do. */
    if (makeKey(key) === makeKey(make)) { setMake(""); setModel(""); return; }
    setMake(key); setModel("");
  };
  const openModel = (key) => { setQuery(""); setFocus(""); setModel(model === key ? "" : key); };
  const backHome = () => {
    setQuery(""); setFocus(""); setCat(""); setMake(""); setModel("");
  };

  /* Tapping something in the shop window. A poster goes wherever it was pointed;
     a part opens its own section with itself at the top, so a customer sees what
     they tapped and everything like it underneath. */
  const pickCard = (c) => {
    if (c.query) { setCat(""); setMake(""); setModel(""); setFocus(""); setQuery(c.query); return; }
    if (c.code) { setQuery(""); setFocus(c.code); setCat(c.cat); return; }
    if (c.cat) openSection(c.cat);
  };

  const send = async () => {
    if (sending) return;
    setSending(true);
    setErr("");
    try {
      const res = await api.placeCustomerOrder({ customer: name, phone, note, items: cart });
      setSent(res);
      setCart(clearCart());
      setNote("");
    } catch (e) {
      setErr(e?.message || "That didn't send. Please try again, or call the shop.");
    } finally {
      setSending(false);
    }
  };

  const waLink = `https://wa.me/${shop.phoneIntl}`;
  const telLink = `tel:+${shop.phoneIntl}`;
  const here = sectionOf(cat);

  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#1B2430]">
      {/* ---- who this is, and how to reach them without the page ---- */}
      <header className="bg-[#1B2430] text-[#F3F5F8]">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <button onClick={backHome} className="text-left">
            <div className="font-bold text-lg leading-tight">{shop.name}</div>
            <div className="text-xs text-[#9BB7F0] mt-0.5">{shop.tagline}</div>
          </button>
          <div className="text-[11px] text-[#DEE3E9] mt-1.5 flex items-center gap-1.5">
            <MapPin size={12} /> {shop.location}
          </div>
          <div className="flex gap-2 mt-3">
            <a href={telLink} className="flex items-center gap-1.5 bg-[#2563EB] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide rounded-md px-3 py-2">
              <Phone size={13} /> Call the shop
            </a>
            <a href={waLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-[#15926A] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide rounded-md px-3 py-2">
              <MessageCircle size={13} /> WhatsApp
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4 pb-28">
        {/* ---- search, on every screen ---- */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — premio bumper, wish mirror, harrier headlight…"
            className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg pl-9 pr-9 py-2.5 text-sm outline-none focus:border-[#2563EB]"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6472]" aria-label="Clear">
              <X size={15} />
            </button>
          )}
        </div>

        {err && (
          <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-3 flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              {err}
              <div className="mt-1 text-[11px]">Or call {shop.phone}.</div>
            </div>
          </div>
        )}

        {items === null ? (
          <div className="flex items-center gap-2 text-[#5A6472] text-sm py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading what is on the shelf…
          </div>
        ) : view === "home" ? (
          /* ================= THE FRONT PAGE ================= */
          <>
            <Showcase cards={cards} onPick={pickCard} />

            <p className="text-xs text-[#5A6472] mb-4">
              Everything on this page is in stock — {counts.parts.toLocaleString()} different parts
              across {counts.sections} {counts.sections === 1 ? "section" : "sections"}. Start with your
              car or with the part you need, add it and send it. We call you back on the number you
              give. Nothing is paid for here.
            </p>

            {/* ---- WHICH CAR ---- */}
            {makes.length > 0 && (
              <div className="mb-5">
                <div className="font-bold text-sm uppercase tracking-wide text-[#5A6472] mb-2">
                  Which car?
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {(allMakes ? makes : makes.slice(0, 8)).map((m) => (
                    <MakeCard key={m.key} card={m} active={makeKey(make) === m.key} onPick={openMake} />
                  ))}
                </div>
                {makes.length > 8 && (
                  <button
                    onClick={() => setAllMakes((v) => !v)}
                    className="mt-2 text-xs font-bold uppercase tracking-wide text-[#2563EB]"
                  >
                    {allMakes ? "Fewer makes" : `All ${makes.length} makes`}
                  </button>
                )}
              </div>
            )}

            <div className="font-bold text-sm uppercase tracking-wide text-[#5A6472] mb-2">
              Or which part?
            </div>
            {grid.length === 0 ? (
              <div className="text-center py-8 px-6">
                <PackageSearch size={30} className="mx-auto text-[#2563EB] mb-2" />
                <div className="font-semibold">The list is empty just now</div>
                <div className="text-xs text-[#5A6472] mt-1">
                  Please call the shop — there is plenty we can find for you.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {grid.map((c) => <SectionCard key={c.key} card={c} onOpen={openSection} />)}
              </div>
            )}
          </>
        ) : (
          /* ================= A SECTION, OR A SEARCH ================= */
          <>
            <button onClick={backHome} className="flex items-center gap-1.5 text-[#2563EB] text-sm font-semibold mb-3">
              <ArrowLeft size={15} /> Start again
            </button>

            {/* ---- what is being asked for, and the way off each part of it ----
                Three narrowings can be in force at once. Showing them as words
                the customer can cross off is the difference between a list they
                are steering and a list that has decided things for them. */}
            {!searching && filtered && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {make && (
                  <FilterChip
                    label={makeLabel(make)}
                    onClear={() => { setMake(""); setModel(""); }}
                  />
                )}
                {model && <FilterChip label={browseTitle({ model })} onClear={() => setModel("")} />}
                {cat && <FilterChip label={here?.label || cat} onClear={() => setCat("")} />}
              </div>
            )}

            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="font-bold text-base">
                {searching
                  ? "Search results"
                  : browseTitle({ make, model, sectionLabel: here?.label || cat }) || "Everything in stock"}
              </div>
              <div className="text-[11px] text-[#5A6472]">
                {listed.length} {listed.length === 1 ? "part" : "parts"}
              </div>
            </div>

            {/* ---- the models under this make ----
                An X-Trail button covers the NT30s, the NT31s and the NT32s; a
                chassis-code button is there because that is how a used Subaru
                gets asked for. See src/lib/browse.js. */}
            {!searching && make && models.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 mb-2">
                {models.map((m) => {
                  const on = model === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => openModel(m.key)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border ${
                        on
                          ? "bg-[#2563EB] border-[#2563EB] text-[#F3F5F8]"
                          : "bg-[#FFFFFF] border-[#DEE3E9] text-[#5A6472]"
                      }`}
                    >
                      {m.label} · {m.count}
                    </button>
                  );
                })}
              </div>
            )}

            {listed.length === 0 ? (
              <div className="text-center py-10 px-6">
                <PackageSearch size={30} className="mx-auto text-[#2563EB] mb-2" />
                <div className="font-semibold">Nothing matches that</div>
                <div className="text-xs text-[#5A6472] mt-1">
                  {filtered && !searching
                    ? "That car and that section have nothing in common on the shelf just now. Cross one of them off above, or ask us — we have more coming in than is on this list."
                    : "Try the car's model on its own, or call us and describe the part — we have more coming in than is on this list."}
                </div>
                <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 bg-[#15926A] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide rounded-md px-3 py-2">
                  <MessageCircle size={13} /> Ask on WhatsApp
                </a>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {listed.slice(0, shown).map((it) => (
                    <Row
                      key={it.code}
                      item={it}
                      section={sectionOf(it.cat)}
                      inCart={lineFor(it.code)}
                      onAdd={add}
                      onStep={step}
                      highlight={it.code === focus}
                    />
                  ))}
                </div>
                {listed.length > shown && (
                  <button
                    onClick={() => setShown((s) => s + 40)}
                    className="mt-3 w-full border border-[#DEE3E9] bg-[#FFFFFF] rounded-lg py-2.5 text-xs font-bold uppercase tracking-wide text-[#5A6472]"
                  >
                    Show more — {listed.length - shown} left
                  </button>
                )}
              </>
            )}

            {/* Somewhere to go next rather than a dead end at the bottom of a
                section. */}
            {!searching && grid.length > 1 && (
              <div className="mt-6">
                <div className="font-bold text-xs uppercase tracking-wide text-[#5A6472] mb-2">
                  {cat ? "Other sections" : make ? "Narrow it down" : "Other sections"}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4">
                  {grid.filter((c) => c.key !== cat).map((c) => (
                    <button
                      key={c.key}
                      onClick={() => openSection(c.key)}
                      className="shrink-0 bg-[#FFFFFF] border border-[#DEE3E9] rounded-full px-3 py-1.5 text-xs font-semibold text-[#5A6472]"
                    >
                      {c.label} · {c.count}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-8 pt-4 border-t border-[#DEE3E9] text-[11px] text-[#5A6472] leading-relaxed">
          <div className="font-semibold text-[#1B2430]">{shop.name}</div>
          <div>{shop.location} · {shop.phone}</div>
          <div className="mt-1">We stock parts for {shop.makes}.</div>
          {/* No link to the shop's own system from here, deliberately. This page
              is handed to strangers; the sign-in screen is not part of what they
              were given, and staff know their own address.

              That holds even now the front door asks which you are: a staff phone
              that answered "customer" by mistake is not stuck, because /system
              beats a remembered answer. See frontDoor in src/lib/publicRoute.js. */}
        </div>
      </div>

      {/* ---- the basket, always reachable ---- */}
      {cart.length > 0 && !basketOpen && !sent && (
        <button
          onClick={() => setBasketOpen(true)}
          className="fixed bottom-0 left-0 right-0 bg-[#2563EB] text-[#F3F5F8] px-4 py-3.5 flex items-center gap-3 shadow-lg"
        >
          <ShoppingCart size={18} />
          <span className="font-bold text-sm">
            {totals.lines} {totals.lines === 1 ? "part" : "parts"} · {totals.pieces} {totals.pieces === 1 ? "piece" : "pieces"}
          </span>
          <span className="ml-auto font-bold text-sm flex items-center gap-1">
            {totals.total > 0 ? `KES ${totals.total.toLocaleString()}` : "Send for a price"}
            <ChevronRight size={16} />
          </span>
        </button>
      )}

      {(basketOpen || sent) && (
        <div className="fixed inset-0 z-50 bg-[#1B2430]/60 flex items-end sm:items-center sm:justify-center">
          <div className="bg-[#F3F5F8] w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[92vh] overflow-y-auto">
            {sent ? (
              /* ---- it landed. Say what happens next, in the shop's own words ---- */
              <div className="p-5 text-center">
                <CheckCircle2 size={34} className="mx-auto text-[#15926A]" />
                <div className="font-bold text-lg mt-2">Sent to the shop</div>
                <div className="font-mono text-sm text-[#2563EB] mt-1">{sent.ref}</div>
                <p className="text-sm text-[#5A6472] mt-3 leading-relaxed">
                  It is on the shop's screen now, with your name and number. Somebody will call you
                  to confirm the parts{sent.total > 0 ? " and the price" : " and give you the price"}.
                </p>
                {/* The shop's copy of this order records where it asked for more
                    than there is, and whoever rings says so. It is not printed
                    back to the customer here: "there were fewer than that" is a
                    fact about the shop's shelf, and this page does not hand those
                    out — see src/lib/cart.js. */}
                <p className="text-xs text-[#5A6472] mt-2">
                  How many of each we can supply is confirmed on that call.
                </p>
                <p className="text-xs text-[#5A6472] mt-3">
                  Keep {sent.ref} to hand — quoting it saves explaining the whole order again.
                </p>
                <div className="flex flex-col gap-2 mt-4">
                  <a href={telLink} className="flex items-center justify-center gap-1.5 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide text-xs rounded-md py-2.5">
                    <Phone size={14} /> Call the shop now
                  </a>
                  <button
                    onClick={() => { setSent(null); setBasketOpen(false); }}
                    className="border border-[#DEE3E9] bg-[#FFFFFF] rounded-md py-2.5 text-xs font-bold uppercase tracking-wide text-[#5A6472]"
                  >
                    Back to the list
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart size={16} className="text-[#2563EB]" />
                  <span className="font-bold uppercase tracking-wide text-xs">Your basket</span>
                  <button onClick={() => setBasketOpen(false)} className="ml-auto text-[#5A6472]" aria-label="Close">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-2">
                  {cart.map((l) => (
                    <div key={l.code} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-2.5 flex gap-2.5 items-center">
                      <Thumb item={l} section={null} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold leading-snug">{l.name}</div>
                        <div className="text-[11px] text-[#5A6472]">{priceText(l.price)}</div>
                        {/* No "only 2 on the shelf" line. A basket is not told the
                            shop's counts, so it cannot know — and the shop reads
                            what was asked for and says on the phone what it can
                            actually supply. */}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => step(l.code, l.qty - 1)} className="border border-[#DEE3E9] rounded p-1 text-[#5A6472]" aria-label="One fewer">
                          <Minus size={13} />
                        </button>
                        <span className="text-sm font-bold min-w-[1.4rem] text-center">{l.qty}</span>
                        <button onClick={() => step(l.code, l.qty + 1)} className="border border-[#DEE3E9] rounded p-1 text-[#5A6472]" aria-label="One more">
                          <Plus size={13} />
                        </button>
                        <button onClick={() => drop(l.code)} className="ml-1 text-[#5A6472]" aria-label="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ---- the total, and what it cannot include ---- */}
                <div className="mt-3 bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#5A6472]">{totals.pieces} {totals.pieces === 1 ? "piece" : "pieces"}</span>
                    <span className="font-bold">{totals.total > 0 ? `KES ${totals.total.toLocaleString()}` : "—"}</span>
                  </div>
                  {totals.quoted > 0 && (
                    <div className="text-[11px] text-[#B45309] mt-1.5">
                      {totals.quoted === totals.lines
                        ? "None of these have a price on the list — we price them at the counter and will tell you when we call."
                        : `${totals.quoted} of these ${totals.quoted === 1 ? "has no price" : "have no prices"} on the list yet, so the figure above does not include ${totals.quoted === 1 ? "it" : "them"}.`}
                    </div>
                  )}
                </div>

                {/* ---- who to call back ---- */}
                <div className="mt-3 space-y-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2563EB]"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="Phone number we should call"
                    className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2563EB]"
                  />
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Anything else — the car, the year, when you need it (optional)"
                    className="w-full bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] resize-none"
                  />
                </div>

                {err && (
                  <div className="mt-2 text-xs text-[#DC3B2E] flex gap-1.5">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span>{err}</span>
                  </div>
                )}

                <button
                  onClick={send}
                  disabled={sending || !cart.length}
                  className="mt-3 w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-lg py-3 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {sending ? "Sending…" : "Send to the shop"}
                </button>
                <p className="text-[11px] text-[#5A6472] mt-2 text-center">
                  No payment here. We call you back to confirm everything first.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
