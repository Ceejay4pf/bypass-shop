-- ============================================================
-- BYPASS SHOP — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (uses "if not exists" / "or replace").
-- ============================================================

-- ---------- STAFF PROFILES ----------
-- One row per staff account. Linked to Supabase Auth users.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  shop        text default 'Bypass Shop',
  created_at  timestamptz default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- INVENTORY ----------
-- Item code is the primary key (unique across the whole shop).
create table if not exists public.inventory (
  code        text primary key,
  cat         text not null,
  brand       text,
  model       text,
  series      text,
  year_from   int,
  year_to     int,
  condition   text,
  side        text,
  variant     text,
  color       text,
  name        text,
  price       numeric default 0,
  qty         int default 0,
  min_qty     int default 3,
  location    text,
  supplier    text,
  notes       text,
  images      jsonb default '[]'::jsonb,
  status      text default 'Active',
  created_by  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Keep updated_at fresh on every change.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists inventory_touch on public.inventory;
create trigger inventory_touch before update on public.inventory
  for each row execute function public.touch_updated_at();

-- ---------- NOTIFICATIONS (the "reports to Main Shop" feed) ----------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz default now(),
  type        text not null,            -- new_item | stock | sale | adjust | delete
  code        text,
  name        text,
  qty         int,
  by_name     text,                     -- staff who did it
  buyer       text,
  phone       text,
  paid        boolean,
  total       numeric,
  remaining   int
);

-- ---------- STOCK MOVEMENTS (permanent audit trail) ----------
-- NOT linked by a foreign key on purpose: history survives even if the
-- item is later deleted.
create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz default now(),
  code        text not null,
  type        text not null,            -- new_item | stock | sale | adjust | return
  qty         int,
  by_name     text,
  buyer       text,
  supplier    text,
  reason      text,
  paid        boolean,
  remaining   int
);

-- ---------- SALES (dedicated sales register) ----------
create table if not exists public.sales (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz default now(),
  code        text,
  name        text,
  qty         int,
  buyer       text,
  phone       text,
  paid        boolean,
  total       numeric,
  by_name     text
);

-- ---------- UNIQUE SERIAL for inventory codes ----------
-- A global sequence guarantees every generated code is unique even when
-- two devices add an item at the same instant.
create sequence if not exists public.inventory_serial_seq start 1;
create or replace function public.next_inventory_serial()
returns int language sql as $$ select nextval('public.inventory_serial_seq')::int $$;

-- ---------- ATOMIC QUANTITY FUNCTIONS ----------
-- These run inside the database so concurrent sales/restocks can't race.
create or replace function public.add_stock(p_code text, p_amount int)
returns int language plpgsql as $$
declare new_qty int;
begin
  update public.inventory set qty = qty + p_amount
  where code = p_code returning qty into new_qty;
  return new_qty;
end; $$;

create or replace function public.sell_item(p_code text, p_qty int)
returns int language plpgsql as $$
declare new_qty int;
begin
  update public.inventory set qty = greatest(qty - p_qty, 0)
  where code = p_code returning qty into new_qty;
  return new_qty;
end; $$;

create or replace function public.set_qty(p_code text, p_qty int)
returns int language plpgsql as $$
declare new_qty int;
begin
  update public.inventory set qty = p_qty
  where code = p_code returning qty into new_qty;
  return new_qty;
end; $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- Every table is locked down; only signed-in (authenticated) staff
-- can read or write. Anonymous visitors get nothing.
-- ============================================================
alter table public.profiles        enable row level security;
alter table public.inventory       enable row level security;
alter table public.notifications   enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales           enable row level security;

-- Helper macro pattern: authenticated users have full access.
do $$
declare t text;
begin
  foreach t in array array['inventory','notifications','stock_movements','sales'] loop
    execute format('drop policy if exists "staff_all" on public.%I;', t);
    execute format(
      'create policy "staff_all" on public.%I for all
         to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- Profiles: a user can read all profiles but only edit their own.
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_write" on public.profiles;
create policy "profiles_write" on public.profiles for update to authenticated using (auth.uid() = id);

-- ============================================================
-- REALTIME — broadcast row changes to all connected devices
-- ============================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.inventory'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.notifications'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.stock_movements'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.sales'; exception when others then null; end;
end $$;
