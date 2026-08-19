-- ===========================================================
-- RECEIPTS: REMEMBER WHERE THEY CAME FROM
--
-- Run this once in Supabase -> SQL Editor. Safe to run twice.
--
-- WHY
-- The shop was typing the same list of parts twice.
--
-- A quotation is a list of parts and prices agreed with a customer. When they
-- came back and paid, that list was typed again into the Receipt screen off a
-- printed page -- the one moment in the day where a slip of the finger changes
-- what somebody is charged.
--
-- A sale is already recorded: the part, how many, who bought it, what it came
-- to. Writing the receipt meant naming those parts by hand while the system was
-- holding them the whole time.
--
-- Both now carry across with one tap. These two columns are what makes that
-- safe rather than merely quick:
--
--   from_quote  the quote number a receipt was built from. On paper it lets a
--               customer's quote and their receipt be put side by side; in the
--               system it is why a quote is only stamped Converted once the
--               receipt has actually saved. A quote marked Converted against a
--               receipt that failed is a quote nobody can quote from again.
--
--   from_sales  the sale ids a receipt was built from, so the same delivery
--               cannot be receipted twice by accident. Without it the picker
--               would offer yesterday's sales again this morning and look
--               entirely correct doing it.
--
-- Receipts written before today have neither, and are simply not counted. An
-- absent record is not evidence that a sale was never receipted -- the picker
-- says "not sure" rather than "not receipted" for anything older.
-- ===========================================================

alter table public.receipts add column if not exists from_quote text;
alter table public.receipts add column if not exists from_sales jsonb default '[]'::jsonb;

-- Finding "was this sale already receipted?" reads from_sales across the table,
-- so it is worth an index. GIN because the question is containment, not equality.
create index if not exists receipts_from_sales_idx
  on public.receipts using gin (from_sales);

-- Quotes could already say Converted -- the column has allowed it since
-- supabase/quotes.sql -- but nothing ever set it, because there was no way to
-- turn a quote into anything. Nothing to change here; noted so the next person
-- doesn't go looking for a missing migration.

-- What the table looks like now.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'receipts'
   and column_name in ('from_quote', 'from_sales')
 order by column_name;
