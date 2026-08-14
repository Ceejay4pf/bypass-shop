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
  The first two cards count **different parts** and **pieces on the shelf**, which
  are two different questions — see [Parts and pieces](#parts-and-pieces).
- **Search Inventory** — pick a category or search everything. Press and hold a
  result for a menu: sell it, quote it, edit it, add information, add stock, or
  view its history.
- **Inventory** — grouped by category, multi-select for bulk add-stock or delete.
  Every tile shows both parts and pieces, and the totals are spelled out at the
  bottom so the dashboard's figures can be traced to the sections they came from.
- **Low Stock** — parts that are **finished**, plus any part that has reached a
  reorder level somebody typed on it. Searchable, narrowed by **Finished /
  Running low** and by section, with a **Print list** button. See
  [When a part counts as low](#when-a-part-counts-as-low) and
  [Filtering and printing](#filtering-and-printing).
- **Inventory Ledger** — the full movement history of any part.
- **Add New Item** — auto code (e.g. `FBM-MZD-AXL-18-0001`), photos, location,
  condition, side, colour, low-stock level. Quantity starts at **1**, never 0 —
  see [Quantity is never zero](#quantity-is-never-zero). **Low-stock at** starts
  blank, which means *tell me when it's finished*; type a number only for a part
  that has to be reordered before it runs out.
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
  A part the system says it has **none of is still sellable**: tap it and either
  put the real shelf count in right there, or record it as another branch's
  goods. See [When the count says zero](#when-the-count-says-zero).
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
- **Notifications** — the activity log that reports to the main shop, with a
  search box and a row of names so a day's feed can be read by person or by part.
- **Reports** — Today, Yesterday, Last 7 days, **This month**, **Last month**,
  This year, or **pick your own two dates**; each period says how it compares with
  the one before it; a sales trend chart; where the money came from by section; top
  sellers; and (admin) estimated profit. Filter the sales by **who sold them**
  (tick several people at once), by **paid or pending**, and by anything typed in
  the search box — every total, chart and by-person figure follows the filter —
  then **Print report**. See [What Reports tells you](#what-reports-tells-you) and
  [Filtering and printing](#filtering-and-printing).
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
- `src/lib/reports.js` — the Reports arithmetic (periods, comparisons, trends),
  kept free of React and the database so every sum can be checked on its own
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
- `supabase/low_stock_reset.sql` — clears the reorder levels nobody chose; see
  [When a part counts as low](#when-a-part-counts-as-low)

### The sections stock is filed under

Twenty-six of them, built in and ready to use:

| | |
|---|---|
| **Body** | Wing — Left / Right · Doors · Front Bumpers · Rear Bumpers · Bonnets · Boots · Bumper Slides · Grilles |
| **Lights** | Headlights · Taillights · Boot Lights · Fog Lights · Indicators |
| **Electrical** | Bulbs · Headlight Computers (ballasts, modules) |
| **Mirrors** | Side Mirrors — With Indicator / Plain |
| **Mechanical** | Radiators · Engine Parts · Suspension · Boot Shocks · Hinges |
| **Other** | Interior Parts · Glass & Windscreens · **Other Parts** |

**Other Parts** is the honest home for anything genuinely one-off, so a part
never has to be filed under something it isn't just to get it saved.

There is no *Fenders* section on purpose — a fender **is** a wing, and the two
Wing sections already hold them. A second name for the same shelf would split
the same parts across two codes.

### Adding a section of your own

Still something missing? **Settings → Categories → Add a section** lets an admin
name one — wiper blades, mud flaps, whatever turns up.

An added section behaves exactly like a built-in one. It appears in Add New
Item, Search, Inventory, Print Stock, Sell, Reports and the dashboard, it gets
its own colour and shelf label, and the plain-English list reader learns its
name — so pasting *"wiper blade — Toyota Premio 2016"* files itself without
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

Adding sections of your own needs `supabase/part_categories.sql` run once in the
Supabase SQL editor. That is **optional** — the twenty-six above are built into
the app and need no SQL at all. Until you run it the *Add a section* form is the
only thing that doesn't work; everything else is unaffected, because a shop that
can't list its own sections can't sell anything.

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

### When a part counts as low

**A part is flagged when it is finished.** Not when it is nearly finished — when
there are none left.

That sounds obvious and it wasn't what the app did. Every part carried a
low-stock level of **3**, and the test is *quantity at or below the level*. This
shop holds body parts one at a time — one Premio bonnet, one Harrier bumper — and
one piece is full stock, not a shortage. So nearly every part on the shelves sat
in the reorder list permanently, the list named most of the inventory, and the
number on the dashboard meant nothing. **An alert that is always on is not an
alert.**

The 3 was never anybody's decision. It was the column's default and a value
pre-filled in the form, so it got stamped on parts automatically.

**If a part does need reordering before it runs out** — bulbs, filters, anything
fast-moving — type a number in its **Low-stock at** box. That number always wins,
and the part is flagged the moment it reaches it. Left blank, the part is flagged
only when it hits zero.

Run `supabase/low_stock_reset.sql` once to clear the automatic 3s out of the
database for good. Until you do, the app already ignores a stored 3, so the
reorder list is honest either way — a fix that needs a migration the shop hasn't
run is a fix the shop doesn't have. The one cost: while that SQL is unrun, a
reorder level of *exactly* 3 can't be asked for by hand. Type 2 or 4.

Stock badges follow the same rule. Red **None left** means finished; a blue badge
means the part reached a level somebody set; green is just how many there are.

### Parts and pieces

The dashboard's first two cards count two different things, and used to be
labelled as though they counted the same one — *Inventory Items* against *Total
Stock Qty*. They never matched, and with nothing on screen saying why, that read
as the system contradicting itself.

- **Different parts** — one per row in the stock list. Eight identical headlights
  are **one** part.
- **Pieces on the shelf** — every physical piece added up. Those same eight
  headlights are **eight** pieces.

So the second number is normally the larger, and the two are *meant* to differ.
Both cards now say which they are, and Inventory prints the same two totals at the
bottom of the section tiles, so the dashboard figure can be traced to the sections
it came from.

There was also a real fault behind it. Inventory only drew a tile for a section
the app could name, so a part filed under anything else was **invisible there
while still counted on the dashboard** — the gap the two labels are now honest
about. Those parts get a tile of their own now, headed *Section BTL* or whatever
the three letters are, with a note saying the section needs a name. It happens
when a section was added in Settings but `supabase/part_categories.sql` hasn't
been run on that database.

### When the count says zero

Parts keyed in before that rule existed are still sitting on 0, and Sell Item
used to grey them out — a dead end with a customer standing there, so the sale
went in the exercise book and the system fell further behind.

Now the part is tappable. The screen says *the system says there are none of
these left* and offers the two things that are actually true:

- **It is on the shelf and the count is wrong.** Type how many are really there
  and it is corrected on the spot, logged as a restock with your name on it, then
  the sale goes through. No leaving the screen and searching for the part twice.
- **It came from another branch.** Choose **Another branch** and our count is
  left alone, which is what should happen to goods that were never ours.

Confirming is blocked until one of those is done, because a sale deducted from a
count of none records money against stock that was never there.

### What Reports tells you

**The periods are real calendar periods.** *This month* means the 1st to today,
not the last thirty days; *Last month* is that whole month. **Pick dates** takes
any two days — leave the end blank for "since then, up to today", and a backwards
pair is read the way it was obviously meant rather than refused.

**Every figure says how it compares with the period before.** This month against
last month, Tuesday against Monday. A calendar period steps back a whole calendar
unit, so February compares with January and not with "the 28 days before
February". When there is nothing to compare against, the screen says nothing
rather than printing a triumphant *+100%* against a month of no sales.

**The trend chart** draws the period day by day, or month by month once it is
longer than about two months, and names the best day and how many days were quiet.
A day with no sales is drawn as a zero, not skipped — a dead Tuesday is a fact,
and leaving it out draws a straight line through the week that was never there.

**Where the money came from** breaks the takings down by section, worked out from
the three letters at the front of each part code. That is deliberate: a part that
sold out and was removed from stock still reports correctly, and that is exactly
the part a report about last month is asking about.

**Estimated profit** is admin-only and labelled as an estimate, because it is one:
it is worked back from the sale price on the assumption stated in
[Financial statements](#financial-statements), not from a cost price anybody typed.

**One correctness note.** These figures come from the sales register, not the
activity feed. The feed is capped at 200 rows so it loads fast, which is right for
*what happened today* and wrong for *what did we take this year* — a monthly total
built from it quietly showed roughly the weekly number. If the register can't be
read, the screen says so in amber instead of showing confident, understated
figures.

### Filtering and printing

Three screens — **Reports**, **Notifications** and **Low Stock** — share the same
two controls: a search box, and rows of tappable pills.

A pill with a **tick box** means *tick as many as you like*. That is the whole
point of the change: "what did James **and** Mary sell this week" and "bumpers
**and** grilles that are finished" were questions the screens couldn't answer, so
people added the figures up on paper from the feed and got them wrong. Pills
without a tick box are one-at-a-time — a period, or paid-versus-pending.

The search box matches everything written on the row at once — part name, code,
customer, phone number, who did it — so nobody has to know which field a word
lives in. It has a clear button, because a filter left on by accident is a wrong
number read off a right screen.

**On Reports**, every figure obeys the filters: the totals, the comparison with
the period before, the trend chart, the by-section breakdown, the top-selling
chart and the by-person list. The same filter is applied to *both* periods being
compared, so "James this month against James last month" compares like with like —
a filtered month set against an unfiltered one would read as a collapse in sales.
The stock figures beside them (how many parts, what they're worth, how many are
low) do not follow the filter — how much is on the shelf doesn't change because
you asked what one person sold.

**Two things print.**

- **Reports → Print report** — a sales report of exactly what is on screen, with
  the by-person totals, every sale itemised, and the period, the people and the
  paid/pending choice stated in the header. That header line is deliberate: a page
  of figures that doesn't say what it covers gets filed, found next month, and
  read as the whole month's takings.
- **Low Stock → Print list** — a reorder list to carry to the market. Unlike the
  customer-facing Print Stock list, this one **does** show the quantity, because
  how many are left is the entire question, and it ends with a blank **Bought**
  column to write in what actually came back.

The low-stock list used to be on Reports as well, and the copy there was the
poorer one — no search, no sections, nothing to print. Reports now states the
number and sends you to **Low Stock Alert**, which is the screen that can act on it.

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
