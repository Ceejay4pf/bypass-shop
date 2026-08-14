/* ---------------------------------------------------------
   BYPASS SHOP — the arithmetic behind the Reports screen.

   Kept out of the component so the sums can be checked on their own. Nothing
   here reads the database or React state: give it sales and items, get figures
   back. Every function is safe on an empty list, because an empty period is a
   normal Monday morning and not an error.
--------------------------------------------------------- */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ---- PERIODS ----
   "Monthly" used to mean the last rolling 30 days, which never matches the
   owner's books: on the 20th it covered half of one month and half of another,
   so the figure could not be checked against anything. These are real
   boundaries — a month runs from the 1st to the last day of that month.

   Each period returns { from, to } in milliseconds, `to` exclusive, plus the
   equally-long window before it so a figure can be shown against the last one.
*/
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
const startOfNextDay = (d) => startOfDay(d) + 86400000;

export function periodRange(key, now = new Date(), custom = {}) {
  const d = new Date(now);
  switch (key) {
    case "today":
      return { from: startOfDay(d), to: startOfNextDay(d), label: "Today" };
    case "yesterday": {
      const y = startOfDay(d) - 86400000;
      return { from: y, to: y + 86400000, label: "Yesterday" };
    }
    case "week7":
      return { from: startOfDay(d) - 6 * 86400000, to: startOfNextDay(d), label: "Last 7 days" };
    case "month": {
      const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      return { from, to, label: monthName(d) };
    }
    case "lastMonth": {
      const from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      const to = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return { from, to, label: monthName(new Date(from)) };
    }
    case "year": {
      const from = new Date(d.getFullYear(), 0, 1).getTime();
      const to = new Date(d.getFullYear() + 1, 0, 1).getTime();
      return { from, to, label: String(d.getFullYear()) };
    }
    case "custom": {
      /* A blank end date means "up to today" rather than nothing, because
         someone typing a start date and reading zero sales concludes the
         report is broken. A backwards pair is swapped rather than refused —
         the two boxes look alike and get filled in either order. */
      if (!custom.from) return { from: startOfDay(d), to: startOfNextDay(d), label: "Today", incomplete: true };
      let from = startOfDay(new Date(custom.from + "T00:00:00"));
      let to = custom.to ? startOfNextDay(new Date(custom.to + "T00:00:00")) : startOfNextDay(d);
      // Swapped dates: `to` is exclusive, so unwind that before flipping them.
      if (to <= from) [from, to] = [to - 86400000, from + 86400000];
      return { from, to, label: `${fmtDay(from)} – ${fmtDay(to - 86400000)}` };
    }
    default:
      return periodRange("today", now, custom);
  }
}

/* The window of the same length immediately before this one, for comparison.
   Calendar periods step back a whole calendar unit rather than subtracting
   days, so February compares against January and not against "the 28 days
   before February". */
export function previousRange(key, range, now = new Date()) {
  const d = new Date(now);
  if (key === "month") {
    return {
      from: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
      to: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    };
  }
  if (key === "lastMonth") {
    return {
      from: new Date(d.getFullYear(), d.getMonth() - 2, 1).getTime(),
      to: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
    };
  }
  if (key === "year") {
    return {
      from: new Date(d.getFullYear() - 1, 0, 1).getTime(),
      to: new Date(d.getFullYear(), 0, 1).getTime(),
    };
  }
  const span = range.to - range.from;
  return { from: range.from - span, to: range.from };
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
export const monthName = (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const fmtDay = (ts) =>
  new Date(ts).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

/* Is the period one where a day-by-day trend makes sense? A year drawn as 365
   points is a smear, so it's drawn by month instead. */
export const trendGrain = (range) => ((range.to - range.from) / 86400000 > 62 ? "month" : "day");

/* ---- TOTALS ---- */
export function totals(sales) {
  let units = 0, revenue = 0, paidRevenue = 0;
  for (const s of sales) {
    units += num(s.qty);
    revenue += num(s.total);
    if (s.paid) paidRevenue += num(s.total);
  }
  return { count: sales.length, units, revenue, paidRevenue, pending: revenue - paidRevenue };
}

/* How this figure compares with the same-length window before it.
   Returns null when there is nothing to compare against, so the screen can
   say nothing rather than print a meaningless "+100%" against a zero. */
export function change(now, before) {
  const a = num(now), b = num(before);
  if (b === 0) return a === 0 ? null : { pct: null, dir: "up", first: true };
  const pct = ((a - b) / b) * 100;
  return { pct, dir: pct >= 0 ? "up" : "down", first: false };
}

/* ---- WHAT SOLD ----
   Grouped by part code but LABELLED with the part's name. The chart used to be
   a row of codes like FBM-TOY-PRE-16-0042, which nobody in the shop reads as a
   front bumper — so the one chart meant to say what is selling said nothing.
   `items` is the current stock list, used to recover the name of a part whose
   sale rows predate the name being recorded. */
export function topSelling(sales, items = [], limit = 8) {
  const byCode = new Map(items.map((i) => [i.code, i]));
  const map = new Map();
  for (const s of sales) {
    const code = s.code || "—";
    const cur = map.get(code) || { code, label: "", units: 0, revenue: 0 };
    cur.units += num(s.qty);
    cur.revenue += num(s.total);
    if (!cur.label) {
      const it = byCode.get(code);
      cur.label = s.name || it?.name || (it ? `${it.brand} ${it.model}`.trim() : code);
    }
    map.set(code, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, limit);
}

/* Revenue by section, worked out from the part code's own prefix.

   The prefix is the section key and is stamped into the code for the life of
   the part (BTL-TOY-PRE-16-0042), so it still resolves for a part that has
   since been sold out and removed — which is exactly the part a report about
   the past needs to name. Looking the section up in the current stock list
   would silently drop it. */
export const sectionOf = (code) => String(code || "").split("-")[0].toUpperCase();

export function bySection(sales, categories = []) {
  const meta = new Map(categories.map((c) => [c.key, c]));
  const map = new Map();
  for (const s of sales) {
    const key = sectionOf(s.code) || "—";
    const cur = map.get(key) || { key, units: 0, revenue: 0, count: 0 };
    cur.units += num(s.qty);
    cur.revenue += num(s.total);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      // A code whose section has since been renamed away still has to read as
      // something: the three letters are better than a blank.
      label: meta.get(r.key)?.label || r.key,
      color: meta.get(r.key)?.color || "#6B7480",
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/* ---- TREND ----
   One point per day (or per month for a long period), zero-filled. The gaps
   matter: a dead Tuesday is a fact, and a chart that simply omits it draws a
   flat line through the week and hides it. */
export function trend(sales, range, grain = trendGrain(range)) {
  const buckets = new Map();
  const keyOf = (ts) => {
    const d = new Date(ts);
    return grain === "month"
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Every slot in the period, in order, even the empty ones.
  const cursor = new Date(range.from);
  if (grain === "month") cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  const order = [];
  while (cursor.getTime() < range.to) {
    const k = keyOf(cursor.getTime());
    if (!buckets.has(k)) {
      buckets.set(k, { key: k, ts: cursor.getTime(), value: 0, revenue: 0 });
      order.push(k);
    }
    if (grain === "month") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }

  for (const s of sales) {
    const b = buckets.get(keyOf(s.ts));
    if (!b) continue;   // outside the period — the caller already filtered, but be safe
    b.value += num(s.qty);
    b.revenue += num(s.total);
  }

  /* On a long day-by-day run, labelling every point turns the axis into a
     grey smudge — so only a handful are named, evenly spaced. */
  const pts = order.map((k) => buckets.get(k));
  const every = Math.max(1, Math.ceil(pts.length / 7));
  return pts.map((p, i) => ({
    ...p,
    label:
      grain === "month"
        ? new Date(p.ts).toLocaleDateString("en-KE", { month: "short" })
        : i % every === 0 || i === pts.length - 1
        ? new Date(p.ts).toLocaleDateString("en-KE", { day: "2-digit", month: "short" })
        : "",
  }));
}

/* ---- WHO SOLD ---- */
export function sellers(sales) {
  const map = new Map();
  for (const s of sales) {
    const who = s.by || "Unknown";
    const cur = map.get(who) || { person: who, count: 0, units: 0, revenue: 0, pending: 0 };
    cur.count += 1;
    cur.units += num(s.qty);
    cur.revenue += num(s.total);
    if (!s.paid) cur.pending += num(s.total);
    map.set(who, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
