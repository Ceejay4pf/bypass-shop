-- ===========================================================
-- DOORS: FRONT AND REAR — say which door it is
--
-- Run this once in Supabase -> SQL Editor. Safe to run twice.
--
-- WHY
-- A car has four doors and the shop names them by two things at once: which end
-- of the car, and which hand. "Front Left" and "Rear Left" are different parts.
-- They do not interchange, they are not the same money, and a customer asking
-- for one will not take the other.
--
-- The system only ever recorded the hand. The pasted-list reader read one side
-- word per line and stopped, so "Front Left-Hand Side Door - Honda CR-V RE4"
-- went in as side "Left" and the word "front" survived nowhere but the note.
-- The result on the shelf: 90 doors, 47 of them reading "Left" and 43 reading
-- "Right", with no way to tell a front door from a rear one on screen. Staff
-- had to open the note, or walk to the shelf.
--
-- The reader is fixed (src/lib/parseParts.js), and the forms now refuse to save
-- a door without saying which end (src/tabs.jsx). This is the other half: the
-- 90 doors already in the database.
--
-- WHERE THE ANSWER COMES FROM
-- Their own notes. Every one of the 90 kept the line it was pasted from, and
-- every one of those lines says front or rear:
--     90 doors, 81 saying front, 9 saying rear or back, 0 saying both,
--     0 with no note at all.
-- So nothing here is guessed. The word is read back out of the line the shop
-- itself typed, and combined with the hand already on the row.
--
-- WHAT THIS DOES
--   * side 'Left'  + a note saying front -> 'Front Left'
--   * side 'Right' + a note saying rear  -> 'Rear Right'   (and so on)
--   * one adjustment movement per door, so the change is traceable years later
--   * one summary line in the feed, not 90
--
-- WHAT IT LEAVES ALONE
--   * The codes. DOR-HON-CRV-XX-L-0293 stays exactly as it is. A code is
--     printed on a shelf label and is never rewritten -- the L is still true,
--     just less exact than the field beside it now is.
--   * Any door whose note says both front and rear, or neither. It hasn't said,
--     so this doesn't decide for it; it stays on the hand alone and the review
--     screen keeps asking. (There are none of these today.)
--   * Any door already reading 'Front Left' etc., and any door reading 'Pair' --
--     a pair of doors is sold as the pair and which-end is the wrong question.
--   * Every other section. Doors are the only section holding both ends of the
--     car in one place; a front bumper is already its own section (FBM), so the
--     word would add nothing there.
--
-- THE COST, PLAINLY
-- If a note ever contradicted the part on the shelf, this copies that mistake
-- into the side field where it is now visible -- which is the point: it can be
-- seen and corrected on screen instead of hiding in a note nobody opens. Edit
-- Parts fixes any single row, and the ledger shows exactly what this changed.
-- ===========================================================

-- 1. The ledger entry, written BEFORE the change so the reason can quote what
--    the side was corrected from. One row per door: the audit trail is never
--    summarised away, only the feed line is.
insert into public.stock_movements (code, type, qty, by_name, reason, remaining)
select i.code,
       'adjust',
       0,
       'System correction',
       'Side corrected from ' || i.side || ' to ' ||
         case when i.notes ~* '\mfront' then 'Front ' else 'Rear ' end || i.side ||
         ' - read from the part''s own note (see supabase/door_front_rear.sql)',
       i.qty
  from public.inventory i
 where i.cat = 'DOR'
   and i.side in ('Left', 'Right')
   -- Exactly one of the two words, so a note saying both decides nothing.
   and (i.notes ~* '\mfront') <> (i.notes ~* '\m(rear|back)')
   and not exists (
         select 1 from public.stock_movements m
          where m.code = i.code and m.reason like 'Side corrected from %'
       );

-- 2. The correction itself. Same condition, so the two can never disagree.
update public.inventory i
   set side = case when i.notes ~* '\mfront' then 'Front ' else 'Rear ' end || i.side
 where i.cat = 'DOR'
   and i.side in ('Left', 'Right')
   and (i.notes ~* '\mfront') <> (i.notes ~* '\m(rear|back)');

-- 3. One line in the feed for the whole thing, not 90. `code` names the batch
--    rather than a part, the same way addBatchNotification does in the app.
--
--    The `not exists` is what makes running this twice harmless. Steps 1 and 2
--    are self-guarding already (a second run finds no plain Left/Right doors
--    left), but this count reads the whole history.
insert into public.notifications (type, code, name, by_name)
select 'adjust',
       count(*) || ' doors',
       count(*) || ' doors now say front or rear as well as left or right - read from each part''s own note',
       'System correction'
  from public.stock_movements
 where reason like 'Side corrected from %'
   and not exists (
         select 1 from public.notifications n
          where n.by_name = 'System correction'
            and n.name like '%doors now say front or rear%'
       )
having count(*) > 0;

-- 4. What the doors say now. `unsaid` is the count still on a bare hand -- those
--    are the ones the review screen will keep asking about, and it should be 0.
select count(*)                                                       as doors,
       count(*) filter (where side = 'Front Left')                    as front_left,
       count(*) filter (where side = 'Front Right')                   as front_right,
       count(*) filter (where side = 'Rear Left')                     as rear_left,
       count(*) filter (where side = 'Rear Right')                    as rear_right,
       count(*) filter (where side in ('Left', 'Right'))              as unsaid
  from public.inventory
 where cat = 'DOR';
