-- ===========================================================
-- LOW-STOCK RESET — make the reorder alert mean something again
--
-- Run this once in Supabase → SQL Editor. Safe to run twice.
--
-- WHY
-- Every part in this shop carried min_qty = 3, and the low-stock test is
-- "quantity at or below the level". Body parts are held one piece at a time —
-- one Premio bonnet, one Harrier bumper — so one piece is full stock, not a
-- shortage. The result was that nearly every part on the shelves sat in the
-- reorder list permanently, and a list that names the whole inventory tells the
-- owner nothing. An alert that is always on is not an alert.
--
-- The 3 was never a decision anybody made: it was the column default below and
-- a pre-filled value in the form, so it was stamped on parts automatically.
--
-- WHAT THIS DOES
--   1. Drops the default, so nothing gets a reorder level it wasn't given.
--   2. Clears the levels that were never chosen (the automatic 3s) to NULL,
--      which the app reads as "warn me when this part is finished".
--
-- WHAT IT LEAVES ALONE
-- Any level that isn't 3 — a 1, 2, 4, 10 — was typed in by somebody who meant
-- it, and stays exactly as it is.
--
-- THE COST, PLAINLY
-- A part that genuinely wanted a reorder level of exactly 3 loses it here and
-- has to be set again (type 2 or 4 if you want it to stick, or 3 once this has
-- run and the app no longer treats 3 as unset). That trade was worth it: a
-- handful of parts to re-set against a reorder list that was useless.
--
-- AFTER THIS RUNS
-- A part is flagged when its quantity reaches zero, unless it carries its own
-- "Low-stock at" number, which always wins. Fast movers — bulbs, filters — are
-- where that box earns its keep.
-- ===========================================================

-- 1. No more automatic level on new rows.
alter table public.inventory alter column min_qty drop default;

-- 2. Clear the levels nobody chose. Count them first if you're curious:
--      select count(*) from public.inventory where min_qty = 3;
update public.inventory
   set min_qty = null
 where min_qty = 3;

-- 3. What the reorder list will show from now on: only parts somebody gave a
--    level to that have reached it. Parts sitting at zero are listed by the app
--    as finished regardless. If this returns a long list, those levels were all
--    typed in deliberately — nothing here is guessing on your behalf any more.
select code, name, qty, min_qty
  from public.inventory
 where min_qty is not null
   and qty <= min_qty
 order by code;
