/* ---------------------------------------------------------
   DARAJA — the fiddly parts, in one file with no Deno in it

   Safaricom's M-Pesa API rejects a request for reasons it does not explain well.
   Three of them are computed, not typed, and all three have bitten every person
   who has ever integrated this:

     1. The timestamp must be NAIROBI wall-clock time. The server runs in UTC.
        Three hours out and the password no longer matches the timestamp, and the
        error you get back talks about the password.
     2. The password is base64(shortcode + passkey + timestamp) — the SAME
        timestamp that is sent alongside it, to the second.
     3. The phone number must be 2547XXXXXXXX. A number the cashier typed as
        0712345678 or +254 712 345 678 is rejected as "invalid".

   So they live here, as plain JavaScript with no Deno API in it, which means
   node can import this file and check them. `btoa` is a global in both Deno and
   node 18+, so base64 needs nothing platform-specific.

   THIS FILE IS THE AUTHORITY ON THE PHONE NUMBER. src/lib/mpesa.js checks it too,
   so the cashier is told about a bad number without waiting for a round trip, but
   that copy is a courtesy and this one is the rule. A server that trusts the
   browser's validation has no validation.
--------------------------------------------------------- */

/* Nairobi is UTC+3 all year — Kenya has no daylight saving, which is the one
   mercy in this API. Shifted, then read with the UTC getters, so the result is
   Nairobi's wall clock whatever the server thinks the time is. */
export function eatTimestamp(ms) {
  const d = new Date(ms + 3 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    String(d.getUTCFullYear()) +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
}

export function stkPassword(shortcode, passkey, timestamp) {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

export function basicAuth(key, secret) {
  return `Basic ${btoa(`${key}:${secret}`)}`;
}

/* Sandbox and production differ only in the hostname, so the whole switch is one
   string. Named the way Safaricom's own portal names the two. */
export function darajaBase(env) {
  return String(env).toLowerCase() === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

/* ---------------------------------------------------------
   THE PHONE NUMBER

   Everything a Kenyan counter actually types, turned into the one form Daraja
   accepts. 07xx and 01xx are both Safaricom-era mobile prefixes; 011x exists and
   refusing it would refuse real customers.

   Returns { msisdn } or { error } — a sentence, not a code, because it goes on a
   screen in front of a customer waiting to pay.
--------------------------------------------------------- */
export function normaliseMsisdn(raw) {
  /* Spaces, dashes and brackets are how people write phone numbers down; none of
     them are part of the number. A leading + is, until it is turned into 254. */
  const digits = String(raw == null ? "" : raw).replace(/[^\d]/g, "");
  if (!digits) return { error: "No phone number was given." };

  let n = digits;
  if (n.startsWith("254")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);

  /* What is left must be nine digits starting 7 or 1 — 712345678, 112345678. A
     number with the country code typed twice, a landline, or a digit missing all
     land here, and all of them would come back from Safaricom as "invalid" with
     nothing said about which part was wrong. */
  if (!/^[71]\d{8}$/.test(n)) {
    return {
      error: `${raw} is not a Kenyan mobile number. It should be ten digits starting 07 or 01.`,
    };
  }
  return { msisdn: `254${n}` };
}

/* ---------------------------------------------------------
   WHAT SAFARICOM'S ANSWER MEANS

   ResultCode arrives on the callback and on the status query, and it is the only
   thing that says what happened. Everything except 0 is a failure, but they are
   very different failures and the cashier's next move depends on which:
   "cancelled" means ask them to try again, "wrong PIN" means hand the phone back,
   "timeout" means the phone never even rang.
--------------------------------------------------------- */
const RESULTS = {
  0:    ["paid",      "Paid."],
  1:    ["failed",    "Not enough M-Pesa balance."],
  1001: ["failed",    "They have another M-Pesa transaction open. Finish or cancel it, then try again."],
  1019: ["timeout",   "The request expired before it was answered."],
  1032: ["cancelled", "They cancelled it on their phone."],
  1037: ["timeout",   "No answer — the phone was off, out of network, or the prompt was ignored."],
  2001: ["failed",    "Wrong M-Pesa PIN."],
};

export function statusFor(resultCode, resultDesc = "") {
  const code = Number(resultCode);
  const hit = RESULTS[code];
  if (hit) return { status: hit[0], detail: hit[1] };
  /* Unknown code. NOT treated as paid — an unrecognised answer is the one case
     where guessing costs the shop a part it never got money for. */
  return {
    status: code === 0 ? "paid" : "failed",
    detail: String(resultDesc || `M-Pesa returned code ${resultCode}.`),
  };
}

/* The metadata on a successful callback is a list of name/value pairs rather than
   an object, and the order is not promised. */
export function callbackMeta(items) {
  const out = {};
  for (const it of Array.isArray(items) ? items : []) {
    if (it && it.Name != null) out[String(it.Name)] = it.Value;
  }
  return out;
}
