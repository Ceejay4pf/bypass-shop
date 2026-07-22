// Supabase Edge Function: emails the shop owner whenever a staff member logs in.
// Deploy:  supabase functions deploy notify-login
// Secrets: supabase secrets set RESEND_API_KEY=... OWNER_EMAIL=addamsjmk@gmail.com
//
// Uses Resend (https://resend.com) — free tier is plenty for login alerts.
// The app calls this via supabase.functions.invoke("notify-login", { body }).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "addamsjmk@gmail.com";
// Until you verify your own domain in Resend, use their shared sender.
const FROM = Deno.env.get("ALERT_FROM") ?? "Bypass Shop <onboarding@resend.dev>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { who, at } = await req.json();
    const when = at ? new Date(at).toLocaleString("en-KE") : new Date().toLocaleString("en-KE");

    if (!RESEND_API_KEY) {
      // No key set yet — succeed quietly so the app's in-app log still works.
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
        subject: `Bypass Shop — ${who} just logged in`,
        html: `<div style="font-family:system-ui,sans-serif">
          <h2 style="color:#2563EB;margin:0 0 8px">Bypass Shop — Login Alert</h2>
          <p><strong>${who}</strong> signed in to the system.</p>
          <p style="color:#5A6472">Time: ${when}</p>
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
