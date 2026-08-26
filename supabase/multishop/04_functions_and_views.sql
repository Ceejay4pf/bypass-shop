-- ============================================================
-- MULTI-SHOP, STEP 4 OF 6 — the functions and views that would be WRONG
--
-- Run AFTER 03, and BEFORE 05. Safe to re-run.
--
-- This is the step that makes the job bigger than tables and policies. There are
-- 37 functions in this database and most of them are fine. These are the ones that
-- key on a part code, a document number or a whole table, and that with two shops
-- would not fail — they would quietly do the wrong thing. A function that fails is
-- a bug report. A function that updates whichever shop's row it found first is a
-- shop whose stock counts drift and nobody knows why.
--
-- EVERY SHOP-AWARE FUNCTION KEEPS ITS OLD SIGNATURE WORKING.
-- The SQL is pasted before the new app deploys, so for a few minutes the running
-- app is calling add_stock(p_code, p_amount) with no shop. Those old forms are all
-- still here; each resolves the shop through my_one_shop(), which is exactly right
-- for the ~23 accounts that belong to one shop, and raises rather than guesses for
-- anybody who belongs to two. Nothing at the counter stops working mid-deploy.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) PER-SHOP NUMBERING
--
-- quotes.number, receipts.number and customer_orders.ref were fed by global
-- sequences, so Surefit's first receipt would have been numbered somewhere in
-- Jaspare's 400s and the two businesses' books would interleave. Sequences cannot
-- be made per-shop, so they are replaced by a counter row per shop per kind.
--
-- The counters are SEEDED FROM THE NUMBERS ALREADY ISSUED, not from the sequences.
-- A sequence can drift from the table after a restore or an import; the highest
-- number actually on a document cannot. Starting Jaspare at 1 would have collided
-- with its own back catalogue on the very first quote.
-- ------------------------------------------------------------
create table if not exists public.shop_counters (
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind    text not null,                 -- 'quote' | 'receipt' | 'enquiry' | 'serial'
  n       bigint not null default 0,
  primary key (shop_id, kind)
);

alter table public.shop_counters enable row level security;
-- Not readable or writable by a client. Numbers are handed out by the functions
-- below and by nothing else; a client that could set the counter could reissue a
-- receipt number that is already on a customer's copy.
revoke all on public.shop_counters from anon, authenticated;

create or replace function public.next_shop_number(p_shop uuid, p_kind text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_n bigint;
begin
  if p_shop is null then
    raise exception 'No shop was given for this number, and this account belongs to more than one shop. Open the shop you meant and try again.';
  end if;

  -- on conflict do update takes a row lock, so two devices asking at the same
  -- instant get two different numbers rather than the same one twice.
  insert into public.shop_counters (shop_id, kind, n)
  values (p_shop, p_kind, 1)
  on conflict (shop_id, kind)
    do update set n = shop_counters.n + 1
  returning n into v_n;

  return v_n;
end $$;

revoke all on function public.next_shop_number(uuid, text) from public, anon;
grant execute on function public.next_shop_number(uuid, text) to authenticated;

-- Seed. Runs once meaningfully; on a re-run the greatest() keeps the higher of
-- what is there and what the documents say, so it can never wind a counter back.
do $$
declare s record;
begin
  for s in select id, slug from public.shops loop
    insert into public.shop_counters (shop_id, kind, n) values
      (s.id, 'quote',   coalesce((select max((substring(number from '(\d+)$'))::bigint)
                                    from public.quotes   where shop_id = s.id), 0)),
      (s.id, 'receipt', coalesce((select max((substring(number from '(\d+)$'))::bigint)
                                    from public.receipts where shop_id = s.id), 0)),
      (s.id, 'enquiry', coalesce((select max((substring(ref    from '(\d+)$'))::bigint)
                                    from public.customer_orders where shop_id = s.id), 0)),
      (s.id, 'serial',  greatest(
                          coalesce((select max((substring(code from '(\d+)$'))::bigint)
                                      from public.inventory where shop_id = s.id), 0),
                          coalesce((select last_value from public.inventory_serial_seq), 0)))
    on conflict (shop_id, kind) do update
      set n = greatest(shop_counters.n, excluded.n);
  end loop;
end $$;


-- ------------------------------------------------------------
-- 2) THE NUMBER-GIVING FUNCTIONS
-- ------------------------------------------------------------
create or replace function public.next_inventory_serial(p_shop uuid)
returns int language sql security definer set search_path = public as $$
  select public.next_shop_number(p_shop, 'serial')::int;
$$;

-- The old form, for the app that is still deployed while this runs.
create or replace function public.next_inventory_serial()
returns int language sql security definer set search_path = public as $$
  select public.next_inventory_serial(public.my_one_shop());
$$;

create or replace function public.next_quote_number(p_shop uuid)
returns text language sql security definer set search_path = public as $$
  select 'QT-' || to_char(now(), 'YYYY') || '-' ||
         lpad(public.next_shop_number(p_shop, 'quote')::text, 4, '0');
$$;

create or replace function public.next_quote_number()
returns text language sql security definer set search_path = public as $$
  select public.next_quote_number(public.my_one_shop());
$$;

create or replace function public.next_receipt_number(p_shop uuid)
returns text language sql security definer set search_path = public as $$
  select 'RCP-' || to_char(now(), 'YYYY') || '-' ||
         lpad(public.next_shop_number(p_shop, 'receipt')::text, 4, '0');
$$;

create or replace function public.next_receipt_number()
returns text language sql security definer set search_path = public as $$
  select public.next_receipt_number(public.my_one_shop());
$$;

grant execute on function public.next_inventory_serial(uuid) to authenticated;
grant execute on function public.next_quote_number(uuid)     to authenticated;
grant execute on function public.next_receipt_number(uuid)    to authenticated;


-- ------------------------------------------------------------
-- 3) THE THREE QUANTITY FUNCTIONS
--
-- These are the dangerous ones. `update inventory set qty = qty + n where code =
-- p_code` with two shops in the table is not a failure — it is a restock applied
-- to somebody else's shelf, or to both. Every one of them now takes the shop, and
-- every one of them refuses if the caller is not a member of it: they are
-- security definer, so RLS is not protecting them.
-- ------------------------------------------------------------
create or replace function public.add_stock(p_shop uuid, p_code text, p_amount int)
returns int language plpgsql security definer set search_path = public as $$
declare new_qty int;
begin
  if p_shop is null or not exists (select 1 from public.user_shops
                                    where user_id = auth.uid() and shop_id = p_shop) then
    raise exception 'You are not signed in to that shop.';
  end if;
  update public.inventory set qty = qty + p_amount
   where shop_id = p_shop and code = p_code
  returning qty into new_qty;
  return new_qty;
end $$;

create or replace function public.add_stock(p_code text, p_amount int)
returns int language sql security definer set search_path = public as $$
  select public.add_stock(public.my_one_shop(), p_code, p_amount);
$$;

create or replace function public.sell_item(p_shop uuid, p_code text, p_qty int)
returns int language plpgsql security definer set search_path = public as $$
declare new_qty int;
begin
  if p_shop is null or not exists (select 1 from public.user_shops
                                    where user_id = auth.uid() and shop_id = p_shop) then
    raise exception 'You are not signed in to that shop.';
  end if;
  update public.inventory set qty = greatest(qty - p_qty, 0)
   where shop_id = p_shop and code = p_code
  returning qty into new_qty;
  return new_qty;
end $$;

create or replace function public.sell_item(p_code text, p_qty int)
returns int language sql security definer set search_path = public as $$
  select public.sell_item(public.my_one_shop(), p_code, p_qty);
$$;

create or replace function public.set_qty(p_shop uuid, p_code text, p_qty int)
returns int language plpgsql security definer set search_path = public as $$
declare new_qty int;
begin
  if p_shop is null or not exists (select 1 from public.user_shops
                                    where user_id = auth.uid() and shop_id = p_shop) then
    raise exception 'You are not signed in to that shop.';
  end if;
  update public.inventory set qty = p_qty
   where shop_id = p_shop and code = p_code
  returning qty into new_qty;
  return new_qty;
end $$;

create or replace function public.set_qty(p_code text, p_qty int)
returns int language sql security definer set search_path = public as $$
  select public.set_qty(public.my_one_shop(), p_code, p_qty);
$$;

grant execute on function public.add_stock(uuid, text, int) to authenticated;
grant execute on function public.sell_item(uuid, text, int) to authenticated;
grant execute on function public.set_qty(uuid, text, int)   to authenticated;


-- ------------------------------------------------------------
-- 4) UNDOING A SALE
--
-- security definer, so RLS does not apply — and it put stock back with
-- `where code = v_sale.code`, which with two shops means the other shop's shelf
-- as well as, or instead of, this one's. It also wrote a movement and a
-- notification with no shop on them.
-- ------------------------------------------------------------
create or replace function public.undo_sale(
  p_sale_id  uuid,
  p_by       text,
  p_reason   text default null,
  p_restock  boolean default true
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_sale    record;
  v_new_qty int;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'That sale no longer exists.';
  end if;

  -- The membership check RLS would have done, done by hand because it cannot.
  if not exists (select 1 from public.user_shops
                  where user_id = auth.uid() and shop_id = v_sale.shop_id) then
    raise exception 'That sale belongs to another shop.';
  end if;

  if v_sale.returned_at is not null then
    raise exception 'That sale was already undone on %.', to_char(v_sale.returned_at, 'DD Mon YYYY');
  end if;

  if p_restock then
    update public.inventory
       set qty = qty + coalesce(v_sale.qty, 0)
     where shop_id = v_sale.shop_id and code = v_sale.code
    returning qty into v_new_qty;
    -- The part may have been deleted since it was sold; that is not a reason to
    -- refuse the undo, so v_new_qty simply stays null.
  else
    select qty into v_new_qty from public.inventory
     where shop_id = v_sale.shop_id and code = v_sale.code;
  end if;

  update public.sales
     set returned_at = now(), returned_by = p_by
   where id = p_sale_id;

  update public.notifications
     set returned_at = now(), returned_by = p_by
   where shop_id = v_sale.shop_id
     and type = 'sale'
     and code = v_sale.code
     and returned_at is null
     and abs(extract(epoch from (ts - v_sale.ts))) < 120;

  insert into public.stock_movements (shop_id, code, type, qty, by_name, buyer, reason, remaining)
  values (
    v_sale.shop_id, v_sale.code, 'return', coalesce(v_sale.qty, 0), p_by, v_sale.buyer,
    coalesce(nullif(p_reason, ''),
             'Returned - sale of ' || to_char(v_sale.ts, 'DD Mon YYYY') || ' undone'),
    v_new_qty
  );

  insert into public.notifications (shop_id, type, code, name, qty, by_name, buyer, remaining)
  values (v_sale.shop_id, 'return', v_sale.code, v_sale.name,
          coalesce(v_sale.qty, 0), p_by, v_sale.buyer, v_new_qty);

  return v_new_qty;
end $$;


-- ------------------------------------------------------------
-- 5) POSTING TO A CREDIT ACCOUNT
--
-- The shop is not passed in and does not need to be: it is a property of the
-- account being posted against, and taking it from there means a transaction can
-- never be filed under a different shop from the balance it changes.
-- ------------------------------------------------------------
create or replace function public.post_credit_txn(
  p_account uuid,
  p_kind text,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_description text,
  p_by text
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  new_balance numeric;
  v_shop      uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select shop_id into v_shop from public.credit_accounts where id = p_account;
  if v_shop is null then
    raise exception 'Credit account not found';
  end if;
  if not exists (select 1 from public.user_shops
                  where user_id = auth.uid() and shop_id = v_shop) then
    raise exception 'That account belongs to another shop.';
  end if;

  if p_kind = 'charge' then
    update public.credit_accounts set balance = balance + p_amount
     where id = p_account returning balance into new_balance;
  elsif p_kind = 'payment' then
    update public.credit_accounts set balance = greatest(balance - p_amount, 0)
     where id = p_account returning balance into new_balance;
  else
    raise exception 'Unknown transaction kind: %', p_kind;
  end if;

  insert into public.credit_txns
    (shop_id, account_id, kind, amount, method, reference, description, balance_after, by_name)
  values
    (v_shop, p_account, p_kind, p_amount, p_method, p_reference, p_description, new_balance, p_by);

  return new_balance;
end $$;


-- ------------------------------------------------------------
-- 6) THE THREE PUBLIC VIEWS — the shop window
--
-- These are read by strangers with no session, so RLS is not what narrows them:
-- they run as the owner (security_invoker = false) and expose exactly the columns
-- written out below. Each one now carries shop_slug, so the customer page can ask
-- for one shop's shelf by the same word that is in the address bar.
--
-- Publishing BOTH shops' catalogues to anon is not a leak — a shop window is
-- public by definition. Mixing them would be: a customer must never be shown one
-- business's part under another business's name.
--
-- Dropped and recreated rather than replaced, because Postgres will not let
-- create-or-replace add a column in the middle of a view, and the grants have to
-- be made again afterwards.
-- ------------------------------------------------------------
drop view if exists public.catalogue;

create view public.catalogue
with (security_invoker = false) as
select
  sh.slug as shop_slug,
  i.code, i.cat, i.brand, i.model, i.series, i.year_from, i.year_to,
  i.condition, i.side, i.variant, i.color, i.name, i.price,
  -- Whether there is a photograph worth sending, not the photograph itself, and
  -- false for one heavier than the cap so the page draws its coloured tile and
  -- nobody waits on a stranger's bundle.
  (octet_length(i.images->>0) <= 500000) as has_photo
from public.inventory i
join public.shops sh on sh.id = i.shop_id and sh.is_active
where coalesce(i.status, 'Active') = 'Active'
  and coalesce(i.qty, 0) > 0;          -- only what can actually be handed over

grant select on public.catalogue to anon, authenticated;

drop view if exists public.catalogue_photos;

create view public.catalogue_photos
with (security_invoker = false) as
select
  sh.slug as shop_slug,
  i.code,
  (i.images->>0) as photo
from public.inventory i
join public.shops sh on sh.id = i.shop_id and sh.is_active
where coalesce(i.status, 'Active') = 'Active'
  and coalesce(i.qty, 0) > 0
  and octet_length(i.images->>0) <= 500000;

grant select on public.catalogue_photos to anon, authenticated;

drop view if exists public.catalogue_sections;

create view public.catalogue_sections
with (security_invoker = false) as
select sh.slug as shop_slug, c.key, c.label, c.sort
  from public.part_categories c
  join public.shops sh on sh.id = c.shop_id and sh.is_active;

grant select on public.catalogue_sections to anon, authenticated;

-- The shops themselves, for the landing page, without needing a policy round trip.
-- A view rather than a direct read so the columns handed to strangers are written
-- down in one place: a name, a slug and a number to ring.
create or replace view public.shop_directory
with (security_invoker = false) as
select s.slug, s.name, s.phone
  from public.shops s
 where s.is_active
 order by s.name;

grant select on public.shop_directory to anon, authenticated;


-- ------------------------------------------------------------
-- 7) SENDING AN ORDER FROM THE CUSTOMER PAGE
--
-- Takes the shop as a SLUG rather than an id, because the caller is an anonymous
-- browser reading it out of its own address bar and has no business knowing
-- internal ids. Without this, every order from either storefront lands in
-- Jaspare's notifications.
-- ------------------------------------------------------------
create or replace function public.place_customer_order(
  p_customer   text,
  p_phone      text,
  p_note       text,
  p_items      jsonb,
  p_shop_slug  text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop     uuid;
  v_line     jsonb;
  v_lines    jsonb := '[]'::jsonb;
  v_code     text;
  v_want     int;
  v_give     int;
  v_row      public.inventory;
  v_pieces   int := 0;
  v_total    numeric := 0;
  v_gone     int := 0;
  v_recent   int;
  v_ref      text;
  v_names    text := '';
  v_summary  text;
begin
  select id into v_shop from public.shops
   where slug = lower(btrim(coalesce(p_shop_slug, ''))) and is_active;
  if v_shop is null then
    raise exception 'That shop could not be found. Please reload the page.';
  end if;

  p_customer := btrim(coalesce(p_customer, ''));
  p_phone    := btrim(coalesce(p_phone, ''));
  p_note     := nullif(btrim(coalesce(p_note, '')), '');

  if length(p_customer) < 2 then
    raise exception 'Please give the name we should ask for.';
  end if;
  if length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 9 then
    raise exception 'Please give a phone number we can call you back on.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'There is nothing in the basket.';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'That is more than 40 different parts. Please send it as two orders, or call the shop.';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Please shorten the message to 500 characters.';
  end if;

  -- Five an hour, counted WITHIN THIS SHOP. Counting across both would let a
  -- busy hour at one shop lock a customer out of the other one.
  select count(*) into v_recent
    from public.customer_orders
   where shop_id = v_shop and phone = p_phone and ts > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'That number has already sent 5 orders in the last hour. Please call the shop instead.';
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    v_code := btrim(coalesce(v_line->>'code', ''));
    begin
      v_want := greatest(coalesce((v_line->>'qty')::int, 1), 1);
    exception when others then
      v_want := 1;                        -- a quantity that isn't a number reads as one
    end;
    if v_want > 99 then v_want := 99; end if;

    -- Narrowed by shop. Without it, a hand-edited request naming a part code that
    -- exists at the OTHER shop would put that shop's part, name and price on this
    -- shop's order.
    select * into v_row from public.inventory
     where shop_id = v_shop and code = v_code
       and coalesce(status, 'Active') = 'Active';

    if v_row.code is null then
      continue;                           -- never in this shop, so never recorded
    end if;

    v_give := least(v_want, greatest(coalesce(v_row.qty, 0), 0));
    if v_give < v_want then
      v_gone := v_gone + 1;
    end if;

    v_lines := v_lines || jsonb_build_object(
      'code',      v_row.code,
      'name',      v_row.name,
      'price',     coalesce(v_row.price, 0),
      'qty',       v_give,
      'requested', v_want,
      'available', (v_give > 0)
    );
    v_pieces := v_pieces + v_give;
    v_total  := v_total + coalesce(v_row.price, 0) * v_give;
    if v_names = '' then v_names := coalesce(v_row.name, v_row.code); end if;
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'None of those parts are on the shop''s list any more. Please reload the page.';
  end if;

  v_ref := 'ENQ-' || to_char(now(), 'YYYY') || '-' ||
           lpad(public.next_shop_number(v_shop, 'enquiry')::text, 4, '0');

  insert into public.customer_orders (shop_id, ref, customer, phone, note, items, pieces, total)
  values (v_shop, v_ref, p_customer, p_phone, p_note, v_lines, v_pieces, v_total);

  v_summary := v_names;
  if jsonb_array_length(v_lines) > 1 then
    v_summary := v_summary || ' and ' || (jsonb_array_length(v_lines) - 1) || ' more';
  end if;
  if v_gone > 0 then
    v_summary := v_summary || ' — ' || v_gone || ' asked for more than the shelf has';
  end if;

  insert into public.notifications (shop_id, type, code, name, qty, by_name, buyer, phone, paid, total)
  values (v_shop, 'enquiry', v_ref, v_summary, v_pieces, 'Online order', p_customer, p_phone, false, v_total);

  return jsonb_build_object(
    'ref', v_ref, 'pieces', v_pieces, 'total', v_total, 'short', v_gone, 'lines', v_lines
  );
end $$;

-- The old four-argument form, so an order sent from the currently-deployed
-- customer page still lands somewhere sensible while the new build rolls out. It
-- names Jaspare explicitly rather than picking "the first shop", because the old
-- link IS Jaspare's link — that is not a default, it is the truth about that URL.
create or replace function public.place_customer_order(
  p_customer text, p_phone text, p_note text, p_items jsonb
) returns jsonb
language sql security definer set search_path = public as $$
  select public.place_customer_order(p_customer, p_phone, p_note, p_items, 'jaspare-auto');
$$;

grant execute on function public.place_customer_order(text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.place_customer_order(text, text, text, jsonb)       to anon, authenticated;


-- ------------------------------------------------------------
-- 8) A CUSTOMER READING THEIR OWN ORDER BACK
--
-- References are unique per shop now, so ENQ-2026-0001 exists at both. The
-- three-argument form is the correct one and the customer page passes the slug it
-- was opened with.
--
-- The two-argument form is kept for the build that is already deployed, and it is
-- careful: it searches every shop, and if the reference AND phone somehow match
-- more than one row it returns NOTHING rather than picking one. Handing a stranger
-- somebody else's shopping list would be the worst possible failure of a function
-- whose whole purpose is that the reference alone is not enough.
-- ------------------------------------------------------------
create or replace function public.order_lookup(p_ref text, p_phone text, p_shop_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ref  text := upper(btrim(coalesce(p_ref, '')));
  v_dig  text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_shop uuid;
  v_row  public.customer_orders;
begin
  if v_ref = '' or length(v_dig) < 7 then
    return null;
  end if;

  select id into v_shop from public.shops
   where slug = lower(btrim(coalesce(p_shop_slug, ''))) and is_active;
  if v_shop is null then
    return null;
  end if;

  select * into v_row
    from public.customer_orders
   where shop_id = v_shop
     and upper(ref) = v_ref
     -- The last 9 digits, so a number saved with 0, with 254 or with +254 all
     -- match the same phone.
     and right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_dig, 9)
   limit 1;

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'ref', v_row.ref, 'ts', v_row.ts, 'customer', v_row.customer, 'note', v_row.note,
    'items', v_row.items, 'pieces', v_row.pieces, 'total', v_row.total, 'status', v_row.status
  );
end $$;

create or replace function public.order_lookup(p_ref text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ref   text := upper(btrim(coalesce(p_ref, '')));
  v_dig   text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_count int;
  v_slug  text;
begin
  if v_ref = '' or length(v_dig) < 7 then
    return null;
  end if;

  select count(*), min(sh.slug) into v_count, v_slug
    from public.customer_orders o
    join public.shops sh on sh.id = o.shop_id
   where upper(o.ref) = v_ref
     and right(regexp_replace(o.phone, '\D', '', 'g'), 9) = right(v_dig, 9);

  -- Exactly one, or nothing at all.
  if v_count <> 1 then
    return null;
  end if;

  return public.order_lookup(p_ref, p_phone, v_slug);
end $$;

revoke all on function public.order_lookup(text, text)       from public;
revoke all on function public.order_lookup(text, text, text) from public;
grant execute on function public.order_lookup(text, text)       to anon, authenticated;
grant execute on function public.order_lookup(text, text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 9) A NEW ACCOUNT LANDS IN A SHOP
--
-- Without this, somebody who signs up gets a profile, no membership, and an app
-- that is completely empty with no error to explain it — every policy says "a shop
-- you belong to" and they belong to none.
--
-- The slug rides along in the sign-up metadata, which the app now sends. A sign-up
-- with no slug gets NO membership on purpose rather than being dropped into
-- Jaspare: an account quietly given the keys to the wrong business is worse than
-- an account an admin has to place by hand.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  insert into public.profiles (id, full_name, email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    exists (select 1 from public.verified_emails where email = lower(new.email))
  )
  on conflict (id) do nothing;

  select id into v_shop from public.shops
   where slug = lower(btrim(coalesce(new.raw_user_meta_data->>'shop_slug', '')));

  if v_shop is not null then
    insert into public.user_shops (user_id, shop_id, role)
    values (new.id, v_shop, 'staff')
    on conflict (user_id, shop_id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------
-- 10) THE TWO ADMIN REPORTS, narrowed to the admin's own shop
--
-- Both are security definer and both read across the whole database. Left alone, a
-- Jaspare admin reads Surefit's staff list and Surefit's activity — which is the
-- kind of leak that never shows up as an error.
--
-- Note what is NOT changed: public.is_admin() itself. It keeps its three hardcoded
-- addresses and keeps meaning "the person who owns this system", which is true and
-- useful. What changes is that it stops being the test in anything that guards one
-- shop's DATA. That job is is_shop_admin_of(shop_id), which knows which shop it is
-- being asked about.
-- ------------------------------------------------------------
create or replace function public.staff_reachability()
returns table (
  id uuid, name text, email text,
  reachable boolean, proved boolean, devices int, last_signin timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    u.id,
    coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)) as name,
    u.email,
    (u.email is not null and u.email not ilike '%@bypassshop.co')  as reachable,
    exists (select 1 from public.verified_emails v where v.email = lower(u.email)) as proved,
    (select count(*)::int from public.trusted_devices d where d.email = lower(u.email)) as devices,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  -- Only people who work at a shop the caller administers.
  where exists (
    select 1 from public.user_shops them
     where them.user_id = u.id
       and public.is_shop_admin_of(them.shop_id)
  )
  order by
    (u.email is not null and u.email not ilike '%@bypassshop.co'),
    coalesce(nullif(p.full_name, ''), u.email);
$$;

revoke all on function public.staff_reachability() from public, anon;
grant execute on function public.staff_reachability() to authenticated;

create or replace function public.staff_activity_summary()
returns table (
  person text, sales bigint, units_sold bigint, revenue numeric, returns bigint,
  items_added bigint, items_edited bigint, items_deleted bigint, restocks bigint,
  last_seen timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    n.by_name                                                          as person,
    count(*) filter (where n.type = 'sale' and n.returned_at is null)  as sales,
    coalesce(sum(n.qty)   filter (where n.type = 'sale' and n.returned_at is null), 0)::bigint as units_sold,
    coalesce(sum(n.total) filter (where n.type = 'sale' and n.returned_at is null), 0)         as revenue,
    count(*) filter (where n.type = 'return')                          as returns,
    count(*) filter (where n.type = 'new_item')                        as items_added,
    count(*) filter (where n.type = 'adjust')                          as items_edited,
    count(*) filter (where n.type = 'delete')                          as items_deleted,
    count(*) filter (where n.type = 'stock')                           as restocks,
    max(n.ts)                                                          as last_seen
  from public.notifications n
  where public.is_shop_admin_of(n.shop_id)      -- their shop, not every shop
    and n.by_name is not null
    and n.by_name <> ''
  group by n.by_name
  order by max(n.ts) desc;
$$;

revoke all on function public.staff_activity_summary() from public, anon;
grant execute on function public.staff_activity_summary() to authenticated;

commit;


-- ------------------------------------------------------------
-- Check it worked:
--   select * from public.shop_counters;             -- Jaspare's must NOT be 0 for quote/receipt
--   select shop_slug, count(*) from public.catalogue group by 1;
--   select public.next_receipt_number((select id from public.shops where slug='jaspare-auto'));
--   -- must be HIGHER than the highest number already in public.receipts
-- ------------------------------------------------------------
