/* ---------------------------------------------------------
   Roles — who is allowed to change stock.

   Note that this list is NOT per shop. An admin email is an admin
   wherever they sign in. That is deliberate for the two accounts that
   run the businesses, and it is also why the DATA is fenced off
   separately, by shop_id, in src/lib/supabase.js — being an admin does
   not let you see the other shop's stock, it lets you change your own.

   Admins can do everything (add items, add stock, sell, adjust,
   delete). Everyone else is view + sell + quotation only.

   Membership is by login email. The name-based login turns a
   typed name into "<name>@bypassshop.co", so the admin who signs
   in as "admin" / "admin123" lands on admin@bypassshop.co.
   Real emails (like the owner's) are matched directly.
--------------------------------------------------------- */
const ADMIN_EMAILS = [
  "admin@bypassshop.co",       // role login "Admin"
  "management@bypassshop.co",  // role login "Management"
  "keziah@bypassshop.co",      // role login "Keziah" — runs Sure Fit, unrestricted
  "eunice@bypassshop.co",      // role login "Eunice Wangari" — runs Jeyden, unrestricted
  "addamsjmk@gmail.com",       // owner
];

export function isAdmin(session) {
  const email = session?.user?.email?.toLowerCase() || "";
  return ADMIN_EMAILS.includes(email);
}

// The shared role accounts are pre-trusted: they never sit in the
// approval queue, since the password itself is the authorisation.
const ROLE_EMAILS = [
  "admin@bypassshop.co",
  "management@bypassshop.co",
  "sales@bypassshop.co",
  "staff@bypassshop.co",
  "keziah@bypassshop.co",
  "eunice@bypassshop.co",
];

export function isRoleAccount(session) {
  const email = session?.user?.email?.toLowerCase() || "";
  return ROLE_EMAILS.includes(email);
}

/* Capabilities baked into each shared role, so a role login works the
   moment it's used — no admin has to tick boxes first. Admin and
   management are admins already, so they aren't listed. */
const ROLE_PERMISSIONS = {
  sales: ["quick"],
  staff: ["additem", "edit", "quick"],
};

export function rolePermissions(session) {
  const email = session?.user?.email?.toLowerCase() || "";
  const key = email.split("@")[0];
  return ROLE_PERMISSIONS[key] || [];
}

// Owner inbox that gets the login-alert email.
export const OWNER_EMAIL = "addamsjmk@gmail.com";

/* Delicate capabilities an admin can grant to individual staff.
   Admins always have all of these; staff have only what's granted.
   Keys must match the strings used in the SQL permission functions. */
export const CAPABILITIES = [
  { key: "delete",  label: "Delete items",      desc: "Permanently remove items from inventory." },
  { key: "edit",    label: "Edit parts",        desc: "Change part details, prices and settings." },
  { key: "additem", label: "Add new items",     desc: "Create brand-new inventory items." },
  { key: "quick",   label: "Quick Transaction", desc: "Use the fast add/sell/adjust screen." },
];

// Does this account have a given capability? Admins always do.
export function hasCap(cap, { admin, permissions }) {
  if (admin) return true;
  return Array.isArray(permissions) && permissions.includes(cap);
}
