# Bypass Shop — Branch Inventory & Sales System

**Jaspare Auto Bypass Shop** · Near Total Northlands · a branch of
**Jaspare Auto (Main Shop)**

## What this system is about

Bypass Shop sells second-hand and new **Japanese car body parts** — headlights,
taillights, bumpers, boots, shocks, doors, grilles, bonnets and side mirrors —
for Suzuki, Toyota, Daihatsu, Subaru, Mitsubishi, Nissan, Honda, Mazda and Isuzu.

This system replaces the exercise book. It answers, at any moment and from any
phone in the shop:

- **What do we have?** Every part carries a generated code, the exact vehicle it
  fits (brand, model, series, year range), its condition, side, colour, price,
  quantity, shelf location and up to four photos — so a new staff member can
  identify the right bumper without asking anyone. The year can be left blank
  when nobody knows it: the part reads **year not known**, its code carries
  `XX` in the year slot, and searching *no year* lists everything still to be
  filled in. Nothing is ever stamped with a guessed year.
- **Where is it?** Warehouse location down to rack, shelf and bin. Search matches
  code, part name, vehicle, year, colour, side or location.
- **What moved, and who moved it?** Every add, sale and adjustment is written to
  a ledger with the staff member's name and the time. Nothing changes silently.
- **What do we owe and who owes us?** Garages that buy on credit have running
  accounts; payments by cash, cheque or paybill are posted against the balance.
- **What did we sell?** Receipts, invoices, delivery notes and quotations print
  or send on WhatsApp, on the shop's letterhead, with optional VAT.
- **What's running out?** Low-stock warnings per part, plus a printable stock
  list for a physical count.

It reports upward too: activity flows into a notifications feed that the main
shop can read, so the branch's day is visible without a phone call.

Runs in any modern browser — phone, tablet or desktop. Data lives in the cloud
and syncs live, so two staff on two phones always see the same stock.

## What it does, screen by screen

**Stock**
- **Dashboard** — stat cards, stock by category, 7-day sales trend, low stock, recent activity.
- **Search Inventory** — pick a category or search everything. Press and hold a
  result for a menu: sell it, quote it, edit it, add information, add stock, or
  view its history.
- **Inventory** — grouped by category, multi-select for bulk add-stock or delete.
- **Low Stock** — everything at or below its own low-stock level.
- **Inventory Ledger** — the full movement history of any part.
- **Add New Item** — auto code (e.g. `FBM-MZD-AXL-18-0001`), photos, location,
  condition, side, colour, low-stock level. Quantity starts at **1**, never 0 —
  see [Quantity is never zero](#quantity-is-never-zero).
- **Add a Whole List** — paste a written list and every line is read into a part.
  Anything on the line that isn't one of the fields is **kept as it was written**
  and saved as a note on the part: "with bracket, small crack on the corner"
  stays on the part instead of being thrown away. Price, quantity, colour, shelf
  and supplier are read off the line too, and sections the shop added itself are
  recognised by name, so a pasted "boot light — Toyota Premio 2016" files itself.
- **Edit Parts** — correct details, price and photos after the fact.
- **Add New Stock** — find a part, increase the quantity, logged with who and when.
- **Print Stock** — a printable list of the parts held. Tick **as many
  categories as you like** (bumpers *and* side mirrors on one list), or a whole
  family at once with one tap — **all** side mirrors, bumpers or lights. Tick
  nothing and the whole shop prints. Optionally limit it to what was added on a
  chosen date. Deliberately shows **no quantity and no price**, so the list can
  be handed to a customer or sent to another branch as it is.

**Selling**
- **Sell Item** — quantity, **the price it actually sold for**, customer, phone,
  paid or pending, and — when it was paid — whether the money went into **Cash**,
  **M-PESA** or the **Bank**, which is what keeps the cash book's three columns
  apart. The price box starts blank and means *the shelf price*, so an ordinary
  sale is one less thing to type; type over it and the screen says how much above
  or below the shelf price the part went for. The shelf price itself is unchanged
  — only this sale. Choose per sale whether the goods leave *this* branch's stock
  or were supplied by another branch (in which case our count is untouched).
- **Quick Transaction** — one fast screen for add / sell / adjust.
- **Quotation** — priced quotes, printable or sent on WhatsApp.
- **Receipt** — receipt, invoice or delivery note; automatic **PAID /
  DISCOUNTED / ON CREDIT** stamp; walk-in, referred or commission customer;
  optional 16% VAT either inside the price or added on top.
- **Credit Accounts** — a running balance per garage, with every charge and
  payment (cash, cheque, paybill) itemised on a statement.
- **Branch Transfers** — a record of stock taken to or received from another branch.

**Money (admin only)**
- **Financial Statements** — a cash book, a trading account and a balance sheet,
  all worked out from the sales, receipts, credit movements, expenses and stock
  already recorded. Viewable for any single month or for the shop's whole life.
  See [Financial statements](#financial-statements) below.

**People and oversight**
- **Staff Feed** — shop-floor messages.
- **Notifications** — the activity log that reports to the main shop.
- **Reports** — daily, weekly, monthly, yearly; top sellers; inventory summary; low stock.
- **Staff Approvals / My Permissions** — an admin decides who may delete, edit,
  add items or use Quick Transaction.
- **Settings** — role passwords, staff directory, biometric app lock, shop
  contacts, and **categories — where an admin adds a section of their own**. See
  [Adding a category](#adding-a-category).

## Who logs in

Two ways, both real Supabase Auth accounts:

1. **Role login** — tap **Admin**, **Management**, **Sales** or **Staff**, type
   **your own name**, enter the role password (starts as `admin123`,
   `management123`, `sales123`, `staff123`). Your name — not the role — is
   stamped on everything you do, so accountability survives a shared password.
   An admin can change any role password in **Settings → Role Passwords**.
2. **Personal account** — a staff member signs up with their own name and
   password, and an admin approves them before they get in.

Admin and Management have full access. Sales and Staff get sensible defaults,
which an admin can widen or narrow per person.

## Security

Passwords are hashed server-side by Supabase and never touch this code. Sessions
are server-issued. Row Level Security means only a signed-in account can read or
write. Every login is recorded, and every stock change carries a name and a
timestamp. An optional biometric lock guards the app on a shared phone.

## Built with

React + Vite + Tailwind CSS on the front end; **Supabase** (Postgres, Auth,
Realtime, Row Level Security) for data; hosted on **Vercel**.

## Run it locally

1. Set up Supabase and your keys — see **[DEPLOYMENT.md](DEPLOYMENT.md)** (Steps 1–3).
2. Copy `.env.example` to `.env` and fill in your Supabase URL + anon key.
3. Then:
   ```bash
   npm install
   npm run dev
   ```

Open the printed URL. On your phone (same Wi-Fi), open the **Network** URL.

Production bundle:

```bash
npm run build
npm run preview
```

## Put it online (free, always-on)

Full step-by-step in **[DEPLOYMENT.md](DEPLOYMENT.md)** — Supabase (database +
auth) + Vercel (hosting). Works from anywhere, even with your laptop off.

## Project structure

- `src/App.jsx` — navigation, permissions and the screen router
- `src/tabs.jsx` — every feature screen
- `src/finance.jsx` — the financial statements screens
- `src/lib/finance.js` — the statement arithmetic, kept testable on its own
- `src/ui.jsx` — shared pieces (item cards, fields, charts)
- `src/LoginGate.jsx` — the login screen (role + personal)
- `src/lib/supabase.js` — the cloud connection
- `src/lib/api.js` — all reads and writes
- `src/lib/auth.js` — sign in, sign up, sessions, role passwords
- `src/lib/roles.js`, `src/lib/roleAccounts.js` — who may do what
- `src/lib/shopInfo.js` — the shop details printed on every document
- `src/lib/hooks.js` — live data hooks with realtime subscriptions
- `supabase/schema.sql` — run this once to build the database
- `supabase/receipts.sql`, `credit_accounts.sql`, `transfers.sql` — the later tables
- `supabase/email_verification.sql` — emailed sign-up codes (see below)
- `supabase/finance.sql` — the financial statements (see below)
- `supabase/part_categories.sql` — the sections the shop adds itself (see below)

### Adding a category

The system starts with thirteen sections — bumpers, mirrors, lights, doors and
the rest. A shop stocks more than that. **Settings → Categories → Add a
section** lets an admin name one: boot lights, hinges, bulbs, headlight
computers, bumper slides, whatever is on the shelf.

An added section behaves exactly like a built-in one. It appears in Add New
Item, Search, Inventory, Print Stock, Sell, Reports and the dashboard, it gets
its own colour and shelf label, and the plain-English list reader learns its
name — so pasting *"boot light — Toyota Premio 2016"* files itself without
anyone choosing a category.

Each section owns a **three-letter code** that starts every part code it ever
issues (`BTL-TOY-PRE-16-0042`). The app suggests one from the name and refuses a
code already in use. Two things follow from that code, and the screen says both:

- **The code can never be changed.** It is already printed inside the code of
  every part filed under it. The name, colour and shelf label can be corrected
  at any time; the three letters cannot.
- **A section can never be deleted.** Deleting it would not delete the parts —
  their codes still start with those letters, and the app would have nothing left
  to name the section with, so a shelf of real stock would read as *unknown*. The
  database has no delete policy at all, so this holds even for an admin.

Adding a section is admin-only; **everybody** can read the list, because a staff
member has to be able to say which section a part belongs to.

To switch it on: run `supabase/part_categories.sql` in the Supabase SQL editor.
It seeds Boot Lights, Hinges, Bulbs and Headlight Computers to start with. Until
you run it the shop simply sees the built-in thirteen and everything else keeps
working — the app never fails closed on this, because a shop that can't list its
own sections can't sell anything.

The admin list in `part_categories.sql`'s `is_shop_admin()` must match
`ADMIN_EMAILS` in `src/lib/roles.js`, or the Add button appears for someone the
database will refuse.

### Quantity is never zero

A part being typed into the system is a part the shop is holding, so the smallest
true quantity is **one**. Leave the box blank and it saves as 1 — in Add New
Item, in Quick Transaction and on every line of a pasted list.

Blank used to save as 0, and "0 in stock" on a shelf with the part sitting on it
reads as sold out. Staff turned customers away over it. **Only a sale, a
deduction or a stock adjustment reaches zero** — so a zero on screen now means
the shelf is genuinely empty.

### Financial statements

**Admin only**, and not only on screen: the tables refuse everybody else, because
a screen the app hides is still a screen anyone can reach with the app's own key.

Three views behind one tab:

- **Cash book** — opening balance, money in, money out and closing balance, in
  separate **Cash / M-PESA / Bank** columns so the drawer can be counted and
  checked against the Cash column. Every entry is listed with a running balance,
  so a shortfall can be traced to the moment it happened. An unpaid sale is not
  here — it is a debt, and reaches the cash book on the day it is paid.
- **Trading account** — sales, cost of what was sold, gross profit, running
  expenses and net profit, plus a breakdown of where the expenses went.
- **Balance sheet** — what the shop owns (cash, M-PESA, bank, stock at cost,
  money owed by credit accounts and on unpaid sales), what it owes, and the
  difference: what the business is worth.

Plus **Expenses**, where money going out is typed in as it is spent, and
**Opening balances**, typed once.

**It has to tally.** The balance sheet ends with a proof line: owned = owed +
worth. If the two sides ever disagree the screen says so in red and tells the
owner not to rely on the figures, rather than quietly showing a wrong total.

Three things worth knowing about the numbers:

- **Nothing is stored.** Every figure is worked out on demand from records that
  already exist, so no total can drift out of agreement with what it came from.
- **Profit is an estimate.** The shop does not record what it paid for each
  part, so the owner's own rule is used: profit is three times the VAT inside a
  sale — 41.4% at 16%. Every screen that shows profit says it is an estimate.
- **Buying stock is not a loss.** It is money out of the drawer, so it is in the
  cash book, but it appears on the balance sheet as stock and becomes a cost only
  when the part sells.
- **Expenses are voided, never deleted.** A voided entry stays on the list
  crossed out with who voided it and why, and stops counting. The database has no
  delete policy, so money out cannot vanish without trace.

To switch it on: run `supabase/finance.sql` in the Supabase SQL editor. Until you
do, the tab loads and says which figures could not be read instead of showing a
screen of zeros as though nothing had been spent.

The admin list in `finance.sql`'s `is_finance_admin()` must match `ADMIN_EMAILS`
in `src/lib/roles.js`. If the app thinks someone is an admin and the database
does not, they get the tab and then an empty screen — which reads as a broken
app rather than a refusal.

### Emailed sign-up codes

Creating an account works the way it does in any other app:

1. **Your details** — name, email, password (typed twice).
2. **Check your email** — a 6-digit code arrives; type it in.
3. The account is created and you're logged straight in.

The account does not exist until the code is right, so an abandoned sign-up
leaves nothing behind and a mistyped address is simply corrected and re-sent.
The code is generated and checked inside the database — only its hash is
stored, it expires after 15 minutes, and it locks after 5 wrong guesses.

Signing **in** still accepts either an email or a name: accounts made this way
are found by their email, while older accounts and the ones an admin creates
under *Staff Approvals* are found by name.

To switch it on:

1. Run `supabase/email_verification.sql` in the Supabase SQL editor.
2. Deploy the sender: `supabase functions deploy send-signup-code --no-verify-jwt`
3. **Verify a domain at [resend.com/domains](https://resend.com/domains)** and set
   the `ALERT_FROM` secret to an address on it.

Step 3 is not optional. Until a domain is verified, Resend will only deliver to
the account owner's own address, so codes never reach anybody else. Until then
the app skips the code screen, creates the account anyway, and says on-screen
that the address wasn't confirmed — because blocking every sign-up until the
shop finishes its email setup would be worse.

## Still to come

M-PESA integration, barcode/QR scanning, supplier management, a customer
database, AI stock predictions and purchase history. The data model already
leaves room for these.

---

Developed by **Josphat Mbugua Kagiri**
