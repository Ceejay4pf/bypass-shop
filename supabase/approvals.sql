-- ============================================================
-- BYPASS SHOP — Admin approval for new accounts
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run.
--
-- After this: a newly signed-up account is "pending" and cannot use the
-- app until an admin approves it from the Staff Approvals screen.
-- All accounts that already exist are grandfathered in (approved).
-- ============================================================

-- 0) Backfill a profile row for every existing auth user. Accounts created
--    before the sign-up trigger existed have no profiles row, so they never
--    appear in Staff Approvals. This creates the missing rows.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- 1) Add the approval flag (defaults to false for all FUTURE sign-ups).
alter table public.profiles
  add column if not exists approved boolean not null default false;

-- 2) Grandfather every account that exists right now, so nobody currently
--    using the system gets locked out by this change.
update public.profiles set approved = true;

-- 3) Admin-only function to approve / revoke another account.
--    SECURITY DEFINER lets it update any row, but it first checks the
--    caller is one of the shop admins (by login email).
create or replace function public.set_user_approved(target uuid, val boolean)
returns void language plpgsql security definer as $$
declare caller_email text;
begin
  select lower(email) into caller_email from auth.users where id = auth.uid();
  if caller_email not in ('admin@bypassshop.co', 'addamsjmk@gmail.com') then
    raise exception 'Only an admin can approve accounts.';
  end if;
  update public.profiles set approved = val where id = target;
end; $$;

-- 4) Broadcast profile changes over realtime, so a pending user's screen
--    unlocks the instant an admin approves them (no refresh needed).
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.profiles'; exception when others then null; end;
end $$;

-- ============================================================
-- 5) PER-ACTION PERMISSIONS
--    Approved staff can still be limited. An admin grants individual
--    capabilities (delete items, edit parts, add items, quick transaction)
--    to each staff member. Staff can REQUEST a capability; it stays pending
--    until an admin grants it.
--
--    Capability keys used by the app: 'delete', 'edit', 'additem', 'quick'.
-- ============================================================
alter table public.profiles
  add column if not exists permissions        text[] not null default '{}',
  add column if not exists pending_permissions text[] not null default '{}';

-- Staff: request a capability for MY OWN account (adds to pending, unless I
-- already have it). No admin check — you can only ever affect your own row.
create or replace function public.request_permission(perm text)
returns void language plpgsql security definer as $$
begin
  update public.profiles
     set pending_permissions =
           case when perm = any(permissions) then pending_permissions
                else array(select distinct unnest(pending_permissions || array[perm])) end
   where id = auth.uid();
end; $$;

-- Staff: cancel my own pending request.
create or replace function public.cancel_permission_request(perm text)
returns void language plpgsql security definer as $$
begin
  update public.profiles
     set pending_permissions = array_remove(pending_permissions, perm)
   where id = auth.uid();
end; $$;

-- Admin: grant a capability to a staff account (also clears any pending request).
create or replace function public.grant_permission(target uuid, perm text)
returns void language plpgsql security definer as $$
declare caller_email text;
begin
  select lower(email) into caller_email from auth.users where id = auth.uid();
  if caller_email not in ('admin@bypassshop.co', 'addamsjmk@gmail.com') then
    raise exception 'Only an admin can grant permissions.';
  end if;
  update public.profiles
     set permissions = array(select distinct unnest(permissions || array[perm])),
         pending_permissions = array_remove(pending_permissions, perm)
   where id = target;
end; $$;

-- Admin: revoke a granted capability.
create or replace function public.revoke_permission(target uuid, perm text)
returns void language plpgsql security definer as $$
declare caller_email text;
begin
  select lower(email) into caller_email from auth.users where id = auth.uid();
  if caller_email not in ('admin@bypassshop.co', 'addamsjmk@gmail.com') then
    raise exception 'Only an admin can revoke permissions.';
  end if;
  update public.profiles
     set permissions = array_remove(permissions, perm),
         pending_permissions = array_remove(pending_permissions, perm)
   where id = target;
end; $$;

-- Admin: deny (clear) a pending request without granting it.
create or replace function public.deny_permission_request(target uuid, perm text)
returns void language plpgsql security definer as $$
declare caller_email text;
begin
  select lower(email) into caller_email from auth.users where id = auth.uid();
  if caller_email not in ('admin@bypassshop.co', 'addamsjmk@gmail.com') then
    raise exception 'Only an admin can deny requests.';
  end if;
  update public.profiles
     set pending_permissions = array_remove(pending_permissions, perm)
   where id = target;
end; $$;
