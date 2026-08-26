-- ============================================================
-- MULTI-SHOP, STEP 1 OF 6 — the three new tables
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- SAFE TO RE-RUN. Every statement is "if not exists" / "or replace" /
-- "on conflict do nothing".
--
-- WHAT THIS STEP DOES
-- Creates the tenant (shops), the places a tenant has (branches), and who is
-- allowed to see which tenant (user_shops). Then it puts every account that
-- already exists into Jaspare Auto, so nobody is locked out.
--
-- WHAT THIS STEP DOES NOT DO
-- It does not touch one existing table, one existing policy, or one existing row
-- of stock. The running app cannot tell this has happened. That is on purpose:
-- if steps 2 to 6 are never run, the shop keeps working exactly as it does today.
--
-- READ THIS BEFORE RUNNING THE WHOLE SET
-- Step 2 puts a shop_id on every table. Between step 2 and the app being
-- redeployed, writes are kept working by a temporary column default. Step 6
-- removes it. Run 1 → 6 in one sitting, on the same day the app deploys.
-- ============================================================


-- ------------------------------------------------------------
-- 1) shops — the business
--
-- The slug is the part that ends up in the address bar, so it is constrained
-- rather than trusted: lower case, digits, single hyphens, nothing else. A slug
-- with a slash or a space in it is a broken route that looks like a typo.
-- ------------------------------------------------------------
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  -- One column beyond the brief. The landing page lists both shops to strangers,
  -- and a shop tile with no way to ring it is worse than no tile at all.
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Older runs of this file may predate the phone column.
alter table public.shops add column if not exists phone     text;
alter table public.shops add column if not exists is_active boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'shops_slug_shape'
                    and conrelid = 'public.shops'::regclass) then
    alter table public.shops
      add constraint shops_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  end if;
end $$;

-- The registered name, not the one the app has been showing. "Super Fix Auto"
-- was never this business's name; it is not carried over, not even as an alias,
-- because an alias is how a wrong name survives a rename.
insert into public.shops (name, slug, phone) values
  ('Jaspare Auto',          'jaspare-auto',      '+254729695400'),
  ('Surefit Autoparts Ltd', 'surefit-autoparts', '+254780643828')
on conflict (slug) do nothing;


-- ------------------------------------------------------------
-- 2) branches — created here, because there has never been one
--
-- The brief described seven branches under Jaspare. In this database there is no
-- branches table, no branch_id column, and nothing scoped by branch — the seven
-- exist only as a hardcoded array in a prototype file with no database behind it.
-- So this is built, not extended.
--
-- Two rows are seeded: the two entries the live app actually names as places.
-- The prototype's other five hold no stock and would make a branch picker that is
-- mostly dead ends; each is one line whenever it becomes real.
--
-- Surefit gets none, as asked.
-- ------------------------------------------------------------
create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete restrict,
  name        text not null,
  code        text not null,
  kind        text,                       -- 'Main Shop' | 'Retail' | 'Warehouse'
  location    text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  -- Codes are unique INSIDE a shop, not across shops. Surefit is entitled to a
  -- branch called MAIN without asking Jaspare's permission.
  unique (shop_id, code)
);

create index if not exists branches_shop_idx on public.branches (shop_id);

insert into public.branches (shop_id, name, code, kind, location, phone)
select s.id, v.name, v.code, v.kind, v.location, v.phone
  from public.shops s
  join (values
    ('Jaspare Auto — Main Shop', 'MAIN', 'Main Shop', 'Main shop', '+254729695400'),
    ('Jeyden Auto Spares',       'JEY',  'Retail',    'South B',   '+254798718321')
  ) as v(name, code, kind, location, phone) on true
 where s.slug = 'jaspare-auto'
on conflict (shop_id, code) do nothing;

-- NO branch_id GOES ON ANY DATA TABLE IN THIS MIGRATION, and that is worth saying
-- out loud because it is the one place the hierarchy is narrowed. Stamping a
-- branch onto 604 parts and every past sale would mean attributing them on the
-- strength of an assumption, and a month later that assumption would be
-- indistinguishable from a count somebody actually took. shops → branches is real
-- after this file. branches → data is a second, smaller step, taken when somebody
-- knows which branch holds what.


-- ------------------------------------------------------------
-- 3) user_shops — who may see which shop
--
-- Two columns beyond the (user_id, shop_id) asked for, both load-bearing:
--
--   role       is_admin() is a hardcoded list of three email addresses with no
--              notion of WHICH shop you administer. Without a per-shop role there
--              is no way to say "admin of Surefit but not of Jaspare", and
--              role-based access cannot be scoped at all.
--
--   branch_id  nullable, so the shop → branch → person chain has somewhere to
--              live later without a second migration. Null means shop-wide, which
--              is what every account is today.
-- ------------------------------------------------------------
create table if not exists public.user_shops (
  user_id    uuid not null references auth.users(id) on delete cascade,
  shop_id    uuid not null references public.shops(id) on delete cascade,
  role       text not null default 'staff'
             check (role in ('staff','manager','admin')),
  branch_id  uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

create index if not exists user_shops_shop_idx on public.user_shops (shop_id);


-- ------------------------------------------------------------
-- 4) THE HELPERS EVERY POLICY IN STEP 5 IS BUILT ON
--
-- Defined here rather than in step 5 because step 4 (functions and views) needs
-- them too, and a policy body is validated the moment it is created — a helper
-- defined later makes the whole script fail with an error that mentions
-- categories or receipts and says nothing about the missing function.
-- ------------------------------------------------------------

-- The shops this account belongs to. security definer so a policy can read
-- user_shops without needing a policy on user_shops to allow it, which would be
-- circular.
create or replace function public.my_shop_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select shop_id from public.user_shops where user_id = auth.uid();
$$;

-- Admin OF A NAMED SHOP — the thing is_admin() cannot express.
create or replace function public.is_shop_admin_of(p_shop uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_shops
     where user_id = auth.uid() and shop_id = p_shop and role = 'admin'
  );
$$;

-- The caller's shop, when there is exactly one of them.
--
-- This exists so the OLD app keeps working during the deploy. Every function the
-- app calls today passes a part code and no shop; the shop-aware versions in step
-- 4 keep a no-shop overload that resolves through here. It returns null rather
-- than a guess when somebody belongs to two shops, so an ambiguous call fails
-- loudly instead of writing to whichever shop came back first.
create or replace function public.my_one_shop()
returns uuid
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then min(shop_id) end
    from public.user_shops where user_id = auth.uid();
$$;

revoke all on function public.my_shop_ids()          from public, anon;
revoke all on function public.is_shop_admin_of(uuid) from public, anon;
revoke all on function public.my_one_shop()          from public, anon;
grant execute on function public.my_shop_ids()          to authenticated;
grant execute on function public.is_shop_admin_of(uuid) to authenticated;
grant execute on function public.my_one_shop()          to authenticated;


-- ------------------------------------------------------------
-- 5) THE MEMBERSHIP BACKFILL — nobody is locked out
--
-- Every account that exists becomes Jaspare staff. The three addresses that
-- is_admin() already trusts become Jaspare ADMINS — and nothing else. Surefit
-- starts with zero members, which means zero people can see it until somebody is
-- put there deliberately (step 7).
-- ------------------------------------------------------------
insert into public.user_shops (user_id, shop_id, role)
select u.id,
       (select id from public.shops where slug = 'jaspare-auto'),
       case when lower(u.email) in ('admin@bypassshop.co',
                                    'management@bypassshop.co',
                                    'addamsjmk@gmail.com')
            then 'admin' else 'staff' end
  from auth.users u
on conflict (user_id, shop_id) do nothing;


-- ------------------------------------------------------------
-- 6) POLICIES ON THE THREE NEW TABLES
-- ------------------------------------------------------------
alter table public.shops      enable row level security;
alter table public.branches   enable row level security;
alter table public.user_shops enable row level security;

-- shops is READABLE BY STRANGERS, on purpose. The landing page has to list the
-- businesses before anybody has signed in, and what it exposes is a name, a slug
-- and a phone number — the same three facts that are about to be in the URL and
-- painted on the shutter.
drop policy if exists "shops_public_read" on public.shops;
create policy "shops_public_read" on public.shops
  for select to anon, authenticated using (is_active);

-- Nobody creates, renames or deletes a shop through the API. It happens in this
-- editor, by a person, once.
revoke insert, update, delete on public.shops from anon, authenticated;

drop policy if exists "branches_read" on public.branches;
create policy "branches_read" on public.branches
  for select to authenticated using (shop_id in (select public.my_shop_ids()));

drop policy if exists "branches_write" on public.branches;
create policy "branches_write" on public.branches
  for all to authenticated
  using (public.is_shop_admin_of(shop_id))
  with check (public.is_shop_admin_of(shop_id));

-- You can see your own memberships; an admin can see their own shop's.
drop policy if exists "user_shops_self" on public.user_shops;
create policy "user_shops_self" on public.user_shops
  for select to authenticated
  using (user_id = auth.uid() or public.is_shop_admin_of(shop_id));

-- NOTE THE DELIBERATE GAP. is_shop_admin_of is checked against the ROW's shop_id,
-- so an admin of Jaspare cannot add anybody to Surefit. That means Surefit's first
-- admin cannot be created through the app at all — it is one insert in this
-- editor, which is step 7. That is correct: a shop that can grant itself
-- membership of another shop is not two shops.
drop policy if exists "user_shops_admin_write" on public.user_shops;
create policy "user_shops_admin_write" on public.user_shops
  for all to authenticated
  using (public.is_shop_admin_of(shop_id))
  with check (public.is_shop_admin_of(shop_id));


-- ------------------------------------------------------------
-- Check it worked:
--   select name, slug, phone from public.shops order by name;
--   select s.name, b.name, b.code from public.branches b
--     join public.shops s on s.id = b.shop_id;
--   select s.slug, us.role, count(*) from public.user_shops us
--     join public.shops s on s.id = us.shop_id group by 1,2;
--
-- Expect: 2 shops, 2 branches (both Jaspare), and ~23 memberships all Jaspare —
-- 3 of them 'admin'. Surefit must show ZERO memberships.
-- ------------------------------------------------------------
