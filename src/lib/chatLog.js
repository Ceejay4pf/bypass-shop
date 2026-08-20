/* ---------------------------------------------------------
   BYPASS SHOP — the assistant's conversation, kept by the day

   Everything asked and everything changed through the instruction box is
   remembered, so the box stops being a thing you type into and forget and
   becomes a record: what was asked this morning, what the answer was, and which
   forty parts somebody bulk-changed on Tuesday.

   WHY IT IS GROUPED BY DAY
   One long list is the problem. After a week it is a wall of grey that nobody
   scrolls, and the answer from ten minutes ago sits three screens above the
   thing you just typed. So the transcript is cut into days — Today, Yesterday,
   then the date — and only today is open. An older day is one line with a count
   on it until it is tapped.

   Kept on the phone, not in the database. Two reasons: it is one person's own
   working notes rather than a shop record, and nothing in here is worth a
   migration or a network call to read. The real records — the ledger line for
   every changed part, the sale, the notification — are already in the database
   and are not what this file is for.

   The storage is wrapped so a full or blocked localStorage can never be the
   reason the box stops working: a lost transcript is an inconvenience, and a
   thrown error would take the whole screen with it.
--------------------------------------------------------- */

const KEY = "bypass.assistant.chat.v1";

/* How much is kept. Both limits, not either: 300 messages stops a busy shop's
   transcript growing without end, and 60 days stops a quiet one keeping a
   question from last spring at the top of the list for ever. */
const MAX_MESSAGES = 300;
const MAX_DAYS = 60;

const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/* A stable id without Math.random(), which two messages typed in the same
   millisecond would otherwise need. The counter only has to be unique within
   one loaded page, because ids are never compared across devices. */
let seq = 0;
export function newId(ts) {
  seq += 1;
  return `m${ts}-${seq}`;
}

export function pruneChat(list, now = Date.now()) {
  const cutoff = startOfDay(now) - MAX_DAYS * 86400000;
  return (Array.isArray(list) ? list : [])
    .filter((m) => m && Number.isFinite(Number(m.ts)) && Number(m.ts) >= cutoff)
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_MESSAGES);
}

export function loadChat(now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return pruneChat(JSON.parse(raw), now);
  } catch {
    return [];
  }
}

export function saveChat(list, now = Date.now()) {
  const kept = pruneChat(list, now);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* A full or private-mode storage loses the history, which is not worth
       telling anybody about — the answers on screen are unaffected. */
  }
  return kept;
}

export function clearChat() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
  return [];
}

/* How a day is named at the top of its group. Today and Yesterday by name,
   because that is how the shop refers to them; anything older gets its date,
   with the weekday, because "Tuesday" is how somebody remembers when they did
   the thing they are looking for. The year only appears when it isn't this one
   — printing 2026 on every heading is noise until the year turns. */
export function dayLabel(ts, now = Date.now()) {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  if (day === today) return "Today";
  if (day === today - 86400000) return "Yesterday";
  const d = new Date(day);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("en-KE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/* Cut the transcript into days, oldest day first — so the whole thing reads
   top to bottom in time and the newest message sits directly above the box that
   typed it. The older days above it are one folded line each, so what is between
   the heading and today's conversation is a few grey lines rather than a week of
   history.

   Within a day the messages stay in the order they happened: a question and its
   answer read as a pair, and reversing them makes nonsense of both. */
export function groupByDay(list, now = Date.now()) {
  const map = new Map();
  for (const m of pruneChat(list, now)) {
    const key = startOfDay(m.ts);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, items]) => ({
      key,
      label: dayLabel(key, now),
      isToday: key === startOfDay(now),
      count: items.length,
      items,
    }));
}

/* One line describing a day's group when it is folded shut, so it can be
   recognised without opening it. */
export function daySummary(group) {
  const asked = group.items.filter((m) => m.role === "you").length;
  const changes = group.items.filter((m) => m.kind === "done").length;
  const bits = [];
  if (asked) bits.push(`${asked} ${asked === 1 ? "message" : "messages"}`);
  if (changes) bits.push(`${changes} ${changes === 1 ? "change" : "changes"}`);
  return bits.join(" · ") || `${group.count}`;
}
