/* ---------------------------------------------------------
   BYPASS SHOP — the question reader

   The instruction box already takes orders ("add a category for boot lights",
   "put all quantities as one") — see command.js. This file is the other half:
   the shop asking the app something instead of telling it something.

     what sales were made today
     do we have a premio front bumper
     all details about SMI-TOY-FIE-16-0006
     how much did we make this month
     who sold the most this week
     what is still unpaid
     generate a report for last month
     write a receipt

   Three kinds of answer come out of here:

     a FIGURE     — sales, takings, what is unpaid, who sold what
     a PART       — is it on the shelf, how many, what it costs, where it is
     a JOURNEY    — "generate a statement" opens the screen that does it,
                    already set to the period that was asked for

   Nothing here reads the database, React, or the clock unless the clock is
   handed in. Stock, sales and `now` go in; a description of the answer comes
   out. So every answer can be checked by reading it, and a question about
   "today" can be tested without waiting for tomorrow.

   WHY IT NEVER GUESSES
   A wrong figure is worse than no figure, because a figure gets believed. So
   when the reader cannot tell which period, which person or which part was
   meant, it says which window it measured and which words it matched, in the
   answer itself. "Today" written above the total is the difference between a
   number the owner can check and a number they have to trust.
--------------------------------------------------------- */
import { selectParts, readCommand } from "./command.js";
import { periodRange, totals, topSelling, sellers, fmtDay, monthName } from "./reports.js";
import { reorderLevel, isOutOfStock, isLowStock } from "../data.js";
import { tidy } from "./parseParts.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const money = (n) => `KES ${Math.round(num(n)).toLocaleString()}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

/* ---------- is this a question at all? ----------

   Only real interrogatives count, and that narrowness is deliberate. This test
   runs BEFORE the order reader in command.js, so every word listed here is a
   word that stops being usable in an order — and letting a loose one in is far
   worse than leaving a question out.

   "in stock", "total", "list" and "left" were all in this list once. Each of
   them appears in an ordinary order — "put all quantities in stock as one" — and
   with them in, that order was read as a question and never carried out. A
   question that misses out lands on the order reader and gets told what the box
   can do; an order that misses out silently doesn't happen. */
const ASK_WORDS = [
  "how many", "how much", "how's", "how is", "how are", "what", "whats", "which",
  "who", "whose", "where", "when",
  "do we", "did we", "have we", "are we", "is there", "are there", "do you",
  "tell me", "show me", "give me",
];
export function looksLikeAsk(text) {
  const low = ` ${String(text || "").toLowerCase().trim()} `;
  if (low.trim().endsWith("?")) return true;
  return ASK_WORDS.some((w) => low.includes(` ${w}`));
}

/* A question about the shop's own figures, as opposed to a request to open a
   screen. Used to keep "generate a report" apart from "what did we sell" — the
   first wants a button, the second wants the number. */
const DATA_QUESTION = /\b(what|whats|which|who|whose|how many|how much|is there|are there|do we|did we|have we)\b/;

/* Words that are asking rather than naming a part. Taken out before the part
   matcher sees the sentence, because that matcher treats any word it doesn't
   know as "you named something I can't find" and answers nothing at all — which
   is right for an order that would rewrite stock, and wrong for a question. */
const ASK_FILLER = new Set([
  "how", "many", "much", "what", "whats", "which", "who", "whose", "where",
  "when", "why", "is", "are", "was", "were", "do", "does", "did", "have", "has",
  "had", "got", "there", "here", "any", "some", "the", "a", "an", "of", "in",
  "on", "at", "to", "for", "from", "by", "with", "about", "and", "or",
  "we", "us", "our", "i", "my", "me", "you", "your", "it", "its", "they",
  "them", "their", "shop", "system", "app", "please", "kindly", "tell", "show",
  "list", "give", "find", "search", "check", "know", "left", "remaining",
  "available", "availability", "detail", "details", "info", "information",
  "everything", "still", "now", "currently", "today", "yesterday",
  "stock", "instock", "quantity", "quantities", "qty", "pieces", "piece",
  "price", "prices", "cost", "worth", "sell", "selling", "sold", "sale", "sales",
  "like", "just", "also", "can", "could", "would", "will", "am", "be", "been",
]);
function stripAsk(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[?!.,;:]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !ASK_FILLER.has(w))
    .join(" ")
    .trim();
}

/* ---------- when ----------

   Every sales answer names its own window. A total with no window on it is the
   commonest way a report gets misread: the owner reads "18,400" as today's
   takings when it was the month's, and plans the day around it. */
const MONTH_WORDS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];
const MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const dayRange = (d) => {
  const from = new Date(d);
  from.setHours(0, 0, 0, 0);
  return { from: from.getTime(), to: from.getTime() + 86400000, label: fmtDay(from.getTime()) };
};

/* A date written the way people write it. Returns a one-day window or null.
   Day-first on purpose: 08/12 is the 8th of December in this shop, not the 12th
   of August, and quietly reading it the American way would put a day's takings
   under the wrong month four times out of five. */
function readDate(low, now) {
  const year = now.getFullYear();

  // 12/08/2026, 12-8-26, 12.08.2026
  const slash = low.match(/\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/);
  if (slash) {
    const day = Number(slash[1]);
    const mon = Number(slash[2]) - 1;
    let yr = slash[3] ? Number(slash[3]) : year;
    if (yr < 100) yr += 2000;
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) {
      return dayRange(new Date(yr, mon, day));
    }
  }

  // 12 august 2026 / 12 aug / august 12
  const names = MONTH_WORDS.map((m, i) => ({ i, m })).concat(MONTH_SHORT.map((m, i) => ({ i, m })));
  for (const { i, m } of names.sort((a, b) => b.m.length - a.m.length)) {
    if (!new RegExp(`\\b${m}\\b`).test(low)) continue;
    const dm = low.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${m}\\b`));
    const md = low.match(new RegExp(`\\b${m}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    const yr = low.match(new RegExp(`\\b(20\\d{2})\\b`));
    const day = dm ? Number(dm[1]) : md ? Number(md[1]) : 0;
    const useYear = yr ? Number(yr[1]) : year;
    if (day >= 1 && day <= 31) return dayRange(new Date(useYear, i, day));
    /* A month with no day in it is the whole month. "how did july go" is a
       month question, and answering it with one day would be wrong by thirty. */
    const from = new Date(useYear, i, 1);
    const to = new Date(useYear, i + 1, 1);
    /* A month named without a year, that hasn't happened yet, means last year's.
       In February, "how was December" is never a question about ten months' time. */
    if (!yr && from.getTime() > now.getTime()) {
      return {
        from: new Date(useYear - 1, i, 1).getTime(),
        to: new Date(useYear - 1, i + 1, 1).getTime(),
        label: monthName(new Date(useYear - 1, i, 1)),
      };
    }
    return { from: from.getTime(), to: to.getTime(), label: monthName(from) };
  }
  return null;
}

/* The window a question is about, or null when it names none. The caller
   decides what "none" means — for sales it means today, and says so. */
const ALL_TIME = { from: 0, to: Number.MAX_SAFE_INTEGER, label: "All time" };

export function readPeriod(text, now = new Date()) {
  const low = ` ${String(text || "").toLowerCase()} `;
  const p = (k) => periodRange(k, now);

  if (/\b(all time|ever|altogether|overall|since we (started|opened)|in total|of all time)\b/.test(low)) {
    return ALL_TIME;
  }
  if (/\blast month\b|\bprevious month\b|\bthe month before\b/.test(low)) return p("lastMonth");
  if (/\bthis month\b|\bmonth to date\b|\bmonthly\b|\bthis month'?s\b|\bcurrent month\b/.test(low)) return p("month");
  if (/\b(last|past|previous)\s+(?:7|seven)\s+days?\b|\bthis week\b|\blast week\b|\bpast week\b|\bweekly\b|\bthe week\b/.test(low)) {
    return p("week7");
  }
  if (/\bthis year\b|\bthe year\b|\byearly\b|\bannual\b|\byear to date\b/.test(low)) return p("year");
  if (/\byesterday\b/.test(low)) return p("yesterday");
  if (/\btoday\b|\bthis morning\b|\bthis afternoon\b|\bso far\b|\bnow\b/.test(low)) return p("today");

  const dated = readDate(low, now);
  if (dated) return dated;
  return null;
}

/* ---------- who ---------- */

/* A name in the question, matched against names the sales register actually
   holds. Matched against real data rather than guessed from grammar: there is
   no way to tell "sales by James" from "sales by cash" out of the words alone,
   and a made-up person filters the list to nothing while looking like it
   worked. */
function readPerson(low, sales) {
  const names = [...new Set(sales.map((s) => String(s.by || "").trim()).filter(Boolean))];
  const buyers = [...new Set(sales.map((s) => String(s.buyer || "").trim()).filter(Boolean))];
  const hit = (list) => {
    // Longest first, so "James Mwangi" wins over "James" when both are staff.
    for (const n of [...list].sort((a, b) => b.length - a.length)) {
      const parts = [n, ...n.split(/\s+/)].filter((p) => p.length >= 3);
      for (const p of parts) {
        if (new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low)) {
          return { full: n, matched: p };
        }
      }
    }
    return null;
  };
  const seller = hit(names);
  const buyer = hit(buyers);
  /* Both lists can hold the same word — a staff member who also buys parts. The
     preposition decides: sold BY somebody, sold TO somebody. */
  if (seller && buyer) {
    if (new RegExp(`\\b(?:to|for)\\s+${buyer.matched}`, "i").test(low)) return { kind: "buyer", ...buyer };
    return { kind: "seller", ...seller };
  }
  if (seller) return { kind: "seller", ...seller };
  if (buyer) return { kind: "buyer", ...buyer };
  return null;
}

/* ---------- sales questions ---------- */

const SALES_WORDS = /\b(sale|sales|sold|sell|selling|takings|revenue|turnover|income|earn|earned|earnings|made|make|money|cash|profit|paid|unpaid|pending|owe|owes|owing|owed|debt|credit|customer|customers|buyer|buyers|best seller|best selling|fast moving)\b/;

function salesAnswer(raw, low, { sales, items, categories, now }) {
  const wantsUnpaid = /\b(unpaid|not paid|pending|owe|owes|owing|owed|debt|balance|credit)\b/.test(low);
  const wantsPaid = /\b(paid up|already paid|settled)\b/.test(low) && !wantsUnpaid;

  const period = readPeriod(low, now);
  /* A debt does not expire at midnight. With no period named, a question about
     money still owing is about ALL of it — answering "nothing is owing" because
     nobody happened to buy on credit since this morning is a lie the shop would
     act on. Every other question with no period named means today. */
  const window = period || (wantsUnpaid ? ALL_TIME : periodRange("today", now));
  /* An undone sale is not a sale. Left in, the day's takings keep counting money
     for goods that came back — and Reports already leaves them out, so counting
     them here would make two screens disagree about the same day. */
  const live = sales.filter((s) => !s.returnedAt);
  let inWindow = live.filter((s) => s.ts >= window.from && s.ts < window.to);

  const person = readPerson(low, live);
  if (person) {
    inWindow = inWindow.filter((s) =>
      person.kind === "seller"
        ? String(s.by || "") === person.full
        : String(s.buyer || "") === person.full
    );
  }

  let list = inWindow;
  if (wantsUnpaid) list = list.filter((s) => !s.paid);
  if (wantsPaid) list = list.filter((s) => s.paid);

  const t = totals(list);
  const scope = [
    window.label,
    person ? (person.kind === "seller" ? `sold by ${person.full}` : `bought by ${person.full}`) : "",
    wantsUnpaid ? "unpaid only" : wantsPaid ? "paid only" : "",
  ].filter(Boolean).join(" · ");

  /* ---- who owes us ----
     Grouped by the buyer's name, not listed sale by sale. "Who owes us" is a
     question about people, and the useful answer is one line per person with the
     whole of their balance on it — a list of nine separate unpaid sales makes
     somebody add up the same customer twice by hand. */
  if (wantsUnpaid && /\bwho\b/.test(low)) {
    const map = new Map();
    for (const s of list) {
      const who = String(s.buyer || "").trim() || "No name recorded";
      const cur = map.get(who) || { who, owed: 0, count: 0, phone: "", last: 0 };
      cur.owed += num(s.total);
      cur.count += 1;
      cur.phone = cur.phone || String(s.phone || "");
      cur.last = Math.max(cur.last, s.ts);
      map.set(who, cur);
    }
    const debtors = [...map.values()].sort((a, b) => b.owed - a.owed);
    if (!debtors.length) {
      return answer("Nobody owes anything", [`Every sale is paid — ${scope}.`], { scope, window });
    }
    const owed = debtors.reduce((s, d) => s + d.owed, 0);
    return answer("Who owes us", [
      `${money(owed)} is owing, from ${plural(debtors.length, "customer")}.`,
      `${scope}.`,
    ], {
      scope,
      window,
      rows: debtors.map((d) => ({
        a: "",
        b: d.who,
        c: money(d.owed),
        note: [plural(d.count, "sale"), d.phone, `last ${fmtDay(d.last)}`].filter(Boolean).join(" · "),
        tone: "warn",
      })),
      /* Credit Accounts is where a balance is actually settled, so that is the
         button — Reports can only show the same list again. */
      go: { tab: "credit", label: "Open Credit Accounts" },
      goAlt: { tab: "reports", options: reportTarget(low, period, { pay: "pending" }), label: "See them in Reports" },
    });
  }

  /* ---- who sold the most ---- */
  if (/\bwho\b/.test(low) && /\b(sold|sell|selling|most|best|top|leading|made)\b/.test(low)) {
    const rank = sellers(list);
    if (!rank.length) {
      return answer("Who sold the most", [`Nobody sold anything — ${scope}.`], { scope, window });
    }
    return answer(
      "Who sold the most",
      [
        `${rank[0].person} is top with ${money(rank[0].revenue)} from ${plural(rank[0].count, "sale")}.`,
        `${scope}.`,
      ],
      {
        scope,
        window,
        rows: rank.map((r, i) => ({
          a: `${i + 1}.`,
          b: r.person,
          c: money(r.revenue),
          note: `${plural(r.count, "sale")} · ${plural(r.units, "piece")}${r.pending ? ` · ${money(r.pending)} unpaid` : ""}`,
        })),
        go: { tab: "reports", options: reportTarget(low, period, { people: [rank[0].person] }), label: "Open Reports" },
      }
    );
  }

  /* ---- what sold the most ---- */
  if (/\b(what|which)\b/.test(low) && /\b(most|best|top|fast|moving|popular)\b/.test(low)) {
    const top = topSelling(list, items, 10);
    if (!top.length) {
      return answer("What sold the most", [`Nothing sold — ${scope}.`], { scope, window });
    }
    return answer(
      "What sold the most",
      [`${top[0].label} leads with ${plural(top[0].units, "piece")} sold.`, `${scope}.`],
      {
        scope,
        window,
        rows: top.map((r, i) => ({
          a: `${i + 1}.`,
          b: r.label,
          c: `${r.units} sold`,
          note: `${r.code} · ${money(r.revenue)}`,
        })),
        go: { tab: "reports", options: reportTarget(low, period), label: "Open Reports" },
      }
    );
  }

  /* ---- how much did we make ---- */
  const moneyOnly = /\bhow much\b/.test(low) && !/\bhow many\b/.test(low);

  if (!list.length) {
    return answer(
      wantsUnpaid ? "Nothing unpaid" : "No sales",
      [
        wantsUnpaid
          ? `Nothing is owing — ${scope}.`
          : `No sales were recorded — ${scope}.`,
        !period ? "That is today only. Say “this week”, “this month” or a date for a longer look." : "",
      ].filter(Boolean),
      { scope, window, go: { tab: "reports", options: reportTarget(low, period), label: "Open Reports" } }
    );
  }

  const lines = [];
  if (moneyOnly) {
    lines.push(`${money(t.revenue)} in sales — ${scope}.`);
  } else {
    lines.push(`${plural(t.count, "sale")}, ${plural(t.units, "piece")}, ${money(t.revenue)} — ${scope}.`);
  }
  if (wantsUnpaid) {
    /* The list is already only the unpaid ones, so "KES 0 of that is in" is a
       true sentence that reads like a fault. */
    lines.push("None of it has been paid.");
  } else if (t.pending > 0) {
    lines.push(`${money(t.paidRevenue)} of that is in. ${money(t.pending)} is still owing.`);
  } else {
    lines.push("Every one of them is paid.");
  }
  /* Only when the window was actually assumed. A question about money owing
     defaults to all of time, not to today, so this warning would be false. */
  if (!period && !wantsUnpaid) {
    lines.push("That is today only. Say “this week”, “this month” or a date for a longer look.");
  }

  const shown = list.slice(0, 15);
  return answer(moneyOnly ? "Takings" : "Sales", lines, {
    scope,
    window,
    rows: shown.map((s) => ({
      a: fmtTime(s.ts),
      b: s.name || s.code || "—",
      c: money(s.total),
      note: [
        s.qty > 1 ? `${s.qty} pcs` : "",
        s.buyer || "",
        s.by ? `by ${s.by}` : "",
        s.paid ? "" : "UNPAID",
      ].filter(Boolean).join(" · "),
      tone: s.paid ? "" : "warn",
    })),
    more: list.length > shown.length
      ? `and ${list.length - shown.length} more — Reports has the full list, with printing.`
      : "",
    go: { tab: "reports", options: reportTarget(low, period, wantsUnpaid ? { pay: "pending" } : {}), label: "Open Reports" },
  });
}

/* Which pill the Reports screen should land on, so "sales last month" and the
   button under the answer agree with each other. */
function rangeKeyFor(low, period) {
  if (!period) return "today";
  if (/\blast month\b|\bprevious month\b/.test(low)) return "lastMonth";
  if (/\bthis month\b|\bmonthly\b|\bmonth to date\b|\bcurrent month\b/.test(low)) return "month";
  if (/\bweek\b|\b(?:7|seven) days?\b/.test(low)) return "week7";
  if (/\byear\b|\bannual\b/.test(low)) return "year";
  if (/\byesterday\b/.test(low)) return "yesterday";
  if (/\btoday\b/.test(low)) return "today";
  return "";
}

const isoDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* Everything the Reports screen needs to open on the same window this answer
   measured. A period written as a date ("sales on 18 august", "in july") has no
   pill to land on, so it is handed over as a custom range instead — otherwise the
   answer would say one thing and the screen it opens would show another, which is
   the one outcome worse than not offering the button at all. */
function reportTarget(low, period, extra = {}) {
  const key = rangeKeyFor(low, period);
  const opts = { ...extra };
  if (key) {
    opts.range = key;
  } else if (period && period !== ALL_TIME && Number.isFinite(period.to)) {
    opts.range = "custom";
    opts.from = isoDay(period.from);
    opts.to = isoDay(period.to - 86400000);
  } else if (period === ALL_TIME) {
    /* There is no "all time" pill. A year is the longest one there is, and the
       answer above already says the figure covers everything. */
    opts.range = "year";
    opts.note = "all time";
  } else {
    opts.range = "today";
  }
  return opts;
}

/* ---------- part questions ---------- */

const CODE_RE = /\b([A-Z]{3}(?:-[A-Z0-9]{1,4}){2,})\b/i;

/* Everything the shop knows about one part, as label/value pairs. This is the
   answer to "all details about it": if a field is empty it is still listed, as
   "not recorded" — a blank row is a job to do, and leaving the row out makes it
   invisible. */
function partFacts(it, categories) {
  const cat = categories.find((c) => c.key === it.cat);
  const yrs = it.yearFrom
    ? `${it.yearFrom}${it.yearTo && it.yearTo !== it.yearFrom ? `–${it.yearTo}` : ""}`
    : "not recorded";
  const level = reorderLevel(it);
  return [
    { k: "Code", v: it.code },
    { k: "Section", v: cat?.label || it.cat || "not recorded" },
    { k: "Vehicle", v: [it.brand, it.model, it.series].filter(Boolean).join(" ") || "not recorded" },
    { k: "Years", v: yrs },
    { k: "Side", v: it.side || "not recorded" },
    { k: "Variant", v: it.variant || "—" },
    { k: "Condition", v: it.condition || "not recorded" },
    { k: "Colour", v: it.color || "not recorded" },
    { k: "In stock", v: `${plural(num(it.qty), "piece")}${isOutOfStock(it) ? " — finished" : isLowStock(it) ? ` — at or below its level of ${level}` : ""}` },
    { k: "Price", v: num(it.price) ? money(it.price) : "not priced yet" },
    { k: "Where", v: it.location || "not recorded" },
    { k: "Supplier", v: it.supplier || "—" },
    { k: "Photos", v: it.images?.length ? plural(it.images.length, "photo") : "none" },
    { k: "Notes", v: it.notes || "—" },
    { k: "Added", v: it.createdAt ? `${fmtDay(new Date(it.createdAt).getTime())}${it.createdBy ? ` by ${it.createdBy}` : ""}` : "—" },
  ];
}

function partAnswer(raw, low, { items, categories, sales, salesReady = true }) {
  /* A code typed in full is not a description — it is the one part, and no
     amount of word matching should be allowed to widen it. */
  const codeHit = raw.match(CODE_RE);
  if (codeHit) {
    const code = codeHit[1].toUpperCase();
    const it = items.find((i) => i.code.toUpperCase() === code);
    if (!it) {
      /* The first three groups of a code are its section, make and model, so
         searching those shows the family the code was meant to be in — which is
         what somebody who mistyped a digit actually needs to see.

         It does NOT offer the Ledger. The movements of a deleted part do survive
         in the database, but the Ledger screen finds a part through the stock
         list first, so a code that isn't on the list opens an empty screen. A
         button that promises a history it cannot reach is worse than no button. */
      const family = code.split("-").slice(0, 3).join("-");
      return answer("Not found", [
        `Nothing in stock has the code ${code}.`,
        "Check the code against the part, or look through the ones like it.",
      ], { go: { tab: "search", options: { q: family }, label: `Show every ${family}…` } });
    }
    return onePart(it, categories, sales, salesReady);
  }

  const cleaned = stripAsk(raw);
  if (!cleaned) return null;
  const sel = selectParts(cleaned, items, categories);

  /* A word it couldn't read stops the answer even when other words in the
     question DID match, and that is the whole point of this branch.

     "Do we have a lamborghini bumper" matches the two bumper sections and not the
     make, so ignoring the word it failed on answers "yes, three of them" about
     Toyota bumpers. A wrong yes sends somebody to the shelf for a part that was
     never there, and they believe the app rather than the shelf. Saying which
     word was missed costs one retype and cannot mislead. */
  if (sel.unknownWords?.length) {
    const matched = (sel.terms || []).map((t) => t.label).filter(Boolean).join(" · ");
    return answer("I don't know that word", [
      `I don't know “${sel.unknownWords.join(" ")}”, so I won't answer in case I answer about the wrong parts.`,
      matched
        ? `I did read ${matched}. Ask again without the word I missed and I'll list those.`
        : "Try the section name as it appears in Inventory, plus the make or model — “premio front bumper”, “vitz headlight”.",
    ], { go: { tab: "search", options: { q: cleaned }, label: "Search for it instead" } });
  }
  if (!sel.codes.length) {
    return answer("Nothing matches", [
      sel.everything
        ? "There is nothing in stock at all."
        : `Nothing in stock matches ${sel.describe}.`,
    ], { go: { tab: "search", options: { q: cleaned }, label: "Search for it" } });
  }

  const byCode = new Map(items.map((i) => [i.code, i]));
  const found = sel.codes.map((c) => byCode.get(c)).filter(Boolean);
  if (found.length === 1) return onePart(found[0], categories, sales, salesReady);

  const pieces = found.reduce((s, i) => s + num(i.qty), 0);
  const onShelf = found.filter((i) => !isOutOfStock(i));
  const finished = found.length - onShelf.length;
  const prices = found.map((i) => num(i.price)).filter((p) => p > 0).sort((a, b) => a - b);
  const value = found.reduce((s, i) => s + num(i.qty) * num(i.price), 0);

  const lines = [
    pieces > 0
      ? `Yes — ${plural(pieces, "piece")} on the shelf, across ${plural(found.length, "part")}.`
      : `On the list, but none on the shelf — all ${plural(found.length, "part")} read zero.`,
    `Chosen by: ${sel.describe}.`,
  ];
  if (prices.length) {
    lines.push(
      prices[0] === prices[prices.length - 1]
        ? `All at ${money(prices[0])}.`
        : `${money(prices[0])} to ${money(prices[prices.length - 1])}.`
    );
  }
  if (finished) lines.push(`${finished} of them ${finished === 1 ? "is" : "are"} finished and cannot be sold until restocked.`);
  if (value) lines.push(`Worth ${money(value)} at the shelf price.`);

  const shown = found.slice(0, 15);
  return answer(pieces > 0 ? "In stock" : "None on the shelf", lines, {
    rows: shown.map((i) => ({
      a: i.code,
      b: [i.brand, i.model, i.side && i.side !== "Not Applicable" ? i.side : ""].filter(Boolean).join(" ") || i.name,
      c: `${i.qty} × ${num(i.price) ? money(i.price) : "no price"}`,
      note: [i.condition, i.location].filter(Boolean).join(" · "),
      tone: isOutOfStock(i) ? "warn" : "",
    })),
    more: found.length > shown.length ? `and ${found.length - shown.length} more.` : "",
    go: { tab: "search", options: { q: cleaned }, label: "Open them in Search" },
  });
}

function onePart(it, categories, sales, salesReady = true) {
  const live = sales.filter((s) => !s.returnedAt && s.code === it.code);
  const lastSale = live.length ? live.reduce((a, b) => (a.ts > b.ts ? a : b)) : null;
  const lines = [
    isOutOfStock(it)
      ? `${it.name || it.code} is finished — zero on the shelf.`
      : `${it.name || it.code} — ${plural(num(it.qty), "piece")} on the shelf at ${num(it.price) ? money(it.price) : "no price set"}.`,
    it.location ? `Kept at ${it.location}.` : "No shelf location recorded for it.",
  ];
  if (!salesReady) {
    /* "It has never been sold" is a claim, not an absence of one, and an
       unreadable register would have it said about the shop's best seller. */
    lines.push("I can't see the sales register just now, so I can't say what it has sold.");
  } else if (live.length) {
    lines.push(
      `Sold ${plural(live.reduce((s, x) => s + num(x.qty), 0), "piece")} altogether, last on ${fmtDay(lastSale.ts)}.`
    );
  } else {
    lines.push("It has never been sold.");
  }
  return answer(it.name || it.code, lines, {
    facts: partFacts(it, categories),
    /* A finished part sends you to Add New Stock, not to Sell. Offering to sell
       a part with none on the shelf is offering a button that can only fail —
       and the reason somebody looked it up is usually that it needs restocking. */
    go: isOutOfStock(it)
      ? { tab: "stock", options: { code: it.code }, label: "Add stock for it" }
      : { tab: "sell", options: { code: it.code }, label: "Sell it" },
    goAlt: { tab: "ledger", options: { code: it.code }, label: "Its full history" },
  });
}

/* Said instead of a figure when the register could not be read. Reports has the
   same fallback and says so on screen, which is where somebody who needs a
   number anyway should be sent. */
function registerUnreadable() {
  return answer("I can't see the sales register", [
    "The list of sales didn't come back from the database, so any figure I gave you would be wrong rather than small.",
    "Check the connection and ask again. Reports falls back to the activity feed, which is capped at the last 200 things that happened — near enough for today, not for a month.",
  ], { go: { tab: "reports", options: { range: "today" }, label: "Open Reports anyway" } });
}

/* ---------- whole-shop questions ---------- */

function shopAnswer(raw, low, { items, categories, sales, now, salesReady = true }) {
  const pieces = items.reduce((s, i) => s + num(i.qty), 0);
  const value = items.reduce((s, i) => s + num(i.qty) * num(i.price), 0);
  const low_ = items.filter((i) => isLowStock(i) && !isOutOfStock(i));
  const gone = items.filter(isOutOfStock);

  if (/\b(low|reorder|running out|nearly|almost|finish)\b/.test(low)) {
    if (!low_.length && !gone.length) {
      return answer("Nothing is low", [
        "Every part is above its own reorder level.",
        "Most parts here are held one at a time, so their level is zero — they only appear when they have genuinely sold out.",
      ], { go: { tab: "lowstock", label: "Open Low Stock" } });
    }
    return answer("Low and finished stock", [
      `${plural(low_.length, "part")} at or below its level, and ${plural(gone.length, "part")} finished.`,
    ], {
      rows: [...gone, ...low_].slice(0, 15).map((i) => ({
        a: i.code,
        b: [i.brand, i.model].filter(Boolean).join(" ") || i.name,
        c: isOutOfStock(i) ? "finished" : `${i.qty} left`,
        note: `level ${reorderLevel(i)}`,
        tone: isOutOfStock(i) ? "warn" : "",
      })),
      more: low_.length + gone.length > 15 ? `and ${low_.length + gone.length - 15} more.` : "",
      go: { tab: "lowstock", label: "Open Low Stock" },
    });
  }

  if (/\b(out of stock|finished|zero|nothing left|sold out)\b/.test(low)) {
    return answer("Finished parts", [
      gone.length
        ? `${plural(gone.length, "part")} read zero and cannot be sold until restocked.`
        : "Nothing reads zero — every part on the list has at least one piece.",
    ], {
      rows: gone.slice(0, 15).map((i) => ({
        a: i.code,
        b: [i.brand, i.model].filter(Boolean).join(" ") || i.name,
        c: "finished",
        note: i.location || "",
        tone: "warn",
      })),
      more: gone.length > 15 ? `and ${gone.length - 15} more.` : "",
      go: { tab: "lowstock", label: "Open Low Stock" },
    });
  }

  const today = periodRange("today", now);
  const soldToday = sales.filter((s) => !s.returnedAt && s.ts >= today.from && s.ts < today.to);
  const tt = totals(soldToday);
  return answer("The shop right now", [
    `${plural(items.length, "part")} on the list, ${plural(pieces, "piece")} on the shelves.`,
    `Worth ${money(value)} at shelf prices.`,
    `${plural(low_.length, "part")} low, ${plural(gone.length, "part")} finished.`,
    !salesReady
      ? "I can't see the sales register just now, so I can't tell you today's takings."
      : soldToday.length
        ? `Today: ${plural(tt.count, "sale")}, ${money(tt.revenue)}${tt.pending ? ` (${money(tt.pending)} owing)` : ""}.`
        : "Nothing sold yet today.",
  ], {
    /* Said plainly because the two figures look like they should be equal and
       are not, and somebody works out which one is wrong every few weeks. */
    footer: "Parts are the different things on the list; pieces are how many of them are on the shelves. One part held once counts as one of each.",
    go: { tab: "reports", options: { range: "today" }, label: "Open Reports" },
  });
}

/* ---------- journeys: "generate a report / statement / receipt" ---------- */

const DO_WORDS = /\b(generate|make|create|write|prepare|produce|draw|draft|do|open|start|new|print|give me|show me|take me|go to|i want|i need|let me)\b/;

const DESTINATIONS = [
  {
    test: /\b(financial statement|statements?|cash ?book|balance sheet|profit(?: and loss)?|p&l|expenses?|books)\b/,
    tab: "finance",
    label: "Financial Statements",
    view: (low) => (/\bexpenses?\b/.test(low) ? "expenses" : "statements"),
    say: "The cash book and the balance sheet are built there from every sale and expense — nothing is typed in twice.",
    admin: true,
  },
  { test: /\b(receipts?|invoice)\b/, tab: "receipt", label: "Receipt", say: "Sales already made are waiting there to be pulled in, so the items don't get typed again — you only put the prices on." },
  { test: /\b(quotations?|quotes?)\b/, tab: "quote", label: "Quotation", say: "A quotation written there can be fetched into a receipt later with one button." },
  { test: /\breports?\b/, tab: "reports", label: "Reports", say: "Pick the period, filter by person or by what is unpaid, and print the page." },
  { test: /\b(low stock|reorder)\b/, tab: "lowstock", label: "Low Stock" },
  { test: /\b(ledger|history|movements?)\b/, tab: "ledger", label: "Ledger" },
  { test: /\b(print(?:ing)? (?:the )?(?:list|stock)|stock list|catalogue|catalog)\b/, tab: "print", label: "Print Stock List" },
  { test: /\b(credit accounts?|debtors?|who owes)\b/, tab: "credit", label: "Credit Accounts" },
  { test: /\b(transfers?|another (?:shop|branch)|branch)\b/, tab: "transfers", label: "Branch Transfers" },
  { test: /\b(sell|sale of a|record a sale)\b/, tab: "sell", label: "Sell Item" },
  { test: /\b(whole list|paste|bulk)\b/, tab: "bulk", label: "Add a Whole List" },
];

function journeyAnswer(raw, low, { now }) {
  if (!DO_WORDS.test(low)) return null;
  /* An instruction about the shape of the stock list is not a journey, even
     though "make" appears in both. command.js owns that sentence. */
  if (/\b(category|categories|section|sections)\b/.test(low)) return null;
  /* "Show me what is low on stock" wants the list, not a button. Anything asking
     what, which, who or how many is answered with figures below, and those
     answers carry the button anyway — so a question never loses the journey, but
     a journey can lose the figures, which is why this test is here and not
     further down. */
  if (DATA_QUESTION.test(low)) return null;

  for (const d of DESTINATIONS) {
    if (!d.test.test(low)) continue;
    const period = readPeriod(low, now);
    const options = {};
    if (d.tab === "reports") Object.assign(options, reportTarget(low, period));
    if (d.tab === "finance") options.view = d.view ? d.view(low) : "statements";

    const lines = [`${d.label} is the screen that does that.`];
    if (d.tab === "reports" && period) lines.push(`It will open on ${period.label}.`);
    if (d.say) lines.push(d.say);
    if (d.admin) lines.push("Admin only — the database blocks it for everybody else, not just the screen.");
    return answer(`Open ${d.label}`, lines, {
      topic: "goto",
      go: { tab: d.tab, options, label: `Open ${d.label}` },
    });
  }
  return null;
}

/* ---------- the one entry point ---------- */

function answer(title, lines, extra = {}) {
  return {
    kind: "answer",
    topic: extra.topic || "figure",
    title,
    lines: (lines || []).filter(Boolean),
    facts: extra.facts || null,
    rows: extra.rows || null,
    more: extra.more || "",
    footer: extra.footer || "",
    scope: extra.scope || "",
    window: extra.window || null,
    go: extra.go || null,
    goAlt: extra.goAlt || null,
  };
}

/* Read a question. Returns an answer, or null when the text is not a question
   at all — in which case the caller passes it to readCommand(), which is the
   half that changes things.

   Never returns null for something question-shaped. A question it cannot answer
   comes back as a list of what can be asked: the person retypes and gets an
   answer, instead of retyping and getting "I didn't follow that" twice. */
export function askShop(
  text,
  /* salesReady is whether the sales register actually answered. An empty
     register and an unreadable one look identical from here, and "no sales
     today" said confidently about a day that had ten is the worst thing this
     file could do — so when it is false the sales half says it cannot see
     rather than reporting zero. */
  { items = [], categories = [], sales = [], now = new Date(), salesReady = true } = {}
) {
  const raw = tidy(text);
  if (!raw) return null;
  const low = raw.toLowerCase();

  /* Journeys first. "generate a report for last month" is not a question about
     figures — it is a request for the screen that prints them — and answering it
     with the figures would leave the person still looking for the button. */
  const journey = journeyAnswer(raw, low, { now });
  if (journey) return { ...journey, raw };

  /* A code jumps the queue, before the question test rather than after it.
     "All details about SMI-TOY-FIE-16-0006" contains no question word at all —
     it is phrased as an order — and a part code is unambiguous enough that
     nothing else it could be is worth protecting.

     Except an order that names one: "set FBM-TOY-PRE-16-0001 price to 9000" is a
     price change and command.js should have it, so a setting verb hands it back. */
  if (CODE_RE.test(raw) && !/\b(set|put|make|change|update|adjust|mark)\b/.test(low)) {
    const p = partAnswer(raw, low, { items, categories, sales, salesReady });
    if (p) return { ...p, raw };
  }

  if (!looksLikeAsk(raw)) return null;

  if (SALES_WORDS.test(low)) {
    if (!salesReady) return { ...registerUnreadable(), raw };
    return { ...salesAnswer(raw, low, { sales, items, categories, now }), raw };
  }

  /* "Low on stock" and "low stock" are the same question, and requiring the exact
     phrase sent the first one to the part matcher, which answered "I don't know
     the word low". Anything about being low, needing a reorder or having run out
     is a question about the shop rather than about one part. */
  if (/\b(low|reorder|restock|running out|out of stock|finished|sold out|total stock|whole stock|how (?:many|much) (?:parts|pieces|stock|inventory)|inventory worth|stock worth|the shop|everything)\b/.test(low)) {
    return { ...shopAnswer(raw, low, { items, categories, sales, now, salesReady }), raw };
  }

  const part = partAnswer(raw, low, { items, categories, sales, salesReady });
  if (part) return { ...part, raw };

  return {
    ...answer("I'm not sure what you're asking", [
      "I can answer three kinds of thing, and open any screen that makes a document.",
    ], {
      topic: "unsure",
      rows: [
        { a: "Sales", b: "what sales were made today · how much did we make this month · who sold the most · what is still unpaid", c: "" },
        { a: "Stock", b: "do we have a premio front bumper · all details about SMI-TOY-FIE-16-0006 · what is low on stock", c: "" },
        { a: "Papers", b: "generate a report for last month · write a receipt · open the financial statement", c: "" },
      ],
    }),
    raw,
  };
}

/* ---------- one door for both halves ----------

   Questions are read FIRST, and the order in which these two run is the whole
   safety of it.

   A question can be mistaken for an order in a way that does damage. "What is
   the price of a premio bumper" is read by the order side as price-setting, and
   the number it finds is the "a" in "a premio" — the word for one — so it comes
   back offering to reprice every Premio bumper in the shop to a single shilling.
   It would still take a press to happen, but nobody should be shown that button
   for having asked a question.

   The reverse mistake is harmless by comparison: an order mistaken for a
   question prints a figure and changes nothing. So questions go first, and
   looksLikeAsk() is kept to real interrogatives so an order can never trip it. */
export function readInstruction(text, ctx = {}) {
  const asked = askShop(text, ctx);
  if (asked) return asked;
  return readCommand(text, ctx);
}

/* Tappable examples, covering both halves. A box that only shows examples of
   changing things teaches the shop that it only changes things. */
export const ASK_EXAMPLES = [
  "what sales were made today",
  "how much did we make this month",
  "do we have a premio front bumper",
  "who owes us money",
  "what is low on stock",
  "generate a report for last month",
  "write a receipt",
  "add a category for boot lights",
  "put all quantities as one",
];
