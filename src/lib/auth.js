/* ---------------------------------------------------------
   Auth — real login backed by Supabase Auth.
   Each staff member gets their own email/password account,
   so "who did what" is authenticated, not self-reported.
--------------------------------------------------------- */
import { supabase } from "./supabase.js";

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
