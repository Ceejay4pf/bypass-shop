-- ============================================================
-- BYPASS SHOP - signing in with a code instead of a password
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.
--
-- WHAT THIS ADDS
-- At the login screen you type your email and then choose:
--
--     [ Use my password ]      [ Email me a code ]
--
-- The code route is a real way in, not a second step after the password. It
-- exists because a password is the thing people actually lose: it gets
-- forgotten, written on a note by the till, or told to somebody who then leaves.
-- An emailed code is held by whoever can open that inbox and nobody else, and it
-- is finished in ten minutes.
--
-- HOW THE SESSION IS CREATED
-- The code is minted and checked inside the database (issue_email_code /
-- verify_email_code, see email_verification.sql), so the browser never learns it
-- and cannot fake it. But a checked code is not a session -- only Supabase Auth
-- can hand one out. So the edge function `otp-login` holds the service key,
-- checks the code itself, and only then asks Auth for a one-time token which the
-- app swaps for a session.
--
-- The order is the whole point: the browser can ask for a code and it can ask to
-- swap one, but it can never mint a code and it can never get a session without
-- having proved one. All three of those are enforced by grants, not by the app.
-- ============================================================

-- ---------- the phone gets remembered here too ----------
-- Somebody who has just proved an emailed code has proved MORE than a password
-- would have. It would be perverse to then demand another code the next time
-- they sign in with a password on the same phone -- so signing in by code trusts
-- the phone, exactly as typing a new-phone code does.
--
-- Safe to expose to a signed-in caller: it can only ever add the caller's own
-- address, read out of the token by auth.jwt() rather than passed in. A session
-- is the thing being trusted, and this session was got by proving a code.
create or replace function public.trust_my_device(p_device text, p_label text default '')
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email  text := lower(coalesce(auth.jwt()->>'email', ''));
  v_device text := trim(p_device);
begin
  if v_email = '' or v_device = '' then return false; end if;

  insert into public.trusted_devices (email, device_id, label)
  values (v_email, v_device, nullif(trim(p_label), ''))
  on conflict (email, device_id) do update set last_seen = now();

  -- Proving a code that was only ever put in an email is proof the address can
  -- be read, so record that as well. It is what decides whether this account is
  -- ever asked for a new-phone code at all.
  insert into public.verified_emails (email) values (v_email)
    on conflict (email) do update set verified_at = now();

  return true;
end; $$;

revoke all on function public.trust_my_device(text, text) from public, anon;
grant execute on function public.trust_my_device(text, text) to authenticated;

-- ---------- can this shop actually email anybody? ----------
-- The login screen has to know before it offers the code button, because an
-- offer that cannot be honoured is worse than no offer: somebody stands at the
-- counter tapping a button and waiting on an inbox that will never get anything.
--
-- Set by the admin screen once a test code has actually been received. Read by
-- anon, because the login screen asks before anybody has signed in.
insert into public.app_settings (key, value)
values ('otp_login', '{"enabled": false, "proved": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.otp_login_available()
returns boolean language sql security definer
set search_path = public, extensions as $$
  select coalesce((select (value->>'enabled')::boolean
                     from public.app_settings where key = 'otp_login'), false);
$$;

grant execute on function public.otp_login_available() to anon, authenticated;

-- ---------- who counts as an admin, according to the database ----------
-- The app decides this from a list in src/lib/roles.js, which is fine for what
-- the app SHOWS but useless for what the database ALLOWS: a hidden button is not
-- a locked door. Anybody who can reach the network can call an RPC directly.
--
-- So the same list lives here, and the shop-wide switches below read the caller's
-- own address out of their token rather than believing an address handed to them.
-- KEEP IN SYNC with ADMIN_EMAILS in src/lib/roles.js.
create or replace function public.caller_is_admin()
returns boolean language sql stable
set search_path = public, extensions as $$
  select lower(coalesce(auth.jwt()->>'email', '')) in (
    'admin@bypassshop.co',
    'management@bypassshop.co',
    'addamsjmk@gmail.com'
  );
$$;

grant execute on function public.caller_is_admin() to authenticated;

-- Turned on only by an admin who has had a code arrive. Same reasoning as the
-- new-phone switch: a shop-wide promise that email works must be backed by
-- somebody having actually seen an email work.
--
-- p_email is ignored on purpose. It used to be the address the "has a code
-- arrived?" test was run against, which meant any signed-in member of staff could
-- name an address that happened to be verified and flip a shop-wide setting. The
-- caller's own address comes out of the token now, where it cannot be chosen.
create or replace function public.set_otp_login(p_enabled boolean, p_email text, p_by text default '')
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if not public.caller_is_admin() then
    raise exception 'Only an admin can change how the shop logs in.';
  end if;

  if p_enabled and not exists (
    select 1 from public.verified_emails where email = v_email
  ) then
    raise exception 'Have a code arrive on your own address first. Offering a code button that cannot send leaves somebody waiting at the counter on an email that never comes.';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('otp_login',
          jsonb_build_object('enabled', p_enabled, 'proved', p_enabled),
          now(), nullif(trim(p_by), ''))
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  return p_enabled;
end; $$;

revoke all on function public.set_otp_login(boolean, text, text) from public, anon;
grant execute on function public.set_otp_login(boolean, text, text) to authenticated;

-- ---------- does this account exist? ----------
-- Asked before a code is minted, so a stranger typing any address at the login
-- screen cannot make the shop send mail to it. Only the edge function may ask,
-- because answering "yes, that address has an account here" to the browser would
-- turn the login screen into a way to list the shop's staff.
create or replace function public.account_exists(p_email text)
returns boolean language sql security definer
set search_path = public, extensions, auth as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(trim(p_email))
  );
$$;

revoke all on function public.account_exists(text) from public, anon, authenticated;
grant execute on function public.account_exists(text) to service_role;

-- ---------- spend a login code ----------
-- verify_email_code() leaves the code in place, which is right for sign-up (the
-- account still has to be created afterwards and the same code proves it). For a
-- login it is wrong: the code buys a session, and a code that still works after
-- it has bought one buys a second session for anybody who saw it over a
-- shoulder. So this checks and destroys in one statement.
--
-- service_role only. The browser must not be the thing that decides a code was
-- good, because the browser is what wants the session.
create or replace function public.consume_login_code(p_email text, p_code text)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_ok    boolean;
begin
  v_ok := public.verify_email_code(v_email, p_code);
  if v_ok then
    delete from public.email_codes where email = v_email;
  end if;
  return v_ok;
end; $$;

revoke all on function public.consume_login_code(text, text) from public, anon, authenticated;
grant execute on function public.consume_login_code(text, text) to service_role;

-- ---------- the same hole in the new-phone switch ----------
-- set_device_otp() took the address to check as an argument too, so any signed-in
-- member of staff could switch the new-phone code OFF for the whole shop -- and
-- switching off is deliberately never blocked, which made it the easy direction.
-- Rewritten here rather than in device_otp.sql so one file can be re-run to fix
-- a shop that already has both.
create or replace function public.set_device_otp(
  p_enabled boolean, p_email text, p_device text, p_by text default ''
) returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email  text := lower(coalesce(auth.jwt()->>'email', ''));
  v_device text := trim(p_device);
begin
  if not public.caller_is_admin() then
    raise exception 'Only an admin can change how the shop logs in.';
  end if;

  -- Both guards apply only when switching ON. Switching OFF must never be
  -- blocked: if the policy has locked the shop out, the switch is the way back.
  if p_enabled then
    if not exists (select 1 from public.verified_emails where email = v_email) then
      raise exception 'Send yourself a test code and type it back first, so the shop knows a code can actually reach you.';
    end if;
    if not exists (
      select 1 from public.trusted_devices
       where email = v_email and device_id = v_device
    ) then
      raise exception 'This phone is not on the trusted list yet. Prove a code on it first, or switching this on locks you out of your own shop.';
    end if;
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('device_otp', jsonb_build_object('enabled', p_enabled),
          now(), nullif(trim(p_by), ''))
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  return p_enabled;
end; $$;

revoke all on function public.set_device_otp(boolean, text, text, text) from public, anon;
grant execute on function public.set_device_otp(boolean, text, text, text) to authenticated;

comment on function public.trust_my_device(text, text) is
  'Signing in by emailed code also trusts the phone - the code proved more than a password would.';
comment on function public.consume_login_code(text, text) is
  'Checks a login code and destroys it, so one code buys exactly one session.';
comment on function public.caller_is_admin() is
  'Admin check for shop-wide switches, read from the caller token. Keep in sync with ADMIN_EMAILS in src/lib/roles.js.';

select
  public.otp_login_available() as otp_login_on,
  (select value from public.app_settings where key = 'device_otp') as device_otp;
