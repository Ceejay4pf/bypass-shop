-- ============================================================
-- SUB-CATEGORIES, DELETING A CATEGORY, AND AN ADMIN PER SHOP
--
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Four things the shop asked for, and they turn out to be the same problem
-- twice, so they are in one file:
--
--   1. Categories inside a category. "Switches" holds Main Switch, Rear Right,
--      Rear Left; "Doors" holds Front and Rear. One list of ninety sections is
--      not a list anybody reads, and the shop had started writing whole
--      sentences into the name box to cope.
--   2. Deleting a category. There was no DELETE policy at all — on purpose,
--      because deleting one that has parts filed under it orphans real stock.
--      That reasoning was right and the conclusion was wrong: refuse the
--      dangerous ones and allow the rest, rather than refusing all of them.
--   3. Each shop's own admin can run their own shop. Nine functions and one
--      policy tested a HARDCODED LIST OF THREE EMAIL ADDRESSES, so Keziah at
--      Sure Fit and Eunice at Jeyden could not add a category, approve a
--      person, log anybody out, or restrict anything — at their own shop.
--   4. Each shop's staff list is its own. profiles_read said
--      "is_admin() OR it is me", which for those two meant they saw ONE row —
--      their own — and for admin@bypassshop.co meant that standing in Jeyden
--      they saw all twenty-five of Jaspare's people. Both halves wrong, in
--      opposite directions.
--
-- WHAT IS DELIBERATELY NOT CHANGED
-- public.is_admin() keeps its three hardcoded addresses and keeps meaning "the
-- person who owns this system". That is true and useful. What changes is that
-- it stops being the test for anything that guards ONE SHOP's people or
-- sections — that job goes to a function that knows which shop it is being
-- asked about. Same reasoning as the note in multishop/04.
-- ============================================================


-- ------------------------------------------------------------
-- 1) WHO IS AN ADMIN OF WHAT
--
-- is_shop_admin_of(shop) already existed and reads user_shops, which is the
-- truth. What was missing is the same question asked about a PERSON rather
-- than a shop: "am I an admin of somewhere this person works?" Every screen
-- that manages staff needs that one and had no way to ask it.
-- ------------------------------------------------------------

/* Do this person and I work anywhere together? Used by profiles_read, so a
   shop's team can see each other's names on the feed and on a receipt, and
   cannot see the other shop's team at all. */
create or replace function public.shares_shop_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
      from public.user_shops mine
      join public.user_shops theirs on theirs.shop_id = mine.shop_id
     where mine.user_id = auth.uid()
       and theirs.user_id = p_user
  );
$$;

/* Am I an admin of somewhere this person works? The test for every "log them
   out / approve them / restrict them / rename them" action.

   is_admin() is an OR rather than the only test because the owner's own
   address may not be a member of any shop at all, and locking the owner out
   of their own system while fixing somebody else's access would be a poor
   trade. Everyone else has to earn it through user_shops. */
create or replace function public.is_admin_over(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
      from public.user_shops mine
      join public.user_shops theirs on theirs.shop_id = mine.shop_id
     where mine.user_id = auth.uid()
       and mine.role = 'admin'
       and theirs.user_id = p_user
  );
$$;

/* Am I an admin of anywhere at all? For the screens that are admin-only but
   are already narrowed to one shop by shop_id, so they do not need to name
   which shop in the test as well. */
create or replace function public.is_any_shop_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_shops
     where user_id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.shares_shop_with(uuid)  to authenticated;
grant execute on function public.is_admin_over(uuid)     to authenticated;
grant execute on function public.is_any_shop_admin()     to authenticated;


-- ------------------------------------------------------------
-- 2) A SHOP'S TEAM IS ITS OWN
--
-- The old policy is quoted in the header. This one is the same shape as every
-- other table in the system: what you may read is decided by which shop you
-- work at, and not by whether your email address is on a list in a function.
-- ------------------------------------------------------------
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_shop_with(id));


-- ------------------------------------------------------------
-- 3) NOBODY BUT THE OWNER'S OWN LOGINS WORKS AT TWO SHOPS
--
-- The shop's instruction, in their words: "dont transfer the shops team from
-- one shop to another, each has its individual staff". Enforced here and not
-- only in the app, because the app is not the only way a row gets written —
-- handle_new_user() writes one on every sign-up, from whichever sign-in page
-- the person happened to be standing on.
--
-- Deliberately NOT retroactive: this fires on insert and update, so a
-- membership that already exists is left where it is. It stops the next
-- mistake rather than undoing an old decision nobody has reviewed.
-- ------------------------------------------------------------
create or replace function public.one_shop_per_person()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email  text;
  v_others int;
begin
  select lower(email) into v_email from auth.users where id = new.user_id;

  -- The owner's own logins are the same at every shop, on purpose. This list is
  -- is_admin()'s list and must stay the same as ADMIN_EMAILS in src/lib/roles.js.
  if v_email in ('admin@bypassshop.co', 'management@bypassshop.co', 'addamsjmk@gmail.com') then
    return new;
  end if;

  select count(*) into v_others
    from public.user_shops
   where user_id = new.user_id
     and shop_id <> new.shop_id;

  if v_others > 0 then
    raise exception
      'Person % already works at another shop. Each shop keeps its own staff, so give them their own login here instead of adding this one.',
      coalesce(v_email, new.user_id::text);
  end if;

  return new;
end $$;

drop trigger if exists user_shops_one_shop on public.user_shops;
create trigger user_shops_one_shop
  before insert or update on public.user_shops
  for each row execute function public.one_shop_per_person();


-- ------------------------------------------------------------
-- 4) THE STAFF ACTIONS AN ADMIN CAN TAKE
--
-- Six functions, all with the same hardcoded three-address check, all replaced
-- with is_admin_over(target). Two things change at once and both matter:
-- Keziah and Eunice can now run their own team, AND nobody can act on somebody
-- who does not work with them. The old check never looked at the target at
-- all, so the moment a second shop's admin was added to that list they would
-- have been able to log out the first shop's staff.
--
-- The message says "who works with you" rather than "you are not an admin",
-- because for the person who runs a shop the second one is simply false and
-- sends them looking for the wrong problem.
-- ------------------------------------------------------------

create or replace function public.force_logout(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_over(target) then
    raise exception 'You can only log out somebody who works at your shop.';
  end if;
  update public.profiles set force_logout_at = now() where id = target;
end $$;

create or replace function public.set_user_approved(target uuid, val boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_over(target) then
    raise exception 'You can only approve somebody who works at your shop.';
  end if;
  update public.profiles set approved = val where id = target;
end $$;

create or replace function public.grant_permission(target uuid, perm text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_over(target) then
    raise exception 'You can only change what somebody at your own shop is allowed to do.';
  end if;
  update public.profiles
     set permissions = array(select distinct unnest(permissions || array[perm])),
         pending_permissions = array_remove(pending_permissions, perm)
   where id = target;
end $$;

create or replace function public.revoke_permission(target uuid, perm text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_over(target) then
    raise exception 'You can only change what somebody at your own shop is allowed to do.';
  end if;
  update public.profiles
     set permissions = array_remove(permissions, perm),
         pending_permissions = array_remove(pending_permissions, perm)
   where id = target;
end $$;

create or replace function public.deny_permission_request(target uuid, perm text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_over(target) then
    raise exception 'You can only answer a request from somebody at your own shop.';
  end if;
  update public.profiles
     set pending_permissions = array_remove(pending_permissions, perm)
   where id = target;
end $$;

/* rename_user tested caller_is_admin(), which is the same three addresses
   wearing a different name. Rebuilt here rather than left, because a shop that
   can approve a person but not correct the spelling of their name is a shop
   that ends up with two accounts for one person. */
create or replace function public.rename_user(target uuid, new_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_over(target) then
    raise exception 'You can only rename somebody who works at your shop.';
  end if;
  if btrim(coalesce(new_name, '')) = '' then
    raise exception 'A name cannot be blank.';
  end if;
  update public.profiles set full_name = btrim(new_name) where id = target;
end $$;


-- ------------------------------------------------------------
-- 5) THE ADMIN-ONLY TABLES GET A SHOP TEST TOO
--
-- is_finance_admin() and is_admin() were the WHOLE test on some of these, with
-- no shop_id anywhere in the policy. In practice nothing leaked, because every
-- read in the app goes through shopFrom() in src/lib/supabase.js and that adds
-- the shop itself — but a fence that only holds because the app is polite is
-- not a fence. equity_movements already had it done properly and is the shape
-- copied here.
-- ------------------------------------------------------------

create or replace function public.is_finance_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_any_shop_admin();
$$;

drop policy if exists "expenses_admin_read"   on public.expenses;
drop policy if exists "expenses_admin_write"  on public.expenses;
drop policy if exists "expenses_admin_update" on public.expenses;
create policy "expenses_admin_read" on public.expenses
  for select to authenticated
  using (public.is_finance_admin() and shop_id in (select public.my_shop_ids()));
create policy "expenses_admin_write" on public.expenses
  for insert to authenticated
  with check (public.is_finance_admin() and shop_id in (select public.my_shop_ids()));
create policy "expenses_admin_update" on public.expenses
  for update to authenticated
  using (public.is_finance_admin() and shop_id in (select public.my_shop_ids()));

/* expense_categories had the same shape. Included so the two tables that make
   up the expense screen are fenced the same way — one of them holding and the
   other relying on the app is the version that gets found by accident later. */
drop policy if exists "cats_read"  on public.expense_categories;
drop policy if exists "cats_write" on public.expense_categories;
create policy "cats_read" on public.expense_categories
  for select to authenticated
  using (public.is_finance_admin() and shop_id in (select public.my_shop_ids()));
create policy "cats_write" on public.expense_categories
  for insert to authenticated
  with check (public.is_finance_admin() and shop_id in (select public.my_shop_ids()));

/* Notifications stay admin-only to read, exactly as before — the change is only
   that "admin" now means an admin of THIS shop rather than one of three
   addresses, and that the shop is named in the test instead of being left to
   shopFrom() to remember. */
drop policy if exists "notifications_read_admin"   on public.notifications;
drop policy if exists "notifications_write_admin"  on public.notifications;
drop policy if exists "notifications_delete_admin" on public.notifications;
create policy "notifications_read_admin" on public.notifications
  for select to authenticated
  using (public.is_any_shop_admin() and shop_id in (select public.my_shop_ids()));
create policy "notifications_write_admin" on public.notifications
  for update to authenticated
  using (public.is_any_shop_admin() and shop_id in (select public.my_shop_ids()));
create policy "notifications_delete_admin" on public.notifications
  for delete to authenticated
  using (public.is_any_shop_admin() and shop_id in (select public.my_shop_ids()));


-- ------------------------------------------------------------
-- 6) CATEGORIES INSIDE A CATEGORY
--
-- One nullable column. A row with parent = 'SWT' is a sub-category of
-- Switches; a row with parent null sits at the top.
--
-- NO FOREIGN KEY, and that is not laziness. The built-in sections — Doors,
-- Bumpers, Side Mirrors and the rest — live in src/data.js and have no row in
-- this table, so 'Front Doors' whose parent is the built-in 'DOR' would fail a
-- foreign key against a parent that is real but is not here. The app checks
-- the parent exists across both lists, where both lists are known.
--
-- Two levels only, enforced below. Three levels is a filing system nobody at a
-- counter navigates with one hand while holding a bumper.
-- ------------------------------------------------------------
alter table public.part_categories
  add column if not exists parent text;

create index if not exists part_categories_parent_idx
  on public.part_categories(shop_id, parent);

create or replace function public.part_category_parent_ok()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_grandparent text;
begin
  if new.parent is null or btrim(new.parent) = '' then
    new.parent := null;
    return new;
  end if;

  new.parent := upper(btrim(new.parent));

  if new.parent = new.key then
    raise exception 'A section cannot be inside itself.';
  end if;

  -- Two levels. If the chosen parent is itself in this table and itself has a
  -- parent, this would be the third — refuse it and say which one to pick.
  select parent into v_grandparent
    from public.part_categories
   where shop_id = new.shop_id and key = new.parent;

  if v_grandparent is not null then
    raise exception
      '% is already inside %. Put this one straight into % instead — sections go two deep, not three.',
      new.parent, v_grandparent, v_grandparent;
  end if;

  -- And nothing that already holds sections may be moved inside another.
  if exists (
    select 1 from public.part_categories
     where shop_id = new.shop_id and parent = new.key
  ) then
    raise exception
      '% already holds other sections, so it cannot go inside one. Move those out first.', new.key;
  end if;

  return new;
end $$;

drop trigger if exists part_categories_parent_ok on public.part_categories;
create trigger part_categories_parent_ok
  before insert or update on public.part_categories
  for each row execute function public.part_category_parent_ok();


-- ------------------------------------------------------------
-- 7) THE CATEGORY POLICIES STOP READING AN EMAIL LIST
--
-- This is what stopped Keziah and Eunice adding a section at their own shop.
-- is_shop_admin_of(shop_id) asks about the row being written, which is the
-- question that was always meant.
--
-- is_shop_admin() itself is left in place and left alone: it is still granted
-- and something else may call it. It simply stops being the test here.
-- ------------------------------------------------------------
drop policy if exists "part_categories_read"   on public.part_categories;
drop policy if exists "part_categories_insert" on public.part_categories;
drop policy if exists "part_categories_update" on public.part_categories;
drop policy if exists "part_categories_delete" on public.part_categories;

/* READ stays open to everyone signed in. Without it the app cannot name the
   section a part belongs to and a whole shelf reads as "unknown category" —
   the note from the original file, still true. */
create policy "part_categories_read" on public.part_categories
  for select to authenticated using (true);

create policy "part_categories_insert" on public.part_categories
  for insert to authenticated with check (public.is_shop_admin_of(shop_id));

create policy "part_categories_update" on public.part_categories
  for update to authenticated using (public.is_shop_admin_of(shop_id));

create policy "part_categories_delete" on public.part_categories
  for delete to authenticated using (public.is_shop_admin_of(shop_id));


-- ------------------------------------------------------------
-- 8) DELETING ONE, WITH THE TWO REFUSALS THAT MATTER
--
-- The original file's argument for having no delete at all:
--
--   "Deleting a category does not delete the parts filed under it: their codes
--    still start with that prefix and the app would have nothing left to name
--    the section with, so a shelf of real stock would read as unknown."
--
-- Every word of that is true, and it is an argument for refusing to delete a
-- section THAT HAS PARTS IN IT. It was being used to refuse all of them, which
-- is why the shop ended up with nine sections whose names are half-finished
-- sentences and no way to remove one.
--
-- So: an RPC rather than a bare delete, because the useful part is the
-- SENTENCE it comes back with. "It cannot be deleted" sends somebody looking
-- through the whole catalogue. "Seven parts are filed under BMR" tells them
-- what to do next.
--
-- Note there is no "move the parts somewhere else first" option offered, and
-- there cannot be: the three-letter key is stamped into every code that
-- section has ever issued (BMR-TOY-PRE-16-0042), so moving a part to another
-- section would mean re-coding it, and the code is what is written on the
-- shelf label and on every receipt already printed.
--
-- TWO FORMS, and the two-argument one is the one the app calls. The shop has to
-- be given rather than worked out, because my_one_shop() returns null for an
-- account that belongs to more than one shop — which is admin@bypassshop.co,
-- the account most likely to be doing the tidying, standing in all three. The
-- one-argument form stays for a single-shop account and for the SQL editor, and
-- refuses to guess rather than picking a shop. Same shape as add_stock and
-- sell_item, and shopRpc() in src/lib/supabase.js sends p_shop for it.
-- ------------------------------------------------------------
create or replace function public.delete_part_category(p_key text, p_shop uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_shop  uuid := p_shop;
  v_key   text := upper(btrim(coalesce(p_key, '')));
  v_label text;
  v_parts int;
  v_kids  text;
begin
  if v_shop is null then
    raise exception 'Which shop? Sign in through your shop''s own link and try again.';
  end if;

  if not public.is_shop_admin_of(v_shop) then
    raise exception 'Only an admin can remove a section.';
  end if;

  select label into v_label
    from public.part_categories where shop_id = v_shop and key = v_key;
  if v_label is null then
    raise exception 'There is no section here with the code %.', v_key;
  end if;

  -- REFUSAL ONE: it holds other sections.
  select string_agg(key, ', ' order by key) into v_kids
    from public.part_categories where shop_id = v_shop and parent = v_key;
  if v_kids is not null then
    raise exception
      '% holds % inside it. Move or remove those first, then this one can go.', v_key, v_kids;
  end if;

  -- REFUSAL TWO: real stock is filed under it. Counted off the code prefix and
  -- not off a category column, because the prefix IS how a part says which
  -- section it is in.
  select count(*) into v_parts
    from public.inventory
   where shop_id = v_shop and code like v_key || '-%';
  if v_parts > 0 then
    raise exception
      '% part% still filed under % (codes starting %-). Sell or remove those first — deleting the section would leave them with no section to belong to.',
      v_parts, case when v_parts = 1 then ' is' else 's are' end, v_key, v_key;
  end if;

  delete from public.part_categories where shop_id = v_shop and key = v_key;

  return format('%s (%s) removed.', v_label, v_key);
end $$;

-- The older one-argument form, for an account that belongs to one shop only.
create or replace function public.delete_part_category(p_key text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := public.my_one_shop();
begin
  if v_shop is null then
    raise exception 'Which shop? Open the shop you meant and try again.';
  end if;
  return public.delete_part_category(p_key, v_shop);
end $$;

revoke all on function public.delete_part_category(text) from public;
revoke all on function public.delete_part_category(text, uuid) from public;
grant execute on function public.delete_part_category(text) to authenticated;
grant execute on function public.delete_part_category(text, uuid) to authenticated;


-- ------------------------------------------------------------
-- CHECK IT
--
--   -- Eunice can manage her own sections now:
--   select public.is_shop_admin_of(id) from public.shops where slug='jeyden-autospares';
--
--   -- The tree, per shop:
--   select s.slug, c.parent, c.key, c.label
--     from public.part_categories c join public.shops s on s.id = c.shop_id
--    order by s.slug, coalesce(c.parent, c.key), c.parent nulls first, c.key;
--
--   -- What a shop's team looks like to that shop:
--   select s.slug, count(*) from public.user_shops us
--     join public.shops s on s.id = us.shop_id group by s.slug order by s.slug;
-- ------------------------------------------------------------
