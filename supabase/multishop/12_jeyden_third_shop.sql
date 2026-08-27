-- ============================================================
-- 12 — A NEW SHOP: JEYDEN AUTO SPARES
--
-- PASTE THE WHOLE FILE INTO THE SUPABASE SQL EDITOR AND PRESS RUN.
-- Nothing in it needs editing. Safe to re-run: everything is on-conflict, so a
-- second run changes nothing and reports the same thing.
--
-- It comes back with one row of plain English telling you what exists, who can sign
-- in, and whether Jaspare's seven branches are still seven. Read that row.
--
-- ------------------------------------------------------------
-- WHY THIS FILE CHANGED SHAPE
--
-- It used to have a blank line in it — v_admin — and a shop created with that line
-- blank is a shop with no members: it appears, it cannot be signed in to, and
-- nothing says why except a notice nobody reads. Asking somebody to hand-edit SQL
-- before a shop can open is not a system, it is a form with one field on it.
--
-- So the deciding is done here instead. THE PEOPLE WHO ALREADY RUN EVERY SHOP RUN
-- THIS ONE TOO — computed, not typed. Whoever is an admin of every other shop on
-- this database is made an admin of the new one, because that is who the owner is
-- and it is the only answer that can be worked out rather than guessed. If nobody
-- runs every shop, nothing is invented: the shop is still created, and the report
-- names every admin there is and the one line to run to pick one.
--
-- An email can still be handed over when there is a real answer — the last argument
-- of add_shop — and it wins over the rule above.
--
-- ------------------------------------------------------------
-- PART 1 IS THE MACHINE, PART 2 IS THIS SHOP
--
-- Part 1 creates public.add_shop(...), which is everything a new shop needs done to
-- it. Part 2 is one call. Shop number four is one more call and no new file:
--
--   select public.add_shop('kariobangi-spares', 'Kariobangi Spares',
--                          'Outer Ring Road', 'Outer Ring Road — Kariobangi',
--                          '+254700000000', '+254 700 000 000');
--
-- That is the promise from step 01 finally kept in full: adding a shop is an insert,
-- not a release. The app has already been ready for this since the picker started
-- reading public.shops (mergeShops, src/lib/shopRoute.js) — a slug it has never seen
-- gets a default colour, a default login list and a default advertising order.
--
-- ------------------------------------------------------------
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * No branches, and it does not touch the ones that exist. Jeyden is ALREADY a
--     branch of Jaspare — public.branches, code 'JEY', South B, seeded by step 01 —
--     and that row stays exactly where it is. The seven branches under Jaspare are
--     the structure this business has always had. What this adds is a second,
--     different fact: Jeyden also has a front door and a shelf of its own. Both are
--     true at once, and Shops & Contacts is already told not to print the same name
--     on two cards because of it (fetchDirectory, src/lib/api.js). The report at the
--     end counts Jaspare's branches back to you for exactly this reason.
--   * No stock. A new shelf starts empty and the customer page says so honestly,
--     rather than showing another shop's 604 parts under a third name.
--   * Nothing to the staff feed. The feed is deliberately NOT per-shop (step 09,
--     public.messages has no shop filter), so a new shop's people can talk to
--     everybody from the moment they sign in. A shop added here joins the one
--     conversation; it does not start a third.
-- ============================================================


-- ============================================================
-- PART 1 — THE MACHINE
-- ============================================================
create or replace function public.add_shop(
  p_slug          text,
  p_name          text,
  p_address       text default null,
  p_tagline       text default null,
  p_phone         text default null,   -- dialable, for tel: and WhatsApp links
  p_phone_display text default null,   -- printed, spaced the way it is read out
  p_email         text default null,
  p_kra           text default null,
  -- The first admin, when somebody has actually said who it is. Left null, the rule
  -- in the header applies. An email with no account behind it is an error, not a
  -- silent skip: a shop nobody can open should never look like a success.
  p_admin         text default null
)
returns text
language plpgsql
as $$
declare
  v_shop     uuid;
  v_user     uuid;
  v_email    text;
  v_others   int;
  v_admins   text[] := '{}';
  v_all      text;
  v_report   text;
  v_parts    int;
  v_branches int;
  v_cats     int;
  v_main     int;
begin
  if coalesce(btrim(p_slug), '') = '' or coalesce(btrim(p_name), '') = '' then
    raise exception 'A shop needs a slug and a name.';
  end if;
  -- The same shape the check constraint enforces, said here so the message names the
  -- problem instead of quoting a constraint. The slug ends up in the address bar and
  -- is never changed afterwards, because links get shared.
  if btrim(p_slug) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'The slug "%" cannot go in an address bar. Lower case letters, digits and single hyphens only.', p_slug;
  end if;

  insert into public.shops (name, slug, phone, tagline, address, phone_display, email, kra_pin)
  values (
    btrim(p_name), btrim(p_slug),
    nullif(btrim(p_phone),         ''),
    nullif(btrim(p_tagline),       ''),
    nullif(btrim(p_address),       ''),
    nullif(btrim(p_phone_display), ''),
    nullif(btrim(p_email),         ''),
    nullif(btrim(p_kra),           '')
  )
  on conflict (slug) do nothing;

  select id into v_shop from public.shops where slug = btrim(p_slug);

  -- A re-run with a corrected phone number should apply it, and must never blank a
  -- column somebody fixed in the dashboard. So each field is written only where this
  -- call has something to say about it.
  update public.shops set
    name          = btrim(p_name),
    tagline       = coalesce(nullif(btrim(p_tagline),       ''), tagline),
    address       = coalesce(nullif(btrim(p_address),       ''), address),
    phone         = coalesce(nullif(btrim(p_phone),         ''), phone),
    phone_display = coalesce(nullif(btrim(p_phone_display), ''), phone_display),
    email         = coalesce(nullif(btrim(p_email),         ''), email),
    kra_pin       = coalesce(nullif(btrim(p_kra),           ''), kra_pin),
    is_active     = true
  where id = v_shop;

  -- ----------------------------------------------------------
  -- ITS OWN NUMBERING, STARTING AT ONE
  --
  -- Seeded at 0 so the first receipt is RCP-<year>-0001 and the first part's code
  -- ends 000001. Not left to next_shop_number's own upsert, because step 04's seed
  -- loop raises 'serial' to the old single-shop sequence for every shop it finds —
  -- harmless (a shop cannot reuse another's code; inventory's key is shop_id + code)
  -- but it would hand a brand new shop's first part a six-digit serial for nothing.
  -- ----------------------------------------------------------
  insert into public.shop_counters (shop_id, kind, n) values
    (v_shop, 'quote', 0), (v_shop, 'receipt', 0),
    (v_shop, 'enquiry', 0), (v_shop, 'serial', 0)
  on conflict (shop_id, kind) do nothing;

  -- ----------------------------------------------------------
  -- ITS OWN EXPENSE CATEGORIES
  --
  -- The list is per-shop, so a shop with no rows has an empty picker and cannot
  -- record so much as a rent payment. The same eleven the other shops started with;
  -- 'Stock purchase' carries is_stock, which is what keeps buying parts out of the
  -- loss column on the financial statement.
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
  -- WHO CAN SIGN IN
  --
  -- This cannot be done from inside the app, and that is on purpose: step 01's policy
  -- on user_shops checks is_shop_admin_of(shop_id) against the row being written, so
  -- an admin of one shop cannot add anybody to another. A shop that can grant itself
  -- membership of another shop is not three shops, it is one with three names.
  --
  -- So it is done here, once, by whoever holds this database. Afterwards that person
  -- adds their own staff from inside the app and never opens this file again.
  -- ----------------------------------------------------------
  if coalesce(btrim(p_admin), '') <> '' then
    select id, email into v_user, v_email
      from auth.users where lower(email) = lower(btrim(p_admin));
    if v_user is null then
      raise exception 'No account exists for %. They sign up through the app first, or Dashboard → Authentication → Users → Add user, then run this again.', p_admin;
    end if;
    insert into public.user_shops (user_id, shop_id, role)
    values (v_user, v_shop, 'admin')
    on conflict (user_id, shop_id) do update set role = 'admin';
    v_admins := array[v_email || ' (named in the call)'];

  else
    -- Everybody who is an admin of every OTHER active shop. Joined against shops so a
    -- shop switched off cannot count towards the total, and counted with distinct so
    -- one person cannot satisfy the rule twice through one shop.
    select count(*) into v_others
      from public.shops where id <> v_shop and is_active;

    if v_others > 0 then
      for v_user, v_email in
        select us.user_id, u.email
          from public.user_shops us
          join public.shops s on s.id = us.shop_id and s.is_active and s.id <> v_shop
          join auth.users u on u.id = us.user_id
         where us.role = 'admin'
         group by us.user_id, u.email
        having count(distinct s.id) = v_others
      loop
        insert into public.user_shops (user_id, shop_id, role)
        values (v_user, v_shop, 'admin')
        on conflict (user_id, shop_id) do update set role = 'admin';
        v_admins := v_admins || (v_email || ' (already runs every other shop)');
      end loop;
    end if;
  end if;

  select count(*) into v_parts    from public.inventory          where shop_id = v_shop;
  select count(*) into v_branches from public.branches           where shop_id = v_shop;
  select count(*) into v_cats     from public.expense_categories where shop_id = v_shop;
  select count(*) into v_main
    from public.branches b join public.shops s on s.id = b.shop_id
   where s.slug = 'jaspare-auto';

  v_report :=
    btrim(p_name) || ' (' || btrim(p_slug) || ') is on the system.' || chr(10) ||
    'Stock: ' || v_parts || ' parts · Branches of its own: ' || v_branches ||
    ' · Expense categories: ' || v_cats || ' · Numbering starts at 1' || chr(10);

  if array_length(v_admins, 1) is null then
    -- Nothing invented. The shop exists and cannot be opened, and the report says so
    -- in the first three words and then gives the exact line that fixes it.
    select string_agg(distinct u.email, ', ' order by u.email) into v_all
      from public.user_shops us join auth.users u on u.id = us.user_id
     where us.role = 'admin';
    v_report := v_report ||
      'NOBODY CAN SIGN IN YET. No account is an admin of every other shop, so there was' || chr(10) ||
      'nothing to work out and nothing was guessed. Run this with the right email:' || chr(10) ||
      '  select public.add_shop(''' || btrim(p_slug) || ''', ''' || btrim(p_name) ||
      ''', null, null, null, null, null, null, ''them@example.com'');' || chr(10) ||
      'Admins that exist: ' || coalesce(v_all, 'none at all') || chr(10);
  else
    v_report := v_report ||
      'Can sign in as admin: ' || array_to_string(v_admins, ', ') || chr(10) ||
      'They now belong to more than one shop, so they must use a shop''s own link' || chr(10) ||
      'rather than the bare address — which is right: somebody with three shops' || chr(10) ||
      'should be asked which one they mean.' || chr(10);
  end if;

  v_report := v_report ||
    -- Reported, not asserted against a number. An earlier version of this line
    -- claimed the count "must still say 7", which was never true of this database:
    -- public.branches has held two rows since 2026-08-26 and adding a shop does not
    -- touch it. A guard that cries wolf gets ignored, which is worse than no guard.
    -- What matters is that this number is the SAME before and after.
    'Jaspare Auto''s branches, unchanged by this file: ' || v_main || chr(10) ||
    'Open https://bypass-shop.vercel.app/' || btrim(p_slug) || '/login' || chr(10) ||
    'The tile should no longer say "Not on the system yet", and the shelf should be' || chr(10) ||
    'empty — NOT holding one part of anybody else''s stock. If another shop''s parts' || chr(10) ||
    'appear, step 05 did not run.';

  return v_report;
end $$;

-- The app must never be able to call this. It creates a shop and grants admin
-- membership, which is the one pair of things the policies in step 05 exist to keep
-- apart — and it runs with the privileges of whoever is connected, so a route to it
-- from a browser would be a route round every policy in this database.
revoke all on function public.add_shop(text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;


-- ============================================================
-- PART 2 — THIS SHOP
--
-- The phone number is the one already recorded against Jeyden as a branch of Jaspare
-- (step 01 seeded branches.code 'JEY' with it), so it is the shop's own number rather
-- than a guess. Worth reading back to the owner once: wrong here means a customer
-- rings a wrong number off a printed receipt.
--
-- Email and KRA PIN are left out entirely. A blank column prints nothing, which is
-- the right thing to print when nobody knows the answer.
--
-- Split into one row per line rather than returned as one block of text, because the
-- results grid shows a long value as a single truncated cell and the important
-- sentence is not always the first one. A report that has to be clicked open to be
-- read is a report that goes unread.
-- ============================================================
select l as "Read this"
  from regexp_split_to_table(
    public.add_shop(
      'jeyden-autospares',
      'Jeyden Auto Spares',
      'Dar es Salaam Road, Industrial Area, South B',
      'Industrial Area, South B — Dar es Salaam Road',
      '+254798718321',
      '+254 798 718 321'
    ),
    chr(10)
  ) as l;
