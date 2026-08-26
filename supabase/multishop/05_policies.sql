-- ============================================================
-- MULTI-SHOP, STEP 5 OF 6 — row level security, per shop
--
-- Run AFTER 04. Safe to re-run.
--
-- THIS IS THE STEP THAT MAKES TWO SHOPS TWO SHOPS.
-- Everything before it added columns and narrowed functions. Until this file runs,
-- every policy on every data table still says `using (true)` — any signed-in
-- account can read and write every row of both businesses. The frontend filters by
-- shop_id, and a filter in a browser is a courtesy, not a boundary: a person with a
-- session and a browser console can ask for the other shop's stock, prices and
-- takings and get them.
--
-- After this file, the database itself refuses. That is the difference between two
-- shops sharing a Supabase project and two shops sharing a filing cabinet.
--
-- THE ONE THING IN HERE THAT IS NOT A NARROWING
-- is_admin(), is_shop_admin() and is_finance_admin() each hardcode the same three
-- email addresses:
--
--     admin@bypassshop.co, management@bypassshop.co, addamsjmk@gmail.com
--
-- Leave them guarding data and the moment Surefit's shop row exists those three
-- addresses are full Surefit admins, including its cash book, its opening balances
-- and its profit — a business they have no relationship with. So every policy that
-- guards a shop's DATA moves to is_shop_admin_of(shop_id), which knows which shop
-- it is being asked about and answers from user_shops.
--
-- The three functions are NOT deleted. They still correctly mean "the person who
-- owns this system", and profiles — one row per human, not per shop — still uses
-- is_admin(). What ends is is_admin() deciding who may read a shop's money.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) THE ORDINARY STAFF TABLES
--
-- Nine tables whose rule is the same sentence: any member of the shop may do
-- anything with that shop's rows, and nothing at all with another shop's.
--
-- `with check` matters as much as `using`. Without it a Jaspare member could
-- INSERT a row stamped with Surefit's id — visible to Surefit, unreadable and
-- unfixable by the person who wrote it.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'inventory', 'sales', 'stock_movements', 'customer_orders',
    'quotes', 'receipts', 'credit_accounts', 'credit_txns', 'transfers'
  ] loop
    if not exists (select 1 from pg_tables
                    where schemaname = 'public' and tablename = t) then
      raise notice 'skipped public.% — table does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- The old open policies, under all the names they were created with across
    -- schema.sql, quotes.sql, receipts.sql, credit_accounts.sql, transfers.sql
    -- and customer_enquiries.sql. Any left behind would keep granting everything:
    -- policies are OR'd together, so one surviving `using (true)` undoes this
    -- entire file for that table.
    execute format('drop policy if exists "staff_all" on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);

    execute format('drop policy if exists "shop_staff_all" on public.%I', t);
    execute format(
      'create policy "shop_staff_all" on public.%I for all to authenticated
         using (shop_id in (select public.my_shop_ids()))
         with check (shop_id in (select public.my_shop_ids()))', t);

    raise notice 'public.% is now limited to shops you belong to', t;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 2) NOTIFICATIONS — the activity feed
--
-- Kept exactly as it was in spirit: staff WRITE to it (every sale records a line)
-- but only an admin READS it back. Both halves gain the shop.
--
-- The insert policy was `with check (true)`, which now becomes membership: without
-- it, a staff member could write a line into the other shop's feed, and the feed is
-- what the owner reads to see who sold what.
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "staff_all" on public.notifications;

drop policy if exists "notifications_read_admin" on public.notifications;
create policy "notifications_read_admin" on public.notifications
  for select to authenticated using (public.is_shop_admin_of(shop_id));

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (shop_id in (select public.my_shop_ids()));

drop policy if exists "notifications_write_admin" on public.notifications;
create policy "notifications_write_admin" on public.notifications
  for update to authenticated using (public.is_shop_admin_of(shop_id));

drop policy if exists "notifications_delete_admin" on public.notifications;
create policy "notifications_delete_admin" on public.notifications
  for delete to authenticated using (public.is_shop_admin_of(shop_id));


-- ------------------------------------------------------------
-- 3) PART CATEGORIES — the sections on the shelf
--
-- Read by every member of the shop, changed only by that shop's admin. Same shape
-- as before, with is_shop_admin() replaced by is_shop_admin_of(shop_id) and the
-- read narrowed from `true`.
--
-- Still no delete policy, for the reason part_categories.sql gives: deleting a
-- section does not delete the parts filed under it, and a shelf of real stock
-- reading as "unknown" is worse than a spare line in a picker.
-- ------------------------------------------------------------
alter table public.part_categories enable row level security;

drop policy if exists "part_categories_all" on public.part_categories;

drop policy if exists "part_categories_read" on public.part_categories;
create policy "part_categories_read" on public.part_categories
  for select to authenticated using (shop_id in (select public.my_shop_ids()));

drop policy if exists "part_categories_insert" on public.part_categories;
create policy "part_categories_insert" on public.part_categories
  for insert to authenticated with check (public.is_shop_admin_of(shop_id));

drop policy if exists "part_categories_update" on public.part_categories;
create policy "part_categories_update" on public.part_categories
  for update to authenticated using (public.is_shop_admin_of(shop_id));


-- ------------------------------------------------------------
-- 4) THE MONEY — expenses, opening balances, expense categories
--
-- The most important paragraph in this file. These three were guarded by
-- is_finance_admin(), the same three hardcoded addresses. Untouched, the day
-- Surefit's shop row appears those three people can read Surefit's cash book,
-- set its opening balances and see its profit.
--
-- Still no delete policy on expenses, for the reason finance.sql gives: an expense
-- is voided by an update, which keeps the row and who voided it.
-- ------------------------------------------------------------
alter table public.expenses enable row level security;

drop policy if exists expenses_admin_read on public.expenses;
create policy expenses_admin_read on public.expenses
  for select to authenticated using (public.is_shop_admin_of(shop_id));

drop policy if exists expenses_admin_write on public.expenses;
create policy expenses_admin_write on public.expenses
  for insert to authenticated with check (public.is_shop_admin_of(shop_id));

drop policy if exists expenses_admin_update on public.expenses;
create policy expenses_admin_update on public.expenses
  for update to authenticated using (public.is_shop_admin_of(shop_id));

alter table public.finance_opening enable row level security;

drop policy if exists opening_admin_read on public.finance_opening;
create policy opening_admin_read on public.finance_opening
  for select to authenticated using (public.is_shop_admin_of(shop_id));

drop policy if exists opening_admin_write on public.finance_opening;
create policy opening_admin_write on public.finance_opening
  for insert to authenticated with check (public.is_shop_admin_of(shop_id));

drop policy if exists opening_admin_update on public.finance_opening;
create policy opening_admin_update on public.finance_opening
  for update to authenticated using (public.is_shop_admin_of(shop_id));

alter table public.expense_categories enable row level security;

-- Read by any member of the shop, not only its admin. The category list is not
-- money — it is eleven words — and the previous admin-only read was why a manager
-- recording a fuel receipt saw an empty picker.
drop policy if exists cats_read on public.expense_categories;
create policy cats_read on public.expense_categories
  for select to authenticated using (shop_id in (select public.my_shop_ids()));

drop policy if exists cats_write on public.expense_categories;
create policy cats_write on public.expense_categories
  for insert to authenticated with check (public.is_shop_admin_of(shop_id));


-- ------------------------------------------------------------
-- 5) THE STAFF FEED (messages)
--
-- Read by the shop you work at. The insert rule keeps its "only as yourself"
-- clause and gains "only into your own shop's feed".
--
-- The delete rule loses its inline list of two email addresses — the same hardcoded
-- names, spelled out a fourth time — for "your own message, or anything if you
-- administer this shop".
-- ------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages
  for select to authenticated using (shop_id in (select public.my_shop_ids()));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (auth.uid() = user_id and shop_id in (select public.my_shop_ids()));

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete to authenticated using (
    (auth.uid() = user_id and shop_id in (select public.my_shop_ids()))
    or public.is_shop_admin_of(shop_id)
  );


-- ------------------------------------------------------------
-- 6) THE TEAM DIRECTORY (staff_contacts)
--
-- May not exist yet — it lives in SETUP_REMAINING.sql, which has never been run.
-- Guarded so this file does not fail on a database where that is still true.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_tables
              where schemaname = 'public' and tablename = 'staff_contacts') then

    execute 'alter table public.staff_contacts enable row level security';

    execute 'drop policy if exists "staff_contacts_read" on public.staff_contacts';
    execute 'create policy "staff_contacts_read" on public.staff_contacts
               for select to authenticated using (public.is_shop_admin_of(shop_id))';

    execute 'drop policy if exists "staff_contacts_insert" on public.staff_contacts';
    execute 'create policy "staff_contacts_insert" on public.staff_contacts
               for insert to authenticated with check (public.is_shop_admin_of(shop_id))';

    execute 'drop policy if exists "staff_contacts_update" on public.staff_contacts';
    execute 'create policy "staff_contacts_update" on public.staff_contacts
               for update to authenticated using (public.is_shop_admin_of(shop_id))';

    execute 'drop policy if exists "staff_contacts_delete" on public.staff_contacts';
    execute 'create policy "staff_contacts_delete" on public.staff_contacts
               for delete to authenticated using (public.is_shop_admin_of(shop_id))';
  else
    raise notice 'skipped public.staff_contacts — table does not exist yet';
  end if;
end $$;


-- ------------------------------------------------------------
-- 7) WHAT IS DELIBERATELY LEFT ALONE
--
--   profiles          One row per person, not per shop. A staff member reads their
--                     own row; is_admin() still reads the whole team, which is
--                     correct for the platform owner and is not a shop's data.
--   trusted_devices,
--   email_codes,
--   verified_emails   A phone is trusted by the human holding it. Somebody who
--                     works at both shops cannot have half a trusted phone.
--   app_settings      One row: the new-phone code switch. One login system, so one
--                     setting. Readable by anon on purpose — the login screen has
--                     to know which door to offer before anybody has signed in.
--
-- And one thing NOBODY gets a policy for: shop_counters. Receipt numbers are
-- handed out by next_shop_number() and by nothing else. A client that could write
-- to that table could reissue a number already printed on a customer's copy.
-- ------------------------------------------------------------

commit;


-- ------------------------------------------------------------
-- Check it worked. Every row here should say a shop, never `true`:
--
--   select tablename, policyname, qual
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('inventory','sales','notifications','expenses','messages',
--                        'quotes','receipts','credit_accounts','part_categories')
--    order by tablename, policyname;
--
-- Then the real test, signed in as ordinary Jaspare staff:
--   select count(*) from public.inventory;      -- ~604
--   select count(*) from public.expenses;       -- 0, unless you are a Jaspare admin
--
-- And the one that matters most — nothing of Surefit's is reachable:
--   select count(*) from public.inventory
--    where shop_id = (select id from public.shops where slug='surefit-autoparts');
--   -- must be 0 for a Jaspare account, even once Surefit has stock
-- ------------------------------------------------------------
