-- ============================================================
-- 14 — THE FOURTH SHOP: QUICK JET AUTO SPARES
--
-- PASTE THE WHOLE FILE INTO THE SUPABASE SQL EDITOR AND PRESS RUN.
-- Nothing in it needs editing. Safe to re-run: everything is on-conflict, and the
-- password is set on the first run only (see part 2).
--
-- It comes back with rows of plain English. Read them.
--
-- ------------------------------------------------------------
-- WHAT THIS SHOP IS, AND WHAT IT IS NOT
--
-- The owner's words: "develop the 4th shop quick jet auto spares, but in this one
-- there isn't as many modules as the other ones — just inventory / search inventory
-- / add list of parts / staff feed connected to the other shops / login to this shop
-- are either admin or quickjet1, password quickjet123".
--
-- So it is a shelf, a search, a way to type a list of parts in, and the one staff
-- conversation. No quotations, no receipts, no credit accounts, no books. That is
-- decided in the APP, in src/lib/shopModules.js, and deliberately not here: a menu
-- is not a fence. Everything below is the same shop every other shop is — the same
-- tables, the same policies, its own shop_id — because a shop that starts small and
-- turns out to need a receipt should need one line of JavaScript, not a migration.
--
-- ------------------------------------------------------------
-- STEP 12 ALREADY BUILT THE MACHINE
--
-- public.add_shop(...) exists, and this is the promise from step 01 finally being
-- ordinary: the fourth shop is a call, not a file full of inserts. It creates the
-- shops row, seeds the numbering at zero so the first part's serial is 000001, gives
-- the shop its own eleven expense categories, and makes whoever already runs every
-- other shop an admin of this one too. It creates no stock and no branches, and it
-- does not touch the staff feed.
--
-- THE FEED IS ALREADY WHAT WAS ASKED FOR. "Staff feed connected to the other shops"
-- is exactly what step 09 did — public.messages has no shop_id and no shop filter,
-- so everybody who signs in anywhere is in one conversation. Quick Jet joins it by
-- existing. Nothing here to do, and nothing in step 09 to undo.
--
-- NO ADDRESS AND NO PHONE NUMBER. Nobody has given either. A blank column prints
-- nothing, which is the right thing to print when nobody knows the answer, and it is
-- one update when somebody does:
--
--   update public.shops
--      set address = 'the road it is on', phone = '+2547...',
--          phone_display = '+254 7.. ... ...'
--    where slug = 'quickjet-autospares';
-- ============================================================


-- ============================================================
-- PART 1 — THE SHOP
-- ============================================================
select l as "Read this"
  from regexp_split_to_table(
    public.add_shop(
      'quickjet-autospares',
      'Quick Jet Auto Spares'
    ),
    chr(10)
  ) as l;


-- ============================================================
-- PART 2 — THE SHOP'S OWN LOGIN
--
-- quickjet1 / quickjet123, as given. Two things worth knowing about it:
--
-- THE PASSWORD IS IN THIS FILE ON PURPOSE, and 13_jeyden_first_admin.sql refuses to
-- run with its password in it. The difference is not carelessness in one of them.
-- Eunice's was CHOSEN FOR HER by name: writing it here would publish it — this
-- repository is public — while she carried on believing it was private, which is
-- worse for her than having no password at all. quickjet123 is the opposite kind of
-- thing: it is the documented starting password for a shared shop login, the sign-in
-- screen PRINTS it under "Forgot the password?", and the shop is told to change it in
-- Settings → Role Passwords. Hiding a password the app displays would protect
-- nothing and would only make this file lie.
--
-- THIS FILE COULD ALMOST BE SKIPPED. The app creates a role account by itself the
-- first time somebody signs in with its documented password (signInRole, in
-- src/lib/auth.js), so the login would work without any of this. What it would NOT
-- get is 'admin' on user_shops — handle_new_user grants 'staff' — and staff is not
-- enough: is_shop_admin_of() reads that row, so the role-password panel and the staff
-- list would refuse it IN THE DATABASE while roles.js on the client said it was an
-- admin. Client-side admin with database-side staff is the worst of both: every
-- button visible, half of them failing. So it is done here, properly, once.
--
-- SAFE TO RUN AGAIN. The marker is the account's own shop_slug metadata, which this
-- file writes. A second run repairs the membership if it has drifted and leaves a
-- password that has since been changed alone.
-- ============================================================
do $$
declare
  v_email    text := 'quickjet1@bypassshop.co';   -- matches QUICKJET in src/lib/roleAccounts.js
  v_name     text := 'Quick Jet';
  v_rolekey  text := 'quickjet1';                 -- matches ROLE_KEYS_BY_SLUG there too
  v_password text := 'quickjet123';               -- the documented default; see above
  v_slug     text := 'quickjet-autospares';
  v_user     uuid;
  v_shop     uuid;
  v_fresh    boolean;
begin
  select id into v_shop from public.shops where slug = v_slug;
  if v_shop is null then
    raise exception 'Quick Jet is not in public.shops — part 1 of this file did not run.';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(v_email));

  -- The account, built to match a known-good row rather than to a guess: aud, role,
  -- the instance_id every Supabase project uses, the provider metadata, and the
  -- auth.identities row without which password sign-in does not resolve. The blank
  -- token columns are blank strings and not NULL, because that is how GoTrue writes
  -- them and its own queries read them back.
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      lower(btrim(v_email)), extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
      now(), now(), now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'sub', v_user::text, 'email', lower(btrim(v_email)), 'full_name', v_name,
        'role', v_rolekey, 'shop_slug', v_slug,
        'email_verified', true, 'phone_verified', false)
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user, v_user::text, 'email',
      jsonb_build_object('sub', v_user::text, 'email', lower(btrim(v_email)),
                         'email_verified', true, 'phone_verified', false),
      null, now(), now()
    );
    v_fresh := true;
  else
    v_fresh := coalesce(
      (select raw_user_meta_data->>'shop_slug' from auth.users where id = v_user), '')
      is distinct from v_slug;

    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
             'full_name', v_name, 'role', v_rolekey, 'shop_slug', v_slug),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           encrypted_password = case
             when v_fresh then extensions.crypt(v_password, extensions.gen_salt('bf', 10))
             else encrypted_password end,
           updated_at = now()
     where id = v_user;

    -- A password that has just changed means anything still holding the old one has
    -- to go. A live session surviving a password change is the kind of thing nobody
    -- thinks to check.
    if v_fresh then
      delete from auth.refresh_tokens where user_id = v_user::text;
      delete from auth.sessions where user_id = v_user;
    end if;
  end if;

  -- `approved` set true rather than left to the default: api.js reads it as
  -- `approved !== false`, so NULL would let it in anyway — but the login that runs a
  -- shop sitting in the approval queue is a trap for whoever ticks that list next.
  insert into public.profiles (id, full_name, email_verified, approved)
  values (v_user, v_name, true, true)
  on conflict (id) do update set full_name = v_name, approved = true;

  insert into public.user_shops (user_id, shop_id, role)
  values (v_user, v_shop, 'admin')
  on conflict (user_id, shop_id) do update set role = 'admin';

  -- Quick Jet's login belongs to Quick Jet and nowhere else. The same line 13 has,
  -- for the same reason: a login with a key to a second shop is not four shops, it
  -- is one with four names. The owner's own admin@ login is the deliberate exception
  -- and is untouched by this — it is a different account.
  delete from public.user_shops us
   using public.shops s
   where us.shop_id = s.id and us.user_id = v_user and s.slug <> v_slug;
end $$;


-- ------------------------------------------------------------
-- CHECK IT — expect admin@bypassshop.co and quickjet1@bypassshop.co, both 'admin'.
-- ------------------------------------------------------------
select u.email, p.full_name, s.name as shop, us.role
  from public.user_shops us
  join auth.users u on u.id = us.user_id
  join public.shops s on s.id = us.shop_id
  left join public.profiles p on p.id = u.id
 where s.slug = 'quickjet-autospares'
 order by u.email;

-- Then open  https://bypass-shop.vercel.app/quickjet-autospares/login
-- The tile should no longer say "Not on the system yet". Sign in as Quick Jet with
-- quickjet123, type a name, and the menu should hold FIVE entries — Search Inventory,
-- Inventory, Add a List of Parts, Staff Feed, Settings — and the shelf should be
-- EMPTY. If another shop's parts appear, step 05_policies.sql did not run.
--
-- STILL MISSING AT QUICK JET, and none of it is code:
--   no stock                nothing on the shelf yet — Add a List of Parts is the way in
--   no address or phone     the update is in the header of this file
--   no logo                 public/logo-quickjet-autospares.png
--   blank letterhead        email, po_box, kra_pin, makes, parts_dealt, footer. Nothing
--                           at this shop prints a document yet, so none of it shows.
--   no M-PESA till          MPESA_SHOPS in src/lib/mpesa.js is Jaspare only
-- ------------------------------------------------------------
