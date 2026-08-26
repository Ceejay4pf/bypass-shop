-- ============================================================
-- MULTI-SHOP, STEP 6 OF 6 — take the training wheels off
--
-- Run LAST, and only AFTER the new app is live and you have signed in, sold
-- something and printed a receipt without an error.
--
-- WHY THERE IS A STEP 6 AT ALL
-- Step 2 gave every table a temporary default of Jaspare's shop id. That default
-- existed for one reason: the SQL is pasted minutes before the new frontend
-- deploys, and until it deploys the running app inserts rows with no shop on them.
-- Without a default those inserts fail a NOT NULL check — at the counter, mid-sale.
--
-- Once the new app is live every insert carries its own shop_id and the default is
-- never read. Leaving it in would be the single most expensive line in this whole
-- migration: any code path anybody adds later that forgets shop_id would silently
-- file Surefit's row under Jaspare, with no error, no warning, and nothing to
-- notice until two businesses' books disagree.
--
-- A missing shop_id should be a loud failure the first time it happens. This file
-- is what makes it one.
--
-- IF SOMETHING IS STILL BROKEN, DON'T RUN THIS YET. The default is harmless while
-- only Jaspare has data. It becomes dangerous the day Surefit gets its first part,
-- so this must be run before that — but "before Surefit has stock" is a week, not
-- a minute.
-- ============================================================

begin;

do $$
declare
  t     text;
  n     int := 0;
  tables text[] := array[
    'inventory', 'sales', 'stock_movements', 'notifications', 'customer_orders',
    'quotes', 'receipts', 'credit_accounts', 'credit_txns', 'expenses', 'messages',
    'part_categories', 'expense_categories', 'finance_opening',
    'transfers', 'staff_contacts'
  ];
begin
  foreach t in array tables loop
    if not exists (select 1 from pg_tables
                    where schemaname = 'public' and tablename = t) then
      continue;
    end if;

    -- Only report the ones that actually had a default, so a re-run is quiet.
    if exists (
      select 1 from pg_attrdef d
        join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = ('public.' || t)::regclass and a.attname = 'shop_id'
    ) then
      execute format('alter table public.%I alter column shop_id drop default', t);
      raise notice 'public.% no longer guesses a shop', t;
      n := n + 1;
    end if;
  end loop;

  if n = 0 then
    raise notice 'nothing to do — no table was still defaulting shop_id';
  end if;
end $$;

-- finance_opening keeps its `id` default of 1. That one is not a guess: there is
-- genuinely one opening-balance row per shop and the app writes id 1 every time.
-- Only the shop_id default goes.

commit;


-- ------------------------------------------------------------
-- Check it worked — this should return NO ROWS:
--
--   select c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid) as still_defaults_to
--     from pg_attrdef d
--     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
--     join pg_class c on c.oid = d.adrelid
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and a.attname = 'shop_id';
--
-- And this should FAIL, which is the whole point:
--
--   insert into public.part_categories (key, label, sort) values ('ZZZ', 'test', 1);
--   -- expect: null value in column "shop_id" violates not-null constraint
-- ------------------------------------------------------------
