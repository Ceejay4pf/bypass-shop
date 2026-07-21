#in your Supabase URL + anon key.
3. Then:
   ```bash
   npm install
   npm run dev
   ```
Open the printed URL. On your phone (same Wi-Fi), open the **Network** URL.

## Put it online (free, always-on)

Full step-by-step in **[DEPLOYMENT.md](DEPLOYMENT.md)** — Supabase (database +
auth) + Vercel (hosting). Works from anywhere, even with your laptop off.

## Project structure

- `src/lib/supabase.js` — the cloud connection
- `src/lib/types.ts` — the shape of every database table
- `src/lib/api.js` — all reads/writes (inventory, sales, movements, notifications)
- `src/lib/auth.js` — sign in / sign up / sessions
- `src/lib/hooks.js` — live data hooks with realtime subscriptions
- `supabase/schema.sql` — run this once to build your database
- `supabase/seed.sql` — optional demo data

Build a production bundle:

```bash
npm run build
npm run preview
```

## Login

Real accounts via Supabase Auth. Create the first staff account from the login
screen (“New staff member? Create an account”) or in the Supabase dashboard →
Authentication → Users. Your name is attached to every action you take.

## Features

- **Dashboard** — stat cards, stock-by-category chart, 7-day sales trend, low-stock summary, recent activity.
- **Search** — matches code, part name, brand, model, series, year, condition, colour, side, location.
- **Inventory** — grouped by category, delete items.
- **Add New Item** — rich auto code (e.g. `FBM-MZD-AXL-18-0001`), image upload, warehouse location, condition, side, colour, low-stock level.
- **Add New Stock** — find a part, increase quantity, logged with who/when.
- **Sell Item** — quantity, customer name, phone, Paid/Pending, auto stock decrement.
- **Notifications** — activity feed (the "reports to main shop" log), filterable.
- **Reports** — daily/weekly/monthly/yearly, top sellers, inventory summary, low-stock report.
- **Settings** — manage categories & locations, JSON backup/restore, future-feature placeholders.

## Security

Authentication is real: Supabase hashes passwords server-side, issues sessions,
and Row Level Security means only signed-in staff can read or write data. Each
staff member has their own account, so "who did what" is authenticated.

## Out of scope (placeholders only)

Multi-branch sync, M-PESA, barcode/QR scanning, supplier management, customer
database, AI predictions, purchase history — the data model leaves room for
these without restructuring.
 Bypass Shop — Branch Inventory & Sales System

A dark, professional inventory & sales system for **Bypass Shop**, a branch of
**Jaspare Auto (Main Shop)**. Runs in any modern browser — desktop, tablet, or
phone. Built with **React + Vite + Tailwind + Supabase**. Data lives in the
cloud with **real login** and **realtime sync** across every device.

## Run it locally

1. Set up Supabase and your keys — see **[DEPLOYMENT.md](DEPLOYMENT.md)** (Steps 1–3).
2. Copy `.env.example` to `.env` and fill 