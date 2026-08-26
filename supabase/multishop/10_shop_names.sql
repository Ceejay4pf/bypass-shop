-- =====================================================================
-- 10 — WHAT EACH SHOP IS CALLED
-- ---------------------------------------------------------------------
-- Two corrections, one paste. Both are the name printed at the top of
-- every receipt and quotation, so both are worth getting exactly right:
-- a shop's name on a document is what a customer pays against, and a
-- name that is a word out is a document naming a business that does not
-- exist.
--
--   Jaspare   'Jaspare Auto'          ->  'Bypass Shop Jaspare Branch'
--   Sure Fit  'Sure Auto Spares Ltd'  ->  'Sure Fit Auto Spares Ltd'
--
-- Safe to run twice. Matched on SLUG, not on the old name, so a re-run
-- after the names are already right changes nothing.
-- =====================================================================

update public.shops
   set name = 'Bypass Shop Jaspare Branch'
 where slug = 'jaspare-auto'
   and name is distinct from 'Bypass Shop Jaspare Branch';

update public.shops
   set name = 'Sure Fit Auto Spares Ltd'
 where slug = 'surefit-autoparts'
   and name is distinct from 'Sure Fit Auto Spares Ltd';

-- The seven branches under Jaspare are NOT touched. A branch is a place
-- inside the shop; renaming the shop does not rename the yard.

-- The staff feed stamps the shop's name onto each message when it is
-- posted, so messages already sent still carry the old names. The usual
-- rule — leave a historical stamp alone, it records what was true at the
-- time — is the right rule and the wrong one here: one of these was
-- never the shop's name, it was a missing word, and the other is a
-- relabelling the owner wants to read consistently.
--
-- Corrected by SPELLING, not by shop_id, so a stamp somebody set on
-- purpose is left exactly as it is.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'messages'
       and column_name  = 'shop_name'
  ) then
    update public.messages
       set shop_name = 'Sure Fit Auto Spares Ltd'
     where shop_name in ('Sure Auto Spares Ltd', 'Surefit Autoparts Ltd', 'Surefit Auto Spares Ltd');

    update public.messages
       set shop_name = 'Bypass Shop Jaspare Branch'
     where shop_name in ('Jaspare Auto', 'Jaspare Auto Bypass Shop');
  end if;
end $$;

-- What you should see afterwards: two rows, both names in full. If one
-- still reads the old way then the update matched no row and that shop's
-- slug is not what this file expects — say which, and the slug gets
-- fixed instead of the name.
select slug, name, tagline from public.shops order by name;
