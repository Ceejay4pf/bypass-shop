// Supabase Edge Function: ask a customer's phone for money, and ask what happened.
//
//   { action: "send",  shopId, phone, amount, forCode, forCustomer, by, ref }
//        -> Safaricom pushes a PIN prompt to that phone, and a row is written
//   { action: "check", checkoutRequestId }
//        -> asks Safaricom what became of that prompt, and writes the answer
//
// WHY THE KEYS ARE HERE AND NOWHERE ELSE
// The consumer key, the consumer secret and the passkey are three strings that let
// anybody bill customers in this shop's name. Nothing in a VITE_ variable can hold
// them, because every VITE_ variable is compiled into the JavaScript the site
// hands to every visitor — "hidden" there means published. They are Supabase
// secrets, read by this function on the server, and the browser only ever sees a
// phone number and an amount it already knew.
//
// WHY "check" EXISTS AT ALL, GIVEN THERE IS A CALLBACK
// The callback URL has to be reachable by Safaricom, which means it is reachable
// by anybody, and it carries no signature that proves who sent it. So a POST
// saying "paid" is a claim, not a fact. This action is the fact: the shop's own
// server asking Safaricom's server, authenticated, and it is what the counter's
// Paid light is wired to. The callback is a nudge that makes the answer arrive
// sooner; it is never the only thing consulted before a part leaves the shop.
//
// Deploy:  supabase functions deploy mpesa-stk
//          (JWT verification ON — only signed-in staff may prompt a customer)
//
// Secrets: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET
//          MPESA_SHORTCODE   (sandbox: 174379)
//          MPESA_PASSKEY     (sandbox: Safaricom's published test passkey)
//          MPESA_ENV         sandbox | production      (default sandbox)
//          MPESA_TX_TYPE     CustomerPayBillOnline | CustomerBuyGoodsOnline
//          MPESA_CALLBACK_URL    (default: this project's mpesa-callback)
//          MPESA_CALLBACK_TOKEN  (optional; see mpesa-callback)
//          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  eatTimestamp, stkPassword, basicAuth, darajaBase,
  normaliseMsisdn, statusFor,
} from "../_shared/daraja.js";

const KEY     = Deno.env.get("MPESA_CONSUMER_KEY") ?? "";
const SECRET  = Deno.env.get("MPESA_CONSUMER_SECRET") ?? "";
const ENV     = Deno.env.get("MPESA_ENV") ?? "sandbox";
/* Safaricom's own sandbox shortcode and passkey. Published in their documentation
   for everybody who tests against the sandbox — they are not this shop's secrets
   and they cannot move real money. Defaulted so a first test needs two secrets set
   rather than four; going live means setting all four to the shop's own. */
const SHORTCODE = Deno.env.get("MPESA_SHORTCODE") ?? "174379";
const PASSKEY   = Deno.env.get("MPESA_PASSKEY")
  ?? "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
/* Paybill or Till. Getting this wrong is not a crash — Safaricom accepts the push
   and the money goes to the wrong kind of account, so it is a setting and not a
   guess. Sandbox 174379 is a Paybill. */
const TX_TYPE = Deno.env.get("MPESA_TX_TYPE") ?? "CustomerPayBillOnline";

const SB_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CB_TOKEN = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? "";
const CALLBACK = Deno.env.get("MPESA_CALLBACK_URL")
  ?? `${SB_URL}/functions/v1/mpesa-callback${CB_TOKEN ? `?t=${encodeURIComponent(CB_TOKEN)}` : ""}`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* One sentence, fit to put on a screen in front of a waiting customer. `setup`
   means the shop has not finished configuring this, which is a different problem
   from a payment that failed and the app says so differently. */
const fail = (error: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, error, ...extra });

const base = darajaBase(ENV);

/* An access token is good for an hour. Instances are short-lived, so this saves a
   round trip on a busy counter rather than being a real cache. */
let cachedToken = "";
let cachedUntil = 0;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;
  const r = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: basicAuth(KEY, SECRET) },
  });
  const body = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(body); } catch { /* Safaricom sometimes answers HTML */ }
  if (!r.ok || !parsed.access_token) {
    /* The commonest cause by a mile is a key/secret pair from the wrong app, or
       from the production app while MPESA_ENV still says sandbox. */
    throw new Error(
      `M-Pesa refused the shop's credentials (${r.status}). Check MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET, and that they belong to the ${ENV} app.`
    );
  }
  cachedToken = parsed.access_token;
  /* Expires in 3599 seconds. Retired a minute early so a token is never used in
     the second it dies. */
  cachedUntil = Date.now() + (Number(parsed.expires_in || 3599) - 60) * 1000;
  return cachedToken;
}

async function daraja(path: string, payload: unknown) {
  const token = await accessToken();
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: r.status, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!KEY || !SECRET) {
    return fail(
      "M-Pesa is not set up on this system yet. The shop's Daraja key and secret have to be stored as Supabase secrets first.",
      { setup: true }
    );
  }
  if (!SERVICE_KEY || !SB_URL) {
    return fail("This function is missing its Supabase connection. Redeploy it.", { setup: true });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* handled by the action switch below */ }
  const action = String(body.action || "").toLowerCase();

  /* Two clients, and the difference matters. `authed` acts as the cashier, so row
     level security decides what they may see — that is what stops one shop's
     counter reading another shop's customer phone numbers. `admin` acts as the
     system, and is used only to write the row and the result, which staff are not
     allowed to write themselves. */
  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(SB_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SB_URL, SERVICE_KEY);

  const { data: userRes } = await authed.auth.getUser();
  const user = userRes?.user;
  if (!user) return fail("Sign in again — this session has expired.");

  // -----------------------------------------------------------------
  if (action === "send") {
    const phone = normaliseMsisdn(body.phone);
    if (phone.error) return fail(phone.error);

    const asked = Number(body.amount);
    if (!isFinite(asked) || asked <= 0) return fail("Enter the amount to collect.");
    const amount = Math.round(asked);
    if (amount < 1) return fail("M-Pesa cannot collect less than one shilling.");
    if (amount > 250000) return fail("M-Pesa will not take more than KES 250,000 in one go.");

    const shopId = String(body.shopId || "").trim() || null;

    /* MEMBERSHIP FIRST, BEFORE A CUSTOMER'S PHONE RINGS.
       my_shop_ids() is the same helper every policy in supabase/multishop/ is
       built on, and it answers for whoever is calling it — so this is the
       cashier's own membership, not a claim in the request body. Checked before
       Safaricom is touched: a prompt sent for the wrong shop cannot be recalled,
       and the customer would be paying a business they are not standing in. */
    const { data: mine, error: mineErr } = await authed.rpc("my_shop_ids");
    if (!mineErr) {
      const ids = (Array.isArray(mine) ? mine : []).map((x: any) => String(x?.my_shop_ids ?? x));
      if (!shopId || !ids.includes(shopId)) {
        return fail("You are not signed in to that shop, so a payment cannot be collected for it.");
      }
    }
    /* mineErr means the helper is not there — a database with one shop, where
       there is no other shop to collect for. */

    const timestamp = eatTimestamp(Date.now());
    /* 12 characters is Daraja's limit on AccountReference and it is what the
       customer reads on their SMS, so it says the shop, not an id. */
    const ref = String(body.ref || "BYPASSSHOP").replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "BYPASSSHOP";

    const { status, body: res } = await daraja("/mpesa/stkpush/v1/processrequest", {
      BusinessShortCode: SHORTCODE,
      Password: stkPassword(SHORTCODE, PASSKEY, timestamp),
      Timestamp: timestamp,
      TransactionType: TX_TYPE,
      Amount: amount,
      PartyA: phone.msisdn,
      PartyB: SHORTCODE,
      PhoneNumber: phone.msisdn,
      CallBackURL: CALLBACK,
      AccountReference: ref,
      TransactionDesc: "Spare parts",
    });

    const checkoutId = String(res.CheckoutRequestID || "");
    if (status !== 200 || String(res.ResponseCode) !== "0" || !checkoutId) {
      /* Safaricom's own wording where there is any, because it is more specific
         than anything that could be written here — "invalid Amount", "Merchant
         does not exist", "wrong credentials". */
      return fail(
        String(res.errorMessage || res.ResponseDescription || res.CustomerMessage || "")
          || `M-Pesa would not accept the request (${status}).`
      );
    }

    /* Written with the service key, not the cashier's. The prompt is ALREADY on
       the customer's phone by this line — a record that failed to save because of
       a policy would leave money moving with nothing in the shop's books about
       it, and an unrecorded payment is a worse fault than a permissive insert.
       Membership was checked above, before anything was sent. */
    const { error: insErr } = await admin.from("mpesa_payments").insert({
      shop_id: shopId,
      checkout_request_id: checkoutId,
      merchant_request_id: String(res.MerchantRequestID || "") || null,
      phone: phone.msisdn,
      amount,
      account_ref: ref,
      for_code: String(body.forCode || "").trim() || null,
      for_customer: String(body.forCustomer || "").trim() || null,
      status: "sent",
      requested_by: String(body.by || "").trim() || user.email || null,
      env: ENV,
    });
    if (insErr) console.error("mpesa row not saved", checkoutId, insErr);

    return json({
      ok: true,
      checkoutRequestId: checkoutId,
      amount,
      phone: phone.msisdn,
      /* Safaricom's line is written for the customer — "Success. Request accepted
         for processing" — so the app writes its own for the cashier. */
      message: res.CustomerMessage || "The prompt is on their phone.",
      saved: !insErr,
    });
  }

  // -----------------------------------------------------------------
  if (action === "check") {
    const checkoutId = String(body.checkoutRequestId || "").trim();
    if (!checkoutId) return fail("Nothing to check.");

    /* Read as the cashier. If row level security will not show it to them, they
       have no business asking about it — this is what keeps a signed-in account
       from polling another shop's prompts by guessing an id. */
    const { data: row } = await authed
      .from("mpesa_payments")
      .select("status,amount,mpesa_receipt,result_desc,result_code,phone")
      .eq("checkout_request_id", checkoutId)
      .maybeSingle();
    if (!row) return fail("That prompt is not on this shop's records.");
    if (row.status === "paid") return json({ ok: true, ...row, status: "paid" });

    const timestamp = eatTimestamp(Date.now());
    const { status, body: res } = await daraja("/mpesa/stkpushquery/v1/query", {
      BusinessShortCode: SHORTCODE,
      Password: stkPassword(SHORTCODE, PASSKEY, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutId,
    });

    /* Still on the phone. Safaricom reports this as an ERROR rather than a status,
       with the code below, and treating it as a failure would tell the cashier the
       payment had failed while the customer was still typing their PIN. */
    const pending =
      String(res.errorCode || "") === "500.001.1001" ||
      /being processed|is under process/i.test(String(res.errorMessage || ""));
    if (pending) {
      return json({ ok: true, status: "sent", amount: row.amount, pending: true });
    }
    if (status !== 200 && res.ResultCode == null) {
      /* Could not get an answer. NOT recorded as a failure: the shop does not know
         what happened, and writing 'failed' would be a claim it cannot support. */
      return json({
        ok: true, status: row.status, amount: row.amount, unreachable: true,
        error: String(res.errorMessage || `Could not reach M-Pesa (${status}).`),
      });
    }

    const mapped = statusFor(res.ResultCode, res.ResultDesc);
    const { data: wrote } = await admin.rpc("mpesa_result", {
      p_checkout_id: checkoutId,
      p_result_code: Number(res.ResultCode),
      p_result_desc: mapped.detail,
      p_receipt: null,          // the query never returns the receipt; the callback does
      p_amount: null,
      p_status: mapped.status,
    });

    /* 'already-paid' means the callback beat this query to it, which is the happy
       case and must read as paid rather than as whatever this query just saw. */
    const finalStatus = wrote === "already-paid" ? "paid" : mapped.status;
    const { data: fresh } = await authed
      .from("mpesa_payments")
      .select("status,amount,mpesa_receipt,result_desc,result_code,phone")
      .eq("checkout_request_id", checkoutId)
      .maybeSingle();

    return json({ ok: true, ...(fresh || {}), status: fresh?.status || finalStatus });
  }

  return fail('Unknown action. Use "send" or "check".');
});
