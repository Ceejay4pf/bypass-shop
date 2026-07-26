-- BYPASS SHOP - Garage credit accounts
-- Run once in Supabase -> SQL Editor -> New query -> Run. Safe to re-run.
-- Garages that buy on credit. Taking goods raises the balance owed; paying
-- (cash / cheque / paybill) lowers it. Every movement is a transaction row so
-- the account has a full, printable statement.

-- ---------- ACCOUNTS ----------
create table if not exists public.credit_accounts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,             -- garage / customer name
  contact      text,                      -- person to talk to
  phone        text,
  balance      numeric not null default 0,-- amount currently owed (>= 0)
  notes        text,
  created_at   timestamptz default now(),
  created_by   text
);

-- ---------- TRANSACTIONS (the ledger) ----------
create table if not exists public.credit_txns (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.credit_accounts(id) on delete cascade,
  ts             timestamptz default now(),
  kind           text not null,           -- 'charge' (took goods) | 'payment' (paid us)
  amount         numeric not null,        -- always positive
  method         text,                    -- payment: Cash | Cheque | Paybill | Bank
  reference      text,                    -- cheque no / paybill code / invoice no
  description    text,                    -- what was taken / note
  balance_after  numeric not null,        -- running balance right after this txn
  by_name        text
);

create index if not exists credit_txns_account_idx on public.credit_txns(account_id, ts desc);

-- ---------- ATOMIC POSTING ----------
-- Posts one transaction and updates the account balance in a single, race-safe
-- step. Returns the new balance. A 'charge' adds to what the garage owes; a
-- 'payment' reduces it (never below zero).
create or replace function public.post_credit_txn(
  p_account uuid,
  p_kind text,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_description text,
  p_by text
) returns numeric language plpgsql as $$
declare new_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_kind = 'charge' then
    update public.credit_accounts
      set balance = balance + p_amount
      where id = p_account
      returning balance into new_balance;
  elsif p_kind = 'payment' then
    update public.credit_accounts
      set balance = greatest(balance - p_amount, 0)
      where id = p_account
      returning balance into new_balance;
  else
    raise exception 'Unknown transaction kind: %', p_kind;
  end if;

  if new_balance is null then
    raise exception 'Credit account not found';
  end if;

  insert into public.credit_txns
    (account_id, kind, amount, method, reference, description, balance_after, by_name)
  values
    (p_account, p_kind, p_amount, p_method, p_reference, p_description, new_balance, p_by);

  return new_balance;
end; $$;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.credit_accounts enable row level security;
alter table public.credit_txns     enable row level security;

do $$ begin
  create policy "credit_accounts_all" on public.credit_accounts
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "credit_txns_all" on public.credit_txns
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ---------- REALTIME ----------
do $$ begin
  execute 'alter publication supabase_realtime add table public.credit_accounts';
exception when others then null; end $$;
do $$ begin
  execute 'alter publication supabase_realtime add table public.credit_txns';
exception when others then null; end $$;
