-- ============================================================
-- MULTI-SHOP, STEP 2 OF 6 — shop_id on every table that holds a shop's data
--
-- Run AFTER 01. Safe to re-run.
--
-- WHICH TABLES, AND WHY THESE ONES
-- The brief said "add shop_id to every table currently scoped by branch". Against
-- this database that list is empty: nothing is scoped by branch, there is no
-- branch column anywhere, and the two things that look like it are not
-- (transfers.other_branch is free text typed by hand; profiles.shop is a label
-- nothing reads). So the list below is the real one — every table holding data
-- that belongs to a business rather than to a person.
--
-- WHAT IS DELIBERATELY LEFT OUT
--   profiles, trusted_devices, email_codes, verified_emails, auth.users
--     These are about a person's login, not a shop's data. A phone is trusted by
--     the human who owns it; if that human works for both shops, the trust is
--     still one fact about one phone.
--   app_settings
--     Its only row is the new-phone code switch. A login is one login — somebody
--     with accounts at both shops cannot have their phone half-trusted — so this
--     stays global and its primary key is left alone. set_otp_login() upserts on
--     (key) and would break if it were touched.
--
-- THE TEMPORARY DEFAULT IS THE IMPORTANT LINE IN THIS FILE
-- Every insert path in the running app is shop-blind right now. Without a default,
-- the moment shop_id is NOT NULL every sale, every restock and every order fails
-- at the counter. With one, an un-updated code path writes to Jaspare — which is
-- recoverable, and where those writes were going anyway. So: default in here,
-- frontend deploys, default out in step 6, same day. A permanent default tenant is
-- exactly how a Surefit sale ends up in Jaspare's books.
-- ============================================================

begin;

do $$
declare
  v_jaspare uuid := (select id from public.shops where slug = 'jaspare-auto');
  t text;
  tables text[] := array[
    -- the ordinary ones: a column, backfilled, locked
    'inventory', 'sales', 'stock_movements', 'notifications', 'customer_orders',
    'quotes', 'receipts', 'credit_accounts', 'credit_txns', 'expenses', 'messages',
    -- these three also need their PRIMARY KEY changed, which happens in step 3.
    -- The column has to exist and be full before a key can be built on it.
    'part_categories', 'expense_categories', 'finance_opening',
    -- these two may not exist yet (they live in SETUP_REMAINING.sql, unrun).
    -- Skipped silently if absent; that file now creates them with shop_id already
    -- on board, so they are born correct rather than created wrong and patched.
    'transfers', 'staff_contacts'
  ];
begin
  if v_jaspare is null then
    raise exception 'Jaspare Auto is missing from public.shops — run 01 first.';
  end if;

  foreach t in array tables loop
    if not exists (select 1 from pg_tables
                    where schemaname = 'public' and tablename = t) then
      raise notice 'skipped public.% — table does not exist', t;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists shop_id uuid
         references public.shops(id) on delete restrict', t);

    execute format('update public.%I set shop_id = %L where shop_id is null', t, v_jaspare);
    execute format('alter table public.%I alter column shop_id set not null', t);
    execute format('alter table public.%I alter column shop_id set default %L', t, v_jaspare);
    execute format('create index if not exists %I on public.%I (shop_id)',
                   t || '_shop_idx', t);

    raise notice 'public.% now carries shop_id', t;
  end loop;
end $$;

commit;


-- ------------------------------------------------------------
-- Check it worked — every row of live data now belongs to Jaspare, and no row
-- anywhere belongs to Surefit:
--
--   select 'inventory' t, count(*) from public.inventory
--   union all select 'sales', count(*) from public.sales
--   union all select 'receipts', count(*) from public.receipts;
--
--   select s.slug, count(i.code) from public.shops s
--     left join public.inventory i on i.shop_id = s.id
--    group by s.slug;
--
-- Expect ~604 parts under jaspare-auto and 0 under surefit-autoparts.
-- ------------------------------------------------------------
