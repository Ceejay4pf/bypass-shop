/* ---------------------------------------------------------
   Auth — real login backed by Supabase Auth.
   Each staff member gets their own email/password account,
   so "who did what" is authenticated, not self-reported.
--------------------------------------------------------- */
import { supabase, createIsolatedClient } from "./supabase.js";

/* Turn a typed name (or phone) into a stable, valid login email so staff
   can sign up with just their name — no real inbox needed. If the person
   typed a real email (contains "@"), it's used as-is. So both work:
   "Josphat Kamau" -> josphat.kamau@bypassshop.co
   "admin@gmail.com" -> admin@gmail.com (unchanged)
   NOTE: the domain must be a real TLD (.co), not ".local" —
   Supabase rejects invalid-looking domains even though no mail is sent. */
export function toLoginEmail(identifier) {
  const raw = String(identifier || "").trim();
  if (raw.includes("@")) return raw.toLowerCase();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug || "staff"}@bypassshop.co`;
}

export async function signIn(identifier, password) {
  const email = toLoginEmail(identifier);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/* Sign up with a name (used as both the display name and the login id).
   An optional phone/email is stored on the profile; if it's an email it
   becomes the login id instead of the name-derived one. */
export async function signUp(name, password, contact = "") {
  const c = String(contact || "").trim();
  const usesEmail = c.includes("@");
  const email = usesEmail ? c.toLowerCase() : toLoginEmail(name);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name.trim(), phone: usesEmail ? "" : c } },
  });
  if (error) throw error;
  return data.user;
}

/* ---- ROLE LOGIN (the 4 shared accounts) ----
   Sign in to one of the fixed role accounts (admin / management / sales /
   staff). The person also types their own name, which is saved as the
   display name so every action is stamped with the real human.

   On very first use the role account won't exist in Supabase yet, so an
   "invalid login credentials" error triggers a one-time sign-up — but only
   when the typed password is the documented default (admin123, sales123,
   staff123, management123). Otherwise the first person to guess anything
   would get to set the password. No dashboard setup needed either way. */
export async function signInRole(role, password, personName = "") {
  const email = role.email;
  let user = null;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user;
  } catch (e) {
    const msg = String(e.message || "");
    // First run: the role account doesn't exist yet. Create it, then sign in.
    if (/invalid login credentials/i.test(msg)) {
      if (password !== `${role.key}123`) throw new Error("Wrong password for that role.");
      const { error: upErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: personName || role.label, role: role.key } },
      });
      // "already registered" means the account exists and the password is
      // genuinely wrong — surface that instead of the signup error.
      if (upErr && /already registered/i.test(String(upErr.message))) {
        throw new Error("Wrong password for that role.");
      }
      if (upErr) throw upErr;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      user = data.user;
    } else {
      throw e;
    }
  }
  // Save the person's own name on the profile so the app greets and stamps
  // the real human rather than the shared role.
  if (personName && user) {
    try {
      await supabase.auth.updateUser({ data: { full_name: personName, role: role.key } });
      await supabase.from("profiles").update({ full_name: personName }).eq("id", user.id);
    } catch {
      /* non-fatal — login still succeeds */
    }
  }
  return user;
}

/* Admin changes a role's password.

   Supabase only lets a user change their OWN password, so we sign in as the
   role — but on a throwaway client that never persists its session. That way
   the admin doing the reset stays signed in as themselves in this browser. */
export async function changeRolePassword(role, currentPassword, newPassword) {
  if (String(newPassword || "").length < 6) {
    throw new Error("The new password must be at least 6 characters.");
  }
  const tmp = createIsolatedClient();
  if (!tmp) throw new Error("Supabase is not configured.");
  const { error: inErr } = await tmp.auth.signInWithPassword({
    email: role.email,
    password: currentPassword,
  });
  if (inErr) throw new Error(`The current ${role.label} password is wrong.`);
  const { error } = await tmp.auth.updateUser({ password: newPassword });
  if (error) throw error;
  await tmp.auth.signOut();
}

/* Does this role account exist yet, and is this the right password?
   Used by the admin panel to show which roles are live. */
export async function checkRolePassword(role, password) {
  const tmp = createIsolatedClient();
  if (!tmp) return false;
  const { error } = await tmp.auth.signInWithPassword({ email: role.email, password });
  if (!error) await tmp.auth.signOut();
  return !error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Fetch the staff display name from the profiles table (or auth metadata).
export async function getProfileName(userId, fallback = "") {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  return data?.full_name || fallback;
}

export async function updateMyName(userId, fullName) {
  await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  await supabase.auth.updateUser({ data: { full_name: fullName } });
}
