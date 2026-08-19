-- ============================================================
-- BYPASS SHOP - a code the first time an account is used on a new phone
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.
--
-- WHAT THIS IS FOR
-- A password is a thing that can be told to somebody, guessed, or read off a
-- note by the till. On its own it means anybody holding it can open the shop's
-- stock, prices and takings from any phone in the world.
--
-- So: the password still gets you in on a phone the account has used before.
-- On a phone it has never seen, a 6-digit code is emailed to the address on the
-- account and must be typed back. Ten minutes, five wrong tries. There is no
-- override and no bypass password -- that was decided deliberately, because an
-- override is exactly what somebody who has stolen a password would go looking
-- for. If the code cannot be read, nobody gets in on that phone.
--
-- WHY IT IS OFF UNTIL SOMEBODY TURNS IT ON
-- That last sentence is the whole danger. Of the 23 accounts on this shop, 19
-- were created from a name and have an invented @bypassshop.co address with no
-- inbox behind it -- no code can ever reach them. Switching this on for
-- everybody would lock those 19 out of the shop permanently, at the counter, in
-- front of customers.
--
-- Two things therefore hold it back, and both are deliberate:
--   1. A shop-wide switch, off until an admin turns it on, and it cannot be
--      turned on until a test code has actually been received and typed back.
--   2. Even then, only an account whose address has PROVED it can receive a
--      code (public.verified_emails) is ever challenged. An account with no
--      reachable inbox keeps working on a password alone, because the
--      alternative is not "more secure", it is "nobody gets in, ever".
--
-- As more staff prove a real address, more of the shop comes under the policy
-- on its own. Nothing has to be switched again.
-- ============================================================

-- ---------- 0) the code lives ten minutes, not fifteen ----------
-- Chosen by the shop. Long enough to switch apps and read an email, short
-- enough that a code left on a screen is not a key lying around all afternoon.
-- Everything else about issue_email_code is unchanged; see email_verification.sql.
create or replace function public.issue_email_code(p_email text)
returns text language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_code  text;
  v_bytes bytea := gen_random_bytes(3);
  v_row   public.email_codes;
begin
  if v_email = '' or v_email not like '%@%.%' then
    raise exception 'That does not look like an email address.';
  end if;

  select * into v_row from public.email_codes where email = v_email;

  if v_row.email is not null
     and v_row.created_at > now() - interval '1 hour'
     and v_row.sent_count >= 5 then
    raise exception 'Too many codes sent to that address. Try again in an hour.';
  end if;

  v_code := (
    (get_byte(v_bytes, 0) * 65536 + get_byte(v_bytes, 1) * 256 + get_byte(v_bytes, 2))
    % 900000 + 100000
  )::text;

  insert into public.email_codes (email, code_hash, expires_at, attempts, sent_count)
  values (v_email, encode(digest(v_code, 'sha256'), 'hex'),
          now() + interval '10 minutes', 0,
          case when v_row.created_at > now() - interval '1 hour'
               then coalesce(v_row.sent_count, 0) + 1 else 1 end)
  on conflict (email) do update
    set code_hash  = excluded.code_hash,
        created_at = now(),
        expires_at = excluded.expires_at,
        attempts   = 0,
        sent_count = excluded.sent_count;

  return v_code;
end; $$;

revoke all on function public.issue_email_code(text) from public, anon, authenticated;

-- ---------- 1) shop-wide settings ----------
-- One small table rather than a column somewhere, so the next switch the shop
-- needs does not mean another migration.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.app_settings enable row level security;

-- Readable by anybody, including a phone at the login screen that is not signed
-- in yet -- it has to know whether to ask for a code before it knows who the
-- person is. There is nothing secret in here; it is a policy, not a key.
do $$ begin
  create policy "app_settings_read" on public.app_settings
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

-- Writing is a different matter and goes through the function below, so the
-- switch can never be flipped without the proof that a code arrives.
revoke insert, update, delete on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value)
values ('device_otp', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

-- ---------- 2) the phones an account has been used on ----------
-- The device id is a random string the app makes once and keeps in the phone's
-- own storage. It is not a fingerprint and identifies no person: clearing the
-- browser's data makes a phone new again, which costs one emailed code.
create table if not exists public.trusted_devices (
  email      text not null,
  device_id  text not null,
  label      text,                    -- "Samsung, Chrome" - so a list means something
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (email, device_id)
);

create index if not exists trusted_devices_email_idx on public.trusted_devices (email);

alter table public.trusted_devices enable row level security;
-- Not readable or writable by a client. A person able to insert here could
-- simply declare their own phone trusted and walk straight past the code.
revoke all on public.trusted_devices from anon, authenticated;

-- ---------- 3) does this login need a code? ----------
-- Asked by the login screen BEFORE the password is accepted, so it must be
-- callable by anon.
--
-- Every "no" below is a deliberate fail-open. A fault in here must not be able
-- to shut the shop out of its own stock:
--   switch off               -> no
--   address never proved     -> no  (a code cannot reach it; see the header)
--   phone already known      -> no
--   unknown address          -> no  (and it gives nothing away that typing a
--                                    wrong password does not already give away)
create or replace function public.login_needs_code(p_email text, p_device text)
returns boolean language sql security definer
set search_path = public, extensions as $$
  select
    coalesce((select (value->>'enabled')::boolean
                from public.app_settings where key = 'device_otp'), false)
    and exists (select 1 from public.verified_emails
                 where email = lower(trim(p_email)))
    and not exists (select 1 from public.trusted_devices
                     where email = lower(trim(p_email))
                       and device_id = trim(p_device));
$$;

grant execute on function public.login_needs_code(text, text) to anon, authenticated;

-- ---------- 4) the code, and the phone remembered ----------
-- One call so a phone is only ever trusted by the same act that proved the
-- code. Two separate calls would leave a gap where the browser could trust
-- itself without the code, which is the one thing this whole file is for.
--
-- Deliberately does NOT create a session. The app signs in with the password
-- again afterwards. Somebody who guesses a code still needs the password, and
-- somebody with the password still needs the code.
create or replace function public.verify_login_code(
  p_email text, p_code text, p_device text, p_label text default ''
) returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email  text := lower(trim(p_email));
  v_device text := trim(p_device);
  v_row    public.email_codes;
begin
  if v_device = '' then
    raise exception 'This phone could not be identified.';
  end if;

  select * into v_row from public.email_codes where email = v_email;

  if v_row.email is null then return false; end if;
  if v_row.expires_at < now() then return false; end if;
  -- Five wrong tries and this code is finished. Asking for another one is the
  -- way forward, and that is rate-limited to five an hour by issue_email_code -
  -- so six digits cannot be walked through.
  if v_row.attempts >= 5 then
    raise exception 'Too many wrong tries. Ask for a new code.';
  end if;

  if v_row.code_hash <> encode(digest(trim(p_code), 'sha256'), 'hex') then
    update public.email_codes set attempts = attempts + 1 where email = v_email;
    return false;
  end if;

  update public.email_codes set verified_at = now() where email = v_email;

  -- Typing back a code that was only ever put in an email IS the proof that the
  -- address can be read, so record it. In the login path this is a no-op
  -- refresh, because login_needs_code already required the address to be proved.
  -- It matters for the admin's self-test, which calls this directly and is the
  -- only way the very first address and the very first phone get on the lists --
  -- and until both are, the policy cannot be switched on at all.
  insert into public.verified_emails (email) values (v_email)
    on conflict (email) do update set verified_at = now();

  insert into public.trusted_devices (email, device_id, label)
  values (v_email, v_device, nullif(trim(p_label), ''))
  on conflict (email, device_id) do update set last_seen = now();

  return true;
end; $$;

grant execute on function public.verify_login_code(text, text, text, text) to anon, authenticated;

-- ---------- 5) turning the policy on ----------
-- Cannot be switched on out of thin air. Enabling requires an address that has
-- proved it can receive a code AND the phone doing the switching to already be
-- trusted -- otherwise the admin's very next login is a locked door, and the
-- person who can unlock it is the one standing outside.
create or replace function public.set_device_otp(
  p_enabled boolean, p_email text, p_device text, p_by text default ''
) returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email text := lower(trim(p_email));
begin
  if p_enabled then
    if not exists (select 1 from public.verified_emails where email = v_email) then
      raise exception 'Send yourself a test code and type it back first. Until an address has proved it can receive one, switching this on locks everybody out.';
    end if;
    if not exists (select 1 from public.trusted_devices
                    where email = v_email and device_id = trim(p_device)) then
      raise exception 'This phone is not on the trusted list yet. Type a code on it first, or you will be locked out of the shop the moment you sign out.';
    end if;
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('device_otp', jsonb_build_object('enabled', p_enabled), now(), nullif(trim(p_by), ''))
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  return p_enabled;
end; $$;

-- Only a signed-in person may change shop policy.
revoke all on function public.set_device_otp(boolean, text, text, text) from public, anon;
grant execute on function public.set_device_otp(boolean, text, text, text) to authenticated;

-- ---------- 6) what the admin screen shows ----------
-- How many accounts this policy could actually protect, and how many it could
-- never protect, so the blast radius is on screen BEFORE the switch is flipped
-- rather than discovered afterwards.
create or replace function public.device_otp_status()
returns jsonb language sql security definer
set search_path = public, extensions as $$
  select jsonb_build_object(
    'enabled', coalesce((select (value->>'enabled')::boolean
                           from public.app_settings where key = 'device_otp'), false),
    'accounts', (select count(*) from auth.users),
    -- An address that has proved it can receive a code. These are the accounts
    -- the policy will actually apply to.
    'protected', (select count(*) from auth.users u
                   where exists (select 1 from public.verified_emails v
                                  where v.email = lower(u.email))),
    -- Created from a name, so the address was invented and has no inbox. No
    -- code can ever arrive; these accounts stay on a password alone.
    'no_inbox', (select count(*) from auth.users
                  where email like '%@bypassshop.co'),
    'devices', (select count(*) from public.trusted_devices)
  );
$$;

revoke all on function public.device_otp_status() from public, anon;
grant execute on function public.device_otp_status() to authenticated;

-- ---------- 7) the phones on my own account ----------
-- So a person can see where their account has been used and take a phone off
-- the list. Scoped to the caller's own address by auth.jwt(), not by a
-- parameter -- an email in a parameter would let anybody list, and untrust,
-- anybody else's phones.
create or replace function public.my_devices()
returns table (device_id text, label text, first_seen timestamptz, last_seen timestamptz)
language sql security definer set search_path = public, extensions as $$
  select device_id, label, first_seen, last_seen
    from public.trusted_devices
   where email = lower(coalesce(auth.jwt()->>'email', ''))
   order by last_seen desc;
$$;

grant execute on function public.my_devices() to authenticated;

create or replace function public.forget_device(p_device text)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if v_email = '' then return false; end if;
  delete from public.trusted_devices
   where email = v_email and device_id = trim(p_device);
  return true;
end; $$;

grant execute on function public.forget_device(text) to authenticated;

-- ---------- 8) keep last_seen honest ----------
-- Called after a successful password login on a phone already trusted, so the
-- list an admin looks at says when each phone was really last used.
create or replace function public.touch_device(p_email text, p_device text)
returns void language sql security definer
set search_path = public, extensions as $$
  update public.trusted_devices set last_seen = now()
   where email = lower(trim(p_email)) and device_id = trim(p_device);
$$;

grant execute on function public.touch_device(text, text) to anon, authenticated;

comment on table public.trusted_devices is
  'Phones an account has already been used on. A new one costs an emailed code.';
comment on table public.app_settings is
  'Shop-wide switches. Readable by anyone; only writable through functions.';

-- What the shop looks like right now.
select public.device_otp_status() as status;
