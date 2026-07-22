# Login email alerts — one-time setup

Every login is **already** recorded inside the app (Notifications → "Login"), and
the owner also gets an **email** to `addamsjmk@gmail.com`. The in-app part works
with no setup. To turn on the email, do this once:

## 1. Get a free Resend key (for sending mail)
1. Go to https://resend.com and sign up (free).
2. Dashboard → **API Keys** → **Create API Key** → copy it (starts with `re_...`).

## 2. Install the Supabase CLI (once)
- Windows (PowerShell): `npm install -g supabase`
- Check: `supabase --version`

## 3. Deploy the function
From the project folder (`c:\BYPASS SHOP`):

```bash
supabase login
supabase link --project-ref loliaseckqpqjoqiwyiq
supabase secrets set RESEND_API_KEY=re_your_key_here OWNER_EMAIL=addamsjmk@gmail.com
supabase functions deploy notify-login --no-verify-jwt
```

That's it. Next time anyone logs in, you get an email:
**"Bypass Shop — <name> just logged in"**.

## Notes
- Until you verify your own domain in Resend, emails are sent from
  `onboarding@resend.dev` — that's fine for alerts to yourself.
- If you skip this whole setup, nothing breaks: the login still shows up
  in the app's Notifications, just no email.
- To also receive it at another address, change `OWNER_EMAIL` in the
  `secrets set` command and re-run it.
