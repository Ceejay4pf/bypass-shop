-- ============================================================
-- ADMIN-ONLY VIEWS
--
-- The activity log (who sold/added/adjusted what) and the staff
-- lists are for admins and management only. Hiding the panels in
-- the app is not enough on its own: any signed-in account could
-- still read those tables directly. These policies enforce it in
-- the database, which is the part that actually counts.
--
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- One place that decides who is an admin, so every policy agrees
-- and adding a future admin means editing a single list.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select lower(email) from auth.users where id = auth.uid())
      in (
        'admin@bypassshop.co',
        'management@bypassshop.co',
        'addamsjmk@gmail.com'
      ),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;


-- ------------------------------------------------------------
-- NOTIFICATIONS (the activity feed / "reports to main shop" log)
--
-- Staff may still WRITE to it -- selling an item records a line --
-- but only admins may READ it back.
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "staff_all" on public.notifications;

drop policy if exists "notifications_read_admin" on public.notifications;
create policy "notifications_read_admin" on public.notifications
  for select to authenticated using (public.is_admin());

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert to authenticated with check (true);

drop policy if exists "notifications_write_admin" on public.notifications;
create policy "notifications_write_admin" on public.notifications
  for update to authenticated using (public.is_admin());

drop policy if exists "notifications_delete_admin" on public.notifications;
create policy "notifications_delete_admin" on public.notifications
  for delete to authenticated using (public.is_admin());


-- ------------------------------------------------------------
-- PROFILES (the Shop Team list)
--
-- Admins see the whole team. A staff member sees only their own
-- row, which is all the app needs to show their name and check
-- their approval and permissions.
-- ------------------------------------------------------------
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated using (public.is_admin() or id = auth.uid());

-- Unchanged: you may only edit your own profile.
drop policy if exists "profiles_write" on public.profiles;
create policy "profiles_write" on public.profiles
  for update to authenticated using (auth.uid() = id);


-- ------------------------------------------------------------
-- STAFF_CONTACTS (the Team Directory of names + phone numbers)
--
-- Was readable by everyone; now admin-only. Also adds management
-- to the write policies, which previously listed only admin and
-- the owner.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_tables
             where schemaname = 'public' and tablename = 'staff_contacts') then

    execute 'alter table public.staff_contacts enable row level security';

    execute 'drop policy if exists "staff_contacts_read" on public.staff_contacts';
    execute 'create policy "staff_contacts_read" on public.staff_contacts
               for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists "staff_contacts_insert" on public.staff_contacts';
    execute 'create policy "staff_contacts_insert" on public.staff_contacts
               for insert to authenticated with check (public.is_admin())';

    execute 'drop policy if exists "staff_contacts_update" on public.staff_contacts';
    execute 'create policy "staff_contacts_update" on public.staff_contacts
               for update to authenticated using (public.is_admin())';

    execute 'drop policy if exists "staff_contacts_delete" on public.staff_contacts';
    execute 'create policy "staff_contacts_delete" on public.staff_contacts
               for delete to authenticated using (public.is_admin())';
  end if;
end $$;


-- ------------------------------------------------------------
-- Check it worked: run as an admin and you get rows; run as
-- sales/staff and notifications comes back empty.
-- ------------------------------------------------------------
-- select public.is_admin();
-- select count(*) from public.notifications;
