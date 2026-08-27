/* ---------------------------------------------------------
   ROLE ACCOUNTS — the shared logins on the sign-in screen.

   Instead of every person creating an account (and waiting for
   approval), a shop has a small fixed set of role logins. You pick a
   role, enter its password, then type YOUR OWN NAME so every action is
   still stamped with the real person who did it.

   Default password for each role is "<role>123" — e.g. sales123.
   The admin can change any of them in Settings > Role Passwords.

   THE LIST IS NOT THE SAME AT BOTH SHOPS. Jaspare has the four roles it
   has always had. Sure Fit has two: Keziah and Admin — and the four are
   NOT copied across. A team of three does not need four shared logins,
   and a login on the screen that nobody is meant to use is a login
   somebody eventually uses. The third person gets their own account,
   created for them by Keziah or the admin from inside the app.
--------------------------------------------------------- */

/* Jaspare's four, and the default for any shop without its own list. */
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

/* SURE FIT AUTO SPARES LTD — Keziah, who runs the shop.

   Wears the shop's own colour rather than one of the four above, because she is
   the first thing on that sign-in screen and it should look like her shop.

   Unrestricted, on the owner's instruction: no permissions to tick, nothing hidden.
   That is enforced in src/lib/roles.js, where this address is listed as an admin
   email — not here, because this file only decides what the screen offers. */
const KEZIAH = {
  key: "keziah",
  label: "Keziah",
  desc: "Runs the shop — full control.",
  email: "keziah@bypassshop.co",
  color: "#EA580C",
};

/* Every role that exists anywhere, for looking one up by key or by email. A role
   removed from a shop's screen still has to be recognisable, or somebody already
   signed in with it would stop being identified after a deploy. */
const ALL_ROLES = [...ROLE_ACCOUNTS, KEZIAH];

/* Which logins a shop offers, in the order they appear. Keziah first, as asked. A
   shop with no entry here gets ROLE_ACCOUNTS. */
const ROLE_KEYS_BY_SLUG = {
  "surefit-autoparts": ["keziah", "admin"],
  /* JEYDEN — one door, until the shop says who works there.

     Not the four. The four are Jaspare's shared logins and the people holding those
     passwords are Jaspare's people; putting Sales and Staff on Jeyden's screen would
     invite them in through a door that RLS then shows an empty shop behind, which
     reads as a broken system rather than as "you do not work here".

     So Jeyden opens with Admin only — the role multishop/12 grants, and the only one
     it grants — and that person creates their own staff from inside the app, the same
     way Sure Fit's third person is created. Names go here when there are names. */
  "jeyden-autospares": ["admin"],
};

export function rolesFor(slug) {
  const keys = ROLE_KEYS_BY_SLUG[String(slug || "").toLowerCase()];
  if (!keys) return ROLE_ACCOUNTS;
  /* Mapped from the key list rather than filtered from ALL_ROLES, so the order
     above is the order on the screen and not the order things were declared in. */
  return keys.map((k) => ALL_ROLES.find((r) => r.key === k)).filter(Boolean);
}

// The password every role starts with: admin123, sales123, staff123, management123, keziah123.
export const defaultRolePassword = (key) => `${key}123`;

export const roleByKey = (key) => ALL_ROLES.find((r) => r.key === key) || null;
export const roleByEmail = (email) =>
  ALL_ROLES.find((r) => r.email === String(email || "").toLowerCase()) || null;

/* Which roles count as admin-level (see everything, manage staff). */
export const ADMIN_ROLE_KEYS = ["admin", "management", "keziah"];

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
