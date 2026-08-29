-- ============================================================
-- UNDO A SALE (returns) + PER-PERSON ACTIVITY
--
-- Run once in: Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to run again.
--
-- Two things:
--
-- 1. Undo. A part that was sold and then brought back goes into stock
--    again with one tap. The original sale is NOT erased - it stays in
--    the books, marked as returned, and a separate "return" movement is
--    written with TODAY's date. So the history reads truthfully: sold on
--    the 3rd, returned on the 19th. Money already banked is still
--    visible; you just stop counting it as a sale.
--
-- 2. Activity per person. An index so "show me everything Peter did"
--    stays fast as the log grows.
-- ============================================================

-- ---------- Mark sales/notifications that were undone ----------
alter table public.sales
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by text;

alter table public.notifications
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by text;

-- ---------- Undo a sale, atomically ----------
-- Puts the quantity back, stamps the sale as returned, and logs a
-- "return" movement dated now. Returns the item's new quantity.
--
-- p_sale_id is the row in public.sales. If the sale was recorded from
-- another branch's stock (never deducted here), pass p_restock => false
-- so we don't invent stock we never had.
--
-- ONE SHOP AT A TIME. This file used to find the part with `where code =
-- v_sale.code` and nothing else, which was right when there was one shop and
-- silently wrong the moment there were two: inventory's key is (shop_id, code),
-- so undoing a sale here put the part back on every shop's shelf that happened
-- to stock the same code, and the two inserts at the bottom left out shop_id
-- altogether. That column is NOT NULL with no default, so re-running the old
-- version of this file over a live database did not merely misfile a return —
-- it replaced a working function with one that raises on every undo.
--
-- The body below is the shop-scoped one, kept identical to the copy in
-- multishop/04_functions_and_views.sql, so the header's promise that this file
-- is safe to run again is true again. If the two ever drift, 04 is the one the
-- database has; make them agree rather than picking a winner.
create or replace function public.undo_sale(
  p_sale_id  uuid,
  p_by       text,
  p_reason   text default null,
  p_restock  boolean default true
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale    record;
  v_new_qty int;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'That sale no longer exists.';
  end if;

  -- The membership check RLS would have done, done by hand because it cannot:
  -- security definer runs as the owner, so the policies on sales and inventory
  -- do not apply inside here.
  if not exists (select 1 from public.user_shops
                  where user_id = auth.uid() and shop_id = v_sale.shop_id) then
    raise exception 'That sale belongs to another shop.';
  end if;

  if v_sale.returned_at is not null then
    raise exception 'That sale was already undone on %.', to_char(v_sale.returned_at, 'DD Mon YYYY');
  end if;

  -- Put the goods back on the shelf. This shop's shelf.
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

  -- Stamp the original sale as returned. Kept, not deleted, so the
  -- books still show it happened.
  update public.sales
     set returned_at = now(), returned_by = p_by
   where id = p_sale_id;

  -- Stamp the matching notification too, so the activity log shows it.
  update public.notifications
     set returned_at = now(), returned_by = p_by
   where shop_id = v_sale.shop_id
     and type = 'sale'
     and code = v_sale.code
     and returned_at is null
     and abs(extract(epoch from (ts - v_sale.ts))) < 120;

  -- A fresh movement, dated today - this is the return itself.
  insert into public.stock_movements (shop_id, code, type, qty, by_name, buyer, reason, remaining)
  values (
    v_sale.shop_id, v_sale.code, 'return', coalesce(v_sale.qty, 0), p_by, v_sale.buyer,
    coalesce(nullif(p_reason, ''),
             'Returned - sale of ' || to_char(v_sale.ts, 'DD Mon YYYY') || ' undone'),
    v_new_qty
  );

  -- And a notification, so the main shop sees the return.
  insert into public.notifications (shop_id, type, code, name, qty, by_name, buyer, remaining)
  values (v_sale.shop_id, 'return', v_sale.code, v_sale.name,
          coalesce(v_sale.qty, 0), p_by, v_sale.buyer, v_new_qty);

  return v_new_qty;
end $$;

revoke all on function public.undo_sale(uuid, text, text, boolean) from public;
grant execute on function public.undo_sale(uuid, text, text, boolean) to authenticated;

-- ---------- Per-person activity: keep it fast ----------
create index if not exists notifications_by_name_ts_idx
  on public.notifications (by_name, ts desc);

create index if not exists sales_by_name_ts_idx
  on public.sales (by_name, ts desc);

create index if not exists stock_movements_by_name_ts_idx
  on public.stock_movements (by_name, ts desc);

-- ---------- Who has done anything, with counts ----------
-- Admin-only: the activity log is not for staff eyes. Uses the same
-- is_admin() helper as admin_only_views.sql; if that hasn't been run
-- yet, this creates a matching one.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select lower(auth.jwt() ->> 'email') in (
        'admin@bypassshop.co',
        'management@bypassshop.co',
        'addamsjmk@gmail.com'
     )),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- One row per person, with what they've been doing.
create or replace function public.staff_activity_summary()
returns table (
  person       text,
  sales        bigint,
  units_sold   bigint,
  revenue      numeric,
  returns      bigint,
  items_added  bigint,
  items_edited bigint,
  items_deleted bigint,
  restocks     bigint,
  last_seen    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.by_name                                                          as person,
    count(*) filter (where n.type = 'sale' and n.returned_at is null)  as sales,
    coalesce(sum(n.qty) filter (where n.type = 'sale' and n.returned_at is null), 0)::bigint as units_sold,
    coalesce(sum(n.total) filter (where n.type = 'sale' and n.returned_at is null), 0)       as revenue,
    count(*) filter (where n.type = 'return')                          as returns,
    count(*) filter (where n.type = 'new_item')                        as items_added,
    count(*) filter (where n.type = 'adjust')                           as items_edited,
    count(*) filter (where n.type = 'delete')                           as items_deleted,
    count(*) filter (where n.type = 'stock')                            as restocks,
    max(n.ts)                                                          as last_seen
  from public.notifications n
  where public.is_admin()
    and n.by_name is not null
    and n.by_name <> ''
  group by n.by_name
  order by max(n.ts) desc;
$$;

revoke all on function public.staff_activity_summary() from public;
grant execute on function public.staff_activity_summary() to authenticated;
