// Supabase Edge Function: emails a 6-digit code to somebody signing up, so
// the shop knows the address they typed is really theirs.
//
// WHY THIS RUNS ON THE SERVER AND NOT IN THE APP
// The code is created by issue_email_code(), which anon is not allowed to
// call. Only this function holds the service_role key, so only this function
// can mint a code - and it never returns the code to the browser, it only
// puts it in the email. That is the whole point: a person can only learn the
// code by opening the inbox they claimed.
//
// Deploy:  supabase functions deploy send-signup-code --no-verify-jwt
// Secrets: RESEND_API_KEY, ALERT_FROM  (shared with notify-admin)
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (injected automatically)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("ALERT_FROM") ?? "Bypass Shop <onboarding@resend.dev>";
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email, name } = await req.json();
    const to = String(email || "").trim().toLowerCase();

    if (!to.includes("@") || !to.includes(".")) {
      return json({ ok: false, error: "That does not look like an email address." }, 400);
    }
    if (!SERVICE_KEY || !RESEND_API_KEY) {
      // Say which piece is missing rather than a blank failure - this is the
      // difference between "I mistyped my email" and "the shop isn't set up".
      return json({ ok: false, error: "Email sending is not set up yet.", setup: true }, 503);
    }

    // 1) Mint the code in the database. Rate limits and expiry live there.
    const mint = await fetch(`${SB_URL}/rest/v1/rpc/issue_email_code`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_email: to }),
    });
    const code = await mint.json();
    if (!mint.ok) {
      // The database raises a readable message for "too many codes"; pass it
      // straight through so the person knows to wait rather than retrying.
      return json({ ok: false, error: code?.message || "Could not create a code." }, 429);
    }

    // 2) Email it. The code is in the body only - never in the response.
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `${code} is your Bypass Shop code`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
          <h2 style="color:#2563EB;margin:0 0 4px">Bypass Shop</h2>
          <p style="font-size:15px;margin:0 0 18px">
            ${name ? `Hello ${name}, s` : "S"}omebody is creating a staff account
            with this email address. Type this code into the app to finish:
          </p>
          <p style="font-size:34px;font-weight:800;letter-spacing:7px;
                    font-family:ui-monospace,monospace;color:#0B1524;margin:0">
            ${String(code)}
          </p>
          <p style="color:#5A6472;font-size:13px;margin:14px 0 0">
            The code stops working in 15 minutes.
            If this wasn't you, ignore this email - no account is created
            until the code is entered.
          </p>
          <hr style="border:none;border-top:1px solid #DEE3E9;margin:18px 0 8px"/>
          <p style="color:#5A6472;font-size:12px;margin:0">Jaspare Auto - Main Shop</p>
        </div>`,
      }),
    });

    const body = await send.json();
    if (!send.ok) {
      // Resend refuses to email anyone but the account owner until a domain
      // is verified. That is a shop-setup problem, not the person's mistake,
      // so it gets its own flag and its own wording in the app.
      const msg = String(body?.message || "");
      const ownerOnly = send.status === 403 && /your own email address/i.test(msg);
      return json(
        {
          ok: false,
          setup: ownerOnly,
          error: ownerOnly
            ? "This shop cannot email codes yet. Verify a domain at resend.com/domains."
            : msg || "The code could not be emailed.",
        },
        ownerOnly ? 503 : 500,
      );
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
