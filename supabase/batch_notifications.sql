-- ============================================================
-- ONE NOTIFICATION FOR A WHOLE BATCH
--
-- Adding or removing stock in bulk used to write one notification per
-- part. Twenty parts pasted in meant twenty near-identical entries, and
-- the notification feed became unreadable - the one sale that mattered
-- was buried under a wall of "New item".
--
-- Now a bulk action writes a single summary entry. These columns hold
-- what that summary needs to stay as informative as the separate rows
-- were:
--
--   batch_count  how many parts the entry stands for. Reports and the
--                per-person totals add this instead of counting rows,
--                so "Items Added" still says 20, not 1.
--   batch_codes  every part code in the batch, so the summary can be
--                opened up and each part still named.
--
-- A normal single action leaves both null and behaves exactly as before.
--
-- The per-part audit trail in stock_movements is deliberately NOT
-- collapsed: each part keeps its own ledger entry, because that is what
-- answers "what happened to THIS part" months later.
--
-- Safe to run more than once.
-- ============================================================

alter table public.notifications
  add column if not exists batch_count int,
  add column if not exists batch_codes text[];

-- The feed is read newest-first and filtered by type; a batch summary is
-- read the same way, so no new index is needed.

comment on column public.notifications.batch_count is
  'Parts represented by this entry when it summarises a bulk action. Null = a single part.';
comment on column public.notifications.batch_codes is
  'The part codes a bulk summary stands for, so the detail is not lost.';
