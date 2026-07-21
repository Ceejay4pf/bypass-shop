# Bypass Shop — Going Online (Supabase + Vercel)

This guide takes you from the app running on your laptop to a real website
that works from any phone or computer, anywhere, **even when your laptop is
off** — with a free cloud database, real user login, and live sync between
devices.

Follow the steps **in order**. Everything is free. Take your time.

---

## Overview

| Piece | What it does | Cost |
|-------|--------------|------|
| **Supabase** | Cloud database + user login + realtime sync | Free |
| **Vercel** | Hosts the website, always online | Free |
| **GitHub** | Stores your code; Vercel deploys from it | Free |

You'll do things in this order:
1. Create a Supabase project
2. Run the SQL to build the database
3. Copy your API keys into the app
4. Test locally
5. Create staff login accounts
6. Push the code to GitHub
7. Deploy on Vercel

---

## STEP 1 — Create a Supabase project

1. Go to *** → **Start your project** → sign in with GitHub or email.
2. Click **New project**.
3. Fill in:
   - **Name:** `bypass-shop`
   - **Database Password:** click *Generate a password* and **save it somewhere safe** (you rarely need it, but don't lose it).
   - **Region:** pick the closest to Kenya — **East US** or **EU (Frankfurt)** are fine; closest = fastest.
4. Click **Create new project** and wait ~2 minutes while it sets up.

---

## STEP 2 — Build the database (run the SQL)

1. In your Supabase project, open the left menu → **SQL Editor**.
2. Click **New query**.
3. Open the file [`supabase/schema.sql`](supabase/schema.sql) from this project, **copy everything**, paste it into the editor.
4. Click **Run** (bottom right). You should see *Success. No rows returned*.
5. *(Optional)* To start with the demo parts: New query → paste [`supabase/seed.sql`](supabase/seed.sql) → **Run**.

✅ This created 5 tables, security rules, realtime, and the safe stock functions.
You can see them under **Table Editor** in the left menu.

---

## STEP 3 — Get your API keys into the app

1. In Supabase: left menu → **Project Settings** (gear icon) → **API**.
2. You'll see two things you need:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **Project API keys → `anon` `public`** (a long string)
3. In VS Code, in the project root, **make a copy** of `.env.example` and name it **`.env`**.
4. Open `.env` and paste your values:
   ```
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi... (your long anon key)
   ```
5. Save the file.

> The `anon` key is safe to use in the browser — your data is protected by the
> Row Level Security rules the SQL set up. Never share your *service_role* key
> or database password, though.

---

## STEP 4 — Test it locally

In the VS Code terminal:

```bash
npm install      # if you haven't already
npm run dev
```

Open the printed URL. You should see the **login screen**.
Because there are no accounts yet, do Step 5 first.

---

## STEP 5 — Create staff login accounts

You have two easy options:

**Option A — from the app (simplest):**
1. On the login screen, click **“New staff member? Create an account.”**
2. Enter a name, an email, and a password → **Create Account**.
3. Switch back to **Sign in** and log in.

**Option B — from Supabase dashboard:**
1. Supabase → **Authentication** → **Users** → **Add user** → enter email + password.

> **Turn off email confirmation for a shop tablet** (so new staff can log in
> immediately): Supabase → **Authentication** → **Providers** → **Email** →
> turn **“Confirm email”** OFF → Save. (Fine for an internal shop tool.)

Log in — you're in the dashboard, and your name shows in the header. 🎉

Open the same URL on your **phone** (same Wi-Fi, use the Network URL) or after
Step 7 from **anywhere**. Add a part on one device and watch it appear on the
other within a second — that's realtime sync.

---

## STEP 6 — Put the code on GitHub

1. Create a free account at **https://github.com** if you don't have one.
2. Install **Git** if needed: https://git-scm.com/download/win
3. In the VS Code terminal, from the project folder:
   ```bash
   git init
   git add .
   git commit -m "Bypass Shop — cloud version"
   ```
4. On GitHub: **New repository** → name it `bypass-shop` → **Create** (leave it empty, no README).
5. Copy the commands GitHub shows under *“…or push an existing repository”*, they look like:
   ```bash
   git remote add origin https://github.com/YOUR-NAME/bypass-shop.git
   git branch -M main
   git push -u origin main
   ```

> Your `.env` file is **not** uploaded (it's in `.gitignore`) — your keys stay private. Good.

---

## STEP 7 — Deploy on Vercel (make it always online)

1. Go to **https://vercel.com** → sign in **with GitHub**.
2. **Add New… → Project** → **Import** your `bypass-shop` repo.
3. Vercel auto-detects Vite. Before deploying, expand **Environment Variables** and add the SAME two keys from your `.env`:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Click **Deploy**. Wait ~1 minute.
5. You get a public link like **`https://bypass-shop.vercel.app`** — open it on any device, anywhere. Your laptop can be off. ✅

**One last thing — allow the live site in Supabase:**
Supabase → **Authentication** → **URL Configuration** → add your Vercel URL
(e.g. `https://bypass-shop.vercel.app`) to **Site URL** and **Redirect URLs** → Save.

---

## Updating the app later

Any time you change the code:
```bash
git add .
git commit -m "describe what changed"
git push
```
Vercel automatically rebuilds and redeploys within a minute. That's it.

---

## Troubleshooting

- **“Supabase keys are missing” on the login screen** → your `.env` isn't set,
  or you didn't restart `npm run dev` after editing it. Stop (Ctrl+C) and rerun.
- **Login says “Invalid login credentials”** → the account doesn't exist yet
  (do Step 5), or email confirmation is on and unconfirmed.
- **Data doesn't sync between devices** → confirm the schema ran fully (Step 2);
  Realtime is enabled by the SQL. Check both devices are logged in.
- **Vercel build fails** → make sure you added the two environment variables in
  Vercel (Step 7.3), then **Redeploy**.
- **“permission denied for table …”** → the Row Level Security policies didn't
  run. Re-run `supabase/schema.sql`.

---

## What changed from the local version

- ❌ Removed `localStorage` / `window.storage` for all data.
- ✅ Inventory, notifications, stock movements, and sales now live in Supabase.
- ✅ Real login (hashed passwords, server sessions) — each staff has an account.
- ✅ Realtime sync — every device sees changes instantly.
- ✅ Stock changes are atomic in the database, so two people selling at once
  can't corrupt the count.
- ✅ Stock movement history is a **separate table**, so an item's audit trail
  survives even if the item is deleted.
