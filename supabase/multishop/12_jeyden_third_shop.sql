-- ============================================================
-- 12 — A NEW SHOP: JEYDEN AUTO SPARES
--
-- Paste in the Supabase SQL editor. Safe to re-run: every insert here is
-- on-conflict-do-nothing or matched on slug, so running it twice changes nothing.
--
-- WHY THIS FILE IS SHAPED LIKE A FORM
--
-- Jeyden is the third shop, and it is NOT the last one — Jaspare Auto, the main shop
-- above these branches, has not been created yet. So the shop's details are three
-- variables at the top of one block rather than three literals sprinkled through six
-- statements. Creating the fourth shop is this same file with those lines changed,
-- and nothing else read or edited.
--
-- Nothing in the app was released to make room for this. The picker reads
-- public.shops and merges whatever it finds (mergeShops, src/lib/shopRoute.js), the
-- colours, the login list and the advertising order all fall back to a default for a
-- slug they have never seen. The build already carries Jeyden's tile, greyed out and
-- reading "Not on the system yet"; the moment the row below exists, the tile opens.
-- That is the promise from step 01 kept: adding a shop is an insert, not a release.
--
-- WHAT THIS DOES NOT DO
--
--   * No branches, and it does not touch the one that already exists. Jeyden is
--     ALREADY a branch of Jaspare — public.branches, code 'JEY', South B, seeded by
--     step 01 — and that row is left exactly where it is. The branch hierarchy under
--     Jaspare is the structure this business has always had; nothing here narrows it.
--     What this file adds is a second, different fact: Jeyden also has a front door
--     and a shelf of its own. Both are true at once, and Shops & Contacts is told
--     not to print the same name on two cards because of it (fetchDirectory,
--     src/lib/api.js). Jeyden gets branches of its own if it ever has more than one
--     place, one row each.
--   * No stock. Jeyden's shelf starts empty and its customer page says so honestly,
--     rather than showing Jaspare's 604 parts under a third name.
--   * Nothing to the staff feed. The feed is deliberately NOT per-shop (step 09,
--     public.messages has no shop filter), so Jeyden's people can talk to Jaspare's
--     and Sure Fit's from the moment they sign in. That was asked for, and it is
--     already true — a shop added here joins one conversation, not a third one.
-- ============================================================

-- ------------------------------------------------------------
-- THE FORM — the only lines to edit for a new shop
-- ------------------------------------------------------------
do $$
declare
  -- The door number in the address bar. Lower case, digits, single hyphens (there is
  -- a check constraint). Chosen once and never changed: links get shared.
  v_slug    text := 'jeyden-autospares';
  -- The name printed at the top of its receipts and quotations. In full.
  v_name    text := 'Jeyden Auto Spares';
  v_address text := 'Dar es Salaam Road, Industrial Area, South B';
  v_tagline text := 'Industrial Area, South B — Dar es Salaam Road';

  -- The number already recorded against Jeyden as a branch of Jaspare (step 01
  -- seeded branches.code 'JEY' with it), so this is the shop's own number rather
  -- than a guess. Worth reading back to the owner once; wrong here means a customer
  -- rings a wrong number off a printed receipt.
  v_phone   text := '+254798718321';   -- dialable — for tel: and WhatsApp links
  v_phone_d text := '+254 798 718 321';-- printed, spaced the way it is read out

  -- LEAVE BLANK UNTIL SOMEBODY GIVES THEM. A blank column prints nothing, which is
  -- the right thing to print when nobody knows the answer.
  v_email   text := '';
  v_kra     text := '';

  -- The first admin's email. They must already have an account — either they sign up
  -- through the app, or Dashboard → Authentication → Users → Add user.
  --
  -- Left blank on purpose: nobody has said who runs Jeyden. Blank means the shop is
  -- created with NO members, which is a shop nobody can sign in to — correct, and
  -- said out loud at the end of this file rather than papered over by adding whoever
  -- happens to be handy. Fill it in and re-run when there is a name.
  v_admin   text := '';

  v_shop    uuid;
  v_user    uuid;
begin
  insert into public.shops (name, slug, phone, tagline, address, phone_display, email, kra_pin)
  values (
    v_name, v_slug,
    nullif(btrim(v_phone),   ''),
    nullif(btrim(v_tagline), ''),
    nullif(btrim(v_address), ''),
    nullif(btrim(v_phone_d), ''),
    nullif(btrim(v_email),   ''),
    nullif(btrim(v_kra),     '')
  )
  on conflict (slug) do nothing;

  select id into v_shop from public.shops where slug = v_slug;

  -- A re-run after somebody filled in a phone number above should apply it, but must
  -- never blank a column that was corrected in the dashboard. So each field is
  -- written only where this file has something to say.
  update public.shops set
    name          = v_name,
    tagline       = coalesce(nullif(btrim(v_tagline), ''), tagline),
    address       = coalesce(nullif(btrim(v_address), ''), address),
    phone         = coalesce(nullif(btrim(v_phone),   ''), phone),
    phone_display = coalesce(nullif(btrim(v_phone_d), ''), phone_display),
    email         = coalesce(nullif(btrim(v_email),   ''), email),
    kra_pin       = coalesce(nullif(btrim(v_kra),     ''), kra_pin)
  where id = v_shop;

  -- ----------------------------------------------------------
  -- ITS OWN NUMBERING, STARTING AT ONE
  --
  -- Seeded at 0 so the first receipt is RCP-<year>-0001 and the first part's code
  -- ends 000001. Not left to next_shop_number's own upsert, because step 04's seed
  -- loop raises 'serial' to the old single-shop sequence for every shop it finds —
  -- harmless (a shop cannot reuse another's code; inventory's key is shop_id + code)
  -- but it would hand this shop's first part a six-digit serial for no reason.
  -- ----------------------------------------------------------
  insert into public.shop_counters (shop_id, kind, n) values
    (v_shop, 'quote', 0), (v_shop, 'receipt', 0),
    (v_shop, 'enquiry', 0), (v_shop, 'serial', 0)
  on conflict (shop_id, kind) do nothing;

  -- ----------------------------------------------------------
  -- ITS OWN EXPENSE CATEGORIES
  --
  -- The list is per-shop, so a shop with no rows has an empty picker and cannot
  -- record so much as a rent payment. The same eleven both other shops started with;
  -- 'Stock purchase' carries is_stock, which is what keeps buying parts out of the
  -- loss column.
  -- ----------------------------------------------------------
  insert into public.expense_categories (shop_id, name, is_stock, sort)
  select v_shop, v.name, v.is_stock, v.sort
    from (values
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
    ) as v(name, is_stock, sort)
  on conflict (shop_id, name) do nothing;

  -- ----------------------------------------------------------
  -- ITS FIRST ADMIN
  --
  -- Done here for the same reason step 07 exists: the policy on user_shops checks
  -- is_shop_admin_of(shop_id) against the row being written, so no admin of Jaspare
  -- or Sure Fit can add anybody to Jeyden from inside the app. A shop that can grant
  -- itself membership of another shop is not three shops, it is one with three names.
  -- ----------------------------------------------------------
  if btrim(v_admin) <> '' then
    select id into v_user from auth.users where lower(email) = lower(btrim(v_admin));
    if v_user is null then
      raise exception 'No account exists for %. They sign up through the app first, or add them in Dashboard → Authentication → Users, then re-run this file.', v_admin;
    end if;

    insert into public.user_shops (user_id, shop_id, role)
    values (v_user, v_shop, 'admin')
    on conflict (user_id, shop_id) do update set role = 'admin';

    raise notice '% is now an admin of %.', v_admin, v_name;
  else
    raise notice '% exists with no members yet. Nobody can sign in to it until v_admin is filled in above and this file is re-run.', v_name;
  end if;

  raise notice '% created: no branches, no stock, 11 expense categories, numbering from 1.', v_name;
end $$;


-- ------------------------------------------------------------
-- Check it worked — three rows, each with its own counts:
--
--   select s.slug, s.name,
--          (select count(*) from public.inventory  i  where i.shop_id  = s.id) as parts,
--          (select count(*) from public.user_shops us where us.shop_id = s.id) as members,
--          (select count(*) from public.branches   b  where b.shop_id  = s.id) as branches,
--          (select count(*) from public.expense_categories e where e.shop_id = s.id) as expense_cats
--     from public.shops s order by s.name;
--
-- Expected for Jeyden: parts 0, branches 0, expense_cats 11, members 0 or 1.
-- Jaspare's branches must still read 7. If that number moved, stop and say so.
--
-- Then open  https://bypass-shop.vercel.app/jeyden-autospares/login
-- The tile should no longer say "Not on the system yet", the screen should be teal,
-- and the shop should be empty — NOT holding one part of anybody else's stock.
-- ------------------------------------------------------------
