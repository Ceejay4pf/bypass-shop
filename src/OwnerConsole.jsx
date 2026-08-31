import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, ArrowLeft, ArrowRight, Search, Store, Scale, Users, LogOut,
  MessageSquare, MapPin, AlertTriangle, Loader2, RefreshCw, Check, X, Ban,
  DoorOpen, Package,
} from "lucide-react";
import * as owner from "./lib/ownerApi.js";
import { answerAbout } from "./lib/askStock.js";
import { readQuestion, buildReport, readingOf, kindLabel } from "./lib/ownerReport.js";
import { CAPABILITIES } from "./lib/roles.js";

/* ---------------------------------------------------------
   THE OWNER'S CONSOLE — one screen above all the shops

   Reached from the shops list, before any shop is chosen, because it does not belong
   to a shop. Signed into with a password that opens nothing else: the account behind
   it has no membership of Jaspare, Sure Fit, Jeyden or Quick Jet, so if it were ever
   typed into a shop's own sign-in it would be turned away. See the header of
   supabase/owner_console.sql for why it was built that way round.

   FOUR THINGS, AND THEY WERE ASKED FOR IN THESE WORDS:

     Ask        "you can ask it a certain part is available and it replies as a
                 message and tells you where it is"
     Shops      "what is available in what quantity in the inventory, all shops"
     Compare    "compares the stocks and matches what is there in this shop and is
                 not available in the other shop"
     Access     "this is where all the settings and operations are controlled, for
                 handling the system and giving access in different shops"

   IT IS DARK AND IT LOOKS NOTHING LIKE A SHOP. Not decoration. Every shop screen
   shows one shop's stock and this one shows all of them, and the two must never be
   confused for one another at a glance — the whole system is built on knowing which
   shop you are looking at. A different colour is the cheapest possible reminder that
   the usual rule is suspended here.

   NOTHING HERE WRITES TO STOCK. It can read every part at every shop and it can
   change who is allowed to sign in where. It cannot add, sell, adjust or delete a
   single part — that has to happen at the shop, by somebody standing in it, whose
   name goes on it.
--------------------------------------------------------- */

const card = "rounded-2xl bg-[#0C1424] ring-1 ring-white/10";
const box =
  "w-full bg-[#0A1120] border border-white/15 rounded-xl px-3 py-2.5 text-[#E8EEF7] placeholder-[#5A6E88] outline-none focus:border-[#22D3EE] transition-colors";
const money = (n) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
const when = (ts) => {
  if (!ts) return "never";
  const d = new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString();
};

/* The back button, one piece, used at the top of every section. The owner asked for
   back buttons in the necessary places; the necessary places turn out to be "every
   screen that is not the first one", so it is easier to have one of these than to
   decide each time. */
function Back({ onClick, children = "Back" }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#7DD3FC] hover:text-[#BAE6FD] mb-3"
    >
      <ArrowLeft size={16} />
      {children}
    </button>
  );
}

function Title({ icon: Icon, children, sub }) {
  return (
    <div className="flex items-start gap-2.5 mb-4">
      <span className="w-9 h-9 rounded-lg bg-[#16233A] ring-1 ring-white/10 flex items-center justify-center shrink-0 text-[#67E8F9]">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <h2 className="text-white font-extrabold text-lg leading-tight">{children}</h2>
        {sub ? <p className="text-[#8298B2] text-[12px] mt-0.5 leading-snug">{sub}</p> : null}
      </div>
    </div>
  );
}

function Waiting({ what = "Loading" }) {
  return (
    <div className="flex items-center gap-2 text-[#8298B2] text-[13px] py-8 justify-center">
      <Loader2 size={16} className="animate-spin" />
      {what}…
    </div>
  );
}

function Trouble({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="rounded-xl bg-[#2A1520] ring-1 ring-[#F87171]/30 p-3.5 mb-3">
      <div className="flex items-start gap-2 text-[#FCA5A5] text-[13px]">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-bold">That didn&apos;t work.</div>
          <div className="text-[#E7B3B3] mt-0.5 break-words">{error}</div>
        </div>
      </div>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#3A1C28] ring-1 ring-white/10 px-3 py-1.5 text-[12px] font-bold text-[#FECACA]"
        >
          <RefreshCw size={13} /> Try again
        </button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------
   THE DOOR
--------------------------------------------------------- */
function SignIn({ onIn, onLeave }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await owner.signInOwner(name, password);
      onIn(user);
    } catch (err) {
      setError(err?.message || "That didn't work.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${card} p-5`}>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-10 h-10 rounded-xl bg-[#16233A] ring-1 ring-white/10 flex items-center justify-center text-[#67E8F9]">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h1 className="text-white font-extrabold text-lg leading-tight">Owner&apos;s console</h1>
          <p className="text-[#8298B2] text-[12px]">All the shops at once. Not one of them.</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <input
          className={box}
          placeholder="Name"
          autoComplete="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={box}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error ? (
        <p className="text-[#FCA5A5] text-[12.5px] mt-3 leading-snug">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !name.trim() || !password}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#0891B2] to-[#2563EB] text-white font-extrabold py-3 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
        {busy ? "Checking…" : "Open the console"}
      </button>

      {/* Said before the password box rather than after, because afterwards is too
          late. One browser holds one session: signing in here replaces whoever was
          signed in on this device, and if that is the counter phone it takes their
          half-finished sale with it. */}
      <p className="text-[#8298B2] text-[11.5px] mt-4 leading-relaxed">
        This signs out whoever is using this phone or computer. On a shop&apos;s own
        counter phone, finish the sale first.
      </p>

      <button
        type="button"
        onClick={onLeave}
        className="mt-3 w-full text-center text-[12.5px] font-bold text-[#7DD3FC]"
      >
        Back to the shops
      </button>
    </form>
  );
}

/* ---------------------------------------------------------
   ASK — a question in words, an answer in words

   The owner's "it replies as a message". So the answer is a sentence, and the parts
   are underneath it as the evidence for the sentence. Not a table with a row count,
   which is what a search normally gives back and which does not answer "do we have
   one".

   IT ANSWERS FIVE DIFFERENT QUESTIONS AND SAYS WHICH ONE IT HEARD. One part ("is
   there a premio bumper"), what one shop is missing, what only one shop has, the
   fullest shelves, and everything for a given car. Which of the five was asked is
   read off the wording in ownerReport.js — and then printed on the screen above a row
   of buttons, because a machine that guesses at English and does not show its guess
   is a machine you cannot correct. Reading it wrong costs one tap.
--------------------------------------------------------- */
function Ask({ onBack, shops, kinds, loadKinds }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [read, setRead] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState(null);
  const [focus, setFocus] = useState("");

  useEffect(() => {
    if (!focus && shops.length) setFocus(shops[0].slug);
  }, [focus, shops]);

  const run = async (question, force = "", withShop = "") => {
    const text = String(question ?? q);
    const home = withShop || focus;
    setBusy(true);
    setError("");
    try {
      const heard = readQuestion(text, shops, home);
      if (force) heard.intent = force;
      /* A forced intent may need a shop the question never named — "only here" with
         no shop in it is not a question yet. The one on screen is the answer, and the
         line under the box says which it used. */
      if (!heard.shop && (heard.intent === "missing" || heard.intent === "only")) {
        heard.shop = home;
      }
      setRead(heard);
      setAsked(text);

      if (heard.intent === "find") {
        const { rows: found } = await owner.findPartEverywhere(text);
        setRows(found);
        setReport(null);
        setReply(answerAbout(text, found, shops.length));
      } else {
        /* The reports are arithmetic on one list of part kinds, fetched once and
           then reused for every question after it — which is why the second report
           is instant and why asking again costs nothing. */
        const list = kinds.length ? kinds : await loadKinds();
        if (!list) throw new Error("Couldn't read the stock at every shop. Try again.");
        setRows([]);
        setReply(null);
        setReport(buildReport(heard, list, shops));
      }
    } catch (err) {
      setError(err?.message || "Couldn't reach the shops.");
      setRows([]);
      setReply(null);
      setReport(null);
    } finally {
      setBusy(false);
    }
  };

  /* One example of each of the five, so the shapes that work are visible rather than
     something to be discovered. Tapping one asks it. */
  const examples = [
    "do we have a rear bumper for a premio?",
    "what parts of a premio are available in all shops?",
    "what parts are plenty?",
    "which parts does quick jet not have that jaspare has?",
    "what parts only jeyden has?",
  ];

  const SWITCH = [
    { id: "find", label: "Find one part" },
    { id: "model", label: "Everything for it" },
    { id: "plenty", label: "Fullest shelves" },
    { id: "missing", label: "What's missing" },
    { id: "only", label: "What's only here" },
  ];

  const needsShop = read && (read.intent === "missing" || read.intent === "only");

  return (
    <div>
      <Back onClick={onBack} />
      <Title icon={MessageSquare} sub="Ask in words. It looks in every shop and answers in a sentence.">
        Ask about the stock
      </Title>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className={`${card} p-3.5 mb-3`}
      >
        <div className="flex gap-2">
          <input
            className={box}
            placeholder="Is there a rear bumper for a Premio?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || !q.trim()}
            className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#2563EB] text-white font-extrabold px-4 disabled:opacity-40 shrink-0"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
          </button>
        </div>

        {!asked ? (
          <div className="mt-3 flex flex-col gap-1.5">
            {examples.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => {
                  setQ(x);
                  run(x);
                }}
                className="text-left rounded-lg bg-[#16233A] ring-1 ring-white/10 px-3 py-2 text-[11.5px] text-[#9FB3CC]"
              >
                {x}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {/* WHAT IT UNDERSTOOD, and how to change it. Shown after the first question and
          not before, because there is nothing to correct yet. */}
      {read ? (
        <div className={`${card} p-3 mb-3`}>
          <p className="text-[#9FB3CC] text-[12px] leading-snug">
            <span className="text-[#5A6E88]">Reading that as:</span> {readingOf(read, shops)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SWITCH.map((s) => (
              <button
                key={s.id}
                onClick={() => run(asked, s.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                  read.intent === s.id
                    ? "bg-[#0891B2] text-white ring-white/20"
                    : "bg-[#16233A] text-[#7A8CA3] ring-white/10"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {needsShop ? (
            <div className="mt-2 pt-2 border-t border-white/10">
              <div className="text-[#5A6E88] text-[10.5px] font-bold uppercase tracking-wider mb-1.5">
                About which shop
              </div>
              <div className="flex flex-wrap gap-1.5">
                {shops.map((s) => (
                  <button
                    key={s.slug}
                    onClick={() => {
                      setFocus(s.slug);
                      run(asked, read.intent, s.slug);
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                      read.shop === s.slug
                        ? "bg-[#2E1065] text-[#DDD6FE] ring-[#A78BFA]/30"
                        : "bg-[#16233A] text-[#7A8CA3] ring-white/10"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Trouble error={error} onRetry={() => run(asked || q, read?.intent)} />

      {reply ? (
        <div className="rounded-2xl bg-gradient-to-br from-[#0E2A3A] to-[#122347] ring-1 ring-[#22D3EE]/25 p-4 mb-3">
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#0891B2]/25 ring-1 ring-[#67E8F9]/30 flex items-center justify-center shrink-0 text-[#A5F3FC]">
              <MessageSquare size={15} />
            </span>
            <p className="text-[#E8F7FF] text-[14px] leading-relaxed font-semibold">{reply.text}</p>
          </div>
          {reply.shops.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {reply.shops.map((s) => (
                <span
                  key={s.slug}
                  className="rounded-full bg-black/25 ring-1 ring-white/10 px-2.5 py-1 text-[11.5px] text-[#BAE6FD] font-bold"
                >
                  {s.name}: {s.qty}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {rows.map((r) => (
        <FoundPart key={`${r.slug}-${r.code}`} part={r} />
      ))}

      {report ? <ReportView report={report} shops={shops} /> : null}

      {asked && !busy && !error && !rows.length && !report ? (
        <p className="text-[#5A6E88] text-[12px] text-center py-4">
          Try fewer words — a make and what the part is, like &ldquo;premio bumper&rdquo;.
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------
   THE REPORT ON SCREEN

   Nine hundred lines is not a report, so it arrives folded: a sentence, the two
   numbers that matter, then one row per section with its own totals — and the parts
   themselves only for the section somebody opens. The biggest section is open to
   start with, because it is the one the answer is mostly about.

   Asked for as "a report that can be viewable efficiently", which on a phone means
   the answer fits on the first screen and the detail is one tap away rather than four
   thousand pixels down.
--------------------------------------------------------- */
function ReportView({ report, shops }) {
  const [open, setOpen] = useState(() => new Set(report.groups.slice(0, 1).map((g) => g.key)));
  const [filter, setFilter] = useState("");

  /* A fresh report opens its own biggest section, not the one left open by the last
     question — which would be a section that may not even be in this answer. */
  useEffect(() => {
    setOpen(new Set(report.groups.slice(0, 1).map((g) => g.key)));
    setFilter("");
  }, [report]);

  const nameOf = (slug) => shops.find((s) => s.slug === slug)?.name || slug;
  const short = (slug) => nameOf(slug).replace(/\b(bypass shop|auto spares?|auto ?parts|ltd|branch)\b/gi, "").trim() || slug;

  const groups = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return report.groups;
    return report.groups
      .map((g) => ({
        ...g,
        rows: g.rows.filter((k) => {
          const hay = `${g.label} ${kindLabel(k)} ${k.exampleName || ""}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        }),
      }))
      .filter((g) => g.rows.length);
  }, [report.groups, filter]);

  const toggle = (key) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <div className="rounded-2xl bg-gradient-to-br from-[#0E2A3A] to-[#122347] ring-1 ring-[#22D3EE]/25 p-4 mb-3">
        <div className="flex items-start gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[#0891B2]/25 ring-1 ring-[#67E8F9]/30 flex items-center justify-center shrink-0 text-[#A5F3FC]">
            <MessageSquare size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-[#E8F7FF] text-[14px] leading-relaxed font-semibold">
              {report.sentence}
            </p>
            {report.kinds ? (
              <div className="flex gap-2 mt-3">
                <span className="rounded-lg bg-black/25 ring-1 ring-white/10 px-2.5 py-1.5">
                  <span className="block text-white font-extrabold text-[15px] leading-none">
                    {report.kinds.toLocaleString()}
                  </span>
                  <span className="block text-[#7FA8C4] text-[10px] mt-0.5">kinds of part</span>
                </span>
                <span className="rounded-lg bg-black/25 ring-1 ring-white/10 px-2.5 py-1.5">
                  <span className="block text-white font-extrabold text-[15px] leading-none">
                    {report.units.toLocaleString()}
                  </span>
                  <span className="block text-[#7FA8C4] text-[10px] mt-0.5">on the shelves</span>
                </span>
                <span className="rounded-lg bg-black/25 ring-1 ring-white/10 px-2.5 py-1.5">
                  <span className="block text-white font-extrabold text-[15px] leading-none">
                    {report.groups.length}
                  </span>
                  <span className="block text-[#7FA8C4] text-[10px] mt-0.5">sections</span>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {report.kinds ? (
        <>
          <div className="text-[#8298B2] text-[11px] font-bold uppercase tracking-wider mb-2">
            {report.title}
          </div>

          {report.groups.length > 3 ? (
            <input
              className={`${box} mb-2.5`}
              placeholder="Narrow it down — a make, a model, a section"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          ) : null}

          {groups.map((g) => {
            const isOpen = open.has(g.key);
            return (
              <div key={g.key} className={`${card} mb-2 overflow-hidden`}>
                <button
                  onClick={() => toggle(g.key)}
                  className="w-full text-left px-3.5 py-3 flex items-center gap-2.5"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-white font-bold text-[13.5px] truncate">{g.label}</span>
                    <span className="block text-[#7A8CA3] text-[11px] mt-0.5">
                      {g.rows.length} kind{g.rows.length === 1 ? "" : "s"} · {g.units.toLocaleString()} on the
                      shelf
                    </span>
                  </span>
                  <ArrowRight
                    size={16}
                    className={`shrink-0 text-[#5A6E88] transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                </button>

                {isOpen ? (
                  <div className="px-3.5 pb-3">
                    {g.rows.slice(0, 120).map((k) => (
                      <div key={k.key} className="py-2 border-t border-white/[0.06]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[#C7D6E8] text-[12.5px] font-semibold min-w-0">
                            {kindLabel(k)}
                          </span>
                          <span className="text-[#BAE6FD] text-[12px] font-bold shrink-0">
                            {report.countIn
                              ? Number(k.shops?.[report.countIn]?.qty || 0)
                              : k.totalQty}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(k.shops)
                            .sort((a, b) => Number(b[1]?.qty || 0) - Number(a[1]?.qty || 0))
                            .map(([slug, v]) => (
                              <span
                                key={slug}
                                className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                                  Number(v?.qty || 0) === 0
                                    ? "bg-[#1A0F16] text-[#B98A8A]"
                                    : slug === report.shop
                                      ? "bg-[#052E1B] text-[#6EE7B7]"
                                      : "bg-[#16233A] text-[#9FB3CC]"
                                }`}
                              >
                                {short(slug)} {Number(v?.qty || 0)}
                              </span>
                            ))}
                        </div>
                      </div>
                    ))}
                    {g.rows.length > 120 ? (
                      <p className="text-[#5A6E88] text-[11px] pt-2">
                        …and {g.rows.length - 120} more in this section. Narrow it down above.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {!groups.length ? (
            <p className="text-[#7A8CA3] text-[12px] text-center py-6">Nothing matches that.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* One part, wherever it is. Everything the owner asked to be able to see when
   searching, including the free-typed notes and who it came from: "extra details of
   parts that I write should be visible when you are searching the part, even though
   they aren't either brand, year or what they are". */
function FoundPart({ part: p }) {
  const years = p.yearFrom ? `${p.yearFrom}${p.yearTo && p.yearTo !== p.yearFrom ? `–${p.yearTo}` : ""}` : "";
  const bits = [p.brand, p.model, p.series, years, p.condition, p.side, p.variant, p.color]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  return (
    <div className={`${card} p-3.5 mb-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[#67E8F9] text-[11px] font-bold tracking-wide">{p.code}</div>
          <div className="text-white font-bold text-[14px] leading-snug mt-0.5">
            {p.name || `${p.brand} ${p.model}`.trim() || p.section}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-extrabold ${
            p.qty > 0 ? "bg-[#052E1B] text-[#6EE7B7] ring-1 ring-[#34D399]/30" : "bg-[#2A1520] text-[#FCA5A5] ring-1 ring-[#F87171]/30"
          }`}
        >
          {p.qty > 0 ? `${p.qty} in stock` : "none left"}
        </span>
      </div>

      {bits.length ? (
        <div className="text-[#9FB3CC] text-[12px] mt-1.5">{bits.join(" · ")}</div>
      ) : null}

      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[12px] mt-2">
        <span className="inline-flex items-center gap-1 font-bold text-[#BAE6FD]">
          <Store size={12} /> {p.shopName}
        </span>
        <span className="text-[#5A6E88]">·</span>
        <span className="inline-flex items-center gap-1 text-[#9FB3CC]">
          <MapPin size={12} /> {p.location && !/^unassigned$/i.test(p.location) ? p.location : "shelf not recorded"}
        </span>
        {p.price > 0 ? (
          <>
            <span className="text-[#5A6E88]">·</span>
            <span className="text-[#FDE68A] font-bold">{money(p.price)}</span>
          </>
        ) : null}
        <span className="text-[#5A6E88]">·</span>
        <span className="text-[#7A8CA3]">{p.section}</span>
      </div>

      {p.notes || p.supplier ? (
        <div className="mt-2.5 rounded-lg bg-[#0A1120] ring-1 ring-white/[0.07] px-3 py-2">
          {p.notes ? (
            <p className="text-[#C7D6E8] text-[12px] leading-snug whitespace-pre-wrap">{p.notes}</p>
          ) : null}
          {p.supplier ? (
            <p className="text-[#7A8CA3] text-[11.5px] mt-1">From {p.supplier}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------
   SHOPS — what each one is holding
--------------------------------------------------------- */
function Shops({ onBack, totals, error, busy, reload }) {
  const all = useMemo(
    () =>
      totals.reduce(
        (a, s) => ({
          parts: a.parts + s.parts,
          units: a.units + s.units,
          value: a.value + s.value,
          outOfStock: a.outOfStock + s.outOfStock,
          low: a.low + s.low,
        }),
        { parts: 0, units: 0, value: 0, outOfStock: 0, low: 0 }
      ),
    [totals]
  );

  return (
    <div>
      <Back onClick={onBack} />
      <Title icon={Store} sub="Every shop's shelf, side by side. Value is at selling price.">
        The shops
      </Title>

      <Trouble error={error} onRetry={reload} />
      {busy && !totals.length ? <Waiting what="Counting" /> : null}

      {totals.map((s) => (
        <div key={s.slug} className={`${card} p-4 mb-2.5`}>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-white font-extrabold">{s.name}</div>
            <div className="text-[#FDE68A] font-bold text-[13px]">{money(s.value)}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Cell label="Parts" value={s.parts.toLocaleString()} />
            <Cell label="On the shelf" value={s.units.toLocaleString()} />
            <Cell label="Sections" value={s.sections} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] mt-3">
            {s.outOfStock ? (
              <span className="text-[#FCA5A5] font-bold">{s.outOfStock} run out</span>
            ) : (
              <span className="text-[#6EE7B7] font-bold">nothing has run out</span>
            )}
            {s.low ? <span className="text-[#FCD34D] font-bold">{s.low} getting low</span> : null}
            <span className="text-[#7A8CA3]">last part booked in {when(s.lastAdded)}</span>
          </div>
        </div>
      ))}

      {totals.length > 1 ? (
        <div className="rounded-2xl bg-gradient-to-br from-[#12233F] to-[#0E2A3A] ring-1 ring-white/10 p-4 mt-3">
          <div className="text-[#8298B2] text-[11px] font-bold uppercase tracking-wider">
            All {totals.length} shops together
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <Cell label="Parts" value={all.parts.toLocaleString()} />
            <Cell label="On the shelf" value={all.units.toLocaleString()} />
            <Cell label="Worth" value={money(all.value)} />
          </div>
          {all.outOfStock ? (
            <p className="text-[#FCA5A5] text-[11.5px] mt-3 font-bold">
              {all.outOfStock} parts have run out somewhere
              {all.low ? `, and ${all.low} more are getting low` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Cell({ label, value }) {
  return (
    <div className="rounded-xl bg-[#0A1120] ring-1 ring-white/[0.07] px-2.5 py-2">
      <div className="text-white font-extrabold text-[15px] leading-none">{value}</div>
      <div className="text-[#7A8CA3] text-[10.5px] mt-1">{label}</div>
    </div>
  );
}

/* ---------------------------------------------------------
   COMPARE — what one shop has and another does not

   Three lists, one shop chosen as "this shop":

     Only here      nobody else has it in stock
     Missing here   somebody else has it and this shop does not
     Shared         more than one shop has it, and how many each

   "Has it" means has one on the shelf. A card with a zero on it is not stock, and a
   comparison that counted it would send somebody driving to another shop for a part
   that is not there either. The parts with cards but no stock are still counted, in
   the line under each heading, because "we used to have one" is worth knowing when
   you are deciding whether to order.

   Read the long note in supabase/owner_console.sql for why a "kind" of part is
   section + make + model + end + variant and not a part code.
--------------------------------------------------------- */
function Compare({ onBack, kinds, totals, error, busy, reload }) {
  const shops = totals.length ? totals : [];
  const [focus, setFocus] = useState("");
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("only");

  useEffect(() => {
    if (!focus && shops.length) setFocus(shops[0].slug);
  }, [focus, shops]);

  const label = useCallback(
    (k) =>
      [k.section, k.brand, k.model, k.side, k.variant]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .join(" ") || k.exampleName || k.cat,
    []
  );

  const held = (k) => Object.keys(k.shops).filter((s) => Number(k.shops[s]?.qty || 0) > 0);

  const lists = useMemo(() => {
    const only = [], missing = [], shared = [];
    for (const k of kinds) {
      const h = held(k);
      if (!h.length) continue; // nothing anywhere: not a comparison, just an empty card
      if (h.length === 1 && h[0] === focus) only.push(k);
      else if (!h.includes(focus)) missing.push({ ...k, holders: h });
      else if (h.length > 1) shared.push({ ...k, holders: h });
    }
    const heavy = (a, b) => b.totalQty - a.totalQty;
    return { only: only.sort(heavy), missing: missing.sort(heavy), shared: shared.sort(heavy) };
  }, [kinds, focus]);

  const nameOf = (slug) => shops.find((s) => s.slug === slug)?.name || slug;
  const mine = nameOf(focus);
  const rows = lists[tab === "only" ? "only" : tab === "missing" ? "missing" : "shared"];
  const shown = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    return rows.filter((k) => {
      const hay = `${label(k)} ${k.exampleName}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, filter, label]);

  const TABS = [
    { id: "only", label: "Only here", n: lists.only.length },
    { id: "missing", label: "Not here", n: lists.missing.length },
    { id: "shared", label: "Both", n: lists.shared.length },
  ];

  return (
    <div>
      <Back onClick={onBack} />
      <Title icon={Scale} sub="Pick a shop. Then see what it alone has, and what everyone else has that it doesn't.">
        Compare the stocks
      </Title>

      <Trouble error={error} onRetry={reload} />
      {busy && !kinds.length ? <Waiting what="Comparing every part at every shop" /> : null}

      {shops.length ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {shops.map((s) => (
            <button
              key={s.slug}
              onClick={() => setFocus(s.slug)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ${
                s.slug === focus
                  ? "bg-[#0891B2] text-white ring-white/20"
                  : "bg-[#16233A] text-[#9FB3CC] ring-white/10"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      {kinds.length ? (
        <>
          <div className="flex gap-1.5 mb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-xl px-2 py-2 ring-1 ${
                  t.id === tab ? "bg-[#122347] ring-[#22D3EE]/30" : "bg-[#0C1424] ring-white/10"
                }`}
              >
                <div className={`font-extrabold text-[15px] ${t.id === tab ? "text-white" : "text-[#9FB3CC]"}`}>
                  {t.n}
                </div>
                <div className="text-[10.5px] text-[#7A8CA3]">{t.label}</div>
              </button>
            ))}
          </div>

          <p className="text-[#8298B2] text-[12px] leading-snug mb-3">
            {tab === "only"
              ? `${lists.only.length} kinds of part that only ${mine} has in stock. Nobody else can sell these.`
              : tab === "missing"
                ? `${lists.missing.length} kinds of part another shop has in stock and ${mine} does not. This is the list to order from, or to move.`
                : `${lists.shared.length} kinds of part more than one shop has. Where a customer can be sent either way.`}
          </p>

          <input
            className={`${box} mb-3`}
            placeholder="Narrow it down — a make, a model, a part"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          {shown.slice(0, 200).map((k) => (
            <div key={k.key} className={`${card} p-3 mb-2`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-white font-bold text-[13.5px] leading-snug">{label(k)}</div>
                  {k.exampleName ? (
                    <div className="text-[#7A8CA3] text-[11.5px] mt-0.5 truncate">{k.exampleName}</div>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-lg bg-[#0A1120] ring-1 ring-white/10 px-2 py-1 text-[11.5px] font-bold text-[#BAE6FD]">
                  {k.totalQty} total
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(k.shops)
                  .sort((a, b) => Number(b[1]?.qty || 0) - Number(a[1]?.qty || 0))
                  .map(([slug, v]) => (
                    <span
                      key={slug}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${
                        Number(v?.qty || 0) === 0
                          ? "bg-[#1A0F16] text-[#B98A8A] ring-[#F87171]/20"
                          : slug === focus
                            ? "bg-[#052E1B] text-[#6EE7B7] ring-[#34D399]/30"
                            : "bg-[#16233A] text-[#9FB3CC] ring-white/10"
                      }`}
                    >
                      {nameOf(slug)}: {Number(v?.qty || 0)}
                    </span>
                  ))}
              </div>
            </div>
          ))}

          {shown.length > 200 ? (
            <p className="text-[#7A8CA3] text-[12px] text-center py-3">
              Showing the 200 with the most stock, of {shown.length}. Narrow it down above.
            </p>
          ) : null}
          {!shown.length ? (
            <p className="text-[#7A8CA3] text-[12px] text-center py-6">
              {filter ? "Nothing matches that." : "Nothing in this list."}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------
   ACCESS — who can sign in, and where

   The owner's rule, and it is the reason this section exists: "I don't want a staff
   to access all shops, so the necessary staff should be able to login only in their
   shop." So moving somebody is one action that puts them in ONE shop and takes away
   every other — there is no "add a second shop" button here, because there is no
   such thing in this system for anybody but the owner.

   Four buttons, kept separate because they are four different decisions:
     Sign out    they carry on working, just not on that device
     Hold        they can sign in but get no further than the waiting screen
     Move        a different shop, or a different job at the same one
     Remove      no shop at all — they no longer work here
--------------------------------------------------------- */
function Access({ onBack, accounts, totals, error, busy, reload }) {
  const [note, setNote] = useState("");
  const [oops, setOops] = useState("");
  const [working, setWorking] = useState("");
  const [open, setOpen] = useState("");
  const [filter, setFilter] = useState("");

  const act = async (email, fn) => {
    setWorking(email);
    setNote("");
    setOops("");
    try {
      const said = await fn();
      setNote(typeof said === "string" ? said : "Done.");
      await reload();
    } catch (err) {
      setOops(err?.message || "That didn't work.");
    } finally {
      setWorking("");
    }
  };

  const homeless = accounts.filter((a) => !a.shops.length);
  const everywhere = accounts.filter((a) => a.shops.length > 1);

  const shown = useMemo(() => {
    const w = filter.toLowerCase().trim();
    const list = w
      ? accounts.filter((a) =>
          `${a.email} ${a.name} ${a.shops.map((s) => s.name).join(" ")}`.toLowerCase().includes(w)
        )
      : accounts;
    return [...list].sort((a, b) => {
      const an = a.shops[0]?.name || "";
      const bn = b.shops[0]?.name || "";
      return an.localeCompare(bn) || a.email.localeCompare(b.email);
    });
  }, [accounts, filter]);

  return (
    <div>
      <Back onClick={onBack} />
      <Title icon={Users} sub="Everyone who can sign in anywhere, and the one shop each of them may open.">
        Who can get in
      </Title>

      <Trouble error={oops || error} onRetry={reload} />
      {note ? (
        <div className="rounded-xl bg-[#052E1B] ring-1 ring-[#34D399]/30 p-3.5 mb-3 flex items-start gap-2">
          <Check size={16} className="text-[#6EE7B7] shrink-0 mt-0.5" />
          <p className="text-[#A7F3D0] text-[12.5px] leading-snug">{note}</p>
        </div>
      ) : null}

      {busy && !accounts.length ? <Waiting what="Reading the staff lists" /> : null}

      {homeless.length ? (
        <div className="rounded-xl bg-[#2A2115] ring-1 ring-[#FCD34D]/25 p-3.5 mb-3">
          <div className="flex items-start gap-2 text-[#FCD34D] text-[12.5px]">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <p className="leading-snug">
              <b>
                {homeless.length} account{homeless.length === 1 ? "" : "s"} belong to no shop.
              </b>{" "}
              They can sign in and then reach nothing at all. Either give them a shop
              below, or remove them.
            </p>
          </div>
        </div>
      ) : null}

      {everywhere.length ? (
        <div className="rounded-xl bg-[#12233F] ring-1 ring-white/10 p-3.5 mb-3">
          <p className="text-[#9FB3CC] text-[12px] leading-snug">
            <b className="text-[#BAE6FD]">
              {everywhere.length} account{everywhere.length === 1 ? "" : "s"} can open more than one
              shop
            </b>{" "}
            — {everywhere.map((a) => a.email).join(", ")}. That is meant to be you and
            nobody else.
          </p>
        </div>
      ) : null}

      {accounts.length ? (
        <input
          className={`${box} mb-3`}
          placeholder="Find a person — name, email or shop"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      ) : null}

      {shown.map((a) => {
        const busyHere = working === a.email;
        const isOpen = open === a.email;
        return (
          <div key={a.email} className={`${card} p-3.5 mb-2`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-bold text-[13.5px] leading-snug truncate">
                  {a.name || a.email.split("@")[0]}
                </div>
                <div className="text-[#7A8CA3] text-[11.5px] truncate">{a.email}</div>
              </div>
              {!a.approved ? (
                <span className="shrink-0 rounded-lg bg-[#2A2115] ring-1 ring-[#FCD34D]/30 px-2 py-1 text-[11px] font-bold text-[#FCD34D]">
                  held
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {a.shops.length ? (
                a.shops.map((s) => (
                  <span
                    key={s.slug}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${
                      s.role === "admin"
                        ? "bg-[#2E1065] text-[#DDD6FE] ring-[#A78BFA]/30"
                        : "bg-[#16233A] text-[#9FB3CC] ring-white/10"
                    }`}
                  >
                    {s.name} · {s.role}
                  </span>
                ))
              ) : (
                <span className="rounded-full bg-[#2A1520] ring-1 ring-[#F87171]/25 px-2.5 py-0.5 text-[11px] font-bold text-[#FCA5A5]">
                  no shop
                </span>
              )}
              {a.permissions.length ? (
                <span className="rounded-full bg-[#0A1120] ring-1 ring-white/10 px-2.5 py-0.5 text-[11px] text-[#7A8CA3]">
                  {a.permissions.join(", ")}
                </span>
              ) : null}
            </div>

            <div className="text-[#5A6E88] text-[11px] mt-2">
              last signed in {when(a.lastSignIn)}
            </div>

            <button
              onClick={() => setOpen(isOpen ? "" : a.email)}
              className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#7DD3FC]"
            >
              {isOpen ? "Close" : "Change what they can do"}
              <ArrowRight size={13} className={isOpen ? "rotate-90 transition-transform" : "transition-transform"} />
            </button>

            {isOpen ? (
              <div className="mt-3 pt-3 border-t border-white/10">
                <MoveTo
                  account={a}
                  totals={totals}
                  busy={busyHere}
                  onMove={(slug, role) => act(a.email, () => owner.moveAccount(a.email, slug, role))}
                />

                <Caps
                  account={a}
                  busy={busyHere}
                  onSave={(perms) => act(a.email, () => owner.setAccountPermissions(a.email, perms))}
                />

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Small
                    icon={DoorOpen}
                    busy={busyHere}
                    onClick={() => act(a.email, () => owner.logOutAccount(a.email))}
                  >
                    Sign out everywhere
                  </Small>
                  <Small
                    icon={a.approved ? X : Check}
                    busy={busyHere}
                    onClick={() => act(a.email, () => owner.setAccountApproved(a.email, !a.approved))}
                  >
                    {a.approved ? "Hold at the waiting screen" : "Let them in"}
                  </Small>
                  <Small
                    icon={Ban}
                    danger
                    busy={busyHere}
                    confirm={`Take every shop away from ${a.email}? They will not be able to reach anything. Nothing they have already stamped changes.`}
                    onClick={() => act(a.email, () => owner.revokeAccount(a.email))}
                  >
                    They no longer work here
                  </Small>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {accounts.length && !shown.length ? (
        <p className="text-[#7A8CA3] text-[12px] text-center py-6">Nobody matches that.</p>
      ) : null}
    </div>
  );
}

function MoveTo({ account, totals, busy, onMove }) {
  const at = account.shops[0]?.slug || "";
  const [slug, setSlug] = useState(at);
  const [role, setRole] = useState(account.shops[0]?.role || "staff");
  const changed = slug !== at || role !== (account.shops[0]?.role || "staff");

  return (
    <div>
      <div className="text-[#8298B2] text-[11px] font-bold uppercase tracking-wider mb-1.5">
        Their one shop
      </div>
      <div className="flex gap-1.5">
        <select className={`${box} py-2`} value={slug} onChange={(e) => setSlug(e.target.value)}>
          <option value="">— choose a shop —</option>
          {totals.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className={`${box} py-2 max-w-[7.5rem]`}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="staff">staff</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <p className="text-[#5A6E88] text-[11px] mt-1.5 leading-snug">
        Moving somebody takes away every other shop and signs them out, so they sign in
        fresh at the right one.
      </p>
      <button
        disabled={busy || !slug || !changed}
        onClick={() => onMove(slug, role)}
        className="mt-2 w-full rounded-xl bg-gradient-to-r from-[#0891B2] to-[#2563EB] text-white font-bold py-2 text-[13px] disabled:opacity-30"
      >
        {busy ? "Working…" : account.shops.length ? "Move them" : "Give them this shop"}
      </button>
    </div>
  );
}

function Caps({ account, busy, onSave }) {
  const [picked, setPicked] = useState(account.permissions || []);
  const admin = account.shops.some((s) => s.role === "admin");
  const changed =
    picked.length !== (account.permissions || []).length ||
    picked.some((p) => !(account.permissions || []).includes(p));

  if (admin) {
    return (
      <p className="text-[#7A8CA3] text-[11.5px] mt-3 leading-snug">
        An admin can already do everything at their shop, so there is nothing to tick.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="text-[#8298B2] text-[11px] font-bold uppercase tracking-wider mb-1.5">
        What they may do
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CAPABILITIES.map((c) => {
          const on = picked.includes(c.key);
          return (
            <button
              key={c.key}
              title={c.desc}
              onClick={() => setPicked(on ? picked.filter((k) => k !== c.key) : [...picked, c.key])}
              className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold ring-1 ${
                on ? "bg-[#0891B2] text-white ring-white/20" : "bg-[#16233A] text-[#9FB3CC] ring-white/10"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {changed ? (
        <button
          disabled={busy}
          onClick={() => onSave(picked)}
          className="mt-2 w-full rounded-xl bg-[#16233A] ring-1 ring-white/15 text-[#BAE6FD] font-bold py-2 text-[13px] disabled:opacity-30"
        >
          Save what they may do
        </button>
      ) : null}
    </div>
  );
}

function Small({ icon: Icon, children, onClick, busy, danger = false, confirm = "" }) {
  const [armed, setArmed] = useState(false);
  const go = () => {
    if (confirm && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onClick();
  };
  return (
    <div className={confirm && armed ? "w-full" : ""}>
      {confirm && armed ? (
        <p className="text-[#FCA5A5] text-[11.5px] leading-snug mb-1.5">{confirm}</p>
      ) : null}
      <button
        disabled={busy}
        onClick={go}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold ring-1 disabled:opacity-40 ${
          danger
            ? "bg-[#2A1520] text-[#FCA5A5] ring-[#F87171]/30"
            : "bg-[#16233A] text-[#9FB3CC] ring-white/10"
        }`}
      >
        <Icon size={13} />
        {confirm && armed ? "Yes, do it" : children}
      </button>
      {confirm && armed ? (
        <button
          onClick={() => setArmed(false)}
          className="ml-2 text-[11.5px] font-bold text-[#7DD3FC]"
        >
          No
        </button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------
   THE CONSOLE
--------------------------------------------------------- */
export default function OwnerConsole({ onLeave }) {
  const [signedIn, setSignedIn] = useState(null); // null = unknown, false = no, user = yes
  const [view, setView] = useState("home");

  const [totals, setTotals] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* A session may already be open — the console was left open, or the owner signed in
     an hour ago. Asking the database rather than trusting the session, because "is
     there a session" and "is it an owner's" are different questions and only the
     second one matters here. */
  useEffect(() => {
    let alive = true;
    owner
      .amOwner()
      .then((ok) => alive && setSignedIn(ok ? true : false))
      .catch(() => alive && setSignedIn(false));
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [t, a] = await Promise.all([owner.fetchShopTotals(), owner.fetchAccounts()]);
      setTotals(t);
      setAccounts(a);
    } catch (err) {
      setError(err?.message || "Couldn't read the shops.");
    } finally {
      setBusy(false);
    }
  }, []);

  /* The comparison is the expensive read — every part at every shop, grouped. Left
     until the Compare screen is actually opened, so the console itself comes up at
     once. */
  const loadKinds = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const list = await owner.fetchPartKinds();
      setKinds(list);
      return list;
    } catch (err) {
      setError(err?.message || "Couldn't compare the shops.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn === true) load();
  }, [signedIn, load]);

  useEffect(() => {
    if (signedIn === true && view === "compare" && !kinds.length) loadKinds();
  }, [signedIn, view, kinds.length, loadKinds]);

  const out = async () => {
    await owner.signOutOwner();
    setSignedIn(false);
    setView("home");
    setTotals([]);
    setKinds([]);
    setAccounts([]);
  };

  const shell = (children) => (
    <div className="min-h-screen bg-[#070B12] p-4">
      <div className="w-full max-w-md mx-auto bp-pop">{children}</div>
    </div>
  );

  if (signedIn === null) return shell(<Waiting what="Checking" />);
  if (signedIn === false) return shell(<SignIn onIn={() => setSignedIn(true)} onLeave={onLeave} />);

  if (view === "ask")
    return shell(
      <Ask onBack={() => setView("home")} shops={totals} kinds={kinds} loadKinds={loadKinds} />
    );
  if (view === "shops")
    return shell(
      <Shops onBack={() => setView("home")} totals={totals} error={error} busy={busy} reload={load} />
    );
  if (view === "compare")
    return shell(
      <Compare
        onBack={() => setView("home")}
        kinds={kinds}
        totals={totals}
        error={error}
        busy={busy}
        reload={loadKinds}
      />
    );
  if (view === "access")
    return shell(
      <Access
        onBack={() => setView("home")}
        accounts={accounts}
        totals={totals}
        error={error}
        busy={busy}
        reload={load}
      />
    );

  const units = totals.reduce((n, s) => n + s.units, 0);
  const parts = totals.reduce((n, s) => n + s.parts, 0);

  return shell(
    <>
      <div className="rounded-2xl bg-gradient-to-br from-[#0E2A3A] to-[#122347] ring-1 ring-white/10 p-5 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-11 h-11 rounded-xl bg-black/25 ring-1 ring-[#67E8F9]/25 flex items-center justify-center text-[#67E8F9]">
            <ShieldCheck size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="text-white font-extrabold text-xl leading-tight">Owner&apos;s console</h1>
            <p className="text-[#A5F3FC] text-[12px]">
              {totals.length ? `${totals.length} shops · ` : ""}
              {parts ? `${parts.toLocaleString()} parts · ${units.toLocaleString()} on the shelves` : "reading…"}
            </p>
          </div>
        </div>
      </div>

      <Trouble error={error} onRetry={load} />

      <Tile
        icon={MessageSquare}
        title="Ask about the stock"
        sub="One part or a whole report — where it is, what a shop is missing, what there is plenty of."
        onClick={() => setView("ask")}
      />
      <Tile
        icon={Package}
        title="The shops"
        sub="What each one holds, how much of it, and what it is worth."
        onClick={() => setView("shops")}
      />
      <Tile
        icon={Scale}
        title="Compare the stocks"
        sub="What one shop has that another does not — and what both have."
        onClick={() => setView("compare")}
      />
      <Tile
        icon={Users}
        title="Who can get in"
        sub="Every account, the one shop it may open, and what it may do there."
        onClick={() => setView("access")}
      />

      <div className="flex gap-2 mt-4">
        <button
          onClick={onLeave}
          className="flex-1 rounded-xl bg-[#0C1424] ring-1 ring-white/10 py-2.5 text-[12.5px] font-bold text-[#9FB3CC] flex items-center justify-center gap-1.5"
        >
          <ArrowLeft size={14} /> The shops list
        </button>
        <button
          onClick={out}
          className="flex-1 rounded-xl bg-[#0C1424] ring-1 ring-white/10 py-2.5 text-[12.5px] font-bold text-[#FCA5A5] flex items-center justify-center gap-1.5"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      <p className="text-[#5A6E88] text-[11px] text-center mt-4 leading-relaxed">
        This console can read every shop and change who signs in where. It cannot add,
        sell or adjust a single part — that happens at the shop, under the name of
        whoever did it.
      </p>
    </>
  );
}

function Tile({ icon: Icon, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 mb-2.5 bg-[#0C1424] ring-1 ring-white/10 active:scale-[0.99] transition-transform flex items-center gap-3.5"
    >
      <span className="w-11 h-11 rounded-xl bg-[#16233A] ring-1 ring-white/10 flex items-center justify-center shrink-0 text-[#67E8F9]">
        <Icon size={20} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-white font-extrabold">{title}</span>
        <span className="block text-[#8298B2] text-[12px] leading-snug mt-0.5">{sub}</span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-[#5A6E88]" />
    </button>
  );
}
