-- ============================================================
-- WHERE DID THE STOCK GO?
--
-- Run once in: Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to run again.
--
-- Until now, deleting a part left one line in the audit trail: who
-- deleted it. That is not enough to answer the question the head office
-- actually asks - "the part is gone, where did it go?"
--
-- So a deletion now records three more things:
--
--   disposal   why it left  - sold, given to a credit customer, moved to
--                             another shop, damaged, taken by staff, other
--   taken_by   who has it now - the customer, the shop, the person
--   logistics  who carried it - the rider, driver, courier or "collected
--                             in person"
--
-- The columns are nullable, so every deletion already on record stays
-- exactly as it is; only new ones carry the extra detail.
-- ============================================================

alter table public.stock_movements
  add column if not exists disposal  text,
  add column if not exists taken_by  text,
  add column if not exists logistics text;

alter table public.notifications
  add column if not exists disposal  text,
  add column if not exists taken_by  text,
  add column if not exists logistics text;

-- Reports group deleted stock by where it went, so index that.
create index if not exists stock_movements_disposal_ts_idx
  on public.stock_movements (disposal, ts desc)
  where disposal is not null;
