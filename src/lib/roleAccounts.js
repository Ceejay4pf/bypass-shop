/* ---------------------------------------------------------
   ROLE ACCOUNTS — the shared logins on the sign-in screen.

   Instead of every person creating an account (and waiting for
   approval), a shop has a small fixed set of role logins. You pick a
   role, enter its password, then type YOUR OWN NAME so every action is
   still stamped with the real person who did it.

   Default password for each role is "<role>123" — e.g. sales123.
   The admin can change any of them in Settings > Role Passwords.

   THE LIST IS NOT THE SAME AT EVERY SHOP. Jaspare has the four roles it
   has always had. Sure Fit has two: Keziah and Admin. Jeyden has two:
   Eunice and Admin — and the four are NOT copied across. A team of three
   does not need four shared logins, and a login on the screen that nobody
   is meant to use is a login somebody eventually uses. The next person at
   either shop gets their own account, created for them by the person who
   runs it, from inside the app.

   NOT EVERY PASSWORD IS name+123. The shared ones are, because that is how
   they were handed out. Eunice's is not: the owner chose it for her by name,
   and it is NOT written down in this file. See defaultRolePassword below for
   what that costs and why it is worth it.
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

/* JEYDEN AUTO SPARES — Eunice Wangari, who runs the shop.

   Same arrangement as Keziah above, and for the same reasons: the shop's own colour
   rather than one of the four, first on her sign-in screen, and unrestricted. The
   teal is Jeyden's accent from lib/shopSkin.js and not a colour picked here, so if
   the shop repaints itself her tile moves with it instead of being left behind.

   Unrestricted is enforced in src/lib/roles.js, where this address is listed as an
   admin email, and in the database, where user_shops says she is an admin OF JEYDEN
   — which is the one that matters, because the client-side list would happily let
   her tap things RLS then refuses. */
const EUNICE = {
  key: "eunice",
  label: "Eunice Wangari",
  desc: "Runs the shop — full control.",
  email: "eunice@bypassshop.co",
  color: "#0D9488",
};

/* Every role that exists anywhere, for looking one up by key or by email. A role
   removed from a shop's screen still has to be recognisable, or somebody already
   signed in with it would stop being identified after a deploy. */
const ALL_ROLES = [...ROLE_ACCOUNTS, KEZIAH, EUNICE];

/* Which logins a shop offers, in the order they appear. Keziah first, as asked. A
   shop with no entry here gets ROLE_ACCOUNTS. */
const ROLE_KEYS_BY_SLUG = {
  "surefit-autoparts": ["keziah", "admin"],
  /* JEYDEN — Eunice first, then Admin.

     Still not the four. The four are Jaspare's shared logins and the people holding
     those passwords are Jaspare's people; putting Sales and Staff on Jeyden's screen
     would invite them in through a door that RLS then shows an empty shop behind,
     which reads as a broken system rather than as "you do not work here".

     So Jeyden opens with the person who runs it and the owner's own key, and Eunice
     creates her staff from inside the app — the same way Sure Fit's third person is
     created. This used to say "names go here when there are names". There is a
     name. */
  "jeyden-autospares": ["eunice", "admin"],
};

export function rolesFor(slug) {
  const keys = ROLE_KEYS_BY_SLUG[String(slug || "").toLowerCase()];
  if (!keys) return ROLE_ACCOUNTS;
  /* Mapped from the key list rather than filtered from ALL_ROLES, so the order
     above is the order on the screen and not the order things were declared in. */
  return keys.map((k) => ALL_ROLES.find((r) => r.key === k)).filter(Boolean);
}

/* THE PASSWORD A ROLE STARTS WITH — or null, when it is not this file's to know.

   Most roles start as name+123: admin123, sales123, staff123, management123,
   keziah123. That is a pattern, not a secret, and the screen says so.

   Eunice's is different. The owner chose it for her by name, and a chosen password
   written into a source file is a chosen password published to everyone who can read
   the repository — which for the person it protects is worse than useless, because
   she would carry on believing it was private. So this returns null for her, every
   screen that showed a hint says "set by the owner" instead, and the only copy lives
   where a password should: hashed, in Supabase Auth.

   THREE PLACES USED TO BUILD `key + 123` FOR THEMSELVES — this function, the
   "Forgot the password?" note on the sign-in screen, and the account-creating branch
   in lib/auth.js. That was harmless while every password matched the pattern and
   became a trap the moment one did not: the note would state a password that is
   wrong, and auth.js would refuse a first sign-in for typing the RIGHT one. All
   three ask this now, and a null answer means "cannot be guessed, and cannot be
   self-created either".

   Keziah is deliberately NOT in here. Hers follows the pattern, so the hint on Sure
   Fit's screen is true, and blanking a true hint helps nobody. */
const OWNER_SET_PASSWORD = new Set(["eunice"]);

export const defaultRolePassword = (key) =>
  OWNER_SET_PASSWORD.has(key) ? null : `${key}123`;

/* The one sentence both screens show about it, so the sign-in note and the Settings
   panel cannot end up telling a person two different things. */
export const rolePasswordHint = (key) => {
  const p = defaultRolePassword(key);
  return p ? `Starts as ${p}` : "Set by the owner";
};

export const roleByKey = (key) => ALL_ROLES.find((r) => r.key === key) || null;
export const roleByEmail = (email) =>
  ALL_ROLES.find((r) => r.email === String(email || "").toLowerCase()) || null;

/* Which roles count as admin-level (see everything, manage staff). The two shop-owner
   keys are here because each runs a shop; what that lets them see is still fenced by
   shop_id, so "admin" means full control of THEIR shop and no sight of the others. */
export const ADMIN_ROLE_KEYS = ["admin", "management", "keziah", "eunice"];

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
