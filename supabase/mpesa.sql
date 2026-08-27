-- ============================================================
-- M-PESA PROMPTS AT THE COUNTER  (Daraja STK Push)
--
-- Paste the whole file into the SQL editor and press Run. Safe to re-run.
--
-- WHAT THIS TABLE IS
-- One row per prompt sent to a customer's phone: who it was sent to, for how
-- much, by which member of staff, and what Safaricom eventually said about it.
-- It is the EVIDENCE that a payment was asked for and answered.
--
-- WHAT IT IS EMPHATICALLY NOT
-- It is not the shop's record of money received, and it must never be added to
-- the cash book. A sale paid by M-Pesa already reaches the M-Pesa pot through
-- sales.method (see src/lib/finance.js — normalisePot turns "M-PESA" into the
-- M-Pesa column). Counting this table as well would put every prompt-paid sale
-- into the day's takings twice, and the drawer would never be reconcilable
-- against it again. If a report ever needs both, it needs one of them.
--
-- So: nothing in src/lib/finance.js reads this table, on purpose.
--
-- WHY STAFF CANNOT WRITE THE RESULT
-- 'sent' is the only status the app is allowed to create, and it cannot update a
-- row at all. Every status after that is written by mpesa_result() below, which
-- only the edge functions can execute, from what Safaricom said. The one thing
-- worth stealing in this whole feature is the ability to mark an unpaid prompt as
-- paid and walk out with the part, so that is the one thing no signed-in account
-- can do.
--
-- Companion files:
--   supabase/functions/mpesa-stk/index.ts       sends the prompt, asks the status
--   supabase/functions/mpesa-callback/index.ts  receives Safaricom's answer
-- ============================================================

create table if not exists public.mpesa_payments (
  id                  uuid primary key default gen_random_uuid(),
  -- Nullable so this file works on a database that has not had supabase/multishop/
  -- pasted into it yet. Where multishop IS installed the policies below require it.
  shop_id             uuid,
  -- Safaricom's handle on this prompt. Unique because both the callback and a
  -- cashier pressing Check arrive quoting it, and they must find the same row.
  checkout_request_id text not null unique,
  merchant_request_id text,
  phone               text not null,          -- 2547XXXXXXXX, as sent
  amount              numeric(12,2) not null, -- what we ASKED for
  account_ref         text,                   -- what appears on the customer's SMS
  -- What the money was for. Not a foreign key: the sale is recorded when the
  -- cashier confirms it, which is after this row exists, and a prompt that is
  -- cancelled never becomes a sale at all.
  for_code            text,
  for_customer        text,
  status              text not null default 'sent'
                      check (status in ('sent','paid','failed','cancelled','timeout')),
  result_code         int,
  result_desc         text,
  mpesa_receipt       text,                   -- the code on the customer's SMS
  -- What Safaricom said was actually paid, kept apart from `amount` above. They
  -- should be equal; if they are not, the row says so instead of overwriting the
  -- figure the customer was asked for.
  paid_amount         numeric(12,2),
  paid_at             timestamptz,
  requested_by        text,
  env                 text not null default 'sandbox',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Older runs of this file may predate a column.
alter table public.mpesa_payments add column if not exists for_code     text;
alter table public.mpesa_payments add column if not exists for_customer text;
alter table public.mpesa_payments add column if not exists paid_amount  numeric(12,2);
alter table public.mpesa_payments add column if not exists env          text not null default 'sandbox';

create index if not exists mpesa_payments_shop_time_idx
  on public.mpesa_payments (shop_id, created_at desc);
-- The one query the till runs constantly: is this prompt answered yet.
create index if not exists mpesa_payments_open_idx
  on public.mpesa_payments (status) where status = 'sent';


-- ------------------------------------------------------------
-- WHO MAY DO WHAT
--
-- Read and create: staff of the shop. Update and delete: nobody, through the API.
-- ------------------------------------------------------------
alter table public.mpesa_payments enable row level security;

revoke update, delete on public.mpesa_payments from anon, authenticated;

drop policy if exists mpesa_read  on public.mpesa_payments;
drop policy if exists mpesa_write on public.mpesa_payments;

do $$
declare
  v_scoped boolean := to_regprocedure('public.my_shop_ids()') is not null;
begin
  if v_scoped then
    -- Multishop is installed: a prompt belongs to a shop, and only that shop's
    -- staff ever see it. A customer's phone number is not a thing to leak sideways.
    execute $p$
      create policy mpesa_read on public.mpesa_payments
        for select to authenticated
        using (shop_id in (select public.my_shop_ids()))
    $p$;
    execute $p$
      create policy mpesa_write on public.mpesa_payments
        for insert to authenticated
        with check (
          shop_id in (select public.my_shop_ids())
          and status = 'sent'
          and result_code is null
          and mpesa_receipt is null
          and paid_at is null
        )
    $p$;
    raise notice 'Policies are per-shop.';
  else
    -- One shop on this database. Same rule about status, no shop to check against.
    execute $p$
      create policy mpesa_read on public.mpesa_payments
        for select to authenticated using (true)
    $p$;
    execute $p$
      create policy mpesa_write on public.mpesa_payments
        for insert to authenticated
        with check (
          status = 'sent'
          and result_code is null
          and mpesa_receipt is null
          and paid_at is null
        )
    $p$;
    raise notice 'my_shop_ids() not found — policies are per-account, not per-shop. Run supabase/multishop/ and then this file again.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ONLY WAY A RESULT GETS WRITTEN
--
-- Called by the two edge functions with the service key, from what Safaricom
-- said. Three rules:
--
--   1) IDEMPOTENT. The callback and a cashier pressing Check both report the same
--      transaction, and they race. Whichever lands second must not undo the first.
--   2) A PAID ROW STAYS PAID. There is no answer from anywhere that turns received
--      money back into unreceived money, and a late 'timeout' arriving after a
--      successful callback would otherwise do exactly that.
--   3) IT ONLY EVER FINDS AN EXISTING ROW. It cannot create one. A result quoting
--      a CheckoutRequestID this shop never sent does nothing at all — which is
--      what protects the public callback URL from being told a lie.
-- ------------------------------------------------------------
create or replace function public.mpesa_result(
  p_checkout_id  text,
  p_result_code  int,
  p_result_desc  text default null,
  p_receipt      text default null,
  p_amount       numeric default null,
  p_status       text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status  text;
  v_current text;
begin
  select status into v_current
    from public.mpesa_payments where checkout_request_id = btrim(p_checkout_id);

  if v_current is null then
    -- Deliberately not an error. The callback URL is public by necessity, so this
    -- is also what a forged or stray POST gets: nothing.
    return 'unknown';
  end if;
  if v_current = 'paid' then
    return 'already-paid';
  end if;

  v_status := coalesce(nullif(btrim(p_status), ''),
                       case when p_result_code = 0 then 'paid' else 'failed' end);
  if v_status not in ('sent','paid','failed','cancelled','timeout') then
    v_status := 'failed';
  end if;

  update public.mpesa_payments set
    status        = v_status,
    result_code   = p_result_code,
    result_desc   = coalesce(nullif(btrim(p_result_desc), ''), result_desc),
    mpesa_receipt = coalesce(nullif(btrim(p_receipt), ''), mpesa_receipt),
    paid_amount   = coalesce(p_amount, paid_amount),
    paid_at       = case when v_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
    updated_at    = now()
  where checkout_request_id = btrim(p_checkout_id);

  return v_status;
end $$;

-- Only the edge functions. A browser that could call this could mark its own
-- prompt paid, which is the whole point of keeping the result out of staff hands.
revoke all on function public.mpesa_result(text, int, text, text, numeric, text)
  from public, anon, authenticated;


-- ============================================================
-- Check it worked:
--
--   select count(*) from public.mpesa_payments;               -- 0 on a fresh run
--   select policyname, cmd from pg_policies                   -- expect 2
--    where tablename = 'mpesa_payments';
--
-- And the two things that must FAIL. Signed in as ordinary staff:
--
--   update public.mpesa_payments set status = 'paid';
--   -- expect: permission denied for table mpesa_payments
--
--   select public.mpesa_result('anything', 0);
--   -- expect: permission denied for function mpesa_result
-- ============================================================
