/* ---------------------------------------------------------
   Auth — real login backed by Supabase Auth.
   Each staff member gets their own email/password account,
   so "who did what" is authenticated, not self-reported.
--------------------------------------------------------- */
import { supabase, createIsolatedClient } from "./supabase.js";
import { currentShopSlug } from "./shopScope.js";
import { shopName } from "./shopInfo.js";

/* WHICH SHOP A NEW ACCOUNT BELONGS TO.

   Sent as sign-up metadata, where the database trigger handle_new_user() reads it
   and writes the matching row into user_shops. Without it a new account gets a
   profile, no membership, and an app that is completely empty — every policy says
   "a shop you belong to" and they belong to none, so there is no error to explain
   it either. The slug is whichever shop's sign-in page they are standing on. */
function signupShop() {
  const slug = currentShopSlug();
  return slug ? { shop_slug: slug } : {};
}

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
    options: { data: { full_name: name.trim(), phone: usesEmail ? "" : c, ...signupShop() } },
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

/* Call an edge function and get a readable answer out of it.

   A non-2xx from a function arrives as a FunctionsHttpError whose `context` is
   the raw Response, so the real message ("too many codes", "verify a domain")
   has to be read out of the body. Without this the screen would show "Edge
   Function returned a non-2xx status code", which tells a shop worker nothing.

   Returns { data, setup, error } and never throws: `setup` means the SHOP is
   unfinished, which is nobody's typing mistake, and `error` is a sentence fit to
   put on screen. */
async function callFunction(fnName, body) {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (!error) {
    if (data && data.ok === false) {
      return { setup: !!data.setup, error: data.error || "That didn't work." };
    }
    return { data: data || {} };
  }
  /* The phone never reached Supabase at all. Say it in the same words the login
     screen already uses for a lost connection — its own detector looks for
     "failed to fetch", which this error's message lacks. */
  if (error.name === "FunctionsFetchError") {
    return { error: "Failed to fetch — the phone couldn't reach the internet." };
  }
  let payload = null;
  try {
    payload = await error.context?.clone().json();
  } catch {
    /* not JSON — e.g. the function isn't deployed and this is an HTML 404 */
  }
  if (payload?.setup) return { setup: true, error: payload.error };
  if (error.context?.status === 404) {
    return { setup: true, error: `The ${fnName} function isn't deployed yet.` };
  }
  return { error: payload?.error || error.message || "That didn't work." };
}

/* Ask for a code to be emailed. Returns {} on success, or {setup:true} when
   the shop's own email sending isn't configured yet — a different problem
   from a mistyped address, and the screen says so differently. */
export async function sendEmailCode(email, name = "", purpose = "signup") {
  const r = await callFunction("send-signup-code", {
    email: String(email).trim().toLowerCase(),
    name: String(name).trim(),
    /* "signup" or "login" — it only changes what the email says, but that
       wording is the whole alarm: somebody reading "signing in on a new
       phone" when they are not learns their password has been taken. */
    purpose: String(purpose || "signup"),
    /* The shop whose sign-in page they are standing on, so the code email is
       headed with that shop's name. A staff member at Sure Fit reading another
       company's name over their own sign-in code has been handed a good reason
       to think the email is a fake and not type it. */
    shop: shopName(),
  });
  if (r.setup) return { setup: true, error: r.error };
  if (r.error) throw new Error(r.error);
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

/* ---- SIGNING IN WITH A CODE INSTEAD OF A PASSWORD ----

   Two ways in, chosen by the person after they type their email:

       [ Use my password ]        [ Email me a code ]

   The code is not a second step on top of the password — it replaces it. That is
   the point: a password is the thing people actually lose. It gets forgotten,
   written on a note by the till, or told to somebody who later leaves. An
   emailed code is held only by whoever can open that inbox, and it is finished
   in ten minutes.

   See supabase/functions/otp-login/index.ts for why the session has to be minted
   on the server: a checked code is not a session, and the browser must not be
   the thing that decides a code was good, because the browser is what wants in. */

/* Can this shop offer the code button at all? Read before the button is drawn,
   because an offer that can't be honoured is worse than no offer — somebody
   stands at the counter tapping it, waiting on an inbox that gets nothing.

   Answers "no" on any failure. Losing the button for one login means typing a
   password; showing a broken one means a person who can't get in. */
export async function otpLoginAvailable() {
  try {
    const { data, error } = await supabase.rpc("otp_login_available");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/* Send the code. Returns {} on success, {setup:true, error} when the shop can't
   email yet, and throws with a readable sentence for anything the person can
   actually fix (wrong address, too many codes asked for). */
export async function startOtpLogin(email, name = "") {
  const r = await callFunction("otp-login", {
    action: "send",
    email: String(email || "").trim().toLowerCase(),
    name: String(name || "").trim(),
    shop: shopName(),
  });
  if (r.setup) return { setup: true, error: r.error };
  if (r.error) throw new Error(r.error);
  return { via: r.data?.via || "" };
}

/* Type the code back, and end up signed in.

   Three steps that must stay in this order: the server checks the code and
   destroys it, hands back a one-time token, and only then does the app swap that
   token for a session. Nothing before the last line leaves a session behind, so
   a wrong code leaves the app exactly as shut as it was. */
export async function finishOtpLogin(email, code) {
  const addr = String(email || "").trim().toLowerCase();
  const r = await callFunction("otp-login", {
    action: "verify",
    email: addr,
    code: String(code || "").trim(),
  });
  if (r.error) throw new Error(r.error);
  const hash = r.data?.token_hash;
  if (!hash) throw new Error("That code was accepted but signing in failed. Try again.");

  /* token_hash and type ONLY. Passing `email` as well makes Auth refuse the whole
     call with "only the token_hash and type should be provided" — the address is
     already baked into the hash, so naming it again is treated as a contradiction
     rather than a helpful extra. Worth stating plainly here because the address IS
     needed two lines above, for the function call, and the asymmetry looks like a
     mistake. */
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: hash,
    type: "magiclink",
  });
  if (error) throw error;
  return data.user;
}

/* Remember this phone, now that a code has proved who is holding it.

   Called after the session exists, not before — the database reads the address
   out of the token rather than taking it as an argument, so this can only ever
   trust the caller's own phone. Failure is swallowed: it only means the next
   login on this phone may ask for a code again, which is an inconvenience, not a
   locked door. */
export async function trustMyDevice(deviceId, label = "") {
  try {
    await supabase.rpc("trust_my_device", {
      p_device: String(deviceId || "").trim(),
      p_label: String(label || "").trim(),
    });
  } catch {
    /* the code still got them in */
  }
}

/* Admin turns the code button on or off for the whole shop. The database refuses
   to turn it ON until this address has actually had a code arrive. */
export async function setOtpLogin(enabled, email, byName = "") {
  const { data, error } = await supabase.rpc("set_otp_login", {
    p_enabled: !!enabled,
    p_email: String(email || "").trim().toLowerCase(),
    p_by: String(byName || "").trim(),
  });
  if (error) throw error;
  return data === true;
}

/* ---- A CODE THE FIRST TIME AN ACCOUNT IS USED ON A NEW PHONE ----

   The password still gets you in on a phone the account has used before. On one
   it has never seen, a 6-digit code is emailed and must be typed back. Ten
   minutes, five wrong tries, no override — see supabase/device_otp.sql for why
   there is deliberately no way round it, and why it stays switched off until the
   shop has proved a code can actually arrive. */

/* Does this login need a code? Asked before the password is sent anywhere, so
   the screen knows which way it is going.

   Any failure answers "no". A fault in the check must not be able to shut the
   shop out of its own stock — losing the extra step for one login is a far
   smaller harm than a counter that cannot be opened. */
export async function loginNeedsCode(email, deviceId) {
  try {
    const { data, error } = await supabase.rpc("login_needs_code", {
      p_email: String(email || "").trim().toLowerCase(),
      p_device: String(deviceId || "").trim(),
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/* Prove the password without signing in.

   Run on a throwaway client that never persists a session, for two reasons.
   Nothing is emailed until the password is right, so a stranger typing a known
   address cannot make codes land in somebody's inbox. And the real session is
   never created until the code is typed, so there is no moment where the app is
   open to somebody who has not finished — not even the flicker of one. */
export async function passwordIsRight(email, password) {
  const tmp = createIsolatedClient();
  if (!tmp) throw new Error("Supabase is not configured.");
  const { error } = await tmp.auth.signInWithPassword({
    email: String(email || "").trim().toLowerCase(),
    password,
  });
  if (!error) await tmp.auth.signOut();
  return { ok: !error, error };
}

/* Email a code for a login on a new phone. Same sender as sign-up, but the
   email has to say the right thing: "somebody is signing in on a new phone" is
   the sentence that tells a person their password has been taken. "Somebody is
   creating an account" would not. */
export async function sendLoginCode(email, name = "") {
  return sendEmailCode(email, name, "login");
}

/* Check the code and, in the same call, remember the phone. One database call
   on purpose: trusting the phone separately would leave a gap where the browser
   could add itself to the trusted list without ever proving a code, which is
   the one thing this whole feature exists to prevent. */
export async function verifyLoginCode(email, code, deviceId, label = "") {
  const { data, error } = await supabase.rpc("verify_login_code", {
    p_email: String(email || "").trim().toLowerCase(),
    p_code: String(code || "").trim(),
    p_device: String(deviceId || "").trim(),
    p_label: String(label || "").trim(),
  });
  if (error) throw error;
  return data === true;
}

/* Note that a trusted phone was used just now, so the list an admin reads says
   when each one was really last seen. Nothing depends on it, so a failure is
   swallowed — it must never be the reason a login fails. */
export async function touchDevice(email, deviceId) {
  try {
    await supabase.rpc("touch_device", {
      p_email: String(email || "").trim().toLowerCase(),
      p_device: String(deviceId || "").trim(),
    });
  } catch {
    /* cosmetic only */
  }
}

/* ---- the admin's side of it ---- */

/* Whether the policy is on, and how many accounts it could actually protect.
   The counts matter more than the switch: most accounts on this shop were made
   from a name and have an invented address with no inbox behind it, so a code
   can never reach them. Turning the policy on for those would lock them out for
   good, which is why the screen shows the numbers before the switch. */
export async function deviceOtpStatus() {
  const { data, error } = await supabase.rpc("device_otp_status");
  if (error) throw error;
  return data || {};
}

/* Turn it on or off. The database refuses to turn it ON unless this address has
   proved it can receive a code and this phone is already trusted — otherwise
   the admin's own next login is a locked door and the only person who could
   unlock it is standing outside it. */
export async function setDeviceOtp(enabled, email, deviceId, byName = "") {
  const { data, error } = await supabase.rpc("set_device_otp", {
    p_enabled: !!enabled,
    p_email: String(email || "").trim().toLowerCase(),
    p_device: String(deviceId || "").trim(),
    p_by: String(byName || "").trim(),
  });
  if (error) throw error;
  return data === true;
}

/* The phones my own account has been used on. Scoped to the caller inside the
   database, not by anything passed from here. */
export async function myDevices() {
  const { data, error } = await supabase.rpc("my_devices");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function forgetDevice(deviceId) {
  const { error } = await supabase.rpc("forget_device", {
    p_device: String(deviceId || "").trim(),
  });
  if (error) throw error;
  return true;
}

/* Every account, and whether a code could actually reach it.

   The counts in deviceOtpStatus() say "19 accounts can never receive a code".
   This says WHICH — and without the names there is nothing an admin can act on.
   Admin-only and read-only, decided inside the database, not here: it returns no
   rows at all to anybody else, and there is nothing in it that could change an
   account. Only the person themselves can put a real address on their own login,
   from Settings, which is the way round it has to be — an address nobody can
   read is worse than an invented one everybody knows is invented. */
export async function staffReachability() {
  const { data, error } = await supabase.rpc("staff_reachability");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
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
        options: { data: { full_name: personName || role.label, role: role.key, ...signupShop() } },
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

/* ---------------------------------------------------------
   AN ADDRESS THAT CAN ACTUALLY BE REACHED

   Most accounts on this shop were made from a name, so their login address is
   an invention — josphat.kamau@bypassshop.co, with no inbox anywhere behind it.
   toLoginEmail() above is what makes them, and it had to: Supabase will not
   create an account without an email, and these accounts were created for people
   who did not give one.

   The cost only shows up later, and it shows up badly. A forgotten password
   cannot be reset. The code sign-in cannot be used. The new-phone code cannot
   protect the account, because a code sent there goes nowhere — which is why
   login_needs_code deliberately skips those accounts rather than locking them
   out (see supabase/device_otp.sql).

   So: let the person put a real one on. Nothing else in this system can fix it
   for them — an admin cannot change somebody else's login address from the
   browser, and should not be able to.
--------------------------------------------------------- */

/* An address with nothing behind it. The domain is the tell: it is the one
   toLoginEmail invents, and it has never had a mail server. */
export function isInventedEmail(email) {
  return /@bypassshop\.co$/i.test(String(email || "").trim());
}

/* Put a real address on this account.

   Supabase does NOT change it here and now — it emails a confirmation link to
   the new address, and the change only happens when that link is opened. That
   is the right way round: it means an address can never be set to one the person
   cannot actually read, which is the entire failure being fixed.

   Returns the address the link went to, so the screen can name it. */
export async function changeMyEmail(newEmail) {
  const email = String(newEmail || "").trim().toLowerCase();
  if (!email.includes("@") || !/\.[a-z]{2,}$/i.test(email)) {
    throw new Error("That does not look like an email address.");
  }
  if (isInventedEmail(email)) {
    throw new Error(
      "That is one of the shop's made-up addresses — no mail can reach it. " +
      "Use a real one, like a Gmail address."
    );
  }
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
  return email;
}
