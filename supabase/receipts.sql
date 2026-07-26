-- BYPASS SHOP - Receipts storage
-- Run once in Supabase -> SQL Editor -> New query -> Run. Safe to re-run.
-- Adds a receipts table plus a human-friendly receipt number.

create table if not exists public.receipts (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  ts          timestamptz default now(),
  customer    text,
  phone       text,
  lines       jsonb not null default '[]'::jsonb,
  subtotal    numeric default 0,
  discount    numeric default 0,
  total       numeric default 0,
  paid        numeric default 0,
  method      text,
  created_by  text
);

-- Sequence that feeds the human-friendly receipt number.
create sequence if not exists public.receipt_seq start 1;

-- Returns the next receipt number, e.g. RCP-2026-0014 (atomic, race-safe).
create or replace function public.next_receipt_number()
returns text language sql as $$
  select 'RCP-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.receipt_seq')::text, 4, '0')
$$;

-- Signed-in staff have full access (same as quotes).
alter table public.receipts enable row level security;

do $$ begin
  create policy "receipts_all" on public.receipts
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Live updates across devices.
do $$ begin
  execute 'alter publication supabase_realtime add table public.receipts';
exception when others then null; end $$;
