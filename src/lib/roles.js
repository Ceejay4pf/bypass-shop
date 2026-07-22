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
