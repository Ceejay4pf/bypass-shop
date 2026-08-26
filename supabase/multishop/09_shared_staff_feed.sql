-- ============================================================
-- ONE STAFF FEED FOR BOTH SHOPS
--
-- Run after 05. Safe to re-run.
--
-- WHAT THIS DELIBERATELY GIVES UP
-- 05 made the staff feed private to each shop, the same as the stock and the
-- money: you read the shop you work at. The owner has asked for the opposite for
-- this one table, so that somebody at one counter can ask the other shop whether
-- they have a part instead of ringing.
--
-- The cost is real and is being accepted on purpose: AFTER THIS FILE THERE IS NO
-- PRIVATE STAFF FEED. Every message already in the table becomes readable by
-- staff at both shops, including anything said about a till, a customer or a
-- member of staff. Nothing here is reversible by reading; if the two shops must
-- be separated again, re-run 05 and the old messages go back behind their shop.
--
-- WHAT IS NOT GIVEN UP
--   * WRITING is still truthful. A message can only be inserted as yourself, and
--     only stamped with a shop you actually work at. Reading is shared; identity
--     is not forgeable.
--   * The stock, sales, receipts, credit, expenses and notifications are all
--     untouched. This file names one table.
--   * A signed-in account that works at NEITHER shop still reads nothing. That is
--     not the same as "any logged-in user", and the difference matters: a customer
--     who signs up on the storefront has an auth account too.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) THE SHOP EACH MESSAGE CAME FROM, IN WORDS
--
-- shop_id already exists (02). The name is stored ALONGSIDE it rather than joined
-- at read time, because a shop can be renamed — Surefit became Sure Auto Spares
-- Ltd in 08, the same week — and a message should still show the name that was
-- over the door when somebody typed it. A join would rewrite history every time
-- the sign changes.
-- ------------------------------------------------------------
alter table public.messages add column if not exists shop_name text;

-- The messages already in the table, given the name of the shop they belong to,
-- so the feed does not open with a wall of unattributed lines on the first read.
update public.messages m
   set shop_name = s.name
  from public.shops s
 where m.shop_id = s.id
   and m.shop_name is null;


-- ------------------------------------------------------------
-- 2) READING IS SHARED
--
-- "works at any shop", not "is signed in". my_shop_ids() is the same helper 01
-- defined and 05 uses everywhere else, so there is one definition of membership
-- in the database rather than two that can drift.
-- ------------------------------------------------------------
drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages
  for select to authenticated
  using (exists (select 1 from public.my_shop_ids()));


-- ------------------------------------------------------------
-- 3) WRITING IS NOT
--
-- Unchanged from 05 on purpose. In a room both shops read, the one thing that
-- must hold is that the name and the shop on a message are true — otherwise a
-- message can be planted as somebody at the other shop, which is worse than a
-- shared feed.
-- ------------------------------------------------------------
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (auth.uid() = user_id and shop_id in (select public.my_shop_ids()));


-- ------------------------------------------------------------
-- 4) DELETING
--
-- Your own message wherever you sent it from, or anything sent from a shop you
-- administer. An admin at one shop does NOT get to delete the other shop's
-- messages: they can now read them, which is what was asked for, and quietly
-- removing another business's words is not.
-- ------------------------------------------------------------
drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete to authenticated using (
    auth.uid() = user_id
    or public.is_shop_admin_of(shop_id)
  );


-- ------------------------------------------------------------
-- 5) LIVE, FOR BOTH SHOPS
--
-- chat.sql already added this table to the realtime publication; repeated because
-- this file has to work on a database where that step was skipped or the
-- publication was rebuilt. The error is swallowed because "already added" is the
-- expected outcome, not a problem.
-- ------------------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.messages';
  exception when others then null;
  end;
end $$;

commit;


-- ------------------------------------------------------------
-- Check it worked:
--   select shop_name, count(*) from public.messages group by shop_name;
--
-- Then, signed in at ONE shop, open Staff Feed and send a message; open the other
-- shop in another tab and it should appear there with the sending shop's name
-- beside it. If it does not appear, the read policy did not replace — run
--   select policyname, qual from pg_policies
--    where tablename = 'messages' and cmd = 'SELECT';
-- and there should be exactly ONE row.
-- ------------------------------------------------------------
