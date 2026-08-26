# Two shops in one database

Jaspare Auto and Sure Fit Auto Spares Ltd, sharing one Supabase project, seeing nothing
of each other.

The plan these files came from, with the reasoning and the alternatives that were
rejected, is `../MULTI_SHOP_PLAN.md`. This file is just how to run them.

---

## Where to paste this

Supabase Dashboard → **SQL Editor** → **New query** → paste one file → **Run**.
One file at a time, in order, reading the `NOTICE` output as it goes.

### Which account

**Project `loliaseckqpqjoqiwyiq`, named "BYPASS JASPRE SHOP", in organisation
`rrpyekscovkwkolooovw`** — all three read straight out of
`supabase/.temp/linked-project.json`, written by the CLI when the project was linked.

That organisation is **not** the one the app is being developed from. The
`addamsjmk-cmyk` login is told *"You do not have access to this project"*, and its
own org lists only `addamsjmk-cmyk's Project` and `mevril auto part`. The management
token in this repo returns `401 Unauthorized`, so the owner's email cannot be read
back from the API.

To find the right login, open **https://supabase.com/dashboard/org/rrpyekscovkwkolooovw**
in each candidate account: the one that owns it sees the org and a project called
"BYPASS JASPRE SHOP", and every other account gets a no-access page. The likeliest
candidate is whoever holds `Ceejay4pf` on GitHub, since that account owns the repo
Vercel deploys from. `charles.mbuguajmk@gmail.com` appears in this codebase only as
the **Resend** account owner (`OWNER_EMAIL` in `supabase/functions/notify-admin/`) —
that is a mail account, not evidence about Supabase.

Until they are run, nothing changes: the app keeps working exactly as it does today,
the shop picker still appears, Jaspare works fully, and Surefit is listed but says
it is not open yet. That is not a workaround — it is the design. The frontend never
assumes the migration has happened.

## The order, and why it is this order

| | File | What it guarantees |
|---|---|---|
| 1 | `01_shops_branches_members.sql` | `shops`, `branches`, `user_shops`, the three helper functions, and every existing account placed in Jaspare so nobody is locked out. **Touches no existing table.** |
| 2 | `02_shop_id_columns.sql` | `shop_id` on 16 tables, backfilled to Jaspare, NOT NULL, indexed — plus a temporary default so the currently-deployed app keeps writing. |
| 3 | `03_keys_and_uniqueness.sql` | The keys that assumed one business: `inventory.code`, `part_categories.key`, `expense_categories.name`, one-row `finance_opening`, and globally-unique quote / receipt / order numbers. |
| 4 | `04_functions_and_views.sql` | The functions that would have been *wrong* rather than broken — `add_stock`, `sell_item`, `set_qty`, `undo_sale`, the numbering, the public catalogue views, `place_customer_order`, `order_lookup`. |
| 5 | `05_policies.sql` | The database itself refusing to show one shop's rows to the other. |
| 6 | `06_drop_temp_defaults.sql` | A forgotten `shop_id` becomes a loud error instead of a silent write into Jaspare. |
| — | `07_surefit_first_admin.sql` | Separate, hand-edited: Surefit's first admin. |
| 8 | `08_shop_letterhead.sql` | The letterhead in the database instead of the code: name, tagline, address, P.O. box, phones, footer. Both shops print their own details — before this, one of them printed the other's. |
| 9 | `09_shared_staff_feed.sql` | **Deliberately gives up privacy on one table.** The staff feed becomes one room both shops read, so a counter can ask the other shop about a part instead of ringing. Writing stays truthful. Re-run 05 to reverse it. |
| 10 | `10_surefit_full_name.sql` | The shop's name in full — Sure Fit Auto Spares Ltd. 08 had it a word short, and a short name on a receipt is a payment sent to the wrong account. Also corrects the names 09 stamped onto existing messages. |

Every file is safe to re-run. If one stops half way, fix the cause and run it again
from the top.

**4 before 5 on purpose.** A policy body is checked when it is created, and the
policies lean on helpers and columns that steps 1–4 put there. Locking the doors
before the keys are cut fails with an error message that mentions receipts and says
nothing about the missing function.

## Steps 1 to 6 belong in one sitting

Step 2 makes `shop_id` NOT NULL. Between that moment and the new frontend going
live, the running app is inserting rows with no shop on them — which is why step 2
adds a temporary default of Jaspare's id, and why step 6 takes it away again.

So: paste 1 → 6, then confirm the app is live and a sale goes through. If the deploy
is going to be delayed, stop after 5 and run 6 later — the default is harmless while
only Jaspare has data. It stops being harmless the day Surefit has its first part.

## What Surefit is on day one

An admin, no other staff, no branches, no stock, eleven expense categories, and its
own numbering starting at 0001. Its customer page shows an empty shelf, which is the
truth. Nothing of Jaspare's leaks into it.

Its address is `/surefit-autoparts` for customers and
`/surefit-autoparts/login` for staff. Jaspare's old links — the bare address,
`/shop`, `/parts`, `/login` — all keep working and all still mean Jaspare, because
they are already printed on things and already sent to people.

## The three things worth checking afterwards

Signed in as ordinary **Jaspare** staff:

```sql
select count(*) from public.inventory;   -- ~604
select count(*) from public.inventory
 where shop_id = (select id from public.shops where slug = 'surefit-autoparts');
-- must be 0, now and forever
```

Then the numbering, which is the one that bites quietly:

```sql
select public.next_receipt_number((select id from public.shops where slug='jaspare-auto'));
-- must be HIGHER than the highest number already in public.receipts
```

And step 6's whole purpose — this should **fail**:

```sql
insert into public.part_categories (key, label, sort) values ('ZZZ','test',1);
-- expect: null value in column "shop_id" violates not-null constraint
```

## Two things these files do not do

**No `branch_id` on any data table.** `shops → branches` is real after step 1.
`branches → data` is not, because stamping a branch onto 604 parts and every past
sale would mean guessing — and a month later the guess would be indistinguishable
from a count somebody actually took. It is a second, smaller migration for the day
somebody knows which branch holds what.

**Five of the seven branches are not seeded.** Only the two the live app names as
real places (`MAIN`, `JEY`) are created. The other five exist as a hardcoded array
in one prototype file with no stock behind them; each is one `insert` whenever it
becomes real.
