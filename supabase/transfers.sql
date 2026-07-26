-- BYPASS SHOP - Branch stock transfers (log only)
-- Run once in Supabase -> SQL Editor -> New query -> Run. Safe to re-run.
-- A plain record of stock moving between branches: taken to another branch, or
-- received from one. This is a LOG ONLY - it does NOT change stock counts.

create table if not exists public.transfers (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz default now(),
  direction    text not null,             -- 'out' (taken to another branch) | 'in' (received)
  other_branch text,                      -- the branch it went to / came from
  code         text,                      -- our item code, if it maps to one
  item         text not null,             -- item description
  qty          int not null default 0,
  note         text,
  by_name      text
);

create index if not exists transfers_ts_idx on public.transfers(ts desc);

-- ---------- ROW LEVEL SECURITY ----------
alter table public.transfers enable row level security;

do $$ begin
  create policy "transfers_all" on public.transfers
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ---------- REALTIME ----------
do $$ begin
  execute 'alter publication supabase_realtime add table public.transfers';
exception when others then null; end $$;
