/* ---------------------------------------------------------
   Roles — who is allowed to change stock.

   Admins can do everything (add items, add stock, sell, adjust,
   delete). Everyone else is view + sell + quotation only.

   Membership is by login email. The name-based login turns a
   typed name into "<name>@bypassshop.co", so the admin who signs
   in as "admin" / "admin123" lands on admin@bypassshop.co.
   Real emails (like the owner's) are matched directly.
--------------------------------------------------------- */
const ADMIN_EMAILS = [
  "admin@bypassshop.co",     // login name "admin"
  "addamsjmk@gmail.com",     // owner
];

export function isAdmin(session) {
  const email = session?.user?.email?.toLowerCase() || "";
  return ADMIN_EMAILS.includes(email);
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
