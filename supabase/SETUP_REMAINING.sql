-- ============================================================
-- BYPASS SHOP — the setup steps still outstanding, in one paste.
--
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- SAFE TO RE-RUN. Every statement is "if not exists" or "or replace", so
-- running it twice does nothing the second time and loses nothing.
--
-- WHAT THIS IS FOR
-- Three screens in the app are finished code sitting on tables that were never
-- created in the live database. Until this is run they answer every request with
-- "Could not find the table ... in the schema cache", which reads to whoever is
-- standing at the counter as "the app is broken". It is not broken; this file
-- has not been pasted.
--
--   1. Branch Transfers          — public.transfers
--   2. Staff Directory           — public.staff_contacts
--   3. Who can be sent a code    — public.staff_reachability()
--
-- Nothing in here touches stock, sales, prices or accounts. It creates two
-- tables that are currently absent and one read-only function.
--
-- IT WORKS EITHER SIDE OF THE MULTI-SHOP MIGRATION.
-- This file has never been run, and supabase/multishop/ now adds a second shop to
-- this database. Whichever goes first, the result is the same: every block below
-- asks whether public.shops exists, and if it does, the two tables are created WITH
-- shop_id from birth and with per-shop policies. Two functions here — order_lookup
-- and staff_reachability — have shop-aware replacements in multishop/04, and this
-- file steps aside rather than overwriting them.
--
-- The reason for the care: a table created without shop_id, in a database that has
-- two shops, is a table where Surefit sees Jaspare's rows. Creating it right is one
-- `if`; noticing it later is a week of confusion.
-- ============================================================


-- ------------------------------------------------------------
-- 0) WHO IS AN ADMIN
--
-- One place decides, so every policy in this shop agrees and adding a future
-- admin means editing a single list. It normally already exists, from
-- supabase/admin_only_views.sql — and if it does it is LEFT ALONE, because that
-- list may have been edited since and this file must not quietly revert it.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    execute $fn$
      create function public.is_admin()
      returns boolean language sql stable security definer
      set search_path = public as $body$
        select coalesce(
          (select lower(email) from auth.users where id = auth.uid())
            in ('admin@bypassshop.co', 'management@bypassshop.co', 'addamsjmk@gmail.com'),
          false)
      $body$;
    $fn$;
    execute 'grant execute on function public.is_admin() to authenticated';
    raise notice 'created public.is_admin()';
  else
    raise notice 'public.is_admin() already exists — left as it is';
  end if;
end $$;


-- ------------------------------------------------------------
-- 1) BRANCH TRANSFERS — public.transfers
--
-- A plain record of stock moving between branches: taken to another shop, or
-- received from one. A LOG ONLY — it does NOT change stock counts. Selling and
-- adding stock are what move numbers, and one movement recorded two ways is how
-- a count starts disagreeing with the shelf.
-- ------------------------------------------------------------
create table if not exists public.transfers (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz default now(),
  direction    text not null,             -- 'out' (taken to another branch) | 'in' (received)
  other_branch text,                      -- the branch it went to / came from
  code         text,                      -- our item code, if it maps to one
  item         text not null,             -- item description
  qty          int not null default 0,
  note         text,
  by_name      text
);

create index if not exists transfers_ts_idx on public.transfers (ts desc);

alter table public.transfers enable row level security;

-- Anybody signed in may record and read a transfer. It is a shop-floor act, not
-- an administrative one: the storekeeper handing parts to the other branch is
-- the person who knows what went.
--
-- Which shop's storekeeper, though. If this database already has more than one
-- business in it, the table is born with shop_id and the policy says "your shop's
-- transfers"; otherwise it is the single-shop rule this file was written with.
do $$
declare v_multi boolean := exists (select 1 from pg_tables
                                    where schemaname = 'public' and tablename = 'shops');
begin
  if v_multi then
    alter table public.transfers
      add column if not exists shop_id uuid references public.shops(id) on delete restrict;
    update public.transfers set shop_id = (select id from public.shops where slug = 'jaspare-auto')
     where shop_id is null;
    alter table public.transfers alter column shop_id set not null;
    create index if not exists transfers_shop_idx on public.transfers (shop_id);

    drop policy if exists "transfers_all" on public.transfers;
    drop policy if exists "shop_staff_all" on public.transfers;
    create policy "shop_staff_all" on public.transfers
      for all to authenticated
      using (shop_id in (select public.my_shop_ids()))
      with check (shop_id in (select public.my_shop_ids()));
    raise notice 'public.transfers created per-shop';
  else
    begin
      create policy "transfers_all" on public.transfers
        for all to authenticated using (true) with check (true);
    exception when duplicate_object then null; end;
  end if;
end $$;

do $$ begin
  execute 'alter publication supabase_realtime add table public.transfers';
exception when others then null; end $$;


-- ------------------------------------------------------------
-- 2) STAFF DIRECTORY — public.staff_contacts
--
-- The shop's phone directory, grouped by department. One row is one phone
-- number, so somebody with two numbers is two rows. Everybody signed in can
-- read it; only an admin can change it.
-- ------------------------------------------------------------
create table if not exists public.staff_contacts (
  id         bigint generated by default as identity primary key,
  dept       text not null default 'General',
  name       text not null,
  role       text,
  phone      text not null,          -- as typed, e.g. "+254 768 553182"
  created_at timestamptz not null default now()
);

create index if not exists staff_contacts_dept_idx on public.staff_contacts (dept);

alter table public.staff_contacts enable row level security;

-- Writing goes through an admin check rather than its own copy of the admin list.
-- An earlier draft of this file listed two addresses by hand and left out
-- management@bypassshop.co, which would have let that admin read the directory
-- and silently fail to edit it.
--
-- WHICH admin check depends on whether this database has two businesses in it.
-- is_admin() is three hardcoded addresses with no idea which shop they are asking
-- about; is_shop_admin_of(shop_id) asks user_shops. With two shops, the first one
-- would hand Surefit's staff phone numbers to Jaspare's owner.
do $$
declare v_multi boolean := exists (select 1 from pg_tables
                                    where schemaname = 'public' and tablename = 'shops');
begin
  if v_multi then
    alter table public.staff_contacts
      add column if not exists shop_id uuid references public.shops(id) on delete restrict;
    update public.staff_contacts set shop_id = (select id from public.shops where slug = 'jaspare-auto')
     where shop_id is null;
    alter table public.staff_contacts alter column shop_id set not null;
    create index if not exists staff_contacts_shop_idx on public.staff_contacts (shop_id);
  end if;

  execute 'drop policy if exists "staff_contacts_read"   on public.staff_contacts';
  execute 'drop policy if exists "staff_contacts_insert" on public.staff_contacts';
  execute 'drop policy if exists "staff_contacts_update" on public.staff_contacts';
  execute 'drop policy if exists "staff_contacts_delete" on public.staff_contacts';

  if v_multi then
    execute 'create policy "staff_contacts_read" on public.staff_contacts
               for select to authenticated using (public.is_shop_admin_of(shop_id))';
    execute 'create policy "staff_contacts_insert" on public.staff_contacts
               for insert to authenticated with check (public.is_shop_admin_of(shop_id))';
    execute 'create policy "staff_contacts_update" on public.staff_contacts
               for update to authenticated using (public.is_shop_admin_of(shop_id))';
    execute 'create policy "staff_contacts_delete" on public.staff_contacts
               for delete to authenticated using (public.is_shop_admin_of(shop_id))';
    raise notice 'public.staff_contacts created per-shop';
  else
    execute 'create policy "staff_contacts_read" on public.staff_contacts
               for select to authenticated using (true)';
    execute 'create policy "staff_contacts_insert" on public.staff_contacts
               for insert to authenticated with check (public.is_admin())';
    execute 'create policy "staff_contacts_update" on public.staff_contacts
               for update to authenticated using (public.is_admin())';
    execute 'create policy "staff_contacts_delete" on public.staff_contacts
               for delete to authenticated using (public.is_admin())';
  end if;
end $$;

do $$ begin
  execute 'alter publication supabase_realtime add table public.staff_contacts';
exception when others then null; end $$;


-- ------------------------------------------------------------
-- 3) WHO CAN BE SENT A CODE — public.staff_reachability()
--
-- Most accounts on this shop were created from a name, so their login address
-- is one the app invented — josphat.kamau@bypassshop.co, with no inbox anywhere
-- behind it. The cost is invisible until the day it matters: that password
-- cannot be reset, that person cannot be emailed a code, and the new-phone code
-- cannot protect them (login_needs_code skips them deliberately, because the
-- alternative is not "more secure", it is "nobody gets in, ever").
--
-- The admin has no way to SEE which accounts those are, so this lists them.
--
-- READ ONLY, ADMIN ONLY, AND NO PASSWORDS. It returns a name, an address, and
-- two yes/no answers. It cannot change anything: only the person themselves can
-- put a real address on their own account, from Settings in the app, and it only
-- takes effect when they open the link sent to the new address.
-- ------------------------------------------------------------
-- If multishop/04 has already run, ITS version is the right one — same columns,
-- but it lists only the staff of shops the caller actually administers. Replacing
-- it with the version below would quietly hand one shop's whole staff list, login
-- addresses included, to the other shop's owner. So: create this only when the
-- multi-shop helpers are absent.
do $outer$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'is_shop_admin_of') then
    raise notice 'public.staff_reachability() left as it is — the per-shop version is already installed';
  else
    execute $fn$
      create or replace function public.staff_reachability()
      returns table (
        id          uuid,
        name        text,
        email       text,
        reachable   boolean,   -- mail could actually get there
        proved      boolean,   -- a code has actually been received and typed back
        devices     int,       -- phones this account is trusted on
        last_signin timestamptz
      )
      language sql stable security definer
      set search_path = public as $body$
        select
          u.id,
          coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)) as name,
          u.email,
          -- The invented domain is the tell. It has never had a mail server.
          (u.email is not null and u.email not ilike '%@bypassshop.co')  as reachable,
          exists (select 1 from public.verified_emails v
                   where v.email = lower(u.email))                        as proved,
          (select count(*)::int from public.trusted_devices d
            where d.email = lower(u.email))                               as devices,
          u.last_sign_in_at
        from auth.users u
        left join public.profiles p on p.id = u.id
        where public.is_admin()          -- not an admin, not a single row
        order by
          (u.email is not null and u.email not ilike '%@bypassshop.co'),
          coalesce(nullif(p.full_name, ''), u.email);
      $body$;
    $fn$;
    execute 'revoke all on function public.staff_reachability() from public, anon';
    execute 'grant execute on function public.staff_reachability() to authenticated';
    raise notice 'created public.staff_reachability()';
  end if;
end $outer$;


-- ------------------------------------------------------------
-- 4) A CUSTOMER CHECKING THEIR OWN ORDER — public.order_lookup()
--
-- The customer page has no login, and public.customer_orders has no anon read
-- policy at all, deliberately: without one, a stranger cannot read anybody's
-- order. That also meant a customer could not read their OWN. They sent a basket,
-- got a reference, and then had nothing but the phone.
--
-- So: one function, and it needs BOTH the reference AND the phone number the
-- order was placed with. The reference alone is not enough — ENQ-2026-0001 counts
-- upwards and anybody could try the next one, which would hand out a stranger's
-- name, number and shopping list. Two facts that only the customer has, and the
-- phone is compared with the digits only so "+254768553182" and "0768 553182"
-- both work.
--
-- It returns one order or nothing. It cannot list, cannot search, and cannot
-- change anything.
-- ------------------------------------------------------------
-- Again: multishop/04 installs a three-argument version that takes the shop's slug,
-- plus a two-argument one that searches every shop and returns NOTHING if the
-- reference and phone match in more than one. Overwriting that with the version
-- below would go back to "the first matching row", and with two shops numbering
-- their orders from ENQ-2026-0001 each, the first matching row is a coin toss over
-- whose name and shopping list gets read out.
do $outer$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'order_lookup'
                and p.pronargs = 3) then
    raise notice 'public.order_lookup() left as it is — the per-shop version is already installed';
  else
    execute $fn$
      create or replace function public.order_lookup(p_ref text, p_phone text)
      returns jsonb
      language plpgsql stable security definer
      set search_path = public as $body$
      declare
        v_ref   text := upper(btrim(coalesce(p_ref, '')));
        v_dig   text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
        v_row   public.customer_orders;
      begin
        -- Nothing half-given. Both or nothing, so this can never degenerate into
        -- "show me the order with this reference".
        if v_ref = '' or length(v_dig) < 7 then
          return null;
        end if;

        select * into v_row
          from public.customer_orders
         where upper(ref) = v_ref
           -- The last 9 digits, so a number saved with 0, with 254, or with +254 all
           -- match the same phone. Kenyan numbers are 9 digits after the leading zero.
           and right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_dig, 9)
         limit 1;

        if v_row.id is null then
          return null;
        end if;

        -- Named one by one rather than to_jsonb(v_row), so a column added to the
        -- table later cannot start leaking through this function by accident.
        -- handled_by is left out on purpose: which member of staff picked it up is
        -- the shop's business, not the customer's.
        return jsonb_build_object(
          'ref',      v_row.ref,
          'ts',       v_row.ts,
          'customer', v_row.customer,
          'note',     v_row.note,
          'items',    v_row.items,
          'pieces',   v_row.pieces,
          'total',    v_row.total,
          'status',   v_row.status
        );
      end $body$;
    $fn$;
    execute 'revoke all on function public.order_lookup(text, text) from public';
    execute 'grant execute on function public.order_lookup(text, text) to anon, authenticated';
    raise notice 'created public.order_lookup()';
  end if;
end $outer$;


-- ------------------------------------------------------------
-- Done. Go back to the app and reload it.
--   Branch Transfers            works
--   Settings → Staff Directory  works
--   Settings → Who can be sent a code   works
--   Customer page → My Orders → Check for the shop's reply   works
-- ------------------------------------------------------------
