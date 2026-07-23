-- ============================================================
-- BYPASS SHOP — Admin approval for new accounts
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run.
--
-- After this: a newly signed-up account is "pending" and cannot use the
-- app until an admin approves it from the Staff Approvals screen.
-- All accounts that already exist are grandfathered in (approved).
-- ============================================================

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
