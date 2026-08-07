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

/* Create the account. Signing up through the app always passes a real email
   (proved by a code first — see below), and that address becomes the login id.

   The name-derived fallback stays for the other callers: the admin adding
   staff directly, and the four shared role accounts. Those have no inbox, so
   toLoginEmail() invents a valid-looking one. */
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

/* ---- PROVING AN EMAIL ADDRESS IS REALLY YOURS ----

   A typed email is only worth something if the shop knows the person can
   open it — otherwise a typo means the account can never be recovered, and
   a stranger's address ends up on somebody else's account.

   So: ask for a 6-digit code, which is emailed to that address, and require
   it back before the account is created. The code is minted and checked
   inside the database (see supabase/email_verification.sql); the browser
   never learns it, so it can't be faked from the console. */

/* Ask for a code to be emailed. Returns {} on success, or {setup:true} when
   the shop's own email sending isn't configured yet — a different problem
   from a mistyped address, and the screen says so differently. */
export async function sendEmailCode(email, name = "") {
  const { data, error } = await supabase.functions.invoke("send-signup-code", {
    body: { email: String(email).trim().toLowerCase(), name: String(name).trim() },
  });
  /* A non-2xx from the function arrives as a FunctionsHttpError whose
     `context` is the raw Response, so the real message ("too many codes",
     "verify a domain") has to be read out of the body. Without this the
     screen would show "Edge Function returned a non-2xx status code", which
     tells a shop worker nothing. */
  if (error) {
    /* The phone never reached Supabase at all. Say it in the same words the
       login screen already uses for a lost connection — its own detector
       looks for "failed to fetch", which this error's message lacks. */
    if (error.name === "FunctionsFetchError") {
      throw new Error("Failed to fetch — the phone couldn't reach the internet.");
    }
    let payload = null;
    let status = error.context?.status;
    try {
      payload = await error.context?.clone().json();
    } catch {
      /* not JSON — e.g. the function isn't deployed and this is an HTML 404 */
    }
    if (payload?.setup) return { setup: true, error: payload.error };
    /* Not deployed yet. Treated exactly like "sending isn't configured": the
       shop hasn't finished setting this up, which is nobody's typing mistake,
       and sign-ups must not be blocked by it. */
    if (status === 404) return { setup: true, error: "The code sender isn't deployed yet." };
    throw new Error(payload?.error || error.message || "The code could not be sent.");
  }
  if (data && data.ok === false) {
    if (data.setup) return { setup: true, error: data.error };
    throw new Error(data.error || "The code could not be sent.");
  }
  return {};
}

/* Check a typed code. The database counts wrong tries and locks the code
   after five, so guessing six digits isn't a way in. */
export async function checkEmailCode(email, code) {
  const { data, error } = await supabase.rpc("verify_email_code", {
    p_email: String(email).trim().toLowerCase(),
    p_code: String(code).trim(),
  });
  if (error) throw error;
  return data === true;
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
