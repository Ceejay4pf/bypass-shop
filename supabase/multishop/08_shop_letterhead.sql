-- ============================================================
-- SHOP LETTERHEAD — the name and address each shop prints on its own documents
--
-- Run any time after 01. Safe to re-run.
--
-- WHY THIS IS A MIGRATION AND NOT AN EDIT TO shopInfo.js
-- Every receipt, quotation, delivery note and stock list in this app printed the
-- words "Bypass Shop" and Jaspare's Northlands address, because there was one shop
-- and its details were a constant in the code. With two shops that constant is a
-- lie on one of them: Surefit's customer would be handed a receipt headed with
-- another business's name, address and phone number.
--
-- So the letterhead becomes data, one row per shop. Changing a phone number is now
-- an update, not a deploy — which matters, because the person who knows the phone
-- number changed is not the person who can deploy.
--
-- WHAT IS NOT CHANGED: the slug. Surefit's address stays /surefit-autoparts even
-- though it is now named Sure Auto Spares Ltd. A slug is a door number, the links
-- have already been shared, and renaming it would break them to no benefit. If it
-- must change later it is one update plus a redirect, decided on purpose.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) THE COLUMNS
--
-- One per line on the printed heading, rather than one free-text blob, because the
-- receipt template centres the name, sets the tagline smaller and puts the phone
-- numbers on their own line. A blob would have to be parsed back apart to do that.
-- ------------------------------------------------------------
alter table public.shops add column if not exists tagline       text;
alter table public.shops add column if not exists address       text;
alter table public.shops add column if not exists po_box        text;
-- What gets PRINTED, spaced the way people read it locally ("0791 285 634").
-- shops.phone stays the dialable one, digits and a +, for tel: and WhatsApp links.
alter table public.shops add column if not exists phone_display text;
alter table public.shops add column if not exists phone2        text;
alter table public.shops add column if not exists email         text;
alter table public.shops add column if not exists kra_pin       text;
alter table public.shops add column if not exists footer        text;
-- The two lists the customer-facing pages read out: makes stocked, parts dealt in.
alter table public.shops add column if not exists makes         text;
alter table public.shops add column if not exists parts_dealt   text;


-- ------------------------------------------------------------
-- 2) SUREFIT — renamed, and given its real letterhead
--
-- Taken from the shop's own invoice pad. The name on the pad is the name that goes
-- on the documents this app prints, because a customer holding both should not have
-- to work out whether they are the same business.
--
-- Note the slug in the WHERE clause, not the name: the name is the thing being
-- changed, so matching on it would make this file work once and then silently do
-- nothing on a re-run.
-- ------------------------------------------------------------
update public.shops set
  name          = 'Sure Auto Spares Ltd',
  tagline       = 'Parts & Service You Trust',
  address       = 'Industrial Area, Dunga Road. Next To Impala',
  po_box        = 'P.O. Box 43912, 00100 GPO Nairobi',
  phone_display = '0140 731 839 / 0791 285 634',
  -- The mobile, as the one a tel: or WhatsApp link should ring.
  phone         = '+254791285634',
  phone2        = '+254140731839',
  footer        = 'Goods received in good order and condition. E.&O.E.'
 where slug = 'surefit-autoparts';


-- ------------------------------------------------------------
-- 3) JASPARE — the same details, moved out of the code
--
-- These are the values that were hardcoded in src/lib/shopInfo.js. Copied here so
-- that BOTH shops read their letterhead from the same place. Leaving Jaspare in the
-- code and Surefit in the database would mean two mechanisms, and the next person
-- to change a phone number would edit the wrong one.
--
-- coalesce, so a value already set by hand in the dashboard is not overwritten by
-- this file on a re-run.
-- ------------------------------------------------------------
update public.shops set
  tagline       = coalesce(tagline,       'Dealers in spare parts — Japanese cars'),
  address       = coalesce(address,       'Near Total Northlands'),
  phone_display = coalesce(phone_display, '0724 450 852 / 0795 697 135'),
  phone2        = coalesce(phone2,        '+254795697135'),
  email         = coalesce(email,         'jasparebypass@gmail.com'),
  footer        = coalesce(footer,
    'Goods once sold are checked and confirmed by the customer. Thank you for your business.'),
  makes         = coalesce(makes,
    'Suzuki, Toyota, Daihatsu, Subaru, Mitsubishi, Nissan, Honda, Mazda, Isuzu'),
  parts_dealt   = coalesce(parts_dealt,
    'Headlights, Taillights, Bumpers, Boots, Shocks, Doors, Grilles, Bonnets, Side Mirrors')
 where slug = 'jaspare-auto';


-- ------------------------------------------------------------
-- 4) THE VIEW THE APP READS IT THROUGH
--
-- Dropped and recreated rather than replaced: create-or-replace cannot add columns
-- to a view that is being reordered, and this adds nine.
--
-- Still readable by anon, and that is correct rather than careless. Every column
-- here is printed on a receipt handed to a stranger or painted on the shutter — a
-- name, an address, a phone number and a KRA PIN that is on every tax invoice by
-- law. There is nothing in this view a customer is not entitled to read.
-- ------------------------------------------------------------
drop view if exists public.shop_directory;

create view public.shop_directory
with (security_invoker = false) as
select s.slug, s.name, s.phone,
       s.tagline, s.address, s.po_box, s.phone_display, s.phone2,
       s.email, s.kra_pin, s.footer, s.makes, s.parts_dealt
  from public.shops s
 where s.is_active
 order by s.name;

grant select on public.shop_directory to anon, authenticated;

commit;


-- ------------------------------------------------------------
-- Check it worked:
--   select slug, name, tagline, address, po_box, phone_display, phone
--     from public.shop_directory order by name;
--
-- Expect two rows. Surefit's name must read "Sure Auto Spares Ltd" and its
-- phone_display "0140 731 839 / 0791 285 634". Jaspare's must be unchanged.
-- ------------------------------------------------------------
