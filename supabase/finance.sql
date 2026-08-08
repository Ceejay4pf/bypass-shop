-- ============================================================
-- BYPASS SHOP - FINANCIAL STATEMENTS
--
-- The shop already records every sale, receipt and credit movement. What it
-- could never show was money going OUT, or where the shop stands overall.
-- Two things were missing, and they are all this file adds:
--
--   expenses          rent, salaries, transport, buying stock - money out.
--                     Without these the cash book only ever grows, and never
--                     matches the notes actually in the drawer.
--
--   finance_opening   what was in Cash / M-Pesa / Bank on the day the shop
--                     started using this system. Without an opening figure
--                     every balance is only "since we installed the app",
--                     which is not the shop's real position.
--
-- Everything else - revenue, profit, debtors, stock value - is worked out
-- from the sales, receipts, credit and inventory tables that already exist.
-- Nothing is duplicated, so no total can drift out of agreement with the
-- records it came from.
--
-- ADMIN ONLY. Costs, profit and total shop worth are not for every member of
-- staff, so the policies below name the admin accounts explicitly rather than
-- relying on the app to hide the screen. A UI-only restriction is no
-- restriction at all: anyone can read the app's own key out of the browser.
--
-- Run once in: Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run.
-- ============================================================

-- ---------- who counts as an admin ----------
-- One place to decide it, so a policy can never disagree with the app.
--
-- This list MUST match ADMIN_EMAILS in src/lib/roles.js. If the app thinks
-- someone is an admin and this function does not, they get the tab and then an
-- empty screen - which reads as a broken app, not as a refusal.
create or replace function public.is_finance_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select lower(email) in (
       'admin@bypassshop.co',       -- role login "Admin"
       'management@bypassshop.co',  -- role login "Management"
       'addamsjmk@gmail.com'        -- owner
     ) from auth.users where id = auth.uid()),
    false);
$$;

grant execute on function public.is_finance_admin() to anon, authenticated;

-- ---------- MONEY OUT ----------
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz not null default now(),
  spent_on    date not null default current_date, -- the day it was actually spent
  category    text not null,                      -- Rent | Salaries | Stock | ...
  description text,
  amount      numeric not null check (amount > 0),
  method      text not null default 'Cash',       -- Cash | M-Pesa | Bank
  reference   text,                               -- receipt no, till no, cheque
  by_name     text,
  created_at  timestamptz not null default now(),
  -- A wrongly typed expense is voided, never erased. Money out is exactly the
  -- kind of record that must not be able to vanish without trace: a deleted
  -- row changes every total below it and leaves nothing to explain why.
  voided_at   timestamptz,
  voided_by   text,
  void_reason text
);

-- Older databases already have the table; add the void columns to those too.
alter table public.expenses add column if not exists voided_at   timestamptz;
alter table public.expenses add column if not exists voided_by   text;
alter table public.expenses add column if not exists void_reason text;

-- The cash book is read a month at a time, newest first.
create index if not exists expenses_date_idx on public.expenses(spent_on desc, ts desc);

alter table public.expenses enable row level security;

drop policy if exists expenses_admin_read on public.expenses;
create policy expenses_admin_read on public.expenses
  for select using (public.is_finance_admin());

drop policy if exists expenses_admin_write on public.expenses;
create policy expenses_admin_write on public.expenses
  for insert with check (public.is_finance_admin());

drop policy if exists expenses_admin_update on public.expenses;
create policy expenses_admin_update on public.expenses
  for update using (public.is_finance_admin());

-- No delete policy on purpose. An expense is voided by an update, which keeps
-- the row and who voided it; RLS with no delete policy means even an admin
-- cannot remove the record through the app.

-- ---------- HOW A SALE WAS PAID ----------
-- The cash book keeps Cash, M-Pesa and Bank apart so the drawer can be
-- counted and checked. The sale register never recorded which, so without
-- this column every sale would land in the Cash column and the drawer would
-- never agree. Older sales stay null and are read as Cash, which is what
-- they nearly always were.
alter table public.sales
  add column if not exists method text;

comment on column public.sales.method is
  'Cash | M-Pesa | Bank. Null on sales taken before this column existed - read as Cash.';

-- ---------- WHERE THE MONEY STARTED ----------
-- A single row. Typed once, when the shop starts using the statements.
create table if not exists public.finance_opening (
  id           int primary key default 1 check (id = 1),
  as_of        date not null default current_date,
  cash         numeric not null default 0,
  mpesa        numeric not null default 0,
  bank         numeric not null default 0,
  -- Money the owner put into the business, and money taken out for personal
  -- use. The balance sheet cannot balance without both.
  capital      numeric not null default 0,
  drawings     numeric not null default 0,
  notes        text,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

alter table public.finance_opening enable row level security;

drop policy if exists opening_admin_read on public.finance_opening;
create policy opening_admin_read on public.finance_opening
  for select using (public.is_finance_admin());

drop policy if exists opening_admin_write on public.finance_opening;
create policy opening_admin_write on public.finance_opening
  for insert with check (public.is_finance_admin());

drop policy if exists opening_admin_update on public.finance_opening;
create policy opening_admin_update on public.finance_opening
  for update using (public.is_finance_admin());

-- ---------- the categories the shop actually spends on ----------
-- Kept in the database, not the app, so the list can grow without a new
-- release. 'Stock' matters most: buying parts is money out of the drawer but
-- it is NOT a loss - it turns into stock on the balance sheet.
create table if not exists public.expense_categories (
  name     text primary key,
  is_stock boolean not null default false,
  sort     int not null default 100
);

insert into public.expense_categories (name, is_stock, sort) values
  ('Stock purchase',   true,  10),
  ('Rent',             false, 20),
  ('Salaries & wages', false, 30),
  ('Transport',        false, 40),
  ('Electricity',      false, 50),
  ('Water',            false, 55),
  ('Airtime & data',   false, 60),
  ('Licences & fees',  false, 70),
  ('Repairs',          false, 80),
  ('Bank charges',     false, 90),
  ('Other',            false, 999)
on conflict (name) do nothing;

alter table public.expense_categories enable row level security;

drop policy if exists cats_read on public.expense_categories;
create policy cats_read on public.expense_categories
  for select using (public.is_finance_admin());

drop policy if exists cats_write on public.expense_categories;
create policy cats_write on public.expense_categories
  for insert with check (public.is_finance_admin());

comment on table public.expenses is
  'Money out. Cash book and profit are worked out from this plus sales - never stored, so totals cannot drift. Rows are voided, never deleted.';
comment on table public.finance_opening is
  'What was in Cash / M-Pesa / Bank when the shop started using the statements. One row.';
comment on column public.expense_categories.is_stock is
  'True = buying stock. Money out of the drawer, but not a loss: it becomes stock on the balance sheet.';
