# Turning the M-Pesa prompt on

The cashier types the customer's number, presses one button, and the customer's
own phone asks for their M-Pesa PIN. Nothing read out loud across the counter, no
till number written on a scrap of paper, no amount typed wrongly.

The code for all of it is already in the repo and already deployed with the site.
What is left is three things nobody can do from a laptop editor: put the two
Daraja credentials into Supabase, create one table, and deploy two functions.

**Until those three are done the button simply is not there**, and the counter
takes M-Pesa exactly the way it does today — the customer pays, the cashier picks
M-PESA, and the cash book is right either way. Nothing is broken while this waits.

---

## What is what

| Piece | Where it lives | What it does |
|---|---|---|
| The button and the waiting screen | `src/tabs.jsx` (Sell Item), `src/lib/mpesa.js` | Asks. Never decides whether money arrived. |
| The prompt push | `supabase/functions/mpesa-stk/` | Holds the credentials. Talks to Safaricom. Checks who is asking, first. |
| Safaricom's answer | `supabase/functions/mpesa-callback/` | Public URL. Can only update a prompt that already exists, and cannot un-pay one. |
| The shared rules | `supabase/functions/_shared/daraja.js` | Phone number, Nairobi timestamp, password, what each result code means. |
| The record | `supabase/mpesa.sql` | Evidence of what was asked and what came back. **Not the cash book.** |

`_shared/` starts with an underscore, so Supabase bundles it into both functions
and does not try to deploy it as a function of its own.

---

## THE CREDENTIALS DO NOT GO IN THIS REPO, AND THEY DO NOT GO IN A `VITE_` VARIABLE

Anything named `VITE_ANYTHING` is compiled into the JavaScript that every visitor
downloads. A consumer secret put there is a consumer secret published. The two
credentials belong in Supabase's secret store, where only the edge functions can
read them, and they are never sent to a browser.

Get them from <https://developer.safaricom.co.ke> → your app → Keys.

```bash
supabase secrets set \
  MPESA_CONSUMER_KEY="paste-the-consumer-key-here" \
  MPESA_CONSUMER_SECRET="paste-the-consumer-secret-here"
```

Optional, and worth doing:

```bash
# A shared word in the callback URL, so a stranger who guesses the address is
# ignored. Any random string. See the note about it below.
supabase secrets set MPESA_CALLBACK_TOKEN="any-long-random-string"
```

Never set `SUPABASE_SERVICE_ROLE_KEY` yourself. Supabase injects it, along with
`SUPABASE_URL` and `SUPABASE_ANON_KEY`, into every function.

---

## The three steps

### 1. The table

Open the Supabase SQL editor and paste **all of `supabase/mpesa.sql`**. Nothing
in it needs editing. It is safe to run twice.

It ends with a short verification block. Two of the things it prints are supposed
to FAIL — an attempt by a signed-in member of staff to change a payment row, and
an attempt to call `mpesa_result` directly. If either of those *succeeds*, stop
and say so: it means anybody with a staff login could mark an unpaid prompt paid.

### 2. The two functions

```bash
supabase functions deploy mpesa-stk
supabase functions deploy mpesa-callback --no-verify-jwt
```

The `--no-verify-jwt` on the second one is required, not a shortcut. Safaricom's
servers have no Supabase login and send no token, so a function that demands one
would reject every result and the counter would only ever learn the answer by
somebody pressing Check again.

### 3. Send one prompt to a real handset

Sandbox mode moves no money, but the phone really does ring, so this is a genuine
end-to-end test and the only one that proves the chain.

Sign in at the shop, Sell Item, pick any part, **Paid → M-PESA**, type a real
number, press **Send a prompt**. The phone should ring within a few seconds and
the screen should change on its own once the PIN is entered.

If it says *"The M-Pesa service is not answering"*, step 2 has not happened. If
it says *"You are not signed in to that shop"*, the account is not a member of the
shop it is trying to bill from.

---

## Which shops have the button

One till number belongs to one business. `MPESA_SHOPS` in `src/lib/mpesa.js`
currently holds `jaspare-auto` alone.

Sure Fit and Jeyden are separate businesses with their own M-Pesa. Pushing *this*
prompt from their counter would ask their customer to pay Bypass Shop — the money
would arrive, in the wrong company's account, with a receipt in the wrong
company's name. That is not a missing feature, it is a wrong one, so the button
only exists where the till behind it is that shop's own.

The browser's copy of that list is a courtesy. The real gate is in
`mpesa-stk/index.ts`, which asks the database `my_shop_ids()` **before** it
contacts Safaricom, because a prompt that has been sent cannot be recalled.

To add a shop: add its slug to `MPESA_SHOPS`, and give its shortcode and passkey
their own per-shop secret names at the same time.

---

## Sandbox, then live

| Secret | Sandbox (the default) | Live |
|---|---|---|
| `MPESA_ENV` | leave unset | `production` |
| `MPESA_SHORTCODE` | leave unset (`174379`) | the shop's own paybill or till |
| `MPESA_PASSKEY` | leave unset (Safaricom's published test key) | the shop's own passkey |
| `MPESA_TX_TYPE` | leave unset (`CustomerPayBillOnline`) | `CustomerBuyGoodsOnline` for a till number |

The sandbox defaults are hard-coded in `mpesa-stk/index.ts` on purpose: they are
Safaricom's own published test values, they are the same for everybody, and they
cannot take money. Anything that *can* take money has no default and has to be
set deliberately.

`darajaBase()` only reaches the real Safaricom for the exact word `production`.
`live`, `prod` and a typo all stay in the sandbox — the failure that costs a real
customer real money is the one worth making hard.

Going live is not only these four secrets: Safaricom require the app to be moved
to a production key, and the shortcode's operator has to authorise it.

Every prompt sent outside production is labelled **"Test mode — no real money
moved"** on screen, so nobody at a counter can mistake one for a payment.

---

## Why the callback URL being public is all right

Safaricom send no signature and no header that proves the call came from them, so
anyone who learns the address can POST to it. What stops that mattering:

1. **It cannot create a payment.** `mpesa_result()` only updates a row that
   already exists, matched on a `CheckoutRequestID` that Safaricom generated and
   that only this shop's own send request has ever seen.
2. **It cannot un-pay.** A row that is paid stays paid, so a late or invented
   failure cannot reverse a real payment.
3. **It is not what the till believes.** The Paid light comes from `mpesa-stk`'s
   `check` action, which asks Safaricom directly, authenticated. The callback only
   makes the right answer arrive sooner.
4. **`MPESA_CALLBACK_TOKEN`**, if set. Worth setting, and not relied on alone — a
   token in a URL is a token in every log the request passes through.

It always answers `200` with `ResultCode: 0`, even when it did nothing at all,
including on a wrong token. Safaricom retry anything else, for days.

---

## The one thing to keep straight about the money

`mpesa_payments` is **evidence, not a ledger.**

A sale paid by M-Pesa is already counted in the M-Pesa column, through the method
recorded on the sale itself. Counting this table as well would put every
prompt-paid sale into the day's takings **twice** and leave the drawer
unreconcilable — the error would look like theft and would be nobody's fault.

So nothing in `src/lib/finance.js` reads this table, on purpose. The only screen
that reads it is the collapsed **M-Pesa prompts sent** list on the idle Sell Item
screen, which answers one question: *did that one ever land.*
