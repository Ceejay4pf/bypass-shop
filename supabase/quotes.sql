-- BYPASS SHOP — quotations storage
-- Run once in Supabase → SQL Editor. Adds a quotes table + a number sequence.

create table if not exists public.quotes (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,          -- e.g. QT-2026-0014
  ts          timestamptz default now(),
  customer    text,
  phone       text,
  lines       jsonb not null default '[]'::jsonb,  -- [{desc, qty, price}]
  subtotal    numeric default 0,
  discount    numeric default 0,
  total       numeric default 0,
  status      text default 'Draft',          -- Draft | Sent | Accepted | Rejected | Converted
  created_by  text
);

-- Sequence that feeds the human-friendly quote number.
create sequence if not exists public.quote_seq start 1;

-- Returns the next quote number, e.g. QT-2026-0014 (atomic, race-safe).
create or replace function public.next_quote_number()
returns text language sql as $$
  select 'QT-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.quote_seq')::text, 4, '0')
$$;

-- Lock it down like the other tables: signed-in staff have full access.
alter table public.quotes enable row level security;
do $$ begin
  create policy "quotes_all" on public.quotes
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Live updates across devices.
do $$ begin
  execute 'alter publication supabase_realtime add table public.quotes';
exception when others then null; end $$;
