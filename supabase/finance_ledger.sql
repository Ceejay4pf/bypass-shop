-- ============================================================
-- THE REST OF THE BOOKS
--
-- Paste the whole file into the SQL editor and press Run. Safe to re-run.
--
-- Adds the four things the statements could not show before:
--
--   1. equity_movements    money the owner puts in and takes out, dated
--   2. suppliers           who the shop buys from
--   3. purchase_invoices   what is owed to them, and when it is due
--   4. supplier_payments   what has been paid against those invoices
--   5. stock_adjustments   stock written off, for the valuation only
--   + refund columns on mpesa_payments
--
-- NOTHING IN HERE TOUCHES STOCK.
-- This is the rule the whole file is built around. A purchase invoice records
-- money owed to a supplier; it does not put parts on a shelf. Parts arrive the
-- way they always have, through Add Stock, counted by the person holding them.
-- A stock adjustment records a write-off so the valuation is honest; it does not
-- change a quantity. An M-Pesa refund records money going back; it does not put
-- the part back on the shelf.
--
-- The reason is not tidiness. Two systems that both believe they own the stock
-- count will disagree within a week, and the count on the shelf is the one a
-- person can check by looking. So nothing here writes to public.inventory, and
-- no trigger in here fires on it.
--
-- WHY A PURCHASE INVOICE ADDS A LIABILITY AND NO ASSET
-- Stock is valued from what is physically on the shelf (see stockValue in
-- src/lib/finance.js). By the time a supplier's invoice is entered, those parts
-- have usually been counted in already. Adding the invoice to stock value as well
-- would count the same parts twice. So an invoice raises Creditors alone — which
-- is right: a bill nobody has paid genuinely reduces what the business is worth.
--
-- WHY THERE IS NO JOURNAL TABLE
-- The General Ledger and Trial Balance screens are worked out on the fly from
-- these records, the same way the cash book always has been. That was a decision,
-- not an omission: no stored total can then disagree with the rows beneath it.
-- The screens say so on their face, because a trial balance that always balances
-- because it was built to is a different thing from one that balances as proof.
--
-- Companion: supabase/finance.sql (expenses, opening balances, categories)
-- ============================================================


-- ------------------------------------------------------------
-- SHOP SCOPING
--
-- Every table below carries shop_id and every policy checks it, the same as
-- expenses and finance_opening. On a database without supabase/multishop/ the
-- column is simply never filled and the fallback policies apply.
-- ------------------------------------------------------------
create or replace function public.fin_scoped() returns boolean
  language sql stable as $$ select to_regprocedure('public.my_shop_ids()') is not null $$;


-- ------------------------------------------------------------
-- 1. EQUITY MOVEMENTS
--
-- Until now the owner's capital and drawings were two numbers on the opening
-- balances form: right on day one and stale by the end of the month. Money put in
-- and taken out happens all year, and a balance sheet that cannot see it makes
-- the shop look like it lost what the owner spent.
--
-- The opening figures stay, and are treated as the position on day one. These are
-- everything since.
-- ------------------------------------------------------------
create table if not exists public.equity_movements (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid,
  happened_on date not null default current_date,
  -- 'capital'  the owner puts money into the business
  -- 'drawings' the owner takes money out for personal use
  kind        text not null check (kind in ('capital','drawings')),
  amount      numeric(14,2) not null check (amount > 0),
  -- Which pot it moved through, so the cash book agrees. Null means it never
  -- touched the shop's money at all — a machine bought with the owner's own cash,
  -- for instance — and the cash book must then leave it alone.
  method      text check (method in ('Cash','M-Pesa','Bank')),
  note        text,
  by_name     text,
  created_at  timestamptz not null default now(),
  -- Voided, never deleted, for the same reason as an expense.
  voided_at   timestamptz,
  voided_by   text,
  void_reason text
);
create index if not exists equity_movements_idx
  on public.equity_movements (shop_id, happened_on desc);


-- ------------------------------------------------------------
-- 2. SUPPLIERS
-- ------------------------------------------------------------
create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid,
  name       text not null,
  phone      text,
  email      text,
  kra_pin    text,
  address    text,
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  by_name    text
);
-- One supplier of a given name per shop. Two rows called "Kirinyaga Motors" is
-- how an accounts-payable list stops being trustworthy.
create unique index if not exists suppliers_shop_name_idx
  on public.suppliers (shop_id, lower(btrim(name)));


-- ------------------------------------------------------------
-- 3. PURCHASE INVOICES
--
-- What the shop owes, and by when. NOT a goods-received note: see the header.
-- ------------------------------------------------------------
create table if not exists public.purchase_invoices (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid,
  supplier_id  uuid references public.suppliers(id) on delete restrict,
  -- Kept as text as well, so a paper invoice can be entered before the supplier
  -- has been set up and the record is never blocked by data entry order.
  supplier_name text,
  invoice_no   text,
  invoiced_on  date not null default current_date,
  due_on       date,
  amount       numeric(14,2) not null check (amount > 0),
  note         text,
  by_name      text,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    text,
  void_reason  text
);
create index if not exists purchase_invoices_idx
  on public.purchase_invoices (shop_id, invoiced_on desc);
-- The same invoice number from the same supplier, entered twice, is the commonest
-- way a payables list overstates a debt. Blocked outright.
create unique index if not exists purchase_invoices_no_idx
  on public.purchase_invoices (shop_id, supplier_id, lower(btrim(invoice_no)))
  where invoice_no is not null and btrim(invoice_no) <> '';


-- ------------------------------------------------------------
-- 4. SUPPLIER PAYMENTS
--
-- Against an invoice where there is one. A payment on account — money handed over
-- with no invoice named — is allowed, because it happens, and the payables screen
-- shows it against the supplier rather than pretending it was not paid.
-- ------------------------------------------------------------
create table if not exists public.supplier_payments (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  invoice_id  uuid references public.purchase_invoices(id) on delete restrict,
  paid_on     date not null default current_date,
  amount      numeric(14,2) not null check (amount > 0),
  method      text not null default 'Cash' check (method in ('Cash','M-Pesa','Bank')),
  reference   text,
  note        text,
  by_name     text,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   text,
  void_reason text
);
create index if not exists supplier_payments_idx
  on public.supplier_payments (shop_id, paid_on desc);


-- ------------------------------------------------------------
-- 5. STOCK ADJUSTMENTS
--
-- A record that stock was damaged, stolen or written off, so the valuation can be
-- reduced honestly. IT DOES NOT CHANGE A QUANTITY — the count on the shelf is
-- corrected by the person holding the part, in Add Stock, and this is the note
-- explaining why the valuation moved.
-- ------------------------------------------------------------
create table if not exists public.stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid,
  happened_on date not null default current_date,
  code        text,                     -- the part, where it is one part
  reason      text not null,            -- Damaged | Stolen | Lost | Correction | Other
  -- Negative writes value off, positive puts it back. Stored signed so the sum
  -- over a period is the adjustment, with no case analysis at the reading end.
  value       numeric(14,2) not null,
  qty         numeric(12,2),            -- how many, for the note only
  note        text,
  by_name     text,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   text,
  void_reason text
);
create index if not exists stock_adjustments_idx
  on public.stock_adjustments (shop_id, happened_on desc);


-- ------------------------------------------------------------
-- WHO MAY DO WHAT
--
-- Finance is the owner's. Read and write for a finance admin of that shop;
-- no delete policy anywhere, so a record is voided rather than erased.
-- ------------------------------------------------------------
do $$
declare
  t text;
  v_scoped boolean := public.fin_scoped();
begin
  foreach t in array array['equity_movements','suppliers','purchase_invoices',
                           'supplier_payments','stock_adjustments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke delete on public.%I from anon, authenticated', t);
    execute format('drop policy if exists fin_read   on public.%I', t);
    execute format('drop policy if exists fin_write  on public.%I', t);
    execute format('drop policy if exists fin_update on public.%I', t);

    if v_scoped then
      execute format($p$create policy fin_read on public.%I for select to authenticated
                        using (public.is_finance_admin()
                               and shop_id in (select public.my_shop_ids()))$p$, t);
      execute format($p$create policy fin_write on public.%I for insert to authenticated
                        with check (public.is_finance_admin()
                                    and shop_id in (select public.my_shop_ids()))$p$, t);
      execute format($p$create policy fin_update on public.%I for update to authenticated
                        using (public.is_finance_admin()
                               and shop_id in (select public.my_shop_ids()))$p$, t);
    else
      execute format($p$create policy fin_read on public.%I for select to authenticated
                        using (public.is_finance_admin())$p$, t);
      execute format($p$create policy fin_write on public.%I for insert to authenticated
                        with check (public.is_finance_admin())$p$, t);
      execute format($p$create policy fin_update on public.%I for update to authenticated
                        using (public.is_finance_admin())$p$, t);
    end if;
  end loop;

  if v_scoped then
    raise notice 'Finance ledger tables are per-shop.';
  else
    raise notice 'my_shop_ids() not found - finance ledger is per-account. Run supabase/multishop/ then this file again.';
  end if;
end $$;


-- ============================================================
-- REFUNDING AN M-PESA PROMPT
--
-- A prompt was paid and should not have been: wrong amount, wrong part, customer
-- changed their mind at the counter. Safaricom's Reversal API sends it back.
--
-- WHAT A REFUND IS AND IS NOT.
-- It is money going back to the customer's phone. It is NOT a part returning to
-- the shelf, and it does NOT cancel a sale. Both of those are separate, deliberate
-- acts by a person who can see the part. Nothing here writes to inventory or to
-- sales — see the header.
--
-- A refund is asked for by staff and answered by Safaricom, so it has the same
-- shape as the payment itself: staff may set 'requested', and nothing else. Only
-- the edge function, through mpesa_refund_result(), can record what happened. The
-- one thing worth faking is a refund marked 'refunded' that Safaricom never made,
-- so that is the one thing no signed-in account can write.
-- ============================================================
alter table public.mpesa_payments add column if not exists refund_status text;
alter table public.mpesa_payments add column if not exists refund_amount numeric(12,2);
alter table public.mpesa_payments add column if not exists refund_reason text;
alter table public.mpesa_payments add column if not exists refund_requested_at timestamptz;
alter table public.mpesa_payments add column if not exists refund_requested_by text;
alter table public.mpesa_payments add column if not exists refund_at timestamptz;
alter table public.mpesa_payments add column if not exists refund_ref text;
alter table public.mpesa_payments add column if not exists refund_result_desc text;
alter table public.mpesa_payments add column if not exists refund_conversation_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mpesa_refund_status_ck') then
    alter table public.mpesa_payments add constraint mpesa_refund_status_ck
      check (refund_status is null
             or refund_status in ('requested','refunded','failed'));
  end if;
end $$;

-- Only a PAID prompt can be refunded, and only once. Enforced here rather than in
-- the app: refunding a prompt that was never paid sends the shop's own money out.
--
-- SECURITY DEFINER, and it has to be. mpesa.sql revokes UPDATE on the table from
-- every signed-in account, which is what stops staff marking a prompt paid — so a
-- plain invoker function could not write this either. The two checks RLS would have
-- made are therefore made here by hand, in this order: are you the owner, and is
-- this row your shop's. Neither is skippable.
create or replace function public.mpesa_refund_ask(
  p_checkout_id text,
  p_amount      numeric,
  p_reason      text,
  p_by          text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_status text; v_refund text; v_paid numeric; v_shop uuid;
begin
  if not public.is_finance_admin() then
    return 'not-allowed';
  end if;

  select status, refund_status, coalesce(paid_amount, amount), shop_id
    into v_status, v_refund, v_paid, v_shop
    from public.mpesa_payments
   where checkout_request_id = btrim(p_checkout_id);

  if v_status is null then return 'unknown'; end if;

  -- The row's own shop, checked against the caller's shops. Skipped only where
  -- multishop is not installed and there is nothing to confuse it with.
  if public.fin_scoped() and v_shop is not null
     and v_shop not in (select public.my_shop_ids()) then
    return 'not-allowed';
  end if;

  if v_status <> 'paid' then return 'not-paid'; end if;
  if v_refund = 'refunded'  then return 'already-refunded'; end if;
  if v_refund = 'requested' then return 'already-asked'; end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > v_paid then return 'bad-amount'; end if;

  update public.mpesa_payments set
    refund_status       = 'requested',
    refund_amount       = p_amount,
    refund_reason       = nullif(btrim(p_reason), ''),
    refund_requested_at = now(),
    refund_requested_by = nullif(btrim(p_by), ''),
    updated_at          = now()
  where checkout_request_id = btrim(p_checkout_id);

  return 'requested';
end $$;

-- Staff need this one, because asking is their job.
grant execute on function public.mpesa_refund_ask(text, numeric, text, text) to authenticated;

-- What Safaricom said. Edge functions only.
create or replace function public.mpesa_refund_result(
  p_checkout_id  text,
  p_ok           boolean,
  p_desc         text default null,
  p_ref          text default null,
  p_conversation text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_current text;
begin
  select refund_status into v_current
    from public.mpesa_payments where checkout_request_id = btrim(p_checkout_id);
  if not found then return 'unknown'; end if;
  -- Money that has gone back has gone back. A late failure cannot un-refund it.
  if v_current = 'refunded' then return 'already-refunded'; end if;

  update public.mpesa_payments set
    refund_status          = case when p_ok then 'refunded' else 'failed' end,
    refund_at              = case when p_ok then coalesce(refund_at, now()) else refund_at end,
    refund_ref             = coalesce(nullif(btrim(p_ref), ''), refund_ref),
    refund_result_desc     = coalesce(nullif(btrim(p_desc), ''), refund_result_desc),
    refund_conversation_id = coalesce(nullif(btrim(p_conversation), ''), refund_conversation_id),
    updated_at             = now()
  where checkout_request_id = btrim(p_checkout_id);

  return case when p_ok then 'refunded' else 'failed' end;
end $$;

revoke all on function public.mpesa_refund_result(text, boolean, text, text, text)
  from public, anon, authenticated;


-- ============================================================
-- Check it worked:
--
--   select count(*) from public.equity_movements;    -- 0
--   select count(*) from public.suppliers;           -- 0
--   select count(*) from public.purchase_invoices;   -- 0
--   select count(*) from public.supplier_payments;   -- 0
--   select count(*) from public.stock_adjustments;   -- 0
--
--   select count(*) from pg_policies                -- expect 15 (3 x 5 tables)
--    where tablename in ('equity_movements','suppliers','purchase_invoices',
--                        'supplier_payments','stock_adjustments');
--
-- And the two things that must FAIL, signed in as ordinary staff:
--
--   delete from public.purchase_invoices;
--   -- expect: permission denied for table purchase_invoices
--
--   select public.mpesa_refund_result('anything', true);
--   -- expect: permission denied for function mpesa_refund_result
-- ============================================================
