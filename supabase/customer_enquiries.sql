-- ============================================================
-- BYPASS SHOP — the public enquiry list, and the orders it sends back
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- WHAT THIS IS FOR
-- A customer standing outside the shop, or sitting at home with a broken
-- Premio, can open bypass-shop.vercel.app/shop with no account and no password,
-- see what is actually on the shelf, put parts in a basket, and send the shop an
-- order. It lands in Notifications like everything else, with their name and
-- their phone number, and somebody calls them back.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It does not take money. An order here is a request, not a sale.
--   * It does not touch a single stock count. Nothing leaves the shelf until a
--     member of staff records a sale on the real screen. Two people can order
--     the same last bumper — that is a phone call, not a data problem, and it is
--     far better than a stranger on the internet being able to move the shop's
--     counts.
--   * It gives the public NO access to any existing table. Not read, not write.
--     Everything below goes through one view and one function, and both are
--     narrowed by hand.
--
-- WHAT THE PUBLIC CAN SEE
-- The catalogue view, and only these columns of it. Cost price, supplier,
-- shelf location, internal notes, who filed the part, the reorder level AND THE
-- QUANTITY are all left behind on purpose — a competitor reading the public page
-- must learn nothing a customer wouldn't be told at the counter. A customer at
-- the counter is told "yes, we have that", not "we have four".
-- ============================================================

-- ---------- WHAT IS ON THE SHELF, FOR ANYBODY ----------
-- NO PHOTOGRAPH IN THIS VIEW, ONLY WHETHER THERE IS ONE.
-- This used to send (images->>0) with every row, and it made the shop window
-- unusable: photographs are stored inline, straight off a phone, so one part
-- carrying an untouched camera file meant several megabytes had to land before
-- the first row was drawn. On mobile data that is minutes of a blank screen, and
-- it is the customer's bundle being spent. The list now says has_photo, the page
-- draws immediately, and the photographs are fetched afterwards from the view
-- below — for the few cards actually on screen, and never for a part whose
-- photograph is too big to send to a stranger.
--
-- AND NO QUANTITY. There is no qty column below, deliberately. Being in this
-- view already means in stock — that is the where clause at the bottom — and how
-- many of a thing the shop holds is nobody's business but the shop's. Hiding it
-- on the page would have been theatre: this link is handed to strangers, and one
-- look at a browser's network tab would have handed a competitor the shop's
-- entire stock position. Not sending it is the only version of that promise that
-- holds. The ordering function re-reads the real quantity from public.inventory
-- server-side, so nothing about placing an order depends on this.
--
-- Dropped rather than replaced: Postgres will not let create-or-replace remove a
-- column from an existing view, so the old three-column-longer version has to go
-- first and the grant has to be made again after.
drop view if exists public.catalogue;

create view public.catalogue
with (security_invoker = false) as   -- runs as the owner, so it can read past
                                     -- the inventory table's own RLS. That is
                                     -- the whole mechanism: the table stays
                                     -- shut, this narrow window is open.
select
  i.code,
  i.cat,
  i.brand,
  i.model,
  i.series,
  i.year_from,
  i.year_to,
  i.condition,
  i.side,
  i.variant,
  i.color,
  i.name,
  i.price,
  -- Whether there is a photograph worth sending, not the photograph itself. False
  -- for a part with none AND for a part whose photograph is heavier than the cap
  -- below, so the page knows not to ask for it and draws its coloured tile
  -- instead. The size is not published: a customer is told yes or no.
  (octet_length(i.images->>0) <= 500000) as has_photo
from public.inventory i
where coalesce(i.status, 'Active') = 'Active'
  and coalesce(i.qty, 0) > 0;       -- only what can actually be handed over

-- A part with no price is NOT held back. This shop prices at the counter — on
-- the day this was written 599 of the 604 parts in stock had no figure on them
-- — so filtering those out would have published a catalogue of four parts and
-- hidden the shop's whole shelf. They go out marked "ask for the price", which
-- is what a customer would be told on the phone anyway.

grant select on public.catalogue to anon, authenticated;

-- ---------- THE PHOTOGRAPHS, ASKED FOR BY NAME ----------
-- Fetched after the list is already on the screen, and only for the handful of
-- cards a customer can actually see, so a shop window full of photographed parts
-- still opens in one go and the rest arrive as they are scrolled to.
--
-- THE 500 kB CAP IS THE POINT OF THIS VIEW.
-- Photographs are stored inline as they came off the phone; one of this shop's is
-- several megabytes. A part like that is not sent to a stranger on a bundle at
-- all — it is left out here and reported as has_photo = false above, so the page
-- shows the part's coloured tile and the customer waits for nothing. The real cure
-- is shrinking a photograph when it is taken; until then, this is the wall.
drop view if exists public.catalogue_photos;

create view public.catalogue_photos
with (security_invoker = false) as
select
  i.code,
  (i.images->>0) as photo
from public.inventory i
where coalesce(i.status, 'Active') = 'Active'
  and coalesce(i.qty, 0) > 0
  and octet_length(i.images->>0) <= 500000;

grant select on public.catalogue_photos to anon, authenticated;

-- The section names, so the public page can group by "Front Bumpers" rather
-- than by "FBM". Built-in sections are in the app's own code; this covers the
-- ones the shop has added since — and only if that optional table was ever
-- created, because a shop that never added a section must still get a working
-- catalogue out of this file.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'part_categories') then
    execute $v$
      create or replace view public.catalogue_sections
      with (security_invoker = false) as
      select c.key, c.label, c.sort from public.part_categories c
    $v$;
    execute 'grant select on public.catalogue_sections to anon, authenticated';
  end if;
end $$;

-- ---------- THE ORDERS THAT COME BACK ----------
create table if not exists public.customer_orders (
  id          uuid primary key default gen_random_uuid(),
  ref         text unique not null,            -- ENQ-2026-0001
  ts          timestamptz default now(),
  customer    text not null,
  phone       text not null,
  note        text,
  -- One row per part asked for: code, name, the price shown at the time, the
  -- quantity, and whether the shelf could still cover it. Kept as written
  -- rather than joined live, because what the customer was shown is the thing
  -- worth arguing about later.
  items       jsonb not null,
  pieces      int default 0,
  total       numeric default 0,
  status      text default 'new',              -- new | called | done | cancelled
  handled_by  text,
  handled_at  timestamptz,
  source      text default 'web'
);

create index if not exists customer_orders_ts_idx     on public.customer_orders(ts desc);
create index if not exists customer_orders_status_idx on public.customer_orders(status, ts desc);
create index if not exists customer_orders_phone_idx  on public.customer_orders(phone, ts desc);

create sequence if not exists public.customer_order_seq start 1;

-- ---------- LOCKED DOWN ----------
-- Staff read and update. The public writes only through the function below,
-- which runs as the owner — so there is no anon policy here at all, and no way
-- for a stranger to read anybody else's order or edit their own after sending.
alter table public.customer_orders enable row level security;
drop policy if exists "staff_all" on public.customer_orders;
create policy "staff_all" on public.customer_orders for all
  to authenticated using (true) with check (true);

-- ---------- SENDING AN ORDER ----------
-- Everything the public can do, in one function, so every rule is in one place:
--   * a name and a real-looking phone number, or it refuses;
--   * at most 40 different parts, and at most 5 orders an hour per number,
--     so the shop's feed can't be flooded from a keyboard;
--   * the price and the name are re-read from the inventory table and the
--     customer's copy is ignored, so a tampered request cannot put "KES 5" on
--     the shop's record;
--   * a part that has sold out in the meantime is kept on the order and marked,
--     not silently dropped — the customer asked for it and will ask again.
create or replace function public.place_customer_order(
  p_customer text,
  p_phone    text,
  p_note     text,
  p_items    jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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

  select count(*) into v_recent
  from public.customer_orders
  where phone = p_phone and ts > now() - interval '1 hour';
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

    select * into v_row from public.inventory
    where code = v_code and coalesce(status, 'Active') = 'Active';

    -- A code that was never in this shop is not recorded at all. It can only
    -- come from a hand-edited request, and putting it on the order would mean
    -- staff ringing somebody about a part that does not exist.
    if v_row.code is null then
      continue;
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
           lpad(nextval('public.customer_order_seq')::text, 4, '0');

  insert into public.customer_orders (ref, customer, phone, note, items, pieces, total)
  values (v_ref, p_customer, p_phone, p_note, v_lines, v_pieces, v_total);

  -- Into the shop's own feed, so it is seen where everything else is seen.
  -- Written from in here rather than by the customer's browser: the public has
  -- no way to put a row in this table, which is what stops the feed being
  -- writable by anybody who finds the page.
  v_summary := v_names;
  if jsonb_array_length(v_lines) > 1 then
    v_summary := v_summary || ' and ' || (jsonb_array_length(v_lines) - 1) || ' more';
  end if;
  if v_gone > 0 then
    v_summary := v_summary || ' — ' || v_gone || ' asked for more than the shelf has';
  end if;

  insert into public.notifications (type, code, name, qty, by_name, buyer, phone, paid, total)
  values ('enquiry', v_ref, v_summary, v_pieces, 'Online order', p_customer, p_phone, false, v_total);

  return jsonb_build_object(
    'ref',     v_ref,
    'pieces',  v_pieces,
    'total',   v_total,
    'short',   v_gone,
    'lines',   v_lines
  );
end;
$$;

grant execute on function public.place_customer_order(text, text, text, jsonb) to anon, authenticated;

-- ---------- MARKING ONE AS DEALT WITH (staff) ----------
create or replace function public.set_customer_order_status(
  p_id uuid, p_status text, p_who text
) returns void
language sql
as $$
  update public.customer_orders
     set status = p_status,
         handled_by = p_who,
         handled_at = now()
   where id = p_id;
$$;

-- ---------- REALTIME ----------
-- So an order sent while somebody is looking at Notifications appears without
-- a refresh — the whole point is that the shop rings back while the customer is
-- still holding the phone.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.customer_orders'; exception when others then null; end;
end $$;
