/* ---------------------------------------------------------
   READING A LIST OUT LOUD

   A stock list arrives three ways in this shop: typed, pasted, or on a sheet
   somebody sends. This is the fourth — said out loud at the shelf, with the part in
   your hands, which is the only one of the four you can do while holding something.

   WHERE THE LINES COME FROM: THE PAUSES.

   The browser hands back one "final result" per utterance — it decides an utterance
   has finished when the talking stops for a moment. That is exactly the rhythm
   somebody counting a shelf already uses: they say a part, they look at the next
   part, they say that one. So a pause is a new line and nothing has to be announced.
   Somebody who runs two parts together can also say "next item" out loud, which is
   the only spoken command here — see LINE_BREAKS.

   WHAT THIS FILE DOES *NOT* DO: it does not understand parts. Not one word of
   category, brand, model, side or price is decided here. It turns speech into the
   same plain text somebody would have typed and hands it to the same box, so it goes
   through the same reader (parsePartsList) and lands on the same checking screen with
   nothing saved. A dictated list and a pasted list are the same list from here on,
   which means there is no second parser to keep in step with the first.

   Everything above the wrapper is pure text and testable with node. The wrapper
   itself is thin on purpose — the part that cannot be tested should be the part with
   the least thinking in it.

   NOTHING IS SENT ANYWHERE BY THIS APP. The browser's own speech recogniser does the
   listening; in Chrome that means audio goes to Google's service the same way it does
   for the keyboard's microphone key, and in Safari to Apple's. That is worth saying
   plainly on the screen, and it is (see the microphone note in BulkAddTab).
--------------------------------------------------------- */

/* ---------- spoken punctuation ----------

   Only the marks that actually get said while reading a parts list out. "comma" and
   "dash" separate a part from its car; "bracket" wraps a year; "slash" writes a year
   range. Deliberately no "point"/"period": a full stop in the middle of a line would
   split a model name, and the pause already ends the line. */
const PUNCTUATION = [
  [/\b(?:comma)\b/gi, ","],
  [/\b(?:dash|hyphen|minus)\b/gi, "-"],
  [/\b(?:slash|stroke|forward slash)\b/gi, "/"],
  [/\b(?:open|opening)\s+(?:bracket|parenthesis|paren)\b/gi, "("],
  [/\b(?:close|closing)\s+(?:bracket|parenthesis|paren)\b/gi, ")"],
  [/\b(?:colon)\b/gi, ":"],
];

/* ---------- one spoken line, or several ----------

   Said out loud when two parts run together without a pause. Not the bare word
   "next": this shop's own address is "next to Impala" and a supplier's note reads
   "next batch", and a break in the wrong place splits one part across two lines. */
const LINE_BREAKS = /\b(?:next\s+(?:item|part|one|line)|new\s+line)\b/gi;

const UNITS = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const SCALES = { hundred: 100, thousand: 1000 };

const isNumWord = (w) =>
  Object.prototype.hasOwnProperty.call(UNITS, w) ||
  Object.prototype.hasOwnProperty.call(TENS, w) ||
  Object.prototype.hasOwnProperty.call(SCALES, w);

/* A run of number words to one number.

   Ordinary arithmetic — "two thousand five hundred" is 2×1000 + 5×100 — with one
   exception that matters more here than anywhere else in the app: A YEAR IS SAID AS
   TWO NUMBERS. "twenty sixteen" is 2016, not 36, and "nineteen ninety eight" is 1998,
   not 109. Every second line of a stock list carries a year said that way.

   The exception is deliberately narrow. It needs "nineteen" or "twenty" followed by
   something from 10 to 99, so "twenty sixteen" is a year while "twenty five" stays
   twenty-five — because a quantity or a price is far likelier than the year 2005, and
   a wrong year is quieter than a wrong count only until somebody looks for the part.

   Browsers already return digits for many numbers ("2016", "8,500"). This is for
   when they do not, and it must leave a digit alone when they do. */
function runToNumber(words) {
  if (!words.length) return null;

  const first = words[0];
  if (words.length >= 2 && (first === "nineteen" || TENS[first] === 20)) {
    const restWords = words.slice(1);
    const rest = plainNumber(restWords);
    /* No "hundred" or "thousand" anywhere in the tail: "twenty thousand" is money
       and "nineteen hundred" is a price, neither is a year. */
    const scaled = restWords.some((w) => SCALES[w]);
    if (rest !== null && !scaled && rest >= 10 && rest <= 99) {
      return (first === "nineteen" ? 1900 : 2000) + rest;
    }
  }
  return plainNumber(words);
}

function plainNumber(words) {
  let total = 0;
  let group = 0;
  let seen = false;
  for (const w of words) {
    if (UNITS[w] !== undefined) { group += UNITS[w]; seen = true; continue; }
    if (TENS[w] !== undefined) { group += TENS[w]; seen = true; continue; }
    if (w === "hundred") { group = (group || 1) * 100; seen = true; continue; }
    if (w === "thousand") { total += (group || 1) * 1000; group = 0; seen = true; continue; }
    return null;
  }
  return seen ? total + group : null;
}

export function wordsToNumbers(text) {
  const tokens = String(text || "").split(/(\s+)/);
  const out = [];
  let run = [];

  const flush = () => {
    if (!run.length) return;
    /* The gap after the last number word belongs to the sentence, not to the number.
       Kept, and put back on the far side, or "twenty sixteen at 8500" comes out as
       "2016at 8500" — which the price reader then cannot see. */
    const trailing = [];
    while (run.length && /^\s+$/.test(run[run.length - 1])) trailing.unshift(run.pop());
    const words = run.filter((t) => !/^\s+$/.test(t)).map((t) => t.toLowerCase());
    const n = runToNumber(words);
    /* A run that does not add up is put back exactly as it was said. Losing the
       words would lose the part. */
    out.push(n === null ? run.join("") : String(n));
    out.push(...trailing);
    run = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\s+$/.test(t)) { (run.length ? run : out).push(t); continue; }
    const w = t.toLowerCase().replace(/[.,]$/, "");
    const tail = t.slice(w.length);
    if (isNumWord(w)) {
      run.push(w);
      if (tail) { flush(); out.push(tail); }
      continue;
    }
    /* "two thousand and sixteen" — "and" only counts as part of the number when a
       number is already running and another number word follows it. */
    if (w === "and" && run.length) {
      const next = tokens.slice(i + 1).find((x) => !/^\s+$/.test(x));
      if (next && isNumWord(next.toLowerCase())) { run.push(" "); continue; }
    }
    flush();
    out.push(t);
  }
  flush();
  return out.join("");
}

/* ---------- the three things that need a symbol ----------

   The reader in parseParts.js knows "@ 8500" and "ksh 8500", "x2" and "2 pcs". It
   does not know "at eight thousand five hundred" or "times two", because nobody
   types those. So the words that are only ever said become the symbols that are only
   ever typed, and the reader is left exactly as it is. */
export function spokenSymbols(text) {
  let s = String(text || "");

  /* "at 8500" / "for 8500" / "price 8500" -> "@ 8500". Three digits at least: a
     price in this shop is never under a hundred shillings, and "at 16" would be
     something else entirely. Written after the number words are digits, so the
     spoken form gets here as "at 8500". */
  s = s.replace(/\b(?:at|for|going for|price is|price at)\s+(\d{3,}(?:[.,]\d+)*)/gi, "@ $1");

  /* "times two" -> "x2". Also "by two", which is how a pair of anything gets said. */
  s = s.replace(/\b(?:times|by)\s+(\d{1,3})\b/gi, "x$1");

  /* "shillings" after a number is a price the same way "/=" is. Left as a word would
     read as part of the description. */
  s = s.replace(/(\d)\s*(?:shillings?|bob|ksh|kes)\b/gi, "$1/=");

  return s;
}

export function tidySpoken(text) {
  return String(text || "")
    .replace(/\s+([,:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/* One utterance in, the lines it means out. Empty array for silence, so a caller can
   ignore a result without checking for an empty string first. */
export function spokenToLines(raw) {
  let s = String(raw || "");
  for (const [re, mark] of PUNCTUATION) s = s.replace(re, mark);
  s = s.replace(LINE_BREAKS, "\n");
  s = wordsToNumbers(s);
  s = spokenSymbols(s);
  return s
    .split("\n")
    .map((line) => tidySpoken(line))
    .filter(Boolean);
}

/* Added to what is already in the box, never over it — the same rule as uploading a
   document, and for the same reason: somebody may have typed six lines and then
   picked up the microphone, and losing those six would be this screen's fault. */
export function appendLines(existing, lines) {
  const kept = String(existing || "").replace(/[ \t]+$/g, "");
  const added = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join("\n");
  if (!added) return String(existing || "");
  if (!kept.trim()) return added;
  return `${kept.replace(/\n+$/, "")}\n${added}`;
}

/* ---------------------------------------------------------
   THE WRAPPER

   Every browser on a counter phone here is Chrome, where this is
   webkitSpeechRecognition and has been for years. Safari has it too. Firefox does
   not, and a microphone button that does nothing when pressed is worse than no
   button, so the caller asks first — see speechSupported.
--------------------------------------------------------- */
const Recognition = () =>
  (typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
  null;

export const speechSupported = () => Boolean(Recognition());

/* Kenyan English first, and it is in Chrome's list. A browser that has never heard
   of it says so ("language-not-supported") rather than guessing, so the fallback is
   British English — nearer than American for how a year and a registration are read
   out here. */
const LANGS = ["en-KE", "en-GB"];

/* Errors that are not failures. Silence while somebody walks to the next shelf is
   'no-speech'; that must not switch the microphone off, because they are coming
   back and they will keep talking to a button they think is still on. */
const HARMLESS = new Set(["no-speech", "aborted", "audio-capture-timeout"]);

export function createDictation({ onLines, onPartial, onError, onStateChange } = {}) {
  const Impl = Recognition();
  if (!Impl) {
    return { supported: false, start: () => {}, stop: () => {}, listening: () => false };
  }

  let rec = null;
  let wanted = false;      // has the person asked for the microphone to be ON
  let langAt = 0;
  let restarts = 0;        // an ended-immediately loop must give up, not spin

  const say = (state) => { try { onStateChange?.(state); } catch { /* the screen's problem, not ours */ } };

  const build = () => {
    const r = new Impl();
    r.lang = LANGS[langAt];
    r.continuous = true;      // a shelf takes longer than one sentence
    r.interimResults = true;  // so the screen shows the words arriving
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const said = res[0]?.transcript || "";
        if (res.isFinal) {
          restarts = 0;       // it is working; forget any earlier stumble
          const lines = spokenToLines(said);
          if (lines.length) { try { onLines?.(lines); } catch { /* as above */ } }
        } else {
          partial += said;
        }
      }
      try { onPartial?.(tidySpoken(partial)); } catch { /* as above */ }
    };

    r.onerror = (e) => {
      const code = e?.error || "";
      if (code === "language-not-supported" && langAt < LANGS.length - 1) {
        langAt += 1;
        return;               // onend restarts it, in the next language
      }
      if (HARMLESS.has(code)) return;
      wanted = false;
      say("off");
      try {
        onError?.(
          code === "not-allowed" || code === "service-not-allowed"
            ? "The microphone was blocked. Allow it for this site in the browser's address bar, then press the microphone again."
            : "The microphone stopped. Press it again to carry on."
        );
      } catch { /* as above */ }
    };

    r.onend = () => {
      /* Chrome ends the session by itself after a stretch of quiet even with
         continuous set. While the person still wants it on, it goes back on. */
      if (!wanted) { say("off"); return; }
      if (restarts > 8) { wanted = false; say("off"); try { onError?.("The microphone kept dropping. Press it again to carry on."); } catch {} return; }
      restarts += 1;
      try { rec = build(); rec.start(); } catch { wanted = false; say("off"); }
    };

    return r;
  };

  return {
    supported: true,
    listening: () => wanted,
    start() {
      if (wanted) return;
      wanted = true;
      restarts = 0;
      try {
        rec = build();
        rec.start();
        say("on");
      } catch {
        wanted = false;
        say("off");
        try { onError?.("The microphone would not start. Check that nothing else is using it."); } catch {}
      }
    },
    stop() {
      wanted = false;
      try { rec?.stop(); } catch {}
      say("off");
    },
  };
}
