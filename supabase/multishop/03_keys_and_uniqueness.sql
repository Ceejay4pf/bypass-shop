-- ============================================================
-- MULTI-SHOP, STEP 3 OF 6 — the keys that two shops break
--
-- Run AFTER 02. Safe to re-run.
--
-- A shop_id column is the easy half. These are the places where the SHAPE of the
-- schema assumes one business, and where Surefit's first row would simply fail to
-- insert:
--
--   inventory.code is the primary key      → two shops cannot both stock HDL-TOY-PRE-16-0001
--   part_categories.key is the primary key → Surefit cannot have its own HDL section
--   expense_categories.name is the PK      → one shared expense list for two businesses
--   finance_opening is ONE ROW, enforced   → there is physically no room for Surefit's
--   quotes.number / receipts.number /
--   customer_orders.ref are globally unique→ Surefit's first receipt lands in Jaspare's 400s
--
-- Constraint names are looked up rather than typed, because a database that has
-- been through a rename or a restore does not always carry the default ones, and a
-- hardcoded name that does not exist stops the whole file on line one.
--
-- ONE THING FROM THE PLAN IS DELIBERATELY NOT DONE HERE, and it is worth saying
-- why. The plan proposed composite foreign keys from sales and stock_movements to
-- inventory(shop_id, code), so a sale could not name another shop's part. It is
-- not here. schema.sql says in as many words that stock_movements has no foreign
-- key ON PURPOSE — "history survives even if the item is later deleted" — and
-- adding one would make deleting a part fail, or make its history vanish with it.
-- Cross-shop consistency is enforced in step 4 instead, inside sell_item,
-- add_stock and set_qty, where it costs no history.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) finance_opening — one row per shop instead of one row full stop
--
-- The `id` column is KEPT, unlike the plan's version, and only its check is
-- dropped. The running app reads with .eq("id", 1) and upserts { id: 1 }; dropping
-- the column would break the statements screen in the window between this file
-- being pasted and the app being redeployed. Keeping it costs one integer and the
-- key becomes (shop_id, id), which is what actually matters.
-- ------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.finance_opening'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%id = 1%'
  loop
    execute format('alter table public.finance_opening drop constraint %I', c);
    raise notice 'dropped the "one row only" check on finance_opening (%)', c;
  end loop;
end $$;

alter table public.finance_opening alter column id set default 1;
alter table public.finance_opening alter column id set not null;


-- ------------------------------------------------------------
-- 2) PRIMARY KEYS, rebuilt to include the shop
-- ------------------------------------------------------------
do $$
declare
  r  record;
  c  text;
begin
  for r in select * from (values
      ('inventory',          'shop_id, code'),
      ('part_categories',    'shop_id, key'),
      ('expense_categories', 'shop_id, name'),
      ('finance_opening',    'shop_id, id')
    ) as v(t, cols)
  loop
    if not exists (select 1 from pg_tables
                    where schemaname = 'public' and tablename = r.t) then
      raise notice 'skipped public.% — table does not exist', r.t;
      continue;
    end if;

    select conname into c from pg_constraint
     where conrelid = ('public.' || r.t)::regclass and contype = 'p';

    -- Already the right shape? Then this file has run before. Leave it.
    if c is not null and pg_get_constraintdef(
         (select oid from pg_constraint where conname = c
           and conrelid = ('public.' || r.t)::regclass)
       ) ilike '%shop_id%' then
      raise notice 'public.% primary key already includes shop_id', r.t;
      continue;
    end if;

    if c is not null then
      execute format('alter table public.%I drop constraint %I', r.t, c);
    end if;
    execute format('alter table public.%I add primary key (%s)', r.t, r.cols);
    raise notice 'public.% primary key is now (%)', r.t, r.cols;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 3) DOCUMENT NUMBERS — unique inside a shop, not across the database
--
-- Finds the single-column unique constraint on the numbering column and replaces
-- it with a two-column one. The per-shop COUNTERS that feed these numbers are in
-- step 4; without them Surefit's first quote would be handed a number from
-- Jaspare's run and fail this very constraint.
-- ------------------------------------------------------------
do $$
declare
  r record;
  c text;
begin
  for r in select * from (values
      ('quotes',          'number'),
      ('receipts',        'number'),
      ('customer_orders', 'ref')
    ) as v(t, col)
  loop
    if not exists (select 1 from pg_tables
                    where schemaname = 'public' and tablename = r.t) then
      continue;
    end if;

    -- The unique constraint over that column ALONE. A two-column one is what we
    -- are creating, so it must not be matched and dropped on a re-run.
    select con.conname into c
      from pg_constraint con
     where con.conrelid = ('public.' || r.t)::regclass
       and con.contype = 'u'
       and con.conkey = array[(select attnum from pg_attribute
                                where attrelid = ('public.' || r.t)::regclass
                                  and attname = r.col)];

    if c is not null then
      execute format('alter table public.%I drop constraint %I', r.t, c);
      raise notice 'dropped global uniqueness on %.% (%)', r.t, r.col, c;
    end if;

    if not exists (select 1 from pg_constraint
                    where conrelid = ('public.' || r.t)::regclass
                      and conname = r.t || '_shop_' || r.col || '_key') then
      execute format('alter table public.%I add constraint %I unique (shop_id, %I)',
                     r.t, r.t || '_shop_' || r.col || '_key', r.col);
      raise notice '%.% is now unique per shop', r.t, r.col;
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 4) THE ONE FOREIGN KEY THIS SCHEMA HAS, made shop-aware
--
-- credit_txns.account_id → credit_accounts(id) is the only foreign key in the
-- entire database. Widened to (account_id, shop_id) so a Surefit transaction
-- cannot be posted against a Jaspare garage's account. This one IS safe to do as
-- a real constraint, because a credit transaction without its account is not
-- history worth keeping — it is a balance that cannot be explained.
-- ------------------------------------------------------------
do $$
declare c text;
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.credit_accounts'::regclass
                    and conname = 'credit_accounts_id_shop_key') then
    alter table public.credit_accounts
      add constraint credit_accounts_id_shop_key unique (id, shop_id);
  end if;

  select conname into c from pg_constraint
   where conrelid = 'public.credit_txns'::regclass and contype = 'f'
     and pg_get_constraintdef(oid) not ilike '%shop_id%';
  if c is not null then
    execute format('alter table public.credit_txns drop constraint %I', c);
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.credit_txns'::regclass
                    and conname = 'credit_txns_account_shop_fkey') then
    alter table public.credit_txns
      add constraint credit_txns_account_shop_fkey
      foreign key (account_id, shop_id)
      references public.credit_accounts (id, shop_id) on delete cascade;
  end if;
end $$;


-- ------------------------------------------------------------
-- 5) SUREFIT'S OWN EXPENSE CATEGORIES
--
-- The list is per-shop now, so a shop with no rows has an empty category picker
-- and cannot record so much as a rent payment. Same eleven names Jaspare started
-- with; 'Stock purchase' carries is_stock, which is what keeps buying parts out of
-- the loss column.
-- ------------------------------------------------------------
insert into public.expense_categories (shop_id, name, is_stock, sort)
select s.id, v.name, v.is_stock, v.sort
  from public.shops s
  join (values
    ('Stock purchase',   true,  10),
    ('Rent',             false, 20),
    ('Salaries & wages', false, 30),
    ('Transport',        false, 40),
    ('Electricity',      false, 50),
    ('Water',            false, 55),
    ('Airtime & data',   false, 60),
    ('Licences & fees',  false, 70),
    ('Repairs',          false, 80),
    ('Bank charges',     false, 90),
    ('Other',            false, 999)
  ) as v(name, is_stock, sort) on true
 where s.slug = 'surefit-autoparts'
on conflict (shop_id, name) do nothing;

commit;


-- ------------------------------------------------------------
-- Check it worked:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.inventory'::regclass;
--   -- expect PRIMARY KEY (shop_id, code)
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.receipts'::regclass and contype = 'u';
--   -- expect UNIQUE (shop_id, number), and nothing on number alone
-- ------------------------------------------------------------
