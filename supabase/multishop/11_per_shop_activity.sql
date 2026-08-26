-- ============================================================
-- MULTI-SHOP, STEP 11 — staff activity, for ONE shop
--
-- Paste in the Supabase SQL editor. Safe to re-run. Nothing depends on it being
-- run before anything else; run it whenever.
--
-- WHAT WAS WRONG
--
-- staff_activity_summary() has no shop. It reads every notification whose shop
-- the signed-in person is an admin of:
--
--     where public.is_shop_admin_of(n.shop_id)
--
-- For the twenty-odd accounts that belong to one shop that is exactly right. For
-- an admin of two shops it is one table with both shops' work in it — Keziah's
-- sales at Surefit added to somebody's sales at Jaspare, under one name, with no
-- way to tell from the screen that it happened. The shop's own rule is that each
-- shop's figures are its own.
--
-- The old no-argument form stays, unchanged and still granted, because it is
-- correct for a single-shop account and because the app running in somebody's
-- browser right now calls it. The app now passes the shop and falls back to the
-- old form if this file has not been pasted yet (see shopRpc, src/lib/supabase.js).
-- ============================================================

begin;

create or replace function public.staff_activity_summary(p_shop uuid)
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
  where n.shop_id = p_shop
    -- The membership check is still made, and still by the database. A shop id in
    -- the argument is a request, not permission: an admin of Jaspare asking for
    -- Surefit's figures gets nothing back, not an error and not a leak.
    and public.is_shop_admin_of(p_shop)
    and n.by_name is not null
    and n.by_name <> ''
  group by n.by_name
  order by max(n.ts) desc;
$$;

revoke all on function public.staff_activity_summary(uuid) from public, anon;
grant execute on function public.staff_activity_summary(uuid) to authenticated;

commit;

-- ------------------------------------------------------------
-- Check it worked — the two shops must give two different tables:
--   select * from public.staff_activity_summary((select id from public.shops where slug='jaspare-auto'));
--   select * from public.staff_activity_summary((select id from public.shops where slug='surefit-autoparts'));
-- ------------------------------------------------------------
