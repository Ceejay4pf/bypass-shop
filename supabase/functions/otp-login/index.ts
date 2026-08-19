// Supabase Edge Function: sign in with an emailed code instead of a password.
//
// Two actions, one function, because they are two halves of one thing and the
// second is meaningless without the first:
//
//   { action: "send",   email, name }   -> mints a 6-digit code and emails it
//   { action: "verify", email, code }   -> checks the code, hands back a
//                                          one-time token the app swaps for a
//                                          real session
//
// WHY THE SESSION IS MINTED HERE AND NOT IN THE APP
// A checked code is not a session. Only Supabase Auth can issue one, and only
// the service key can ask Auth to. If the app could do it, then "I typed the
// right code" would be a claim made by the same browser that wants to get in --
// which is no claim at all. So this function checks the code ITSELF, against the
// database, and only then asks Auth for a token.
//
// The code never leaves this function except inside the email. consume_login_code
// destroys it on success, so one code buys exactly one session.
//
// Deploy:  supabase functions deploy otp-login --no-verify-jwt
// Secrets: BREVO_API_KEY  (preferred - see below)  or  RESEND_API_KEY
//          ALERT_FROM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// WHY TWO SENDERS
// Resend refuses to email anybody except the account owner until a whole DOMAIN
// is verified in DNS, which this shop does not have. Brevo instead verifies a
// SINGLE sender address -- you click a link in your own inbox -- and then sends
// to anyone, free. So Brevo is tried first and Resend is the fallback, and the
// shop can start emailing every member of staff without owning a domain.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("ALERT_FROM") ?? "Bypass Shop <onboarding@resend.dev>";
/* The two senders cannot share a from-address, and getting this wrong breaks
   something that currently works.

   Brevo will only send from an address it has verified (the shop's own Gmail).
   Resend will only send from a domain it has verified, which the shop does not
   have, so it uses onboarding@resend.dev. Point ALERT_FROM at the Gmail and
   Resend starts refusing the admin-notification emails it sends today. So Brevo
   gets its own setting, and falls back to ALERT_FROM only if it has none. */
const BREVO_FROM = Deno.env.get("BREVO_FROM") ?? FROM;
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// "Bypass Shop <no-reply@x.co>" -> { name, email }, because Brevo wants the two
// apart and Resend wants them together, and the shop configures it once.
function splitFrom(raw: string) {
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1] || "Bypass Shop", email: m[2] };
  return { name: "Bypass Shop", email: raw.trim() };
}

const rpc = (fn: string, body: unknown) =>
  fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

function codeEmail(code: string, name: string) {
  return `<div style="font-family:system-ui,sans-serif;max-width:420px">
    <h2 style="color:#2563EB;margin:0 0 4px">Bypass Shop</h2>
    <p style="font-size:15px;margin:0 0 18px">
      ${name ? `Hello ${name}, t` : "T"}ype this code into the app to sign in.
      You will not need your password.
    </p>
    <p style="font-size:34px;font-weight:800;letter-spacing:7px;
              font-family:ui-monospace,monospace;color:#0B1524;margin:0">${code}</p>
    <p style="color:#5A6472;font-size:13px;margin:14px 0 0">
      The code stops working in 10 minutes, and only works once.
      <strong style="color:#B42318">If you did not ask to sign in, do not type this code
      anywhere</strong> - somebody else knows your email address.
    </p>
    <hr style="border:none;border-top:1px solid #DEE3E9;margin:18px 0 8px"/>
    <p style="color:#5A6472;font-size:12px;margin:0">Jaspare Auto - Main Shop</p>
  </div>`;
}

// Returns { ok, via, error, setup }. `setup` means the SHOP is not configured -
// nothing the person standing at the counter typed is wrong, and no amount of
// retrying will help, so the app must say so rather than "try again".
async function sendMail(to: string, subject: string, html: string) {
  const from = splitFrom(BREVO_FROM);
  /* Kept so that if BOTH senders refuse, the message names the one the shop is
     actually trying to use. Telling an admin to "add a BREVO_API_KEY" when they
     have already added one sends them looking in the wrong place. */
  let brevoFailed = "";

  if (BREVO_API_KEY) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: from,
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (r.ok) return { ok: true, via: "brevo" };
    const b = await r.json().catch(() => ({}));
    const msg = String(b?.message || b?.code || `Brevo said ${r.status}`);
    // A sender Brevo has not verified is a setup problem, not a typo.
    const senderBad = /sender|not valid|unrecognised|unrecognized/i.test(msg);
    brevoFailed = senderBad
      ? `Brevo has not verified the sender address ${from.email}. Add it under Senders, Domains & Dedicated IPs and click the link Brevo emails you.`
      : `Brevo would not send: ${msg}`;
    if (!RESEND_API_KEY) {
      return { ok: false, via: "brevo", setup: senderBad, error: brevoFailed };
    }
    // fall through and try Resend rather than failing outright
  }

  if (!RESEND_API_KEY) {
    return { ok: false, setup: true, error: "No email sender is set up for this shop yet." };
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (r.ok) return { ok: true, via: "resend" };

  const b = await r.json().catch(() => ({}));
  const msg = String(b?.message || "");
  const ownerOnly = r.status === 403 && /your own email address/i.test(msg);
  return {
    ok: false,
    via: "resend",
    setup: ownerOnly,
    error: ownerOnly
      ? (brevoFailed
          /* Brevo is the sender the shop chose; Resend is only the fallback. So
             the useful sentence is the one about Brevo, not the one about a
             domain the shop was never going to buy. */
          ? brevoFailed
          : "This shop can only email the Resend account owner so far. Add a BREVO_API_KEY (free, verifies one sender address, no domain needed) so codes can reach everybody.")
      : msg || "The code could not be emailed.",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { action, email, code, name } = await req.json();
    const to = String(email || "").trim().toLowerCase();

    if (!to.includes("@") || !to.includes(".")) {
      return json({ ok: false, error: "That does not look like an email address." }, 400);
    }
    if (!SERVICE_KEY || !SB_URL) {
      return json({ ok: false, setup: true, error: "This shop is not set up to email codes yet." }, 503);
    }

    // ---------------- send a code ----------------
    if (action === "send") {
      /* An address the shop invented for itself has no inbox anywhere in the
         world. Brevo will happily ACCEPT the send and the message then vanishes,
         which is the worst possible outcome: the app says "code sent", the person
         waits, and nothing is ever wrong enough to show them.

         The login screen already hides the button for these, but a hidden button
         is not a closed route - anything can call this function. So it is refused
         here too, in words that say what to do instead. */
      if (/@bypassshop\.co$/i.test(to)) {
        return json(
          {
            ok: false,
            error:
              "That address was invented from a name when the account was made, so no email can reach it. Sign in with the password instead, or ask the admin to put your real email on the account.",
          },
          400,
        );
      }

      // Check the account exists BEFORE minting, so a stranger tapping the
      // button cannot make the shop send mail to an address of their choosing.
      const ex = await rpc("account_exists", { p_email: to });
      if (!ex.ok) return json({ ok: false, error: "Could not check that account." }, 500);
      if ((await ex.json()) !== true) {
        // Said plainly. This is a shop's own staff login, not a public service:
        // a storekeeper who mistyped their address is far more likely than
        // somebody fishing for the names of four people they could ask anyway.
        return json({ ok: false, error: "No account uses that email address." }, 404);
      }

      const mint = await rpc("issue_email_code", { p_email: to });
      const minted = await mint.json();
      if (!mint.ok) {
        return json({ ok: false, error: minted?.message || "Could not create a code." }, 429);
      }

      const sent = await sendMail(
        to,
        `${minted} — your Bypass Shop sign-in code`,
        codeEmail(String(minted), String(name || "")),
      );
      if (!sent.ok) return json(sent, sent.setup ? 503 : 500);
      return json({ ok: true, via: sent.via });
    }

    // ---------------- swap a code for a session ----------------
    if (action === "verify") {
      const typed = String(code || "").trim();
      if (!/^\d{4,8}$/.test(typed)) {
        return json({ ok: false, error: "Type the 6-digit code from the email." }, 400);
      }

      const chk = await rpc("consume_login_code", { p_email: to, p_code: typed });
      const res = await chk.json();
      if (!chk.ok) {
        // The database raises a readable message after five wrong tries.
        return json({ ok: false, error: res?.message || "Could not check the code." }, 400);
      }
      if (res !== true) {
        return json({ ok: false, error: "That code is wrong or has expired." }, 400);
      }

      // The code was right. Ask Auth for a one-time token. generate_link does
      // NOT email anything - it only returns the token - which is exactly what
      // is wanted here, because the person is already holding the app.
      const link = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "magiclink", email: to }),
      });
      const lb = await link.json().catch(() => ({}));
      const hash = lb?.hashed_token || lb?.properties?.hashed_token;
      if (!link.ok || !hash) {
        return json(
          { ok: false, error: lb?.msg || lb?.message || "The code was right but signing in failed." },
          500,
        );
      }

      return json({ ok: true, token_hash: hash, email: to });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
