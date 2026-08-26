-- ============================================================
-- THE SHOP'S FULL NAME
--
-- Run after 08 (and after 09, if 09 has been run). Safe to re-run.
--
-- 08 named this shop "Sure Auto Spares Ltd". That is not its name — it is its name
-- with a word missing. The shop is SURE FIT AUTO SPARES LTD, and that is what has
-- to be on a receipt, a quotation, a delivery note and a printed stock list,
-- because a customer holding a document from this app and an invoice from the pad
-- should not have to work out whether they are the same business. A name with a
-- word missing is the kind of thing that gets a payment sent to the wrong account.
--
-- TWO PLACES HOLD THE NAME, AND BOTH ARE FIXED HERE
--   1. public.shops.name — the one every document reads. Fixing this fixes the
--      receipts, the quotations, the reports, the stock list and the app header in
--      one go, because none of them carry the name themselves.
--   2. public.messages.shop_name — 09 stamped every existing message with the shop
--      name as it stood at the time. Those stamps are deliberately NOT re-read from
--      shops on every load, so that a message keeps the name that was over the door
--      when it was typed. That is right for a shop that gets renamed; it is wrong
--      here, because this was never the shop's name, it was a mistake. So the old
--      stamps are corrected rather than preserved.
--
-- WHAT IS NOT CHANGED: the slug. It stays `surefit-autoparts`. A slug is a door
-- number, the links have already been given out, and renaming it would break every
-- one of them to fix nothing a customer ever sees.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) THE NAME ON EVERY DOCUMENT
--
-- Matched on the slug, not on the name: the name is the thing being changed, so
-- matching on it would make this file work once and then quietly do nothing on a
-- re-run. Both spellings are accepted in the ledger note below for the same reason.
-- ------------------------------------------------------------
update public.shops
   set name = 'Sure Fit Auto Spares Ltd'
 where slug = 'surefit-autoparts'
   and name is distinct from 'Sure Fit Auto Spares Ltd';


-- ------------------------------------------------------------
-- 2) THE MESSAGES ALREADY STAMPED WITH THE SHORT NAME
--
-- Only the two wrong spellings are touched, by name and not by shop_id, so a
-- message somebody deliberately stamped differently is left alone. If 09 has not
-- been run there is no shop_name column yet and this block does nothing at all,
-- which is why it is wrapped rather than written as a plain update.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'messages' and column_name = 'shop_name'
  ) then
    update public.messages
       set shop_name = 'Sure Fit Auto Spares Ltd'
     where shop_name in ('Sure Auto Spares Ltd', 'Surefit Autoparts Ltd');
  end if;
end $$;

commit;


-- ------------------------------------------------------------
-- Check it worked:
--   select slug, name, tagline from public.shops order by name;
--
-- Surefit's row must read exactly "Sure Fit Auto Spares Ltd". Then sign in at
-- /surefit-autoparts/login and print one receipt and one quotation: the name above
-- the address is the same name, in full, on both.
-- ------------------------------------------------------------
