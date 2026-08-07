-- ============================================================
-- BYPASS SHOP - verify a new staff member's email address
--
-- A person signing up with a real email gets a 6-digit code sent to that
-- inbox and must type it back. That proves the address is theirs, so the
-- shop can reach them later and an admin approving the account knows who
-- they are approving.
--
-- WHY THE CODE LIVES IN THE DATABASE AND NOT IN THE BROWSER
-- If the app generated the code and checked it in JavaScript, anyone could
-- read it out of the network tab or the console and "verify" an address
-- they don't own. So: the code is created by a SECURITY DEFINER function,
-- only its HASH is stored, the table itself is readable by nobody, and the
-- check happens inside the database.
--
-- Run this once in: Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run.
-- ============================================================

-- pgcrypto gives us gen_random_bytes (a real random source) and digest
-- (for hashing the code). On Supabase it is installed into the "extensions"
-- schema, which is why every function below sets search_path to include it -
-- without that, digest() is simply not found at runtime.
create extension if not exists pgcrypto with schema extensions;

-- ---------- the pending codes ----------
create table if not exists public.email_codes (
  email       text primary key,
  code_hash   text not null,          -- sha256 of the code, never the code
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  attempts    int not null default 0, -- wrong guesses, so we can lock it
  sent_count  int not null default 0, -- resends, so we can rate-limit
  verified_at timestamptz
);

alter table public.email_codes enable row level security;

-- No policies at all: not readable or writable by anon or by a logged-in
-- user. Everything goes through the two functions below. Without this a
-- staff member could simply select the hash and brute-force it offline.
revoke all on public.email_codes from anon, authenticated;

-- Which addresses have proved themselves. Kept separate from email_codes
-- so clearing out old codes never loses the fact of verification.
create table if not exists public.verified_emails (
  email       text primary key,
  verified_at timestamptz not null default now()
);
alter table public.verified_emails enable row level security;
revoke all on public.verified_emails from anon, authenticated;

-- ---------- 1) issue a code ----------
-- Returns the plain code ONCE, to the caller, so the edge function can put
-- it in an email. It is never stored in plain form and never returned again.
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

  -- Rate limit: no more than 5 codes an hour for one address, so nobody can
  -- use the shop as a machine for spamming somebody else's inbox.
  if v_row.email is not null
     and v_row.created_at > now() - interval '1 hour'
     and v_row.sent_count >= 5 then
    raise exception 'Too many codes sent to that address. Try again in an hour.';
  end if;

  -- 6 digits from the crypto RNG, not random() - random() is seeded and
  -- predictable, which for a code that guards an account is no good.
  -- 100000..999999, so it never has a leading zero to be lost in a paste.
  v_code := (
    (get_byte(v_bytes, 0) * 65536 + get_byte(v_bytes, 1) * 256 + get_byte(v_bytes, 2))
    % 900000 + 100000
  )::text;

  insert into public.email_codes (email, code_hash, expires_at, attempts, sent_count)
  values (v_email, encode(digest(v_code, 'sha256'), 'hex'),
          now() + interval '15 minutes', 0,
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

-- Only the service_role (the edge function) may ask for a code. If anon could
-- call this, anyone could request a code for any address at will - and worse,
-- the code is this function's RETURN VALUE, so they could read it directly and
-- verify an inbox they don't own.
--
-- The revoke must name PUBLIC. Postgres grants EXECUTE on every new function
-- to PUBLIC by default, and anon inherits that; revoking from anon alone
-- leaves the function wide open through the PUBLIC grant.
revoke all on function public.issue_email_code(text) from public, anon, authenticated;

-- ---------- 2) check a code ----------
-- Called from the app (anon), because at this point the person is not
-- signed in yet. Safe: it only ever answers true or false, and locks the
-- code after 5 wrong guesses so 6 digits can't be walked through.
create or replace function public.verify_email_code(p_email text, p_code text)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_row   public.email_codes;
begin
  select * into v_row from public.email_codes where email = v_email;

  if v_row.email is null then return false; end if;
  if v_row.expires_at < now() then return false; end if;
  if v_row.attempts >= 5 then
    raise exception 'Too many wrong tries. Ask for a new code.';
  end if;

  if v_row.code_hash <> encode(digest(trim(p_code), 'sha256'), 'hex') then
    update public.email_codes set attempts = attempts + 1 where email = v_email;
    return false;
  end if;

  update public.email_codes set verified_at = now() where email = v_email;
  insert into public.verified_emails (email) values (v_email)
    on conflict (email) do update set verified_at = now();
  return true;
end; $$;

grant execute on function public.verify_email_code(text, text) to anon, authenticated;

-- ---------- 3) has this address been verified? ----------
-- So the sign-up screen can refuse to create the account otherwise, and so
-- Staff Approvals can show an admin whether the address was proved.
create or replace function public.is_email_verified(p_email text)
returns boolean language sql security definer
set search_path = public, extensions as $$
  select exists (select 1 from public.verified_emails
                 where email = lower(trim(p_email)));
$$;

grant execute on function public.is_email_verified(text) to anon, authenticated;

-- ---------- 4) show it on the profile ----------
-- Staff Approvals reads this: an admin should be able to see at a glance
-- whether the person's email was actually proved or is just typed in.
alter table public.profiles
  add column if not exists email_verified boolean not null default false;

-- Stamp it at sign-up time. The trigger runs as the definer, so it can
-- read verified_emails even though the signing-up user cannot.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    exists (select 1 from public.verified_emails
            where email = lower(new.email))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- housekeeping ----------
-- Old codes are of no use to anyone; clearing them keeps the table small
-- and means an abandoned code can't sit around for months.
create or replace function public.purge_old_email_codes()
returns void language sql security definer
set search_path = public, extensions as $$
  delete from public.email_codes where created_at < now() - interval '7 days';
$$;

-- Housekeeping only, and it deletes rows - not something a client should be
-- able to trigger. Same PUBLIC-grant reasoning as issue_email_code above.
revoke all on function public.purge_old_email_codes() from public, anon, authenticated;

comment on table public.email_codes is
  'Pending 6-digit sign-up codes. Hashes only. Not readable by any client - use the functions.';
comment on table public.verified_emails is
  'Addresses that have proved themselves by entering the code sent to them.';
