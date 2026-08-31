-- ============================================================
-- EACH SHOP'S SECTIONS ARE ITS OWN
--
-- Run once in Supabase -> SQL Editor -> New query -> Run. Safe to re-run.
--
-- WHAT WENT WRONG
-- The shop's report, in their words: "why have you mixed the stocks of different
-- shops, why am I finding list for one shop in the other" — and then the rule,
-- plainly: "each shop has its own categories and lists, they don't have the same
-- things, and when a category is made in this branch it doesn't mean it is in the
-- other. There shouldn't be transfer of list or stock unless I ask or I do it
-- manually."
--
-- The stock itself was never mixed. Checked before changing anything: no part code
-- exists in two shops, no row has a missing shop, and the sections made at Jeyden
-- are all stamped Jeyden. Nothing had been transferred.
--
-- What was wrong is who is ALLOWED TO READ. part_categories had this:
--
--   create policy "part_categories_read" on public.part_categories
--     for select to authenticated using (true);
--
-- — every signed-in account could read every shop's sections. The reason given for
-- it was real: without a readable section list "a whole shelf reads as unknown
-- category". But it was answering the wrong question. The section list a person
-- needs is THEIR shop's, and the only thing keeping the other shops' out of it was
-- a filter in the app (shopFrom in src/lib/supabase.js) — which, by design, turns
-- itself OFF when the app cannot work out which shop it is showing. One failed
-- membership lookup at sign-in and the owner, who is a member of all three shops,
-- was handed all three shops' sections at once.
--
-- A fence that only holds while the app is having a good day is not a fence. So
-- the database now asks the same question every other table in the system asks.
--
-- The app half of this is fixed in the same commit and matters just as much: a
-- scoped table with no shop known now returns NOTHING instead of everything, and
-- writing while no shop is known is refused rather than sent to whichever shop the
-- column default happens to name.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) SECTIONS
--
-- my_shop_ids() is the helper every other policy uses, so there is one definition
-- of membership rather than two that drift apart.
--
-- `to authenticated` as before: a stranger with no session never reached this
-- table anyway. The public shop front reads the catalogue VIEWS, which carry
-- shop_slug and are filtered by it — nothing on this table is needed to show a
-- customer a price.
--
-- The owner's own logins belong to all three shops, so my_shop_ids() returns all
-- three for them and the database cannot narrow them further. That is correct —
-- they administer all three — and it is exactly why the app-side fix had to be
-- done too, rather than trusting this file to be enough on its own.
-- ------------------------------------------------------------
drop policy if exists "part_categories_read" on public.part_categories;
create policy "part_categories_read" on public.part_categories
  for select to authenticated
  using (shop_id in (select public.my_shop_ids()));


-- ------------------------------------------------------------
-- 2) THE OPENING BALANCES
--
-- The same hole, found by the same audit, in the one other place it existed:
--
--   create policy "opening_admin_read" on public.finance_opening
--     for select to authenticated using (is_finance_admin());
--
-- is_finance_admin() asks "are you an admin of some shop", never "of THIS one" —
-- so one shop's admin could read another shop's opening figures. Fixed here
-- rather than left for later: it is one line, and a money figure crossing between
-- two businesses is worse than a section list doing it.
-- ------------------------------------------------------------
drop policy if exists "opening_admin_read" on public.finance_opening;
create policy "opening_admin_read" on public.finance_opening
  for select to authenticated
  using (public.is_finance_admin() and shop_id in (select public.my_shop_ids()));

commit;


-- ------------------------------------------------------------
-- Check it worked. Both of these should come back empty: every SELECT policy on
-- a shop's own data now names the shop.
-- ------------------------------------------------------------
select p.tablename, p.policyname, coalesce(p.qual, '(none)') as still_open
  from pg_policies p
 where p.schemaname = 'public'
   and p.cmd = 'SELECT'
   and coalesce(p.qual, '') not like '%shop%'
   and p.tablename in (
     'inventory','part_categories','sales','stock_movements','notifications',
     'quotes','receipts','credit_accounts','credit_txns','expenses',
     'expense_categories','customer_orders','transfers','staff_contacts',
     'branches','mpesa_payments','suppliers','purchase_invoices',
     'supplier_payments','stock_adjustments','equity_movements','finance_opening')
 order by 1, 2;
