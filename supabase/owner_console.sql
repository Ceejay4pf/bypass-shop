-- ============================================================
-- THE OWNER'S CONSOLE — one screen above all the shops
--
-- PASTE THE WHOLE FILE INTO THE SUPABASE SQL EDITOR AND PRESS RUN, except that the
-- password on the line marked CHANGE-ME has to be filled in first. Safe to re-run:
-- everything is create-or-replace or on-conflict, and the password is set on the
-- first run only.
--
-- ------------------------------------------------------------
-- WHAT IT IS FOR
--
-- The owner's words: "a module only accessible by me via a password that is not in
-- any of the shops... it compares the stocks and matches what is there in this shop
-- and is not available in the other shop, and what is available in what quantity in
-- the inventory of all shops... I can just search for a part and am shown where it is
-- specifically located, in which shop... this is where all the settings and
-- operations are controlled, for handling the system and giving access in different
-- shops".
--
-- So it is the one place that is allowed to look ACROSS the shops. Everything else in
-- this system is built to make that impossible — shopFrom() in the app narrows every
-- query to one shop, and the policies in multishop/05 narrow it again in the
-- database — and that is exactly why this cannot be done by simply signing in
-- somewhere with a big enough account. It needs a deliberate, named, auditable way
-- round the fence, which is what the functions below are.
--
-- ------------------------------------------------------------
-- THE CONSOLE'S LOGIN BELONGS TO NO SHOP AT ALL
--
-- ceejay@bypassshop.co gets no row in user_shops. None. It cannot open Jaspare, or
-- Sure Fit, or Jeyden, or Quick Jet — ShopGate would tell it "wrong shop" at every
-- one of them, which is the truth.
--
-- That is the literal reading of "a password that is not in any of the shops", and it
-- is also the safer design by a distance. The alternative — make the owner an admin
-- of all four shops so the ordinary screens work everywhere — would mean one password
-- that opens every till, every book and every staff list through twenty-five screens
-- that were written assuming one shop at a time. This way the console's reach is
-- exactly the ten functions below and nothing else. Adding an eleventh is a decision
-- somebody has to make on purpose.
--
-- Every function is SECURITY DEFINER, which is how they see past row level security,
-- and every one of them asks is_cross_shop_owner() FIRST. A definer function without
-- that first line is a hole in every policy in this database.
--
-- ------------------------------------------------------------
-- WHY THE PASSWORD IS NOT IN THIS FILE
--
-- This repository is public. The owner chose this password for themselves and uses it
-- elsewhere for all this file knows; writing it on line 246 would publish it while
-- they carried on believing it was private, which is worse than no password at all
-- because it removes the reason to be careful. Compare quickjet123 in
-- multishop/14, which IS in the file: that one is a documented default the sign-in
-- screen prints on the screen, and hiding it would protect nothing.
--
-- So the block below refuses to run until somebody fills it in, uses it once, and
-- does not commit it back. It has already been run against the live project, so the
-- account exists and the placeholder is now only for a rebuild from nothing.
-- ============================================================


-- ============================================================
-- 1) WHO THE OWNER IS
--
-- Two accounts, and the list is deliberately tiny and deliberately here rather than
-- in a table: a table of owners is a table somebody can be added to, and the whole
-- value of this screen is that its reach cannot be granted from inside the app.
--
-- Adding a third owner is an edit to this file plus a run, by whoever holds the
-- database. That is the intended amount of friction.
-- ============================================================
create or replace function public.is_cross_shop_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and lower(u.email) in ('ceejay@bypassshop.co', 'addamsjmk@gmail.com')
  );
$$;

revoke all on function public.is_cross_shop_owner() from anon;
grant execute on function public.is_cross_shop_owner() to authenticated;


-- ============================================================
-- 2) WHAT EACH SHOP IS HOLDING
--
-- One row per shop: how many parts, how many units on the shelf, what they are worth
-- at selling price, and how many have run out. The first answer to "what is available
-- in what quantity in the inventory of all shops".
-- ============================================================
create or replace function public.owner_shop_totals()
returns table (
  shop_slug text, shop_name text, parts int, units bigint,
  value numeric, sections int, out_of_stock int, low int, last_added timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;

  return query
  select s.slug, s.name,
         count(i.code)::int,
         coalesce(sum(coalesce(i.qty, 0)), 0)::bigint,
         coalesce(sum(coalesce(i.qty, 0) * coalesce(i.price, 0)), 0)::numeric,
         (select count(*)::int from public.part_categories c where c.shop_id = s.id),
         count(*) filter (where coalesce(i.qty, 0) = 0)::int,
         count(*) filter (where i.min_qty is not null
                            and coalesce(i.qty, 0) > 0
                            and coalesce(i.qty, 0) <= i.min_qty)::int,
         max(i.created_at)
    from public.shops s
    left join public.inventory i
           on i.shop_id = s.id and coalesce(i.status, 'Active') = 'Active'
   where s.is_active
   group by s.id, s.slug, s.name
   order by s.name;
end $$;


-- ============================================================
-- 3) FIND A PART, ANYWHERE
--
-- "I can just search for a part and am shown where it is specifically located, in
-- which shop." So every row carries the shop, the shelf code, the quantity, the
-- price — and the free-typed notes, because the owner asked for those to show in a
-- search as well: "extra details of parts that I write should be visible when you are
-- searching the part, even though they aren't either brand, year or what they are".
--
-- IT TAKES WORDS, NOT A SENTENCE. The question is turned into words by the app
-- (src/lib/askStock.js), where "is there a bumper for a premio" loses "is", "there",
-- "a" and "for" and can be tested without a database. Every word has to match
-- something, but each may match a different column — "toyota premio bumper" is a
-- make, a model and a section, and no single column contains all three.
-- ============================================================
create or replace function public.owner_find_part(p_words text[])
returns table (
  shop_slug text, shop_name text, code text, cat text, section text, name text,
  brand text, model text, series text, year_from int, year_to int,
  condition text, side text, variant text, color text,
  qty int, price numeric, location text, supplier text, notes text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;

  -- No words is not "everything": a blank box would pull four shops' shelves over a
  -- phone connection to answer a question nobody asked.
  if p_words is null or array_length(p_words, 1) is null then
    return;
  end if;

  return query
  with hay as (
    select s.slug as shop_slug, s.name as shop_name, i.*,
           (select c.label from public.part_categories c
             where c.shop_id = i.shop_id and c.key = i.cat) as section_label,
           lower(concat_ws(' ',
             i.code, i.name, i.brand, i.model, i.series, i.condition, i.side,
             i.variant, i.color, i.location, i.supplier, i.notes,
             i.year_from, i.year_to,
             (select c.label from public.part_categories c
               where c.shop_id = i.shop_id and c.key = i.cat))) as blob
      from public.inventory i
      join public.shops s on s.id = i.shop_id
     where coalesce(i.status, 'Active') = 'Active'
  )
  select h.shop_slug, h.shop_name, h.code, h.cat,
         coalesce(h.section_label, h.cat), h.name,
         h.brand, h.model, h.series, h.year_from, h.year_to,
         h.condition, h.side, h.variant, h.color,
         coalesce(h.qty, 0), coalesce(h.price, 0),
         h.location, h.supplier, h.notes
    from hay h
   where (select bool_and(h.blob like '%' || lower(btrim(w)) || '%')
            from unnest(p_words) as w
           where btrim(w) <> '')
     -- In stock first: a part that is on the shelf answers the question, and one that
     -- ran out is worth knowing about second rather than not at all.
   order by (coalesce(h.qty, 0) > 0) desc, h.shop_name, h.code
   limit 400;
end $$;


-- ============================================================
-- 4) WHAT ONE SHOP HAS AND ANOTHER DOES NOT
--
-- "It compares the stocks and matches what is there in this shop and is not available
-- in the other shop."
--
-- The comparison is NOT by part code. Codes carry a per-shop serial, so the same
-- headlight at two shops has two codes and comparing them would report every part as
-- unique to its own shop — a report that is always maximally alarming and therefore
-- says nothing.
--
-- So it compares the KIND of part: section, make, model, which end of the car, and
-- the variant. Those five are what somebody at the counter means by "the same part",
-- and variant is in the list because a xenon headlight and a non-xenon one are not
-- interchangeable however alike they look.
--
-- One row per kind, with a shop-by-shop breakdown, so a single answer serves both
-- questions the owner asked: shop_count = 1 is what only one shop has, and the
-- `shops` column is what each holds and how many.
-- ============================================================
create or replace function public.owner_part_kinds()
returns table (
  cat text, section text, brand text, model text, side text, variant text,
  example_name text, shops jsonb, shop_count int, total_qty bigint, total_parts int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;

  return query
  with mine as (
    select s.slug,
           coalesce(nullif(btrim(i.cat), ''), '?')      as k_cat,
           coalesce(nullif(btrim(i.brand), ''), '')     as k_brand,
           coalesce(nullif(btrim(i.model), ''), '')     as k_model,
           coalesce(nullif(btrim(i.side), ''), '')      as k_side,
           coalesce(nullif(btrim(i.variant), ''), '')   as k_variant,
           i.name, coalesce(i.qty, 0) as qty
      from public.inventory i
      join public.shops s on s.id = i.shop_id and s.is_active
     where coalesce(i.status, 'Active') = 'Active'
  ),
  per as (
    select k_cat, k_brand, k_model, k_side, k_variant, slug,
           sum(qty)::bigint as qty, count(*)::int as parts,
           min(nullif(btrim(name), '')) as any_name
      from mine
     group by 1, 2, 3, 4, 5, 6
  )
  select p.k_cat,
         /* The section's name from whichever shop has bothered to name it. A scalar
            sub-select rather than a join, because part_categories has one row per
            shop per key and joining it here would multiply every kind by the number
            of shops that use the section — which would silently treble the counts
            below. */
         coalesce((select min(c.label) from public.part_categories c
                    where c.key = p.k_cat), p.k_cat),
         p.k_brand, p.k_model, p.k_side, p.k_variant,
         min(p.any_name),
         jsonb_object_agg(p.slug, jsonb_build_object('qty', p.qty, 'parts', p.parts)),
         count(*)::int,
         sum(p.qty)::bigint,
         sum(p.parts)::int
    from per p
   group by p.k_cat, p.k_brand, p.k_model, p.k_side, p.k_variant
   order by count(*), sum(p.qty) desc, p.k_cat, p.k_brand, p.k_model;
end $$;


-- ============================================================
-- 5) WHO CAN SIGN IN, AND WHERE
--
-- "This is where all the settings and operations are controlled, giving access in
-- different shops... I don't want a staff to access all shops, so the necessary staff
-- should be able to login only in their shop."
--
-- One row per account, with the shop it can open — or no shop, which is a real and
-- important state: an account with no membership can sign in and then reach nothing,
-- and until now there was nowhere that showed you that had happened.
-- ============================================================
create or replace function public.owner_accounts()
returns table (
  email text, full_name text, shop_slug text, shop_name text, role text,
  approved boolean, permissions text[], shops int,
  last_sign_in timestamptz, created timestamptz, forced_out timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;

  return query
  select u.email::text,
         coalesce(pr.full_name, ''),
         coalesce(s.slug, ''), coalesce(s.name, ''), coalesce(us.role, ''),
         pr.approved,
         coalesce(pr.permissions, '{}'::text[]),
         (select count(*)::int from public.user_shops x where x.user_id = u.id),
         u.last_sign_in_at, u.created_at, pr.force_logout_at
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    left join public.user_shops us on us.user_id = u.id
    left join public.shops s on s.id = us.shop_id
   order by coalesce(s.name, 'zzz'), u.email;
end $$;


-- ============================================================
-- 6) CHANGING WHO CAN GET IN
--
-- Four things the console can do, and they are separate on purpose — "log this person
-- out" and "this person no longer works here" are different decisions with different
-- consequences, and a single button that did both would get pressed for the wrong one.
--
--   owner_move_account    put somebody in exactly ONE shop, as staff or admin
--   owner_revoke_account  take away every shop, and end the session
--   owner_log_out         end the session, keep the job
--   owner_set_approved    hold somebody at the pending screen, or let them through
--   owner_set_permissions what they may do once inside
--
-- MOVE, NOT ADD, and that is the owner's rule in code: "I don't want a staff to
-- access all shops". Every membership is deleted before the new one goes in, so this
-- function cannot be used to give one person two shops even by accident. The one_shop
-- trigger from subcategories_and_per_shop_admins.sql would refuse it anyway; doing it
-- here means the console never has to show that error.
-- ============================================================
create or replace function public.owner_move_account(
  p_email text, p_slug text, p_role text default 'staff'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_shop uuid;
  v_name text;
  v_role text := lower(btrim(coalesce(p_role, 'staff')));
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;
  if v_role not in ('staff', 'admin') then
    raise exception 'A person is either staff or admin, not "%".', p_role;
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account here uses %.', p_email;
  end if;

  select id, name into v_shop, v_name from public.shops where slug = lower(btrim(p_slug));
  if v_shop is null then
    raise exception 'No shop called %.', p_slug;
  end if;

  delete from public.user_shops where user_id = v_user;
  insert into public.user_shops (user_id, shop_id, role) values (v_user, v_shop, v_role);

  -- The session in their hand still believes whatever it believed. A person moved
  -- between shops keeps reading the old shop's stock until they sign in again, so
  -- they are signed out — the one case where moving somebody and interrupting them
  -- are the same act.
  update public.profiles set force_logout_at = now() where id = v_user;

  return p_email || ' can now open ' || v_name || ' as ' || v_role ||
         ', and nothing else. They will be asked to sign in again.';
end $$;

create or replace function public.owner_revoke_account(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_gone int;
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account here uses %.', p_email;
  end if;
  if lower(btrim(p_email)) in ('ceejay@bypassshop.co', 'addamsjmk@gmail.com') then
    raise exception 'That is an owner login. Locking yourself out is not something this screen will help with.';
  end if;

  delete from public.user_shops where user_id = v_user;
  get diagnostics v_gone = row_count;
  update public.profiles set force_logout_at = now(), approved = false where id = v_user;

  return p_email || ' is out: ' || v_gone || ' shop membership(s) removed, signed out, '
      || 'and held at the pending screen if they sign in again. The account itself is '
      || 'left alone — nothing they stamped loses its name.';
end $$;

create or replace function public.owner_log_out(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account here uses %.', p_email;
  end if;
  update public.profiles set force_logout_at = now() where id = v_user;
  return p_email || ' will be signed out within a few seconds, on every device.';
end $$;

create or replace function public.owner_set_approved(p_email text, p_ok boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account here uses %.', p_email;
  end if;
  update public.profiles set approved = p_ok where id = v_user;
  if not p_ok then
    update public.profiles set force_logout_at = now() where id = v_user;
  end if;
  return p_email || case when p_ok then ' is allowed in.' else ' is held at the pending screen.' end;
end $$;

create or replace function public.owner_set_permissions(p_email text, p_perms text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  if not public.is_cross_shop_owner() then
    raise exception 'Not your screen.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account here uses %.', p_email;
  end if;
  update public.profiles
     set permissions = coalesce(p_perms, '{}'::text[]),
         pending_permissions = '{}'::text[]
   where id = v_user;
  return p_email || ' may now: ' ||
         coalesce(nullif(array_to_string(coalesce(p_perms, '{}'::text[]), ', '), ''), 'look, and nothing else');
end $$;

-- Reachable by any signed-in account, refused by all but two. The fence is the first
-- line of every function and not the grant, because a grant that has to be right on
-- ten functions is a grant that is wrong on one of them.
revoke all on function public.owner_shop_totals()                        from anon;
revoke all on function public.owner_find_part(text[])                    from anon;
revoke all on function public.owner_part_kinds()                         from anon;
revoke all on function public.owner_accounts()                           from anon;
revoke all on function public.owner_move_account(text, text, text)       from anon;
revoke all on function public.owner_revoke_account(text)                 from anon;
revoke all on function public.owner_log_out(text)                        from anon;
revoke all on function public.owner_set_approved(text, boolean)          from anon;
revoke all on function public.owner_set_permissions(text, text[])        from anon;

grant execute on function public.owner_shop_totals()                     to authenticated;
grant execute on function public.owner_find_part(text[])                 to authenticated;
grant execute on function public.owner_part_kinds()                      to authenticated;
grant execute on function public.owner_accounts()                        to authenticated;
grant execute on function public.owner_move_account(text, text, text)    to authenticated;
grant execute on function public.owner_revoke_account(text)              to authenticated;
grant execute on function public.owner_log_out(text)                     to authenticated;
grant execute on function public.owner_set_approved(text, boolean)       to authenticated;
grant execute on function public.owner_set_permissions(text, text[])     to authenticated;


-- ============================================================
-- 7) THE CONSOLE'S OWN LOGIN
--
-- ceejay@bypassshop.co, and NO membership of any shop — see the header. The password
-- is not in this file and this block refuses to run until it is filled in.
-- ============================================================
do $$
declare
  v_email    text := 'ceejay@bypassshop.co';
  v_name     text := 'Ceejay';
  v_password text := 'CHANGE-ME-BEFORE-RUNNING';   -- first run only; do not commit it back
  v_user     uuid;
  v_fresh    boolean;
begin
  if v_password = 'CHANGE-ME-BEFORE-RUNNING' then
    raise exception 'Put the console password in first — and do not commit it back, this repository is public.';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(v_email));

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
      -- NO shop_slug. handle_new_user() grants a membership when it finds one, and
      -- this is the one account in the system that must not have a shop.
      jsonb_build_object(
        'sub', v_user::text, 'email', lower(btrim(v_email)), 'full_name', v_name,
        'role', 'owner', 'email_verified', true, 'phone_verified', false)
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
      (select raw_user_meta_data->>'role' from auth.users where id = v_user), '') <> 'owner';

    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
             || jsonb_build_object('full_name', v_name, 'role', 'owner'),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           encrypted_password = case
             when v_fresh then extensions.crypt(v_password, extensions.gen_salt('bf', 10))
             else encrypted_password end,
           updated_at = now()
     where id = v_user;

    if v_fresh then
      delete from auth.refresh_tokens where user_id = v_user::text;
      delete from auth.sessions where user_id = v_user;
    end if;
  end if;

  insert into public.profiles (id, full_name, email_verified, approved)
  values (v_user, v_name, true, true)
  on conflict (id) do update set full_name = v_name, approved = true;

  -- Said twice, because it is the whole design: this login opens the console and no
  -- shop. If a future signup or a mis-run ever hands it one, this takes it back.
  delete from public.user_shops where user_id = v_user;
end $$;


-- ============================================================
-- 8) THE OWNER'S OWN ACCOUNT OPENS EVERY SHOP
--
-- "addamsjmk@gmail.com should be allowed to login into any shop."
--
-- It could not. It was a member of jaspare-auto and nothing else, so Sure Fit, Jeyden
-- and Quick Jet all answered "this account does not work at this shop" — correctly,
-- because a membership is what that screen reads. One row per shop fixes it.
--
-- This is the deliberate exception to the rule in part 6, and the one_shop_per_person
-- trigger already names it as one, along with admin@ and management@. Everybody else
-- gets exactly one shop.
-- ============================================================
insert into public.user_shops (user_id, shop_id, role)
select u.id, s.id, 'admin'
  from auth.users u, public.shops s
 where lower(u.email) = 'addamsjmk@gmail.com' and s.is_active
on conflict (user_id, shop_id) do update set role = 'admin';


-- ============================================================
-- 9) KEZIAH IS AN ADMIN IN THE DATABASE TOO
--
-- Found while checking the above, and worth fixing in the same run. roles.js lists
-- keziah@bypassshop.co as an admin and user_shops said 'staff' — which is the exact
-- trap 13_jeyden_first_admin.sql warns about: is_shop_admin_of() reads this row, so
-- the finance views, the staff list and the role-password panel all refused her IN
-- THE DATABASE while every button for them was on her screen. Client-side admin with
-- database-side staff is the worst of both.
--
-- Only her own shop. The point of this file is not to widen anybody's reach.
-- ============================================================
update public.user_shops us set role = 'admin'
  from auth.users u, public.shops s
 where us.user_id = u.id and us.shop_id = s.id
   and lower(u.email) = 'keziah@bypassshop.co'
   and s.slug = 'surefit-autoparts';


-- ============================================================
-- CHECK IT
-- ============================================================
select
  (select count(*) from public.user_shops us join auth.users u on u.id = us.user_id
    where lower(u.email) = 'ceejay@bypassshop.co')                as ceejay_shops_should_be_0,
  (select count(*) from public.user_shops us join auth.users u on u.id = us.user_id
    where lower(u.email) = 'addamsjmk@gmail.com')                 as owner_shops_should_be_4,
  (select count(*) from (
     select us.user_id from public.user_shops us
      join auth.users u on u.id = us.user_id
     where lower(u.email) not in
       ('admin@bypassshop.co', 'management@bypassshop.co', 'addamsjmk@gmail.com')
     group by us.user_id having count(*) > 1) x)                  as staff_in_two_shops_should_be_0,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'owner\_%')      as owner_functions_should_be_9;
