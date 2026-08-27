/* ---------------------------------------------------------
   THE M-PESA PROMPT, AT THE COUNTER

   What this is: the cashier types the customer's number, presses one button, and
   the customer's own phone asks them for their M-Pesa PIN. No till number read
   out loud, no waiting for an SMS to be shown across the counter, no typing the
   amount wrongly.

   WHAT THIS FILE IS AND IS NOT. It is the decisions the browser is allowed to
   make: which shops have a till, whether that phone number could possibly be a
   Kenyan mobile, whether that amount could possibly be sent, and what to put on
   screen for each answer that comes back. No key, no secret and no till number is
   in here or anywhere else the browser can reach — everything that needs those
   happens in supabase/functions/mpesa-stk. Anything in a VITE_ variable is
   readable by every person who opens the site.

   IT DOES NOT DECIDE WHETHER MONEY ARRIVED. Nothing here does. That answer comes
   from asking Safaricom, in the edge function, and it is written by the database
   and read back — see src/lib/api.js.
--------------------------------------------------------- */

/* ---------------------------------------------------------
   WHICH SHOPS

   One till number belongs to one business. Sure Fit and Jeyden are separate
   businesses with their own M-Pesa, and pushing THIS prompt from their counter
   would ask their customer to pay Bypass Shop — the money would arrive, in the
   wrong company's account, with a receipt in the wrong company's name. That is
   not a missing feature, it is a wrong one, so the button only exists where the
   till behind it is that shop's own.

   A shop is added here on the day it hands over its own shortcode and passkey,
   and the secrets get a per-shop name at the same time. Until then its counter
   takes M-Pesa the way it does today: the customer pays, the cashier picks
   M-PESA, and the cash book is right either way.
--------------------------------------------------------- */
const MPESA_SHOPS = new Set(["jaspare-auto"]);

export function mpesaEnabled(slug) {
  return MPESA_SHOPS.has(String(slug || "").toLowerCase());
}

/* ---------------------------------------------------------
   THE PHONE NUMBER

   A second copy of the rule in supabase/functions/_shared/daraja.js, and the
   duplication is deliberate: this one saves the cashier a round trip when they
   have fat-fingered a digit, and the one on the server is the rule. A server that
   trusts the browser has no validation at all, and this is the boundary where
   money crosses.
--------------------------------------------------------- */
export function normalisePhone(raw) {
  const digits = String(raw == null ? "" : raw).replace(/[^\d]/g, "");
  if (!digits) return { error: "Type the customer's phone number first." };
  let n = digits;
  if (n.startsWith("254")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  if (!/^[71]\d{8}$/.test(n)) {
    return { error: "That is not a Kenyan mobile number — ten digits starting 07 or 01." };
  }
  return { msisdn: `254${n}` };
}

/* How the number is shown back, so the cashier can read it out and check it
   against the phone in the customer's hand before pressing send. */
export function prettyPhone(msisdn) {
  const m = /^254(\d{3})(\d{3})(\d{3})$/.exec(String(msisdn || ""));
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : String(msisdn || "");
}

/* ---------------------------------------------------------
   THE AMOUNT

   Daraja takes whole shillings. A decimal is rejected, and rounding it quietly in
   the request would mean the customer paid a different figure from the one on the
   receipt — so the rounding happens here, visibly, before anybody presses send.
--------------------------------------------------------- */
export function checkAmount(raw) {
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return { error: "Enter the amount to collect." };
  const amount = Math.round(n);
  if (amount < 1) return { error: "M-Pesa cannot collect less than one shilling." };
  /* Safaricom's own per-transaction ceiling. Said here rather than let the
     customer's phone ring and then refuse, which looks like the shop's fault. */
  if (amount > 250000) {
    return { error: "M-Pesa will not take more than KES 250,000 in one go. Split it." };
  }
  return { amount, rounded: amount !== n };
}

/* ---------------------------------------------------------
   HOW LONG A PROMPT LIVES

   Safaricom gives the customer about a minute to enter their PIN and then stops
   waiting. The till has to stop waiting too, or a cashier stares at "sent" for
   the rest of the afternoon on a prompt that died at 2pm.
--------------------------------------------------------- */
export const PROMPT_LIFETIME_MS = 90 * 1000;

export function secondsLeft(sentAt, now) {
  const left = Math.ceil((Number(sentAt) + PROMPT_LIFETIME_MS - Number(now)) / 1000);
  return left > 0 ? left : 0;
}

/* ---------------------------------------------------------
   WHAT THE COUNTER SEES

   One place, so the same answer never reads two ways on two screens. `tone` is
   what the colour is for; there is no colour on a printed page and no colour on a
   phone in bright sun, so the words carry it on their own.
--------------------------------------------------------- */
export function promptStatus(row, now = 0) {
  const status = String(row?.status || "").toLowerCase();
  const amount = Number(row?.amount) || 0;
  const money = `KES ${amount.toLocaleString("en-KE")}`;
  /* Two shapes reach here and both are right. The edge function answers with the
     database's own column names, because that is what it read; fetchMpesaPayments
     maps the same row into the camelCase the rest of the app uses. Reading both
     spellings is cheaper than a third mapping between two things that agree. */
  const receipt = row?.mpesa_receipt || row?.receipt || "";
  const why = row?.result_desc || row?.resultDesc || "";

  if (status === "paid") {
    return {
      tone: "good",
      done: true,
      title: `${money} received.`,
      detail: receipt
        ? `M-Pesa receipt ${receipt}. Confirm the sale now.`
        : "Confirm the sale now.",
    };
  }
  if (status === "cancelled") {
    return { tone: "warn", done: true, title: "They cancelled it.",
             detail: why || "Nothing was taken. Send it again, or take cash." };
  }
  if (status === "timeout") {
    return { tone: "warn", done: true, title: "No answer.",
             detail: why || "The prompt was not answered. Send it again, or take cash." };
  }
  if (status === "failed") {
    return { tone: "bad", done: true, title: "It did not go through.",
             detail: why || "Nothing was taken." };
  }
  /* Still waiting. Two different waits: the prompt is on the phone, or the minute
     is up and nobody has told us anything. The second one is NOT a failure — the
     money may have moved and the answer may be late — so it says what it knows
     and nothing more. */
  const left = secondsLeft(row?.sentAt || 0, now);
  if (row?.sentAt && !left) {
    return {
      tone: "warn",
      done: false,
      title: "No answer yet.",
      detail: "Press Check again. Do not hand over the part until this says received.",
    };
  }
  return {
    tone: "wait",
    done: false,
    title: `Asking for ${money}…`,
    detail: left
      ? `The prompt is on their phone — ${left}s to enter their PIN.`
      : "The prompt is on their phone.",
  };
}

/* Never let a screen imply money arrived on anything but a 'paid' row. Used by
   the sale button, because the whole risk in this feature is a part walking out
   of the shop against a prompt that was only ever sent. */
export function isPaid(row) {
  return String(row?.status || "").toLowerCase() === "paid";
}
