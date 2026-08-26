# Adding Surefit Autoparts Ltd — schema and RLS review

**Status: proposal only. No SQL in this file has been run and no table has been altered.**
Nothing here is applied until you say so.

**Decisions taken (25 Aug 2026), folded in below:**

- **Target confirmed: `C:\BYPASS SHOP` / Supabase `loliaseckqpqjoqiwyiq`.** §0 stands as a
  record of what the brief did not match, but the design is against the live system.
- **Surefit Autoparts Ltd is the business currently mislabelled "Super Fix Auto"** in the
  app's own list. It is not a new business — it is a real name replacing a wrong one. See §0b.
- **Branches seeded from the live app's list, not the prototype's seven.**
- Decisions B–F resolved in §8 with my recommendation taken in each case.

---

## 0. Read this part first — the brief does not match what is on disk

You described one system: *repo `jaspare-auto`, React/TypeScript + Supabase (PostgreSQL),
7 branches live, RLS and role-based access already set up.* I looked for it. There are
three separate real things on this machine, and the description is a blend of all three.
None of them is that system.

| What you described | What is actually there |
|---|---|
| repo `jaspare-auto` | No git repo of that name anywhere. `C:\Users\User\Downloads\jaspare-auto.jsx` — a single 929-line React file, three byte-identical copies. |
| 7 branches, running | The 7 branches exist **only as a hardcoded array** in that file (lines 55–63): JASPARE AUTO, QUICK JET AUTO, JEYDEN AUTOSPARE, KAZAPAN, GODMDDOWN, CITYBINS, KIAMBU STORE. It has mock `STAFF`, mock attendance, and Recharts graphs. It contains the string "supabase" zero times. There is no database behind it. |
| React / TypeScript | `C:\jaspare auto\SpareShops` is React 18 + TypeScript — but its backend is **PHP 8.1 + MySQL 8.0**, not Supabase. No RLS (MySQL has none). 3 branches seeded, not 7. Backend is a scaffold: the auth module only. Not a git repo. |
| Supabase / PostgreSQL, RLS, role-based access, live data | `C:\BYPASS SHOP` — real and live at bypass-shop.vercel.app, Supabase project `loliaseckqpqjoqiwyiq`, 21 tables, RLS enabled, `is_admin()`. But it is **plain JSX, not TypeScript** (0 `.ts`/`.tsx` files, 19 `.jsx`/`.js`), it has **no react-router**, and — the important one — it is a **single-shop system with no `branches` table and not one table scoped by branch.** |

**So requirement 2 has an empty answer as written.** "Add `shop_id` to every table currently
scoped by branch" — against the live database, *no table is scoped by branch*. There is no
`branches` table, no `branch_id` column anywhere, and no `products` or `staff` table either
(they are called `inventory` and `profiles`). The two things that look like branch scoping
are not:

- `transfers.other_branch` — free text, typed by hand, e.g. "Jeyden". Not a key.
- `profiles.shop` — `text default 'Bypass Shop'`. A label. Nothing reads it for scoping.

The `shops → branches → data` hierarchy in requirement 7 does not exist yet. It has to be
**built**, not extended. That is a bigger job than adding a column, and it is the reason
this document is longer than you probably expected.

Everything below is designed against **`C:\BYPASS SHOP` / Supabase `loliaseckqpqjoqiwyiq`**,
because it is the only PostgreSQL database in play, the only one with RLS, and the one
holding the live data ("the existing Jaspare Auto data" — 604 in-stock parts, ~23 accounts).
If that is the wrong target, stop here and tell me: a MySQL design for SpareShops has no
RLS section at all and would be a different document.

**One practical blocker, unchanged from before:** I cannot run SQL against that project. The
access token 401s, the CLI is linked but stores no password, `psql` is not installed, and the
dashboard says "You do not have access to this project" for your login. Whatever we agree
here, somebody with the owning account pastes it into the SQL editor.

---

## 0b. Surefit is "Super Fix Auto" under its real name — what that changes

You confirmed: *"its the same as super fit but its real name is surefit autoparts ltd"*.

So Surefit is already in this codebase. It is the third entry of a hardcoded array at
[`src/tabs.jsx:6643`](../src/tabs.jsx#L6643):

```js
const SHOPS = [
  { name: "Jaspare Auto — Main Shop", tag: "Head office", location: "Main shop",
    wa: "254729695400", display: "0724 450 852 · +254 729 695 400" },
  { name: "Jeyden Auto Spares",       tag: "Branch",      location: "South B",
    wa: "254798718321", display: "+254 798 718 321" },
  { name: "Super Fix Auto",           tag: "Partner",     location: "",
    wa: "254780643828", display: "+254 780 643 828" },
];
```

Three consequences, and the first one is the important one.

**1. A business cannot be both a branch of Jaspare and a shop beside it.** Your two answers,
taken literally together, would put Surefit in `branches` (as "Super Fix Auto", seeded from
the live app's list) *and* in `shops` (as the new tenant). That is the same business in two
roles, with two ids, and every query would have to know which one it meant.

I have resolved it the only coherent way: **all three names the live app knows are seeded,
but Surefit goes in `shops`, not `branches`.** So Jaspare gets two branch rows and Surefit
gets a shop row. Nothing the app currently names is dropped. Say so if you meant the other
reading — Surefit as a branch under Jaspare — because that is a much smaller job: no
`shop_id` on 17 tables, no RLS rewrite, no slug routing, just `branches` and a branch picker.

**2. The tag was already telling us this.** Jeyden is tagged `"Branch"`; Super Fix is tagged
`"Partner"`. Whoever wrote that list had already decided Surefit was not a branch of Jaspare.
Making it a separate tenant agrees with what the app has been saying all along.

**3. There is real data for the seed, so nothing has to be invented.** Surefit's WhatsApp
number is `+254 780 643 828`, and the branch phone numbers and locations come from the same
array. The one thing genuinely missing is Surefit's physical location (`location: ""`), which
I have left null rather than guessed.

**4. `SHOPS` in `tabs.jsx` must be rewritten, not just renamed.** Once shops are real rows,
a hardcoded array of three shops is a second copy of the truth — and it is the copy carrying
the wrong name. It should read from `public.shops` + `public.branches`. Renaming the string
alone would leave the same bug one deploy later.

---

## 1. The existing schema, reviewed

21 tables live, plus 4 objects in `supabase/SETUP_REMAINING.sql` that have never been run.

### 1a. Tables that hold shop-owned data — these need `shop_id`

| Table | Primary key | Rows (approx) | Notes |
|---|---|---|---|
| `inventory` | **`code` text** | ~604 | The catalogue. PK is the part code. |
| `sales` | `id` uuid | live | `code` text, no FK to inventory |
| `stock_movements` | `id` uuid | live | `code` text, no FK |
| `notifications` | `id` uuid | live | the activity feed |
| `customer_orders` | `id` uuid, **`ref` unique** | live | public enquiries, `ENQ-2026-0001` |
| `quotes` | `id` uuid, **`number` unique** | live | `QT-2026-0014` |
| `receipts` | `id` uuid, **`number` unique** | live | |
| `credit_accounts` | `id` uuid | live | garages who owe money |
| `credit_txns` | `id` uuid | live | **the schema's only foreign key** → `credit_accounts(id)` |
| `expenses` | `id` uuid | live | |
| `expense_categories` | **`name` text** | ~10 | |
| `finance_opening` | **`id int check (id = 1)`** | 1 | opening balances — hardcoded single row |
| `part_categories` | **`key` text** | ~27 | the 3-letter section codes |
| `app_settings` | **`key` text** | few | includes the OTP login switch |
| `messages` | `id` bigint | live | the staff group chat |
| `transfers` | `id` uuid | **0 — table does not exist yet** | in SETUP_REMAINING.sql |
| `staff_contacts` | `id` bigint | **0 — table does not exist yet** | in SETUP_REMAINING.sql |

### 1b. Tables that must NOT get `shop_id`

These are about a *person's login*, not a shop's data. A phone is trusted by the human who
owns it; if that human works for both shops, the trust is still one fact about one phone.

| Table | Why not |
|---|---|
| `profiles` | 1:1 with `auth.users`. Shop membership moves to `user_shops`. |
| `trusted_devices` | PK `(email, device_id)` — a person's phone |
| `email_codes` | PK `email` — a login code in flight |
| `verified_emails` | PK `email` — proof an address is real |
| `auth.users` | Supabase-managed, one identity per person across shops |

### 1c. What RLS actually says today

This matters because requirement 5 says "in addition to the existing branch-level RLS".
**There is no branch-level RLS.** There is no row filtering of any kind. From
`supabase/schema.sql:166-176`, the policy on `inventory`, `notifications`,
`stock_movements` and `sales` is generated in a loop as:

```sql
create policy "staff_all" on public.<t> for all
  to authenticated using (true) with check (true);
```

`using (true)`. The same pattern (`_all`, `using (true)`) covers `quotes`, `receipts`,
`credit_accounts`, `credit_txns`, `transfers` and `customer_orders`. RLS here means one
thing only: **signed in, or nothing.** Every signed-in member of staff can read and write
every row in the shop.

The only real row logic anywhere is `profiles_write` (`auth.uid() = id`) and the
admin-gated policies on `notifications`, `part_categories` and `staff_contacts`.

So the `shop_id` filter would not be layered on top of an existing tenancy boundary. **It
would be the first one.** That is good news for effort and bad news for risk: there is no
prior art in this database to copy, and if the new policies are wrong there is nothing
underneath them.

### 1d. Role-based access today

`public.is_admin()` (`supabase/admin_only_views.sql`) is:

```sql
select lower(email) in ('admin@bypassshop.co','management@bypassshop.co','addamsjmk@gmail.com')
```

A hardcoded list of three addresses, global, with no notion of *which shop* you administer.
Related: `is_shop_admin()`, `is_finance_admin()`, `caller_is_admin()`. **Left as they are,
the moment Surefit exists those three people are automatically full admins of Surefit —
including its finance screens.** See §6, item 1. This is the single most dangerous line in
the migration and it is not a table change.

---

## 2. Six things a `shop_id` column does not fix

Adding a column is the easy half. These are collisions in keys and uniqueness that make
two shops in one schema actively break, and each one needs a decision.

**1. `inventory.code` is the primary key.**
Two shops cannot both stock `HDL-TOY-PRE-16-0001`. Surefit's first Premio headlight would
fail to insert. `shop_id` as an ordinary column does not help — the PK has to change to
`(shop_id, code)`, or to a surrogate `id uuid` with `unique (shop_id, code)`.
*Mitigating discovery:* the whole schema contains **exactly one foreign key**
(`credit_txns.account_id`). Nothing references `inventory.code`, so changing that PK breaks
no constraints. It does mean every query and every function that joins or looks up by code
alone must start passing the shop.

**2. `part_categories.key` is the primary key.**
Surefit cannot have its own `HDL` section while Jaspare has one. Same fix: `(shop_id, key)`.
Without it, the two shops share one section list and renaming "Headlights" in one renames it
in the other.

**3. Document numbers are globally unique.**
`quotes.number`, `receipts.number`, `customer_orders.ref` are all `unique`, and
`next_quote_number()` / `next_receipt_number()` / the enquiry-ref generator count over the
whole table. Surefit's very first receipt would be numbered somewhere in Jaspare's 400s, and
the two shops' books would interleave. Must become unique **per shop**, with per-shop
counters.

**4. `finance_opening` is a single hardcoded row** — `id int primary key default 1 check
(id = 1)`. One shop's opening cash, M-Pesa, bank, capital and drawings. There is physically
no room for Surefit's. Needs `shop_id` as the PK and the check dropped.

**5. `app_settings.key` is the primary key.** Shop-wide settings are global, and one of them
is the new-phone OTP switch. Surefit would inherit Jaspare's security policy and either shop
could change it for the other. Needs `(shop_id, key)`.

**6. `expense_categories.name` is the primary key.** Same shape as #2 — one shared list of
expense categories for two businesses.

Also, more quietly: **nothing in the database prevents a `sales` row from naming another
shop's part code**, because there are no FKs. Today that is harmless (one shop). With two
shops it is a silent cross-tenant write. Either add real composite FKs while we are in here,
or enforce it inside `sell_item` / `add_stock` / `set_qty`. I recommend both.

---

## 3. New tables

```sql
-- ------------------------------------------------------------
-- shops — the tenant
-- ------------------------------------------------------------
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- lower-case, url-safe, no surprises in a route
alter table public.shops
  add constraint shops_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- The registered name, not the one the app has been showing. "Super Fix Auto" was
-- never this business's name; it is not carried over, not even as an alias, because
-- an alias is how the wrong name survives.
insert into public.shops (name, slug, phone) values
  ('Jaspare Auto',          'jaspare-auto',       '+254729695400'),
  ('Surefit Autoparts Ltd', 'surefit-autoparts',  '+254780643828')
on conflict (slug) do nothing;
```

`phone` is one column beyond your requirement 1 (`id, name, slug, created_at`). It is here
because the landing page in requirement 6 lists both shops to strangers, and a shop tile with
no way to ring it is worse than no tile. Both numbers are real, from the array in §0b:

```sql
alter table public.shops add column if not exists phone text;
```

```sql
-- ------------------------------------------------------------
-- branches — created here, because it does not exist yet
-- ------------------------------------------------------------
create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete restrict,
  name        text not null,
  code        text not null,
  kind        text,                    -- 'Main Shop' | 'Retail' | 'Warehouse'
  location    text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (shop_id, code)               -- codes are unique inside a shop, not across shops
);
create index if not exists branches_shop_idx on public.branches (shop_id);
```

Surefit gets no rows, per requirement 7.

Jaspare gets **two** — the two entries in the live app's list that are actually branches of
Jaspare. The prototype's other five (QUICK JET AUTO, KAZAPAN, GODMDDOWN, CITYBINS, KIAMBU
STORE) are not seeded: nothing in the running system references them, and five branch rows
holding no stock make a branch picker that is mostly dead ends. They can be inserted in one
line each whenever they become real.

```sql
insert into public.branches (shop_id, name, code, kind, location, phone)
select s.id, v.name, v.code, v.kind, v.location, v.phone
  from public.shops s
  join (values
    ('Jaspare Auto — Main Shop', 'MAIN', 'Main Shop', 'Main shop', '+254729695400'),
    ('Jeyden Auto Spares',       'JEY',  'Retail',    'South B',   '+254798718321')
  ) as v(name, code, kind, location, phone) on true
 where s.slug = 'jaspare-auto'
on conflict (shop_id, code) do nothing;
```

**No `branch_id` column goes onto any data table in this migration.** That is deliberate and
worth stating, because it is the one place I have narrowed the hierarchy. Your requirement 2
asked for `shop_id`, and you said you would add Surefit's branches separately once the shop
record exists. Stamping a `branch_id` onto `inventory`, `sales` and the rest now would mean
attributing 604 parts and every past sale to a branch on the strength of an assumption — and
the assumption would then be indistinguishable from a count somebody took. `shops → branches`
is real after this migration; `branches → data` is a second, smaller step, taken when you
know which branch holds what. Say the word if you want it in the same pass.

```sql
-- ------------------------------------------------------------
-- user_shops — who may see which shop
-- ------------------------------------------------------------
create table if not exists public.user_shops (
  user_id    uuid not null references auth.users(id) on delete cascade,
  shop_id    uuid not null references public.shops(id) on delete cascade,
  role       text not null default 'staff'
             check (role in ('staff','manager','admin')),
  branch_id  uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);
create index if not exists user_shops_shop_idx on public.user_shops (shop_id);
```

Two additions beyond the `(user_id, shop_id)` you asked for, both load-bearing:

- **`role`** — because `is_admin()` is a global email list today (§1d). Without a per-shop
  role there is no way to express "admin of Surefit but not of Jaspare", and requirement 5's
  "role-based access" cannot be scoped at all.
- **`branch_id`** — nullable, so the shop→branch→user chain has somewhere to live later
  without a second migration. Null means shop-wide, which is what all ~23 existing accounts
  are today.

---

## 4. Altered tables

### 4a. The mechanical part — the column, backfilled, then locked

Every table in §1a. Ordered so nothing is ever `not null` before it is filled:

```sql
-- one transaction, because a half-applied version of this leaves the app
-- reading tables whose policies already require a column that isn't populated
begin;

do $$
declare
  v_jaspare uuid := (select id from public.shops where slug = 'jaspare-auto');
  t text;
begin
  if v_jaspare is null then
    raise exception 'Jaspare Auto shop row missing — run section 3 first';
  end if;

  foreach t in array array[
    'inventory','sales','stock_movements','notifications','customer_orders',
    'quotes','receipts','credit_accounts','credit_txns','expenses','messages'
  ] loop
    execute format('alter table public.%I add column if not exists shop_id uuid
                      references public.shops(id) on delete restrict', t);
    execute format('update public.%I set shop_id = %L where shop_id is null', t, v_jaspare);
    execute format('alter table public.%I alter column shop_id set not null', t);
    execute format('alter table public.%I alter column shop_id set default %L', t, v_jaspare);
    execute format('create index if not exists %I on public.%I (shop_id)',
                   t || '_shop_idx', t);
  end loop;
end $$;

commit;
```

A note on that `set default`: it is deliberate and temporary. Every insert path in the
running app is shop-blind right now, so between this migration and the frontend being
updated, a default keeps the shop working instead of failing every write with a not-null
violation. **It must be dropped once the frontend passes `shop_id` everywhere** — a default
tenant is exactly how a Surefit sale ends up in Jaspare's books. Tracked as decision D.

### 4b. The part that changes keys — one at a time, not in a loop

```sql
-- inventory: code becomes unique per shop, not globally
alter table public.inventory drop constraint inventory_pkey;
alter table public.inventory add primary key (shop_id, code);

-- part_categories: each shop owns its own section list
alter table public.part_categories drop constraint part_categories_pkey;
alter table public.part_categories add column if not exists shop_id uuid
  references public.shops(id) on delete restrict;
update public.part_categories set shop_id = (select id from public.shops where slug='jaspare-auto')
  where shop_id is null;
alter table public.part_categories alter column shop_id set not null;
alter table public.part_categories add primary key (shop_id, key);

-- app_settings: shop policy stops being global policy
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add column if not exists shop_id uuid
  references public.shops(id) on delete restrict;
update public.app_settings set shop_id = (select id from public.shops where slug='jaspare-auto')
  where shop_id is null;
alter table public.app_settings alter column shop_id set not null;
alter table public.app_settings add primary key (shop_id, key);

-- expense_categories
alter table public.expense_categories drop constraint expense_categories_pkey;
alter table public.expense_categories add column if not exists shop_id uuid
  references public.shops(id) on delete restrict;
update public.expense_categories set shop_id = (select id from public.shops where slug='jaspare-auto')
  where shop_id is null;
alter table public.expense_categories alter column shop_id set not null;
alter table public.expense_categories add primary key (shop_id, name);

-- finance_opening: one row per shop instead of one row full stop
alter table public.finance_opening drop constraint finance_opening_id_check;
alter table public.finance_opening drop constraint finance_opening_pkey;
alter table public.finance_opening add column if not exists shop_id uuid
  references public.shops(id) on delete restrict;
update public.finance_opening set shop_id = (select id from public.shops where slug='jaspare-auto')
  where shop_id is null;
alter table public.finance_opening alter column shop_id set not null;
alter table public.finance_opening drop column id;
alter table public.finance_opening add primary key (shop_id);

-- document numbers: unique inside a shop
alter table public.quotes          drop constraint quotes_number_key;
alter table public.quotes          add constraint quotes_shop_number_key   unique (shop_id, number);
alter table public.receipts        drop constraint receipts_number_key;
alter table public.receipts        add constraint receipts_shop_number_key unique (shop_id, number);
alter table public.customer_orders drop constraint customer_orders_ref_key;
alter table public.customer_orders add constraint customer_orders_shop_ref_key unique (shop_id, ref);

-- credit_txns can no longer point at another shop's account, enforced by the database
alter table public.credit_accounts add constraint credit_accounts_id_shop_key unique (id, shop_id);
alter table public.credit_txns drop constraint credit_txns_account_id_fkey;
alter table public.credit_txns add constraint credit_txns_account_fkey
  foreign key (account_id, shop_id) references public.credit_accounts (id, shop_id)
  on delete cascade;

-- and the same idea for the code joins that have never had a constraint
alter table public.sales           add constraint sales_item_fkey
  foreign key (shop_id, code) references public.inventory (shop_id, code) not valid;
alter table public.stock_movements add constraint stock_movements_item_fkey
  foreign key (shop_id, code) references public.inventory (shop_id, code) not valid;
```

The two `sales` / `stock_movements` FKs are `not valid` on purpose: they bind new rows
without validating 604 parts' worth of history, which will contain codes for parts that have
since been deleted. Run `validate constraint` later only if the history is clean.

`profiles.shop` (the text label) is left in place but becomes dead — deleting a column from
a live table is not worth the risk in the same migration. Decision E.

### 4c. The two tables that do not exist yet

`transfers` and `staff_contacts` are in `supabase/SETUP_REMAINING.sql`, unrun. **Do not
alter them — add `shop_id` to their `create table` in that file** before it is pasted, so
they are born correct instead of created wrong and patched. `transfers` in particular wants
rethinking: `other_branch text` was written for a shop with no branch table, and now that
branches are real it should be `from_branch_id` / `to_branch_id`.

---

## 5. RLS policy changes

### 5a. Two helper functions

```sql
-- the shops this user belongs to
create or replace function public.my_shop_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select shop_id from public.user_shops where user_id = auth.uid();
$$;

-- admin OF A NAMED SHOP, which is the thing is_admin() cannot express
create or replace function public.is_shop_admin_of(p_shop uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_shops
     where user_id = auth.uid() and shop_id = p_shop and role = 'admin'
  );
$$;

revoke all on function public.my_shop_ids()          from public, anon;
revoke all on function public.is_shop_admin_of(uuid) from public, anon;
grant execute on function public.my_shop_ids()          to authenticated;
grant execute on function public.is_shop_admin_of(uuid) to authenticated;
```

### 5b. Replacing `using (true)`

Every `_all` / `staff_all` policy in §1c is replaced by the same shape. Written out for one
table, then applied by the same loop the original used:

```sql
drop policy if exists "staff_all" on public.inventory;
create policy "shop_staff_all" on public.inventory for all to authenticated
  using      (shop_id in (select public.my_shop_ids()))
  with check (shop_id in (select public.my_shop_ids()));
```

```sql
do $$
declare t text;
begin
  foreach t in array array[
    'inventory','sales','stock_movements','notifications','customer_orders',
    'quotes','receipts','credit_accounts','credit_txns','expenses','messages',
    'transfers','part_categories','app_settings','expense_categories',
    'finance_opening','branches'
  ] loop
    execute format('drop policy if exists "staff_all" on public.%I', t);
    execute format('drop policy if exists "%s_all"     on public.%I', t, t);
    execute format($p$
      create policy "shop_staff_all" on public.%I for all to authenticated
        using      (shop_id in (select public.my_shop_ids()))
        with check (shop_id in (select public.my_shop_ids()));
    $p$, t);
  end loop;
end $$;
```

Then the three admin-gated tables keep their admin gate, but a *per-shop* one:

```sql
-- staff_contacts: read within your shop, write only if you administer that shop
drop policy if exists "staff_contacts_read"   on public.staff_contacts;
drop policy if exists "staff_contacts_insert" on public.staff_contacts;
drop policy if exists "staff_contacts_update" on public.staff_contacts;
drop policy if exists "staff_contacts_delete" on public.staff_contacts;

create policy "staff_contacts_read" on public.staff_contacts for select to authenticated
  using (shop_id in (select public.my_shop_ids()));
create policy "staff_contacts_insert" on public.staff_contacts for insert to authenticated
  with check (public.is_shop_admin_of(shop_id));
create policy "staff_contacts_update" on public.staff_contacts for update to authenticated
  using (public.is_shop_admin_of(shop_id));
create policy "staff_contacts_delete" on public.staff_contacts for delete to authenticated
  using (public.is_shop_admin_of(shop_id));
```

`notifications` (admin read/write/delete) and `part_categories` (admin insert/update) get
the same treatment: `is_admin()` → `is_shop_admin_of(shop_id)`.

### 5c. The new tables' own policies

```sql
alter table public.shops      enable row level security;
alter table public.branches   enable row level security;
alter table public.user_shops enable row level security;

-- shops: the landing page must list them, so this row is public by design.
-- It is a name and a slug — the same two facts that are about to be in the URL.
create policy "shops_public_read" on public.shops for select to anon, authenticated
  using (is_active);
-- nobody creates or renames a shop through the API
revoke insert, update, delete on public.shops from authenticated, anon;

create policy "branches_read" on public.branches for select to authenticated
  using (shop_id in (select public.my_shop_ids()));
create policy "branches_write" on public.branches for all to authenticated
  using (public.is_shop_admin_of(shop_id)) with check (public.is_shop_admin_of(shop_id));

-- you can see your own memberships, and an admin can see their shop's
create policy "user_shops_self" on public.user_shops for select to authenticated
  using (user_id = auth.uid() or public.is_shop_admin_of(shop_id));
create policy "user_shops_admin_write" on public.user_shops for all to authenticated
  using (public.is_shop_admin_of(shop_id)) with check (public.is_shop_admin_of(shop_id));
```

Note the deliberate gap in `user_shops_admin_write`: an admin of Jaspare cannot add a user
to Surefit, because `is_shop_admin_of` is checked against the row's own `shop_id`. Creating
the *first* admin of Surefit therefore cannot be done through the app — it is one manual
insert in the SQL editor. That is correct. A shop that can grant itself membership of
another shop is not two shops.

### 5d. Backfill the memberships

```sql
insert into public.user_shops (user_id, shop_id, role)
select u.id,
       (select id from public.shops where slug = 'jaspare-auto'),
       case when lower(u.email) in ('admin@bypassshop.co','management@bypassshop.co',
                                    'addamsjmk@gmail.com')
            then 'admin' else 'staff' end
  from auth.users u
on conflict (user_id, shop_id) do nothing;
```

All ~23 existing accounts become Jaspare staff, and the three current admins become Jaspare
admins — **and nothing else**. Surefit starts with zero members, which means zero people can
see it until you insert one deliberately.

### 5e. What this design does and does not guarantee

Being straight about the limit, because it affects how the frontend must be written.

Membership-based RLS guarantees: **you cannot read or write a row belonging to a shop you
are not a member of.** For anyone who belongs to exactly one shop — which is every account
today and probably every Surefit account ever — that is complete isolation.

It does **not** guarantee "you only see the shop in the URL". A user who is a member of both
shops, opening `/surefit-autoparts/...`, would have a query that forgot its
`.eq('shop_id', …)` return Jaspare rows too. PostgREST cannot hold a per-session "active
shop" reliably across pooled connections, so the honest fix is a single choke point in
`src/lib/api.js` that stamps `shop_id` on every read and write — one place to get right,
one place to audit — rather than a claim the database enforces. Flagged as decision C.

---

## 6. Views and functions that break

This is the part that makes the job bigger than tables and policies. **37 functions** exist;
these are the ones that are shop-blind and would be wrong rather than merely unscoped.

1. **`is_admin()`, `is_shop_admin()`, `is_finance_admin()`, `caller_is_admin()`** — the
   hardcoded three-email list. Left alone, those three accounts silently become Surefit
   admins with access to Surefit's finance screens. Either re-point them at
   `is_shop_admin_of()`, or keep `is_admin()` as an explicit *platform owner* role and never
   use it in a data policy again. **Nothing else in this migration matters if this is missed.**
2. **`add_stock(p_code, p_amount)`, `sell_item(p_code, p_qty)`, `set_qty(p_code, p_qty)`** —
   all key on `p_code` alone. With `(shop_id, code)` as the PK these either fail or, worse,
   update whichever shop's row they find first. Need a shop argument.
3. **`next_inventory_serial()`, `next_quote_number()`, `next_receipt_number()`** and the
   enquiry-ref generator — must count per shop (§2, item 3).
4. **`catalogue`, `catalogue_photos`, `catalogue_sections`** — the three anon-readable views
   behind the public customer page. They need `shop_id` and, for the slug route, a `shop_slug`
   column so the storefront can filter by URL. A public shop window is public, so exposing
   both shops' catalogues to `anon` is not a leak — but a customer must never see them mixed.
5. **`place_customer_order(...)`** (SECURITY DEFINER) — must take the shop slug and stamp
   `shop_id`, or every enquiry from either storefront lands in Jaspare's notifications.
6. **`order_lookup(p_ref, p_phone)`** — new, in SETUP_REMAINING.sql, not yet run. Once refs
   are unique per shop rather than globally, this must take the shop too, or a ref collision
   across shops returns a stranger's order. **Cheapest to fix now, before that file is ever
   pasted.**
7. **`handle_new_user()`** — the signup trigger creates a `profiles` row. It now also needs a
   `user_shops` row, and it cannot know which shop unless the slug rides along in
   `signUp({ options: { data: { shop_slug } } })`. Without this, every new signup lands with
   no membership and sees an empty app with no error.
8. **`staff_reachability()`, `staff_activity_summary()`** — admin reports over `auth.users`.
   Must be restricted to the calling admin's own shop, or a Jaspare admin reads Surefit's
   staff list.
9. **`device_otp_status()`, `set_otp_login(...)`, `login_needs_code(...)`** — read and write
   `app_settings`, now per-shop. Note that OTP is a property of a *login*, and a login is not
   per-shop, so this needs a real decision rather than a mechanical edit: either OTP stays
   global (simplest, and defensible) or it becomes per-shop and a user in both shops has two
   conflicting answers.
10. **Realtime.** The app subscribes on 9 channels (`src/lib/hooks.js`), table-level, no
    filter. Supabase applies RLS to `postgres_changes`, so a Surefit device should not
    receive Jaspare rows once policies are in — but this needs testing rather than assuming,
    and the subscriptions should carry an explicit `filter: shop_id=eq.<id>` so it is true by
    construction and not by trust.

---

## 7. Frontend routing (requirement 6)

Worth setting expectations: **there is no router to add a route to.** The live app has no
`react-router-dom` dependency, no hash routing, and `vercel.json` rewrites `/(.*)` → `/`.
Routing today is `frontDoor({host, path})` in `src/lib/publicRoute.js` — a pure function
matching a handful of literal paths — dispatched by a three-way `if` in `src/main.jsx`.

Two ways forward:

**(a) Extend the existing function.** `frontDoor()` learns to split the first path segment,
look it up as a slug, and return `{door, shopSlug}`. Roughly 60 lines including tests, no new
dependency, and it stays testable under plain `node` like the rest of `src/lib`. Loses
nothing, because there is nothing but these few paths.

**(b) Adopt `react-router-dom`.** Proper `/:shopSlug/login` routes. ~40 kB added to a bundle
already warning at 1,000 kB, and every existing entry path (`/jaspare`, `/system`, `/shop`,
`/spares`, `/parts`, `/catalogue`, `/store`, `/staff`, `/office`) has to be re-expressed as a
route or it 404s for whoever has it bookmarked.

I would do (a), and only take (b) when a third shop or per-shop deep links make it pay.

Either way the shape is the same:

```
/                            landing page: the shops from public.shops (anon-readable)
/:shopSlug                   that shop's front door — the customer/staff question
/:shopSlug/login             staff sign-in, scoped to the shop
/:shopSlug/shop              that shop's public parts list
/jaspare, /system, …         kept working, resolved to jaspare-auto
```

- Slug is resolved **once**, against `public.shops`, before login. Unknown slug → a plain
  "no such shop" page, not a redirect that silently lands them in the other shop.
- The resolved `shop_id` goes into one React context and into the single `api.js` choke
  point from §5e. Not passed down through components — that is how one query gets missed.
- Sign-up must carry the slug (§6, item 7).
- **This collides with what shipped two commits ago.** `FrontDoor.jsx` asks "customer or
  staff?" on `/` and, at your instruction, asks *every time and keeps nothing*. A shop
  picker in front of it means two questions before a storeman reaches a password box. My
  suggestion: `/` lists shops, and each shop's tile links to `/:shopSlug`, where the existing
  customer/staff question lives unchanged. One shop is one tap. Both bare paths keep working
  for anyone who has bookmarked them.

---

## 8. Order of work, and what needs deciding first

Safe order — each step leaves a working app:

1. §3 new tables + §5d membership backfill (additive, invisible to the running app)
2. Fix `shop_id` into `SETUP_REMAINING.sql` before it is ever pasted (§4c, §6 item 6)
3. §4a columns + backfill, with the temporary default
4. §6 functions and views — before policies, so nothing is locked out mid-flight
5. §5 policies
6. Frontend: slug resolution, context, `api.js` choke point, and `SHOPS` in `tabs.jsx`
   replaced by a read of `public.shops` + `public.branches` (§0b, item 4) — this is where the
   name "Super Fix Auto" stops being shown to anybody
7. Drop the temporary `shop_id` defaults (§4a)
8. Insert Surefit's first admin by hand (§5c)

### Decisions — all resolved

- **A. Branches — settled.** Two rows under Jaspare (MAIN, JEY) from the live app's list.
  Surefit is a shop, not a branch (§0b). The prototype's other five are not seeded. No
  `branch_id` on data tables in this pass.
- **B. `inventory` PK — composite `(shop_id, code)`.** Taken because the schema has exactly
  one foreign key, so nothing breaks, and because a surrogate `id` would mean touching every
  query in `api.js` that currently looks a part up by its code. The cost is that moving a part
  between shops becomes a delete-and-insert rather than an update — acceptable, since parts
  do not currently move between shops at all and `transfers` records it as a log either way.
- **C. Isolation — membership RLS plus one choke point in `api.js`.** Taken with the limit in
  §5e stated openly: the database will guarantee "no shop you do not belong to", and the app
  layer guarantees "only the shop in the URL". Since Surefit's staff will be different people
  from Jaspare's, every account belongs to exactly one shop and the two guarantees coincide.
  It stops coinciding the day one person is given both, so the choke point is not optional.
- **D. Temporary `shop_id` default — yes, and dropped in step 7.** Without it there is a
  window where every write in the running shop fails a not-null check. With it there is a
  window where an un-updated code path writes to Jaspare. The second is recoverable and the
  first stops the counter working, so: default in, frontend lands, default out, same day.
- **E. `profiles.shop` — left as dead text for now,** and dropped in a follow-up once nothing
  reads it. Not worth a column drop on a live table in a migration this size.
- **F. OTP login — stays global,** i.e. `app_settings` gets `shop_id` for everything else but
  the OTP switch is read shop-independently. A login is one login; a person with accounts in
  both shops cannot have their phone half-trusted. If Surefit later wants its own policy, that
  is a per-shop key added deliberately, not a side effect of this migration.

**Still needed from you before I write the migration:** nothing on the schema — only the
go-ahead, and the Supabase account that owns `loliaseckqpqjoqiwyiq` so it can actually be run.
