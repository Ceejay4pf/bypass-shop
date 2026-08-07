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
- **Add New Item** — auto code (e.g. `FBM-MZD-AXL-18-0001`), photos, location, condition, side, colour, low-stock level.
- **Edit Parts** — correct details, price and photos after the fact.
- **Add New Stock** — find a part, increase the quantity, logged with who and when.
- **Print Stock** — a printable list for counting.

**Selling**
- **Sell Item** — quantity, customer, phone, paid or pending. Choose per sale
  whether the goods leave *this* branch's stock or were supplied by another
  branch (in which case our count is untouched).
- **Quick Transaction** — one fast screen for add / sell / adjust.
- **Quotation** — priced quotes, printable or sent on WhatsApp.
- **Receipt** — receipt, invoice or delivery note; automatic **PAID /
  DISCOUNTED / ON CREDIT** stamp; walk-in, referred or commission customer;
  optional 16% VAT either inside the price or added on top.
- **Credit Accounts** — a running balance per garage, with every charge and
  payment (cash, cheque, paybill) itemised on a statement.
- **Branch Transfers** — a record of stock taken to or received from another branch.

**People and oversight**
- **Staff Feed** — shop-floor messages.
- **Notifications** — the activity log that reports to the main shop.
- **Reports** — daily, weekly, monthly, yearly; top sellers; inventory summary; low stock.
- **Staff Approvals / My Permissions** — an admin decides who may delete, edit,
  add items or use Quick Transaction.
- **Settings** — role passwords, staff directory, biometric app lock, shop
  contacts, categories.

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
