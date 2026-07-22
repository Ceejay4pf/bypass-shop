// Supabase Edge Function: emails the shop owner about key inventory events
// (new item added, stock sold/deducted, etc.). Generic: the app passes a
// subject + message, this just delivers it.
//
// Deploy:  supabase functions deploy notify-admin --no-verify-jwt
// Reuses the same RESEND_API_KEY / OWNER_EMAIL secrets as notify-login.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "charles.mbuguajmk@gmail.com";
const FROM = Deno.env.get("ALERT_FROM") ?? "Bypass Shop <onboarding@resend.dev>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { subject, message, who } = await req.json();
    const safeSubject = subject || "Bypass Shop — inventory update";

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: true, skipped: "no RESEND_API_KEY" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [OWNER_EMAIL],
        subject: safeSubject,
        html: `<div style="font-family:system-ui,sans-serif">
          <h2 style="color:#2563EB;margin:0 0 8px">Bypass Shop</h2>
          <p style="font-size:15px">${message || safeSubject}</p>
          ${who ? `<p style="color:#5A6472">By: ${who}</p>` : ""}
          <hr style="border:none;border-top:1px solid #DEE3E9"/>
          <p style="color:#5A6472;font-size:12px">Jaspare Auto · Main Shop</p>
        </div>`,
      }),
    });

    const body = await res.json();
    return new Response(JSON.stringify({ ok: res.ok, body }), {
      status: res.ok ? 200 : 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
