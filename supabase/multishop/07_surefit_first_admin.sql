-- ============================================================
-- SUREFIT'S FIRST ADMIN — one line to edit, then run
--
-- NOT PART OF THE MIGRATION. Steps 1 to 6 are the same for everybody and can be
-- pasted as they are. This one has a real person's email address in it, so it is
-- separate and it is hand-edited before it runs.
--
-- WHY THIS CANNOT BE DONE IN THE APP
-- Step 1's policy on user_shops checks is_shop_admin_of(shop_id) against the row
-- being written. A Jaspare admin is not an admin of Surefit, so a Jaspare admin
-- cannot add anybody to Surefit — deliberately. A shop that can grant itself
-- membership of another shop is not two shops, it is one shop with two names.
--
-- So Surefit's first admin is created here, once, by whoever holds this database.
-- After that, that person adds their own staff from inside the app and this file is
-- never needed again.
--
-- BEFORE RUNNING: Surefit's admin must already have an account. Either they sign up
-- through the app first, or you create one in Dashboard → Authentication → Users →
-- Add user. Note that a sign-up made BEFORE step 4 ran gets no membership at all
-- (handle_new_user had no shop to read yet), which is exactly what this file fixes.
-- ============================================================

-- ------------------------------------------------------------
-- EDIT THIS ONE LINE — the email address of Surefit's admin.
-- ------------------------------------------------------------
do $$
declare
  v_email text := 'admin@bypassshop.co';     -- <<< Surefit's admin
  v_user  uuid;
  v_shop  uuid;
begin
  if v_email = 'CHANGE-ME@example.com' then
    raise exception 'Put Surefit''s admin email in this file first — line 29.';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(v_email));
  if v_user is null then
    raise exception 'No account exists for %. They need to sign up first, or add them in Dashboard → Authentication → Users.', v_email;
  end if;

  select id into v_shop from public.shops where slug = 'surefit-autoparts';
  if v_shop is null then
    raise exception 'Surefit is not in public.shops — run 01 first.';
  end if;

  insert into public.user_shops (user_id, shop_id, role)
  values (v_user, v_shop, 'admin')
  on conflict (user_id, shop_id) do update set role = 'admin';

  raise notice '% is now an admin of Surefit Autoparts Ltd.', v_email;

  -- Deliberately NOT done here: adding them to Jaspare as well. If the same person
  -- runs both shops, that is a second line and a decision somebody makes on
  -- purpose. Two memberships also means my_one_shop() returns null for them, so
  -- they must use the shop links rather than the bare address — which is correct:
  -- somebody with two shops should be asked which one they mean.
end $$;


-- ------------------------------------------------------------
-- WHAT SUREFIT LOOKS LIKE THE MOMENT THIS RUNS
--
--   one admin, no other staff
--   no branches            (as asked — added later, one row each)
--   no stock               so its customer page shows an empty shelf, honestly
--   eleven expense categories   (seeded in step 3)
--   its own numbering, starting at QT-2026-0001 / RCP-2026-0001 / ENQ-2026-0001
--
-- Check it:
--   select u.email, s.name, us.role
--     from public.user_shops us
--     join auth.users u on u.id = us.user_id
--     join public.shops s on s.id = us.shop_id
--    where s.slug = 'surefit-autoparts';
--
-- Then have them open  https://bypass-shop.vercel.app/surefit-autoparts/login
-- and sign in. They should see their own empty shop — and NOT one part of
-- Jaspare's 604. If they see Jaspare's stock, step 5 did not run.
-- ------------------------------------------------------------
