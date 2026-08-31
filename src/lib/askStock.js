/* ---------------------------------------------------------
   ASKING FOR A PART IN WORDS, AND BEING ANSWERED IN WORDS

   The owner asked for this: "the search module in this shop should be so advanced
   such that you can ask it a certain part is available and it replies as a message
   and tells you where it is".

   So: a box you type a question into, and a sentence back. Not a table you have to
   read — a sentence, because the question was asked in a sentence.

   THE LANGUAGE IS IN HERE AND THE MATCHING IS IN SQL, and that split is the whole
   point of this file existing. owner_find_part() takes an array of words and does
   nothing clever: every word has to appear somewhere in the part. All the
   understanding — that "do we have" is not part of the part's name, that "bumpers"
   and "bumper" are the same thing — happens here, where it is ordinary JavaScript
   that can be run against a list of examples without a database, a login or a
   network. Language is where the mistakes are, so language is what has to be
   testable.

   WHAT IT DELIBERATELY DOES NOT DO. It does not understand grammar, know which word
   is a make and which is a model, or answer anything other than "where is this and
   how many". A question it cannot make sense of turns into the words it could pick
   out and searches for those, which is worse than magic and much better than an
   error message. Nobody has to learn a syntax and nobody can get it wrong.
--------------------------------------------------------- */

/* Words that are how a question is asked rather than what is being asked for. Every
   one of these is here because it would otherwise be required to appear inside the
   part — "do we have a premio bumper" would look for a part whose description
   contains the word "do", and find nothing, which reads exactly like "we have no
   premio bumpers" and is not the same statement at all. */
const NOT_THE_PART = new Set([
  // asking
  "is", "are", "was", "were", "do", "does", "did", "have", "has", "had", "can",
  "could", "would", "will", "shall", "should", "may", "might", "am",
  "i", "we", "you", "he", "she", "it", "they", "me", "us", "my", "our", "your",
  "there", "here", "any", "some", "get", "got", "find", "know", "tell", "show",
  "want", "need", "looking", "look", "search", "check", "see", "give",
  // "is it available", "how many are left", "in stock"
  "available", "availability", "stock", "instock", "remaining", "spare",
  "spares", "part", "parts", "piece", "pieces", "item", "items", "thing",
  "how", "many", "much", "what", "which", "where", "who", "when", "why",
  // "where is it located", "where is it kept" — asking about the shelf, not a shelf
  "located", "locate", "location", "kept", "stored", "sitting", "put", "lying",
  "anywhere", "somewhere", "still", "also", "yet", "now", "today", "please",
  // joining
  "a", "an", "the", "of", "for", "to", "in", "at", "on", "from", "with", "and",
  "or", "but", "that", "this", "these", "those", "as", "by", "be", "been",
  "shop", "shops", "branch", "branches", "store", "stores", "inventory",
  "kindly", "just", "about", "one", "ones",
  /* Contractions arrive here with the apostrophe already stripped by the cleaner
     below, so "doesn't" is "doesnt" by the time it is looked up. Every one of these
     was found by asking a real question and watching the report come back empty,
     because it had gone looking for a part with "doesnt" written on it. */
  "doesnt", "dont", "isnt", "arent", "wasnt", "werent", "havent", "hasnt", "hadnt",
  "cant", "couldnt", "wouldnt", "wont", "shouldnt", "aint",
  /* Words that steer a question rather than describe a part. These are how the four
     reports are asked for — see ownerReport.js — and the steering is read off the
     whole sentence before this runs, so by here they have done their job. Leaving
     them in made "what parts only jaspare has" hunt for a part called "only". */
  "all", "every", "everything", "only", "plenty", "most", "missing", "lack", "lacks",
  "lacking", "none", "report", "reports", "list", "lists", "listing", "breakdown",
  "generally", "general", "specific", "specifically", "both", "either", "else",
  "other", "others", "another", "same", "different", "than", "compare", "compares",
  "comparison", "stocks", "stocked", "quantity", "quantities", "total", "totals",
  "across", "between", "versus", "vs", "against", "overstock", "excess", "biggest",
  "largest", "highest", "fullest", "unique",
  "too", "enough", "more", "less", "fewer", "few", "lot", "lots", "loads", "over",
]);

/* Kept even though they are short: they are what somebody actually typed and they
   narrow a search hard. "lh" and "rh" are how a counter says left-hand and
   right-hand, and a two-letter word is otherwise dropped.

   Lexus IS is missing from this list on purpose. "is" is a question word first —
   "is there a bumper" would become a search for the IS series — and a series nobody
   can search for costs less than a question that never works. Type "is250". */
const SHORT_BUT_REAL = new Set(["lh", "rh", "fr", "rr", "cx", "gs", "bmw", "kia", "vw"]);

/* A trailing "s" is dropped so that one word finds both. It is safe in a way that
   stemming usually is not, because the match is `like '%word%'`: "bumper" is a
   substring of "bumpers", so searching the singular finds the plural too, while
   searching the plural would miss every row somebody typed in the singular. The
   stems are allowed to be non-words — "lexu" still finds "Lexus" — because nobody
   reads them. Only long enough words, so "gas" does not become "ga". */
const stem = (w) => (w.length >= 5 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/* Turn a question into the words worth matching on.

   Punctuation goes, except the hyphen inside a part code and the dot in a decimal —
   "RBM-MZD-ATE-03-0386" and "2.0" both have to survive being typed in. */
export function askWords(question) {
  const raw = String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\-\s]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter(Boolean);

  /* "LEFT" IS TWO WORDS, and which one it is depends on where it sits.

     "How many premio bumpers are left" is asking what remains. "Front left door" is
     asking for the near side of the car. The same four letters, and the difference
     cannot be settled by a list — so it is settled by position: at the very end of a
     question it means remaining, and anywhere else it is a side.

     That is not a guess about grammar, it is how the two are actually typed. Nobody
     ends a request at "left" meaning the side, because "a left" is not a thing you can
     ask for; and nobody says "are left door" meaning remaining. Getting this wrong
     mattered — with "left" always dropped, a search for a front left door returned the
     right-hand ones as well, and they are not the same part or the same money. */
  if (raw.length > 1 && raw[raw.length - 1] === "left") raw.pop();

  const kept = [];
  for (const w of raw) {
    if (NOT_THE_PART.has(w)) continue;
    if (w.length < 3 && !SHORT_BUT_REAL.has(w)) continue;
    const s = stem(w);
    // Checked twice, before and after stemming, so "locations" is dropped for the
    // same reason "location" is rather than surviving on a technicality.
    if (NOT_THE_PART.has(s)) continue;
    if (!kept.includes(s)) kept.push(s);
  }

  /* A question made entirely of question words asked for everything, which the
     database refuses to answer and rightly so. But "do we have any left?" is not
     nothing — it is somebody who has forgotten to say what. An empty list is how
     that gets reported, and the answer below says so in words. */
  return kept;
}

/* Did they ask for a place, a count, or just whether it exists? Only used to choose
   how the sentence opens, because "where is it" answered with "yes, 3" is a reply to
   a different question. */
export function askKind(question) {
  const q = String(question || "").toLowerCase();
  if (/\bwhere\b|\bwhich shop\b|\blocat/.test(q)) return "where";
  if (/\bhow many\b|\bhow much\b|\bcount\b|\bquantit/.test(q)) return "count";
  return "whether";
}

const num = (n) => Number(n || 0);

/* One shop's worth of an answer: how many, and the shelves they are on. */
function byShop(rows) {
  const out = new Map();
  for (const r of rows) {
    const key = r.shop_slug || "";
    if (!out.has(key)) {
      out.set(key, { slug: key, name: r.shop_name || key, qty: 0, parts: 0, places: [] });
    }
    const s = out.get(key);
    s.qty += num(r.qty);
    s.parts += 1;
    const place = String(r.location || "").trim();
    /* "Unassigned" is what the app writes when nobody has said where a part lives.
       Repeating it back as an answer to "where is it" would be a lie dressed as
       information, so it is left out and the sentence says the shop instead. */
    if (place && !/^unassigned$/i.test(place) && !s.places.includes(place)) s.places.push(place);
  }
  return [...out.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

const list = (items) => {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a.join("");
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
};

const shopPhrase = (s) => {
  const where = s.places.length ? ` (${s.places.slice(0, 3).join(", ")})` : "";
  return `${s.qty} at ${s.name}${where}`;
};

/* The reply. An object rather than a string so the screen can show the shops as
   chips under the sentence without splitting the sentence back up, and so this is
   testable by reading `text`.

   `shopCount` is how many shops exist, which the caller knows and this does not. It
   only affects the wording of a miss: "at none of your 4 shops" is a stronger and
   more useful statement than "not found". */
export function answerAbout(question, rows = [], shopCount = 0) {
  const words = askWords(question);
  const asked = words.length ? `“${words.join(" ")}”` : "that";

  if (!String(question || "").trim()) {
    return { text: "Ask for a part — a make, a model, what it is, or a part code.", shops: [], total: 0, kind: "empty" };
  }
  if (!words.length) {
    return {
      text: "I can't tell which part you mean — every word there was a question word. Try a make, a model, or what the part is: \"rear bumper premio\".",
      shops: [], total: 0, kind: "empty",
    };
  }
  if (!rows.length) {
    return {
      text: `Nothing matching ${asked}${shopCount ? ` at any of your ${shopCount} shops` : ""}. ` +
        `Either it has never been booked in, or it is written down under different words.`,
      shops: [], total: 0, kind: "none",
    };
  }

  const shops = byShop(rows);
  const total = shops.reduce((n, s) => n + s.qty, 0);
  const held = shops.filter((s) => s.qty > 0);

  /* A card with a zero on it is not stock. Saying "yes" because a row came back
     would send somebody to a shelf that has nothing on it. */
  if (!held.length) {
    return {
      text: `No — ${asked} is out of stock. ${list(shops.map((s) => s.name))} ${shops.length > 1 ? "have" : "has"} ` +
        `${rows.length === 1 ? "a card" : `${rows.length} cards`} for it, but the count is zero at all of them.`,
      shops, total: 0, kind: "out",
    };
  }

  const spread = held.length === 1
    ? `all of ${held[0].qty === 1 ? "it" : "them"} at ${held[0].name}${held[0].places.length ? ` (${held[0].places.slice(0, 3).join(", ")})` : ""}`
    : list(held.map(shopPhrase));

  const kind = askKind(question);
  const opener = kind === "where"
    ? `${asked}: ${total} in stock`
    : kind === "count"
      ? `${total} in stock`
      : `Yes — ${total} in stock`;

  /* "12 in stock" reads as one part when it is twelve cards, each its own year,
     colour and shelf. Worth a second sentence, because which of the twelve is the
     next question. */
  const many = rows.length > 1 ? ` Across ${rows.length} separate parts.` : "";

  return {
    text: `${opener}, ${spread}.${many}`,
    shops, total, kind: "found",
  };
}
