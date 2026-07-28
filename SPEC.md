# Build prompt — branch inventory & sales system

Everything Bypass Shop contains, written as a spec you can hand to an AI to
build the same system for another shop. Read the **Before you start** section
first, then paste **The prompt**, then work through **Build it in stages**.

---

## Before you start

Don't paste this whole file as one message. An AI will produce something that
builds and looks right but is too big to check, and you'll spend longer fixing
it than building it in pieces. Bypass Shop took many sessions, and the parts
that broke were the ones added fastest.

Decide these five things first, because changing them later means touching
every screen:

1. **What the shop sells**, and its categories (this shop has 13, from Front
   Bumpers to Side Mirrors). This drives the part codes.
2. **Does stock come in multiples?** Used car parts are one-offs — one specific
   bumper is one piece. A shop selling filters or bulbs holds 50 of one line,
   and then reorder levels, batches and supplier pricing matter much more.
3. **Who logs in, and what may each one do?** Be specific per role.
4. **Is there VAT?** Kenya is 16%; a non-registered shop shouldn't print it.
5. **One shop or several?** Multi-branch changes the data model. Bypass Shop
   is one branch that *reports to* a main shop, which is much simpler than
   true multi-branch stock.

Have ready: the shop's exact name, location, phone numbers and emails as they
should print on a receipt, and a Supabase account.

---

## The prompt

> Build a branch inventory and sales system for **[SHOP NAME]**, a shop in
> **[LOCATION]** that sells **[WHAT IT SELLS]**. It reports to **[MAIN SHOP /
> HEAD OFFICE]**.
>
> Staff use it on their **phones**, on the shop floor, standing next to a
> customer. Design for that first: big tap targets, one thing per screen, no
> tiny text, works on a slow connection. Desktop is secondary.
>
> Stack: **React + Vite + Tailwind CSS** (plain JSX, not TypeScript),
> **lucide-react** for icons, **Supabase** for the database, authentication,
> realtime sync and row-level security. Host on **Vercel**. No other
> dependencies — no UI kit, no state library, no ORM.
>
> Two staff on two different phones must always see the same stock, live,
> without refreshing.
>
> Every stock change must record **who did it and when**, and be impossible to
> undo silently.
>
> Build it in the stages listed below. After each stage, stop, tell me what to
> test, and wait. Don't move to the next stage until I confirm.
>
> Write in plain, calm English throughout the UI — the people using this are
> not computer people. Never show a raw error; say what happened and what to
> do about it.

Then paste **one stage at a time** from below.

---

## Build it in stages

### Stage 1 — Data model and one working screen

The inventory table, with a row per part:

| Field | Notes |
|---|---|
| `code` | primary key, generated (see below) |
| `cat` | category key |
| `brand`, `model`, `series` | what it fits |
| `year_from`, `year_to` | fitment range |
| `condition` | Brand New / Genuine Used / Aftermarket / Refurbished |
| `side` | Left / Right / Front / Rear / Pair / Center / Not Applicable |
| `variant` | e.g. Xenon, LED, With Sensor, Sunroof |
| `color`, `name` | |
| `price` numeric, `qty` int | |
| `min_qty` int | this part's own low-stock level, default 3 |
| `location` | shelf address, e.g. `A / Rack 03 / Shelf 02 / Bin 05` |
| `supplier`, `notes` | |
| `images` jsonb | array of data URLs, up to 4 |
| `status` | Active / other |
| `created_by`, `created_at`, `updated_at` | `updated_at` by trigger |

**Generated part codes.** `CAT-BRAND-MODEL-YY[-SIDE][-VARIANT]-SERIAL`, e.g.
`FBM-MZD-AXL-18-0001`. Category key, 3-letter brand code, 3-letter model
abbreviation, 2-digit year, optional side letter, optional variant letter, then
a 4-digit serial that is unique shop-wide and never reused. Staff read these
aloud on the phone, so keep them short and unambiguous.

**Categories** are a fixed list in code — key, label, default shelf, colour.
Bypass Shop has 13. The colour is used consistently in every chart and badge.

Also: a **vehicle brand → model list** so staff pick from a datalist instead
of typing "Toyta".

Deliver: the schema SQL, and a working Inventory screen grouped by category
that reads live from Supabase.

### Stage 2 — Login and permissions

Two ways in, both real Supabase Auth accounts:

- **Role logins** — four shared accounts (**Admin, Management, Sales, Staff**).
  Tap a role, **type your own name**, enter the role password. The name — not
  the role — is stamped on everything, so a shared password doesn't destroy
  accountability. Starting passwords are the role plus 123 (`admin123`,
  `sales123`…). Role accounts create themselves on first use, but **only if
  the typed password is that documented default**, otherwise the first person
  to guess anything would get to set it.
- **Personal accounts** — a staff member signs up with their own name and
  password, and an admin approves them before they get in.

Name-based login: turn a typed name into `<slug>@<something>.co` so staff never
need a real inbox. The domain must be a real TLD — Supabase rejects `.local`.

Admins reset any role password **in the app**, on a throwaway Supabase client
that doesn't persist its session, so the admin stays signed in as themselves.

Per-person capabilities an admin grants or revokes: **delete items, edit parts,
add new items, quick transaction**. Staff can request one; an admin approves or
denies. Plus an admin **force-logout** that signs a device out remotely.

Optional **biometric app lock** (WebAuthn) for a shared shop phone, re-locking
after 3 minutes in the background — not instantly, or a notification forces a
re-unlock.

⚠️ **Enforce every restriction in row-level security, not just the UI.** Hiding
a panel in React hides nothing from anyone who can open a browser console. This
is the single most common thing to get wrong.

### Stage 3 — Stock in and out

- **Add New Item** — full form, generated code, photos.
- **Add New Stock** — find a part, add quantity, logged.
- **Sell Item** — quantity, customer, phone, paid or pending. Per sale, choose
  whether the goods leave **this** branch's stock or were **supplied by another
  branch** (in which case our count is untouched but the sale is still
  recorded). Do the decrement in a **Postgres function**, not in JavaScript, so
  two phones selling the last piece can't both succeed.
- **Quick Transaction** — one fast screen for add / sell / adjust.
- **Adjust** — correct a count, with a **required reason**.
- **Inventory Ledger** — every movement of one part, with who and when.
- **Low Stock** — everything at or below its own `min_qty`.
- **Photos** — up to 4 per part, so a new staff member identifies the right
  bumper without asking. **Downscale on the client** (canvas, max ~1000px,
  JPEG ~0.7) before storing; phone photos are several MB and will bloat the
  database and crawl on a shop connection.

### Stage 4 — Documents

- **Quotation** — priced lines, printable, shareable on WhatsApp.
- **Receipt** — switchable between **Receipt / Invoice / Delivery Note** (a
  delivery note hides all money columns). Automatic **PAID / DISCOUNTED / ON
  CREDIT** stamp, angled, coloured, decided by the numbers rather than typed.
  Customer type: **Walk-in / Referred / Commission**.
- **VAT** — off by default. When on, either **inclusive** (back-calculated,
  `net = total / 1.16`) or **exclusive** (added on top). [RATE]% — Kenya is 16.
  Don't print a PIN until the shop is actually registered.
- **Sequential numbers** from a Postgres sequence, so two phones can't mint the
  same receipt number.
- Put the shop's name, location, phones and emails in **one config file** that
  every document reads, so changing a number once updates everything.
- Print via `window.open()` + an HTML string + `window.print()` — the phone's
  own print-to-PDF. Share via a `wa.me` link. No PDF library.

### Stage 5 — Money owed and moving stock

- **Credit Accounts** — a running balance per customer (here, garages).
  Charges and payments by **cash, cheque or paybill**, each with a reference,
  on a printable statement. Compute the balance in a **Postgres function** so
  it can't drift.
- **Branch Transfers** — a record of stock taken to, or received from, another
  branch.

### Stage 6 — Oversight

- **Dashboard** — stat cards, stock by category, 7-day sales trend, low stock,
  recent activity. Charts hand-rolled in SVG; no chart library for this.
- **Activity log** — every add, sale and adjustment, with the person's name.
  This is what the head office reads.
- **Reports** — daily, weekly, monthly, yearly; top sellers; inventory summary;
  low stock.
- **Print Stock** — a printable list for a physical count.
- **Staff Feed** — shop-floor messages.
- **Settings** — role passwords, staff directory, app lock, shop contacts,
  categories.

**Admin-only:** the activity log, the staff list and the staff directory. In
this shop the owner didn't want staff seeing who did what, or each other's
numbers. Decide this deliberately — and enforce it in RLS.

### Stage 7 — Hardening

- A **search** that matches code, part name, brand, model, series, year,
  condition, colour, side and location — staff search however they think.
- **Press and hold** a search result for a menu: sell it, quote it, edit it,
  add information, add stock, view its history. Each opens with the part
  already selected, so nobody searches for the same part twice.
- **Error boundary** so one broken screen doesn't white-screen the whole app.
- The phone's **back gesture** must step back one screen, not leave the app.
- **Realtime subscriptions** on every table that two people can change at once.
- **Fail open on reads, closed on writes**: if a permission check errors, don't
  lock a staff member out of selling — but never let an unchecked write through.

---

## What this shop got wrong, so you don't

- **RLS was an afterthought.** Panels were hidden in React first and locked in
  the database later. Do it the other way round.
- **Photos went in uncompressed** at first. Multi-MB rows.
- **`capture="environment"`** on the file input forced the camera and blocked
  picking an existing gallery photo. `accept="image/*"` alone offers both.
- **The approval gate locked everyone out.** Only hard-coded admin emails
  bypassed it, so every other account sat on a pending screen with no way
  through. Whatever gate you build, make sure at least one route in always
  works.
- **Nested `<button>` elements** — a photo thumbnail button inside a card
  button. Invalid HTML, and taps land on the wrong one.
- **Receipt and quotation JSX were near-identical**, so edits kept hitting the
  wrong one. Extract the shared document layout early.
- **Em-dashes and box-drawing characters in SQL files** break the Supabase SQL
  editor. Keep migrations plain ASCII.
- **One 200KB screens file.** Split by feature before it gets there.
- **Free-tier Supabase pauses after ~7 days idle**, and a paused project means
  staff can't log in. Know that before it happens on a Monday morning.

---

## Adapting it to a different trade

The skeleton — parts, movements, ledger, roles, documents, credit — fits most
counter-and-stockroom shops. What changes:

- **Multiples instead of one-offs** (hardware, pharmacy, agrovet): reorder
  levels, batch numbers, expiry dates, buying vs selling price and margin.
  Bypass Shop tracks none of these, because a used bumper has no batch.
- **No vehicle fitment**: drop brand/model/year/side/variant, and the code
  generator gets much simpler.
- **Real multi-branch**: stock per branch, not per shop, and transfers that
  actually move quantity rather than just recording that they happened.
- **Barcodes** if the goods carry them — then scanning replaces most searching,
  and the generated-code scheme matters far less.
- **M-PESA**: Daraja API, an STK push, and a webhook Supabase can receive.
