/* ---------------------------------------------------------
   BYPASS SHOP — the public enquiry list

   No account, no password, no sign-up. Somebody sends a customer the link, the
   customer sees what is actually on the shelf, puts what they need in a basket
   and sends it. It arrives in the shop's Notifications with their name and their
   number, and somebody rings them back.

   HOW IT IS LAID OUT, AND WHY
   A shop window first — pictures of what is in stock — then the sections, and a
   customer chooses one before seeing any parts. Six hundred parts in one scroll
   is a warehouse, not a shop: nobody reads it, and the bumper they came for is
   four hundred rows down. Choosing "Front Bumpers" and then reading twenty is
   how somebody actually shops. Search is the exception and stays on every
   screen, because a customer who knows what they want should never have to
   guess which shelf the shop files it under.

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
  addToCart, setCartQty, removeFromCart, cartTotals, cartFull,
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
   own colour if not, and the two counts a customer actually wants: how many
   different parts, and how many pieces are on the shelf. */
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
          {card.count} {card.count === 1 ? "part" : "parts"} · {card.pieces} on the shelf
        </div>
      </div>
    </button>
  );
}

function Row({ item, section, inCart, onAdd, onStep, highlight = false }) {
  const years = yearText(item);
  return (
    <div className={`bg-[#FFFFFF] rounded-lg p-3 flex gap-3 border ${highlight ? "border-[#2563EB] ring-1 ring-[#2563EB]" : "border-[#DEE3E9]"}`}>
      <Thumb item={item} section={section} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm text-[#1B2430] leading-snug">{item.name || item.code}</div>
        <div className="text-[11px] text-[#5A6472] mt-0.5 flex flex-wrap gap-x-2">
          {section && <span>{section.label}</span>}
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
          <span className="text-[11px] text-[#15926A] font-semibold">
            {item.qty} on the shelf
          </span>
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
              disabled={inCart.qty >= item.qty}
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
  /* "" on the front page, a section key once one is chosen. A search overrides
     both: somebody who has typed knows what they want. */
  const [cat, setCat] = useState("");
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
  const view = searching ? "results" : cat ? "section" : "home";

  /* Room for the posters and then some real parts behind them. The strip
     scrolls, so a card nobody swipes to costs nothing but the picture — and the
     posters are the only pictures being downloaded. */
  const cards = useMemo(() => pickShowcase(items || [], sections, { max: 12 }), [items, sections]);
  const grid = useMemo(() => sectionCards(items || [], sections), [items, sections]);
  const counts = useMemo(() => catalogueCounts(items || []), [items]);

  /* What the screen in front of them lists. On a section, the tapped part first. */
  const listed = useMemo(() => {
    const list = items || [];
    if (searching) {
      return list.filter((it) => matchesQuery(it, query, sectionOf(it.cat)?.label || ""));
    }
    if (!cat) return [];
    const inSection = list.filter((it) => it.cat === cat);
    if (!focus) return inSection;
    return [...inSection].sort((a, b) => (b.code === focus ? 0 : 1) - (a.code === focus ? 0 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sections, cat, query, searching, focus]);

  useEffect(() => { setShown(30); }, [query, cat]);
  /* Back to the top when the screen changes. Landing halfway down a new list is
     disorienting on a phone. */
  useEffect(() => { window.scrollTo({ top: 0 }); }, [cat, searching]);

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

  const openSection = (key) => { setQuery(""); setFocus(""); setCat(key); };
  const backHome = () => { setQuery(""); setFocus(""); setCat(""); };

  /* Tapping something in the shop window. A poster goes wherever it was pointed;
     a part opens its own section with itself at the top, so a customer sees what
     they tapped and everything like it underneath. */
  const pickCard = (c) => {
    if (c.query) { setCat(""); setFocus(""); setQuery(c.query); return; }
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
              Everything here is on the shelf now — {counts.parts.toLocaleString()} different parts,
              {" "}{counts.pieces.toLocaleString()} pieces. Choose a section, add what you need and send it.
              We call you back on the number you give. Nothing is paid for here.
            </p>

            <div className="font-bold text-sm uppercase tracking-wide text-[#5A6472] mb-2">
              What are you looking for?
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
              <ArrowLeft size={15} /> All sections
            </button>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="font-bold text-base">
                {searching ? "Search results" : here?.label || cat}
              </div>
              <div className="text-[11px] text-[#5A6472]">
                {listed.length} {listed.length === 1 ? "part" : "parts"}
              </div>
            </div>

            {listed.length === 0 ? (
              <div className="text-center py-10 px-6">
                <PackageSearch size={30} className="mx-auto text-[#2563EB] mb-2" />
                <div className="font-semibold">Nothing matches that</div>
                <div className="text-xs text-[#5A6472] mt-1">
                  Try the car's model on its own, or call us and describe the part —
                  we have more coming in than is on this list.
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
                <div className="font-bold text-xs uppercase tracking-wide text-[#5A6472] mb-2">Other sections</div>
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
              were given, and staff know their own address. */}
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
                {Number(sent.short) > 0 && (
                  <p className="text-xs text-[#B45309] mt-2">
                    One or more parts had fewer on the shelf than you asked for — we will tell you
                    exactly what we can do when we call.
                  </p>
                )}
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
                        {l.stock > 0 && l.qty > l.stock && (
                          <div className="text-[11px] text-[#B45309]">
                            Only {l.stock} on the shelf — we will confirm the rest.
                          </div>
                        )}
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
