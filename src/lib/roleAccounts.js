/* ---------------------------------------------------------
   ROLE ACCOUNTS — the 4 shared logins.

   Instead of every person creating an account (and waiting for
   approval), the shop has four fixed role logins. You pick a role,
   enter its password, then type YOUR OWN NAME so every action is
   still stamped with the real person who did it.

   Default password for each role is "<role>123" — e.g. sales123.
   The admin can change any of them in Settings > Role Passwords.
--------------------------------------------------------- */

export const ROLE_ACCOUNTS = [
  {
    key: "admin",
    label: "Admin",
    desc: "Full control — everything.",
    email: "admin@bypassshop.co",
    color: "#DC3B2E",
  },
  {
    key: "management",
    label: "Management",
    desc: "Oversight, reports and approvals.",
    email: "management@bypassshop.co",
    color: "#7C5CD6",
  },
  {
    key: "sales",
    label: "Sales",
    desc: "Sell, quote, receipts and credit.",
    email: "sales@bypassshop.co",
    color: "#15926A",
  },
  {
    key: "staff",
    label: "Staff",
    desc: "Day-to-day stock and lookups.",
    email: "staff@bypassshop.co",
    color: "#2563EB",
  },
];

// The password every role starts with: admin123, sales123, staff123, management123.
export const defaultRolePassword = (key) => `${key}123`;

export const roleByKey = (key) => ROLE_ACCOUNTS.find((r) => r.key === key) || null;
export const roleByEmail = (email) =>
  ROLE_ACCOUNTS.find((r) => r.email === String(email || "").toLowerCase()) || null;

/* Which roles count as admin-level (see everything, manage staff). */
export const ADMIN_ROLE_KEYS = ["admin", "management"];

/* Remember the human name typed at role login, so actions are attributed
   to the person and not just "Sales". Stored per device. */
const NAME_KEY = "bp_role_person_name";
const ROLE_KEY = "bp_role_key";

export function setRoleSession(roleKey, personName) {
  try {
    localStorage.setItem(ROLE_KEY, roleKey || "");
    localStorage.setItem(NAME_KEY, personName || "");
  } catch {
    /* storage blocked — role login still works, just not remembered */
  }
}

export function getRolePersonName() {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function getRoleKey() {
  try {
    return localStorage.getItem(ROLE_KEY) || "";
  } catch {
    return "";
  }
}

export function clearRoleSession() {
  try {
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}
