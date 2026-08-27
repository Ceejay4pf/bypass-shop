// Supabase Edge Function: where Safaricom reports what the customer did.
//
// Safaricom POSTs here once a prompt is answered, cancelled, or times out. It is
// the reason the counter's screen changes to "received" a second after the
// customer types their PIN instead of when somebody remembers to press Check.
//
// THIS URL IS PUBLIC AND CANNOT BE OTHERWISE.
// Safaricom's servers call it, and they send no Authorization header, no signature
// and nothing else that proves the call came from them. So anybody who learns the
// address can POST to it. Four things make that harmless rather than a way to walk
// out with a free gearbox:
//
//   1. IT CANNOT CREATE A PAYMENT. mpesa_result() only ever updates a row that
//      already exists, matched on a CheckoutRequestID that Safaricom itself
//      generated and that only this shop's own send request has ever seen. A POST
//      quoting anything else changes nothing and is answered exactly the same way,
//      so it does not even reveal which ids are real.
//   2. IT CANNOT UN-PAY. A row that is paid stays paid, so a late or forged
//      failure cannot reverse a real payment.
//   3. IT IS NOT WHAT THE TILL BELIEVES. The counter's Paid light is wired to
//      mpesa-stk's "check" action, which asks Safaricom directly, authenticated.
//      This function makes the right answer arrive sooner; it is not the authority
//      for it.
//   4. AN OPTIONAL SHARED TOKEN. Set MPESA_CALLBACK_TOKEN and the URL registered
//      with Safaricom carries ?t=..., which this function then requires. Worth
//      doing, and still not relied on as the only defence — a token in a URL is a
//      token in every log the request passes through.
//
// It ALWAYS answers 200 with ResultCode 0, even when it did nothing. Safaricom
// retries anything else, and a retry loop over a message that will never be
// accepted is noise for days.
//
// Deploy:  supabase functions deploy mpesa-callback --no-verify-jwt
//          The --no-verify-jwt is required, not a shortcut: Safaricom has no JWT.
//
// Secrets: MPESA_CALLBACK_TOKEN (optional)
//          SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { statusFor, callbackMeta } from "../_shared/daraja.js";

const SB_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CB_TOKEN    = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? "";

/* What Safaricom wants to hear. Anything else and it comes back. */
const accepted = () =>
  new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  /* Read the body before anything else, so it can be logged whatever happens next.
     A callback that was rejected and not logged is a payment nobody can trace. */
  let raw = "";
  try { raw = await req.text(); } catch { /* nothing to read */ }

  if (CB_TOKEN) {
    const t = new URL(req.url).searchParams.get("t") ?? "";
    if (t !== CB_TOKEN) {
      console.warn("mpesa-callback: bad or missing token");
      /* Still 200. A 401 tells whoever is probing that the token is the thing to
         guess, and Safaricom would retry a 401 for days if the token were ever
         changed without updating the registered URL. */
      return accepted();
    }
  }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch {
    console.warn("mpesa-callback: body was not JSON", raw.slice(0, 400));
    return accepted();
  }

  const cb = payload?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) {
    console.warn("mpesa-callback: no stkCallback in body", raw.slice(0, 400));
    return accepted();
  }

  const meta = callbackMeta(cb?.CallbackMetadata?.Item);
  const mapped = statusFor(cb.ResultCode, cb.ResultDesc);

  if (!SB_URL || !SERVICE_KEY) {
    console.error("mpesa-callback: no Supabase connection; result dropped", cb.CheckoutRequestID);
    return accepted();
  }

  const admin = createClient(SB_URL, SERVICE_KEY);
  const { data, error } = await admin.rpc("mpesa_result", {
    p_checkout_id: String(cb.CheckoutRequestID),
    p_result_code: Number(cb.ResultCode),
    p_result_desc: mapped.detail,
    p_receipt: meta.MpesaReceiptNumber ? String(meta.MpesaReceiptNumber) : null,
    /* What Safaricom says was paid, recorded ALONGSIDE what the customer was asked
       for and never over it. If a callback ever reports a different figure, the
       shop needs to be able to see both rather than have the request quietly
       rewritten to agree with the answer. */
    p_amount: meta.Amount != null ? Number(meta.Amount) : null,
    p_status: mapped.status,
  });

  if (error) console.error("mpesa-callback: mpesa_result failed", cb.CheckoutRequestID, error);
  /* 'unknown' is the interesting one to log: a result for a prompt this database
     has no record of. Either a forged POST, or — the case worth knowing about — a
     prompt whose row failed to save in mpesa-stk. */
  else console.log("mpesa-callback", cb.CheckoutRequestID, cb.ResultCode, "->", data);

  return accepted();
});
