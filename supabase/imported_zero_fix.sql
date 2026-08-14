-- ===========================================================
-- IMPORTED-AS-ZERO FIX — put the pieces back on the shelf
--
-- Run this once in Supabase -> SQL Editor. Safe to run twice.
--
-- WHY
-- The shop's own rule: a part keyed into the system is a part the shop is
-- holding, so the smallest true quantity is one. Only a sale, a deduction or a
-- stock adjustment reaches zero. "0 in stock" on a shelf with the part sitting
-- on it reads as sold out, and staff turned customers away over it.
--
-- The forms were fixed to save blank as 1. The parts already in the database
-- were not. The two bulk imports (stock_2026_07_21.sql and
-- stock_2026_07_22_mirrors.sql) wrote qty = 0 on every row they loaded, so 279
-- of 470 parts read as sold out while sitting on the shelf. None of them has a
-- sale or a deduction in stock_movements: they were never sold, they arrived
-- as zero.
--
-- That is also why the dashboard's pieces figure was lower than its parts
-- figure -- 470 parts holding 191 pieces -- which is arithmetically only
-- possible if most of the list reads as empty.
--
-- WHAT THIS DOES
-- Sets qty = 1 on every part that says 0 AND has no sale or deletion in the
-- ledger, and writes one adjustment movement per part so the correction is
-- traceable years later. It does NOT write 279 notifications: the feed gets one
-- summary line, because 279 individually-announced adjustments bury everything
-- else that happened that day.
--
-- WHAT IT LEAVES ALONE
--   * Any part with a sale or a deletion in its history. If it sold out, zero
--     is the truth and this must not paper over it.
--   * Every quantity that is already 1 or more.
--   * min_qty on every row. The reorder levels are a separate decision, made
--     separately.
--
-- THE COST, PLAINLY
-- If any of these 279 parts genuinely is not on the shelf, this puts a piece
-- back on the books that isn't there, and it will be found at the next stock
-- count. That is the trade against 279 parts the shop cannot sell because the
-- system says they are finished. Sell or Remove corrects any that are wrong,
-- and the ledger shows exactly what this script did and when.
--
-- AFTER THIS RUNS
-- 470 parts, 470 pieces, and a zero on screen means the shelf is genuinely
-- empty again.
-- ===========================================================

-- 1. The ledger entry, written BEFORE the change so `qty` still holds the old
--    figure and the movement records what it was corrected from. One row per
--    part: the audit trail is never summarised away, only the feed line is.
insert into public.stock_movements (code, type, qty, by_name, reason, remaining)
select i.code,
       'adjust',
       1,
       'System correction',
       'Imported as 0 in error - corrected to 1 piece (see supabase/imported_zero_fix.sql)',
       1
  from public.inventory i
 where i.qty = 0
   and not exists (
         select 1 from public.stock_movements m
          where m.code = i.code and m.type in ('sale', 'delete')
       );

-- 2. The correction itself. Same condition, so the two can never disagree.
update public.inventory i
   set qty = 1
 where i.qty = 0
   and not exists (
         select 1 from public.stock_movements m
          where m.code = i.code
            and m.type in ('sale', 'delete')
       );

-- 3. One line in the feed for the whole thing, not 279. `code` names the batch
--    rather than a part, the same way addBatchNotification does in the app, so
--    the feed never shows one part's code as if it were the whole action.
--
--    The `not exists` is what makes running this twice harmless. Steps 1 and 2
--    are already self-guarding (a second run finds no qty = 0 rows left to
--    correct), but this count reads the whole history, so without the guard a
--    second run would announce the same 279 parts again.
insert into public.notifications (type, code, name, by_name)
select 'adjust',
       count(*) || ' parts',
       count(*) || ' parts corrected from 0 to 1 piece - they were loaded by a bulk import as zero and had never been sold',
       'System correction'
  from public.stock_movements
 where reason like 'Imported as 0 in error%'
   and not exists (
         select 1 from public.notifications n
          where n.by_name = 'System correction'
            and n.name like '%corrected from 0 to 1 piece%'
       )
having count(*) > 0;

-- 4. What the shelves say now. parts should equal pieces if every part holds
--    one, and any remaining zero is a part that really did sell.
select count(*)                                as parts,
       sum(qty)                                as pieces,
       count(*) filter (where qty = 0)         as still_zero
  from public.inventory;
