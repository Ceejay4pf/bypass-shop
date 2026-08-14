-- BYPASS SHOP - Categories the shop adds itself
-- Run once in Supabase -> SQL Editor -> New query -> Run. Safe to re-run.
--
-- The thirteen categories built into the app do not cover everything that
-- comes through the door: boot lights, hinges, bulbs, headlight computers,
-- bumper slides for shapes nobody listed. A part with nowhere to go was
-- being filed under something it isn't, which then hid it from whoever went
-- looking for it. This table holds the extra sections, and an added one
-- behaves like any other from then on.

create table if not exists public.part_categories (
  key         text primary key,          -- 3-letter code prefix, e.g. 'BTL'
  label       text not null,             -- what staff see, e.g. 'Boot Lights'
  shelf       text,                       -- shelf label printed on the list
  color       text,                       -- accent colour in the app
  sort        int  default 100,
  created_at  timestamptz default now(),
  created_by  text
);

create index if not exists part_categories_sort_idx
  on public.part_categories(sort, created_at);

-- ---------- ROW LEVEL SECURITY ----------
-- Everyone signed in must be able to READ these: without them the app cannot
-- name the section a part belongs to, and a whole shelf of stock would show
-- as "unknown category" to staff. Only an admin may add or change one.
alter table public.part_categories enable row level security;

drop policy if exists "part_categories_all" on public.part_categories;

drop policy if exists "part_categories_read" on public.part_categories;
create policy "part_categories_read" on public.part_categories
  for select to authenticated using (true);

drop policy if exists "part_categories_insert" on public.part_categories;
create policy "part_categories_insert" on public.part_categories
  for insert to authenticated with check (public.is_shop_admin());

drop policy if exists "part_categories_update" on public.part_categories;
create policy "part_categories_update" on public.part_categories
  for update to authenticated using (public.is_shop_admin());

-- NO DELETE POLICY, on purpose.
--
-- Deleting a category does not delete the parts filed under it: their codes
-- still start with that prefix and the app would have nothing left to name
-- the section with, so a shelf of real stock would read as "unknown". A
-- category that is no longer used is simply left alone - it costs one line in
-- a picker, which is far cheaper than orphaning stock.
drop policy if exists "part_categories_delete" on public.part_categories;

-- ---------- WHO IS AN ADMIN ----------
-- Its own function rather than reusing is_admin() from admin_only_views.sql,
-- because that file may not have been run on this database and a missing
-- function would make every insert here fail with an error that says nothing
-- about categories. This list MUST match ADMIN_EMAILS in src/lib/roles.js.
create or replace function public.is_shop_admin()
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

grant execute on function public.is_shop_admin() to authenticated;

-- ---------- REALTIME ----------
-- A category added on the counter phone has to appear on the workshop phone,
-- otherwise the second person cannot file the part they are holding.
do $$ begin
  execute 'alter publication supabase_realtime add table public.part_categories';
exception when others then null; end $$;

-- ---------- A few the shop already asked for ----------
-- Seeded so the sections exist the moment this runs. Re-running changes
-- nothing: an existing key is left exactly as it is, prefix included,
-- because parts are already coded under it.
insert into public.part_categories (key, label, shelf, color, sort) values
  ('BTL', 'Boot Lights',          'I-01', '#D4A72C', 10),
  ('HNG', 'Hinges',               'I-02', '#6B7480', 20),
  ('BLB', 'Bulbs',                'I-03', '#E86A6A', 30),
  ('HLC', 'Headlight Computers',  'I-04', '#7C5CD6', 40)
on conflict (key) do nothing;

-- Check it worked:
-- select key, label, shelf from public.part_categories order by sort;
