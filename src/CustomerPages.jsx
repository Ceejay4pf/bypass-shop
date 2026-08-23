/* ---------------------------------------------------------
   BYPASS SHOP — the other two pages on the customer's side

   The parts list is one page of three. These are the other two:

     MY ORDERS   what this phone has sent, and the shop's reply to it
     WHAT WE DO  a few pages of what the shop deals in and what it offers

   WHY "MY ORDERS" EXISTS AT ALL
   There is no account on the customer page and there is not going to be one — a
   sign-up between a stranger and a headlight is how a shop loses the stranger.
   The cost of that is the moment after sending a basket: a reference on a screen
   they are about to close, and nothing afterwards. The next thing that happens is
   a phone call that starts "I sent something, I don't remember the number".

   So the references live on the phone that sent them (src/lib/myOrders.js), and
   the shop's answer is fetched one order at a time with the reference AND the
   number it was placed with (public.order_lookup). Two facts, because references
   count upwards and a reference-only lookup would hand out a stranger's name,
   number and shopping list.

   WHAT THE REPLY IS ALLOWED TO CLAIM
   Most of this shelf has no price, so most replies come back with blank lines. A
   page that called that a quotation and totalled it would be showing a figure the
   shop never said. It is only called a quotation when at least one line actually
   has a figure on it; otherwise it says the shop has it and will ring, which is
   what has actually happened. See isQuote() and quoteTotals().

   IF THE DATABASE STEP HAS NOT BEEN RUN, order_lookup does not exist, and the
   checking half of this says so in plain words with the phone number underneath —
   not a Postgres error. The list itself still works, because it is the phone's
   own record and needs nothing from the database.
--------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import {
  Loader2, AlertTriangle, CheckCircle2, Clock, XCircle, RefreshCw, Trash2,
  Phone, Search, Truck, Wrench, Handshake, ChevronLeft, ChevronRight,
  ClipboardList, PackageSearch,
} from "lucide-react";
import * as api from "./lib/api.js";
import { SHOP_INFO } from "./lib/shopInfo.js";
import {
  readOrders, forgetOrder, statusWords, isQuote, quoteTotals, digits,
} from "./lib/myOrders.js";
import { DEALS, SERVICES, HOW_IT_WORKS, AD_PAGES, turn } from "./lib/adverts.js";

const shop = SHOP_INFO.branch;

const money = (n) => `KES ${Number(n || 0).toLocaleString()}`;

function when(at) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ============================================================
   MY ORDERS
   ============================================================ */

const TONE = {
  good: { box: "bg-[#E7F6F0] border-[#15926A] text-[#0F6B4E]", Icon: CheckCircle2 },
  wait: { box: "bg-[#FFF6E5] border-[#B8860B] text-[#8A6508]", Icon: Clock },
  off:  { box: "bg-[#FBEAE8] border-[#DC3B2E] text-[#A32A20]", Icon: XCircle },
};

/* The shop's answer, once it has been fetched. Everything on it comes from
   order_lookup and nothing is inferred. */
function Reply({ reply }) {
  const words = statusWords(reply.status);
  const tone = TONE[words.tone] || TONE.wait;
  const quoted = isQuote(reply);
  const t = quoteTotals(reply);

  return (
    <div className="mt-3">
      <div className={`border rounded-md p-2.5 text-xs flex items-start gap-2 ${tone.box}`}>
        <tone.Icon size={14} className="mt-0.5 shrink-0" />
        <div>
          <span className="font-bold">{words.label}</span> — {words.say}
        </div>
      </div>

      {/* The lines as the shop has them, which may differ from what was sent:
          somebody may have taken a part off it because the shelf was empty. */}
      {Array.isArray(reply.items) && reply.items.length > 0 && (
        <div className="mt-2 border border-[#DEE3E9] rounded-md overflow-hidden bg-[#FFFFFF]">
          {reply.items.map((l, i) => (
            <div
              key={`${l.code || l.name}-${i}`}
              className="flex items-start gap-2 px-2.5 py-2 text-xs border-b border-[#EEF1F5] last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[#1B2430] truncate">{l.name || l.code}</div>
                <div className="text-[#5A6472] text-[11px]">
                  {Number(l.qty) || 1} {Number(l.qty) === 1 ? "piece" : "pieces"}
                  {l.code ? ` · ${l.code}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                {Number(l.price) > 0 ? (
                  <span className="font-bold text-[#1B2430]">{money(Number(l.price) * (Number(l.qty) || 1))}</span>
                ) : (
                  <span className="text-[#5A6472] text-[11px]">Price at the counter</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {quoted ? (
        <div className="mt-2 bg-[#FFFFFF] border border-[#DEE3E9] rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-[#1B2430]">Quoted so far</span>
            <span className="font-bold text-[#2563EB]">{money(t.total)}</span>
          </div>
          {/* Said out loud rather than hidden, because a total that quietly
              leaves out three parts is a number somebody will hold the shop to. */}
          {t.unpriced > 0 && (
            <div className="text-[11px] text-[#5A6472] mt-1">
              {t.unpriced} of {t.lines} {t.lines === 1 ? "line" : "lines"} still to be priced — that
              figure is not the whole bill. Ring the counter for the rest.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-[#5A6472]">
          No prices on it yet. Most parts here are priced at the counter, so this is
          normal — the shop will ring you with the figure.
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onForget }) {
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(null);
  const [note, setNote] = useState("");     // "nothing found" / "not switched on"

  const check = async () => {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const got = await api.lookupCustomerOrder(order.ref, order.phone);
      if (got) setReply(got);
      else {
        setReply(null);
        setNote(
          `Nothing came back for ${order.ref} with that number. If you sent it from a different phone, ` +
          `use the box at the bottom of this page — or ring the shop.`
        );
      }
    } catch (e) {
      setReply(null);
      setNote(
        e?.setup
          ? `Checking replies isn't switched on yet. Your reference is ${order.ref} — ring ${shop.phone} and quote it.`
          : e?.message || "That couldn't be checked just now. Please try again, or ring the shop."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 mb-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-bold text-[#2563EB]">{order.ref}</div>
          <div className="text-[11px] text-[#5A6472] mt-0.5">
            {when(order.at)}
            {order.at ? " · " : ""}
            {order.pieces} {order.pieces === 1 ? "piece" : "pieces"}
            {order.lines?.length ? ` · ${order.lines.length} ${order.lines.length === 1 ? "part" : "parts"}` : ""}
          </div>
        </div>
        <button
          onClick={() => onForget(order.ref)}
          className="text-[#5A6472] hover:text-[#DC3B2E] p-1"
          aria-label={`Remove ${order.ref} from this phone`}
          title="Remove from this phone"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* What was sent, as this phone recorded it — names and counts only. The
          prices belong to the shop's reply, not to this. */}
      {order.lines?.length > 0 && (
        <div className="mt-2 text-xs text-[#5A6472] leading-relaxed">
          {order.lines.map((l, i) => (
            <div key={i} className="truncate">
              {l.qty} × {l.name}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={check}
        disabled={busy}
        className="mt-3 w-full flex items-center justify-center gap-2 bg-[#2563EB] disabled:bg-[#8BA6DC] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide rounded-md px-3 py-2.5"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {reply ? "Check again" : "Check for the shop's reply"}
      </button>

      {note && (
        <div className="mt-2 bg-[#FFF6E5] border border-[#B8860B] text-[#8A6508] rounded-md p-2.5 text-xs flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div>{note}</div>
        </div>
      )}

      {reply && <Reply reply={reply} />}
    </div>
  );
}

/* Somebody on a different phone, or one that has been cleared. The same lookup,
   with the two facts typed in by hand. */
function LookUpByHand() {
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(null);
  const [note, setNote] = useState("");

  const ready = ref.trim().length >= 4 && digits(phone).length >= 9;

  const go = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setNote("");
    setReply(null);
    try {
      const got = await api.lookupCustomerOrder(ref, phone);
      if (got) setReply(got);
      else setNote("Nothing matched that reference and that number. Check both, or ring the shop.");
    } catch (e) {
      setNote(
        e?.setup
          ? `Checking replies isn't switched on yet. Ring ${shop.phone} and quote your reference.`
          : e?.message || "That couldn't be checked just now. Please try again, or ring the shop."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3">
      <div className="font-bold text-sm flex items-center gap-1.5">
        <Search size={14} className="text-[#2563EB]" /> Sent it from another phone?
      </div>
      <p className="text-[11px] text-[#5A6472] mt-1 leading-relaxed">
        Type the reference and the number you gave. Both are needed — a reference on
        its own would let anyone read somebody else&apos;s order.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="ENQ-2026-0001"
          className="bg-[#F3F5F8] border border-[#DEE3E9] rounded-md px-3 py-2.5 text-sm font-mono outline-none focus:border-[#2563EB]"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="0768 553182"
          className="bg-[#F3F5F8] border border-[#DEE3E9] rounded-md px-3 py-2.5 text-sm outline-none focus:border-[#2563EB]"
        />
      </div>
      <button
        onClick={go}
        disabled={busy || !ready}
        className="mt-2.5 w-full flex items-center justify-center gap-2 bg-[#1B2430] disabled:bg-[#8A93A0] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide rounded-md px-3 py-2.5"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        Look it up
      </button>

      {note && (
        <div className="mt-2 bg-[#FFF6E5] border border-[#B8860B] text-[#8A6508] rounded-md p-2.5 text-xs flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div>{note}</div>
        </div>
      )}
      {reply && <Reply reply={reply} />}
    </div>
  );
}

/* `reload` is the reference of the order just sent, if any. It is here because a
   basket can be sent while this page is the one behind the overlay: without it,
   the customer closes the overlay and the list they are looking at is the list
   from before their order. It re-reads the phone rather than remounting, so any
   reply already fetched stays on screen. */
export function MyOrders({ reload = "" }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => { setOrders(readOrders(window.localStorage)); }, [reload]);

  const forget = (ref) => setOrders(forgetOrder(window.localStorage, ref));

  return (
    <div>
      <h2 className="font-bold text-lg flex items-center gap-2">
        <ClipboardList size={18} className="text-[#2563EB]" /> My orders
      </h2>
      <p className="text-xs text-[#5A6472] mt-1 mb-4 leading-relaxed">
        Kept on this phone only — there is no account here. Nothing on this page has
        been paid for; an order is a request for a call.
      </p>

      {orders.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-5 text-center mb-4">
          <PackageSearch size={26} className="mx-auto text-[#5A6472]" />
          <div className="font-semibold text-sm mt-2">Nothing sent from this phone yet</div>
          <p className="text-xs text-[#5A6472] mt-1">
            Add parts to your basket and send them. The reference lands here.
          </p>
        </div>
      ) : (
        orders.map((o) => <OrderCard key={o.ref} order={o} onForget={forget} />)
      )}

      <LookUpByHand />

      <a
        href={`tel:+${shop.phoneIntl}`}
        className="mt-3 w-full flex items-center justify-center gap-2 bg-[#15926A] text-[#F3F5F8] text-xs font-bold uppercase tracking-wide rounded-md px-3 py-2.5"
      >
        <Phone size={13} /> Ring the shop — {shop.phone}
      </a>
    </div>
  );
}

/* ============================================================
   WHAT WE DO — the advert pages
   ============================================================ */

const SERVICE_ICONS = { truck: Truck, wrench: Wrench, search: Search, handshake: Handshake };

function DealsPage({ sections = [], onPickSection }) {
  /* Only sections the shop's own list actually knows about are offered. A key
     that has been renamed in data.js quietly disappears from the poster instead
     of becoming a button that opens an empty shelf. */
  const labelOf = (key) => sections.find((s) => s.key === key)?.label || "";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {DEALS.map((d) => (
        <div key={d.key} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg overflow-hidden">
          <img src={d.image} alt="" className="w-full h-36 object-cover" loading="lazy" />
          <div className="p-3">
            <div className="font-bold text-sm">{d.title}</div>
            <div className="text-xs text-[#5A6472] mt-1 leading-relaxed">{d.line}</div>
            {/* The hint is the counter's own advice. It is the part of an advert
                that saves a wasted trip. */}
            <div className="text-[11px] text-[#8A6508] bg-[#FFF6E5] border border-[#F0DFB8] rounded px-2 py-1.5 mt-2 leading-relaxed">
              {d.hint}
            </div>
            {onPickSection && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {(d.sections || []).map((key) => {
                  const label = labelOf(key);
                  if (!label) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => onPickSection(key)}
                      className="flex items-center gap-1 bg-[#EAF1FE] text-[#2563EB] text-[11px] font-bold rounded-full px-2.5 py-1.5"
                    >
                      {label} <ChevronRight size={12} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ServicesPage() {
  return (
    <div className="space-y-3">
      {SERVICES.map((s) => {
        const Icon = SERVICE_ICONS[s.icon] || Wrench;
        return (
          <div key={s.key} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 flex gap-3">
            <span className="w-10 h-10 rounded-lg bg-[#EAF1FE] text-[#2563EB] flex items-center justify-center shrink-0">
              <Icon size={19} />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm">{s.title}</div>
              <div className="text-xs text-[#2563EB] mt-0.5">{s.line}</div>
              <div className="text-xs text-[#5A6472] mt-1.5 leading-relaxed">{s.detail}</div>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-[#5A6472] leading-relaxed">
        Anything else, ask at the counter. Only what is on this page has been
        promised — if it is not here, ring and find out rather than assume.
      </p>
    </div>
  );
}

function HowPage() {
  return (
    <div>
      <div className="space-y-3">
        {HOW_IT_WORKS.map((h, i) => (
          <div key={h.step} className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-3 flex gap-3">
            <span className="w-8 h-8 rounded-full bg-[#2563EB] text-[#F3F5F8] font-bold text-sm flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm">{h.step}</div>
              <div className="text-xs text-[#5A6472] mt-1 leading-relaxed">{h.line}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 bg-[#EAF1FE] border border-[#BBD1FA] rounded-lg p-3 text-xs text-[#1B2430] leading-relaxed">
        <span className="font-bold">No money changes hands on this page.</span> There is
        nothing to pay online and nobody will ask you for a card or an M-Pesa PIN
        here. Payment happens at the counter, or as arranged on the phone with the
        shop.
      </div>
    </div>
  );
}

export function Adverts({ sections, onPickSection }) {
  const [at, setAt] = useState(0);
  const page = AD_PAGES[at] || AD_PAGES[0];

  const body = useMemo(() => {
    if (page.key === "services") return <ServicesPage />;
    if (page.key === "how") return <HowPage />;
    return <DealsPage sections={sections} onPickSection={onPickSection} />;
  }, [page.key, sections, onPickSection]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setAt(turn(at, -1))}
          className="w-9 h-9 rounded-full bg-[#FFFFFF] border border-[#DEE3E9] flex items-center justify-center text-[#5A6472]"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-center min-w-0">
          <div className="font-bold text-base truncate">{page.title}</div>
          <div className="text-[11px] text-[#5A6472]">
            Page {at + 1} of {AD_PAGES.length}
          </div>
        </div>
        <button
          onClick={() => setAt(turn(at, 1))}
          className="w-9 h-9 rounded-full bg-[#FFFFFF] border border-[#DEE3E9] flex items-center justify-center text-[#5A6472]"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {body}

      {/* Dots as well as arrows: on a phone the arrows say you can turn the page
          and the dots say how many are left. */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {AD_PAGES.map((p, i) => (
          <button
            key={p.key}
            onClick={() => setAt(i)}
            aria-label={p.title}
            className={`h-2 rounded-full transition-all ${i === at ? "w-6 bg-[#2563EB]" : "w-2 bg-[#C6CDD6]"}`}
          />
        ))}
      </div>
    </div>
  );
}
