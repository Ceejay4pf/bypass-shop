-- ============================================================
-- JEYDEN'S FIRST ADMIN — Eunice Wangari
--
-- The same job 07_surefit_first_admin.sql did for Keziah, and separate from steps 01
-- to 06 for the same reason: it names a real person and needs her password, so it is
-- hand-edited and run once rather than pasted along with the migration.
--
-- WHY THIS CANNOT BE DONE IN THE APP
-- The policy on user_shops checks is_shop_admin_of(shop_id) against the row being
-- written. A Jaspare admin is not an admin of Jeyden, so a Jaspare admin cannot add
-- anybody to Jeyden — deliberately. A shop that can grant itself membership of
-- another shop is not two shops, it is one shop with two names.
--
-- WHAT MAKES THIS ONE DIFFERENT FROM 07
-- Surefit's admin already had an account, so 07 only had to grant membership. Eunice
-- had one too, but pointing at the WRONG SHOP: an account eunice@bypassshop.co was
-- created on 2026-07-23 through the ordinary name sign-up and landed in Jaspare as
-- staff, because that is the sign-in page it was made on. So this file has three jobs
-- rather than one — set the password the owner chose, make her an admin of Jeyden,
-- and take her out of Jaspare.
--
-- WHY THE JASPARE ROW GOES
-- Leaving it would reproduce exactly the problem this file exists to fix. Before
-- today the only door into Jeyden was admin@bypassshop.co, which is also Jaspare's
-- and Surefit's admin — so whoever ran Jeyden could read Jaspare's six hundred parts
-- and its books. Giving Eunice her own door and leaving her a second key to Jaspare
-- would be the same leak with a different name on it.
--
-- It is one row, and it is reversible. If she is meant to keep working at Jaspare as
-- well, put it back with:
--
--   insert into public.user_shops (user_id, shop_id, role)
--   select u.id, s.id, 'staff'
--     from auth.users u, public.shops s
--    where u.email = 'eunice@bypassshop.co' and s.slug = 'jaspare-auto'
--   on conflict (user_id, shop_id) do nothing;
--
-- Note what that costs her, though: with two memberships my_one_shop() returns null,
-- so the bare address stops knowing which shop she means and she has to use the shop
-- links. That is correct behaviour, not a bug — somebody with two shops should be
-- asked which one — but it is a change she would notice.
--
-- THE PASSWORD IS NOT IN THIS FILE, and 07 has the same shape for the same reason:
-- this repository is public. A password typed into line 65 and committed is a
-- password published, and the person it protects would carry on believing it was
-- private — which is worse than her having no password at all, because she would
-- not know to be careful. So line 65 is a placeholder and the block below refuses
-- to run until somebody edits it, uses it once, and does not commit it back.
--
-- It has already been run against the live project, so the account exists and the
-- placeholder is now only for a rebuild from nothing.
--
-- SAFE TO RUN AGAIN. The password is set only on the first run; the marker is her
-- shop_slug metadata, which this file writes. A second run therefore fixes the
-- membership if it has drifted and leaves a password she has since changed in
-- Settings → Role Passwords alone. A file that promises to be re-runnable and then
-- quietly resets a password is worse than one that refuses to run twice.
-- ============================================================

do $$
declare
  v_email    text := 'eunice@bypassshop.co';       -- Jeyden's admin
  v_name     text := 'Eunice Wangari';
  v_rolekey  text := 'eunice';                     -- matches ROLE_KEYS_BY_SLUG in src/lib/roleAccounts.js
  v_password text := 'CHANGE-ME-BEFORE-RUNNING';   -- first run only, see above
  v_slug     text := 'jeyden-autospares';
  v_user     uuid;
  v_shop     uuid;
  v_fresh    boolean;
  v_removed  int;
begin
  if v_password = 'CHANGE-ME-BEFORE-RUNNING' then
    raise exception 'Put the password on line 65 first — and do not commit it back, this repository is public.';
  end if;

  select id into v_shop from public.shops where slug = v_slug;
  if v_shop is null then
    raise exception 'Jeyden is not in public.shops — run 12_jeyden_third_shop.sql first.';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(v_email));

  -- ----------------------------------------------------------
  -- 1) THE ACCOUNT
  --
  -- Built to match a known-good row rather than to a guess: aud, role, the
  -- instance_id every Supabase project uses, the provider metadata, and the
  -- auth.identities row without which password sign-in does not resolve. The blank
  -- token columns are blank strings and not NULL, because that is how GoTrue writes
  -- them and its own queries read them back.
  -- ----------------------------------------------------------
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

    raise notice 'Created the account for %.', v_email;
    v_fresh := true;
  else
    -- Has this file already run against this account? Its own metadata is the marker.
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

    if v_fresh then
      raise notice 'Set the password and the shop on the existing account for %.', v_email;
      -- The password has changed, so anything still holding the old one has to go.
      -- She signed in once in July and has not been back, so this is tidying rather
      -- than an interruption — but a live session surviving a password change is the
      -- kind of thing nobody thinks to check.
      delete from auth.refresh_tokens where user_id = v_user::text;
      delete from auth.sessions where user_id = v_user;
    else
      raise notice 'Account for % was already set up — password left alone.', v_email;
    end if;
  end if;

  -- The name on screen and on every stamped action. `approved` is set true rather
  -- than left to the default: api.js reads it as `approved !== false`, so NULL would
  -- let her in anyway — but the person who runs a shop sitting in the approval queue
  -- as an unanswered question is a trap waiting for whoever ticks that list next.
  insert into public.profiles (id, full_name, email_verified, approved)
  values (v_user, v_name, true, true)
  on conflict (id) do update set full_name = v_name, approved = true;

  -- ----------------------------------------------------------
  -- 2) ADMIN OF JEYDEN
  --
  -- 'admin', not 'staff'. handle_new_user() grants staff to anybody who signs up, and
  -- staff is not enough: is_shop_admin_of() reads this row, so the finance views, the
  -- staff list and the role-password panel would all refuse her IN THE DATABASE even
  -- though roles.js on the client says she is an admin. Client-side admin with
  -- database-side staff is the worst of both — every button visible, half of them
  -- failing.
  -- ----------------------------------------------------------
  insert into public.user_shops (user_id, shop_id, role)
  values (v_user, v_shop, 'admin')
  on conflict (user_id, shop_id) do update set role = 'admin';

  -- ----------------------------------------------------------
  -- 3) OUT OF JASPARE — see the header for why, and for how to undo it.
  -- ----------------------------------------------------------
  delete from public.user_shops us
   using public.shops s
   where us.shop_id = s.id and us.user_id = v_user and s.slug <> v_slug;
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    raise notice 'Removed % other shop membership(s) from %.', v_removed, v_email;
  end if;

  raise notice '% (%) is now the admin of Jeyden Auto Spares.', v_name, v_email;
end $$;


-- ------------------------------------------------------------
-- CHECK IT
--
--   select u.email, p.full_name, s.name, us.role
--     from public.user_shops us
--     join auth.users u on u.id = us.user_id
--     join public.shops s on s.id = us.shop_id
--     left join public.profiles p on p.id = u.id
--    where s.slug = 'jeyden-autospares'
--    order by u.email;
--
-- Expect two rows: admin@bypassshop.co and eunice@bypassshop.co, both 'admin'.
--
-- Then have her open  https://bypass-shop.vercel.app/jeyden-autospares/login
-- pick her own tile, type the password, and type her name. She should see her own
-- empty shop — and NOT one part of Jaspare's six hundred. If she sees Jaspare's
-- stock, step 05_policies.sql did not run.
--
-- STILL MISSING AT JEYDEN, and none of it is code:
--   no stock at all               nothing to sell yet
--   no logo                       public/logo-jeyden-autospares.png
--   blank letterhead fields       email, po_box, kra_pin, makes, parts_dealt, footer
--                                 — a shop that HAS a shops row gets blank rather
--                                   than Jaspare's value on purpose, so these are
--                                   simply absent from her receipts and statements
--   no M-PESA till                MPESA_SHOPS in src/lib/mpesa.js is Jaspare only
--   a stray branch row            public.branches still has JEY "Jeyden Auto Spares"
--                                 sitting under jaspare-auto, from before the shop
--                                 was real. Nobody has said whether to move it.
-- ------------------------------------------------------------
