import React, { useState, useEffect } from "react";
import { Boxes, Lock, User, AlertTriangle, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ShieldCheck, HelpCircle, Mail, KeyRound, Smartphone, Camera, ShoppingBag } from "lucide-react";
import { Field, inputCls } from "./ui.jsx";
import {
  signIn, signUp, signInRole, sendEmailCode,
  toLoginEmail, loginNeedsCode, passwordIsRight, sendLoginCode,
  verifyLoginCode, touchDevice, checkRolePassword,
  otpLoginAvailable, startOtpLogin, finishOtpLogin, trustMyDevice,
} from "./lib/auth.js";
import { getDeviceId, thisDeviceLabel } from "./lib/device.js";
import { shopName, SHOP_INFO } from "./lib/shopInfo.js";
import { rolesFor, defaultRolePassword, setRoleSession } from "./lib/roleAccounts.js";
import { currentShopSlug } from "./lib/shopScope.js";
import { heroWashFor } from "./lib/shopSkin.js";
import { hardReload } from "./lib/hardReload.js";
import { isConfigured } from "./lib/supabase.js";
import { InstallNudge } from "./InstallApp.jsx";
import { SlidePictures, useSlideshow } from "./PartsShow.jsx";
import { slidesFor } from "./lib/slides.js";
import ShopMark from "./ShopMark.jsx";

/* ---------------------------------------------------------
   REAL LOGIN — backed by Supabase Auth.

   Each staff member has their own email/password account, so
   every action is attributed to an authenticated user, not a
   self-typed name. Passwords are hashed server-side by Supabase;
   the app never sees or stores them.
--------------------------------------------------------- */
/* The colour laid over the photograph at the top of this screen is asked for by name
   from src/lib/shopSkin.js, because it is an inline style rather than a Tailwind class
   and index.css cannot re-point it.

   It was written out here, two skins in a little table with a fallback to blue. That
   was fine while there were two. There are now seven a shop can choose from, and a
   two-entry table with a fallback would have quietly served blue to five of them —
   the whole screen orange except the one band the shop actually looks at. Built from
   the same table the rest of the app reads, so a skin cannot exist without a hero. */

/* A spare-part emblem — a cog/gear with a piston, drawn in white so it sits
   cleanly on the coloured hero. */
function SparePartIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M24 6l2.2 3.9 4.4-1 .6 4.5 4.3 1.5-1.6 4.2 3.3 3.1-3.3 3.1 1.6 4.2-4.3 1.5-.6 4.5-4.4-1L24 42l-2.2-3.9-4.4 1-.6-4.5-4.3-1.5 1.6-4.2L10.8 26l3.3-3.1-1.6-4.2 4.3-1.5.6-4.5 4.4 1L24 6z"
        stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="white" fillOpacity="0.12"
      />
      <circle cx="24" cy="24" r="6.5" stroke="white" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="1.8" fill="white" />
    </svg>
  );
}

/* The one button that is the point of whichever screen is up: log in, verify the
   code, create the account. Written once because it was written five times, and
   the five had already begun to drift apart. Blue into cyan, so the thing to
   press is the brightest thing on a white card. */
const primaryBtn =
  "w-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white font-bold uppercase " +
  "tracking-wide rounded-xl py-3.5 flex items-center justify-center gap-2 " +
  "shadow-lg shadow-[#2563EB40] active:scale-[0.99] transition-transform " +
  "disabled:opacity-50 disabled:shadow-none";

export default function LoginGate({ onLeave, shop }) {
  /* Whose sign-in screen this is. One build serves more than one business now, and
     a Surefit storekeeper typing their password under "Jaspare Auto" has no way to
     know whether they are about to sign in to the right shop. */
  const shopTitle = shop?.name || shopName();
  // Which login method: the 4 shared role logins, or a personal account.
  const [tab, setTab] = useState("role");      // role | own
  const [mode, setMode] = useState("signin"); // signin | signup
  const [name, setName] = useState("");        // name OR phone/email — the login id
  const [contact, setContact] = useState("");  // optional phone or email (signup only)
  const [password, setPassword] = useState("");
  // Typed twice at signup. A password nobody can see is easy to fat-finger,
  // and getting it wrong here means being locked out of a brand-new account.
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // Role-login fields.
  const [roleKey, setRoleKey] = useState("");
  const [rolePass, setRolePass] = useState("");
  const [personName, setPersonName] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  /* The parts turning over behind the board. Nobody has signed in yet, so this
     is the one thing on the screen that says what sort of shop this is. */
  /* This shop's cars. Same photographs at both shops, different opening — see
     src/lib/slides.js. */
  const slides = slidesFor(currentShopSlug());
  const show = useSlideshow(slides.length);
  const onShow = slides[show.at] || slides[0];
  /* Signing up is two screens, the way every other app does it:

       "form"  - name, email, password
       "code"  - the 6 digits we just emailed

     The account is only created after the code is right. Nothing is written
     to the database in between, so an abandoned sign-up leaves nothing
     behind and a mistyped address can simply be corrected and re-sent. */
  const [step, setStep] = useState("form");
  const [code, setCode] = useState("");
  // Set when the shop hasn't finished setting up email sending. Sign-ups
  // can't be allowed to stop dead because of a shop-side gap.
  const [mailBroken, setMailBroken] = useState("");

  /* A CODE ON A PHONE THIS ACCOUNT HAS NOT BEEN USED ON.

     The password has already been checked at this point, on a throwaway
     connection that leaves no session behind — so nothing is open to anybody
     standing here, and a code was only emailed because the password was right.

     Held: the address it went to, and the role account if this was a role
     login, so the real sign-in can be finished once the code proves out. */
  const [challenge, setChallenge] = useState(null); // {email, role} | null
  const [devCode, setDevCode] = useState("");

  /* TWO WAYS IN, AND THE PERSON PICKS.

     Type your email, then either type the password or tap "Email me a code".
     The code is not a second step on top of the password, it stands in for it —
     because the password is the thing that actually goes missing. It gets
     forgotten over a weekend, written on a note by the till, or told to somebody
     who then leaves. An emailed code belongs to whoever can open that inbox and
     to nobody else, and it is dead in ten minutes.

     `otpOn` is read from the shop's settings before the button is drawn. A
     button that cannot send is worse than no button: it leaves somebody standing
     at the counter tapping it, waiting on an inbox that will never get anything. */
  const [otpOn, setOtpOn] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  useEffect(() => {
    let alive = true;
    otpLoginAvailable().then((v) => { if (alive) setOtpOn(v); });
    return () => { alive = false; };
  }, []);

  /* The logins THIS shop offers. Jaspare has four; Sure Fit has Keziah and Admin.
     Read from the slug rather than held in state, because the slug is settled before
     this screen is drawn and cannot change while somebody is looking at it. */
  const roles = rolesFor(currentShopSlug());
  const chosenRole = roles.find((r) => r.key === roleKey) || null;

  /* An invented address can never receive anything. Accounts made from a name
     get one (josphat.kamau@bypassshop.co), and so do the four shared role
     logins, so the code button is only offered to somebody who typed a real
     address — otherwise the offer is a dead end wearing a button's clothes. */
  const typedRealEmail = name.trim().includes("@") && !/@bypassshop\.co$/i.test(name.trim());

  /* "Failed to fetch" means the browser never reached Supabase at all — the
     password was never even checked. Say so in plain words, because the raw
     message makes staff think they typed something wrong. */
  const isNetworkError = (msg) =>
    /failed to fetch|networkerror|network request failed|load failed|timeout|err_internet|connection/i.test(msg);

  const NETWORK_HELP =
    "Can't reach the internet. Check your data or Wi-Fi is on and try again — " +
    "your password is fine, the phone just couldn't connect.";

  /* When the code cannot be emailed but the policy says one is needed.

     This is the whole cost of the shop's choice that nobody gets in without a
     code, and it is said in full rather than as "something went wrong": the
     person is standing at a counter and needs to know that this phone is not
     the way in today, and what the way in actually is. */
  const CANNOT_MAIL =
    "This phone needs an emailed code, and the shop cannot send one right now. " +
    "There is no way past it by design. Sign in on a phone you have used before, " +
    "or ask the admin to switch the new-phone code off under Settings.";

  /* Does this login need a code first? If so, prove the password, email the
     code and put the code screen up; the caller stops there.
     Returns true when it has taken over, false to carry on signing in.

     The password is proved before anything is emailed, so a stranger who knows
     an address cannot make codes land in that inbox. And the real session is
     not created until the code is right — there is no moment, not even a
     flicker, where the app is open to somebody who has not finished. */
  const needsDeviceCode = async (email, role = null, password = "") => {
    const device = getDeviceId();
    if (!(await loginNeedsCode(email, device))) {
      /* Known phone. Note it was used, so the admin's list of trusted phones
         says when each was really last seen. Nothing waits on this. */
      touchDevice(email, device);
      return false;
    }

    const right = role
      ? await checkRolePassword(role, password)
      : (await passwordIsRight(email, password)).ok;
    if (!right) {
      setError(
        role
          ? `Wrong password for ${role.label}. Ask the admin to reset it.`
          : "That email/name and password don't match."
      );
      return true;
    }

    const res = await sendLoginCode(email, role ? personName.trim() : name.trim());
    if (res.setup) { setError(CANNOT_MAIL); return true; }

    setChallenge({ email, role });
    setDevCode("");
    setNotice(`We sent a 6-digit code to ${email}. It works for 10 minutes.`);
    return true;
  };

  /* The code is right -> the phone is now remembered, and the sign-in that was
     held back can finish. Remembering the phone and checking the code are one
     database call, so a browser can never add itself to the trusted list
     without having proved a code. */
  const confirmDeviceCode = async () => {
    setError("");
    if (devCode.trim().length !== 6) { setError("The code is 6 digits."); return; }
    setBusy(true);
    try {
      const ok = await verifyLoginCode(
        challenge.email, devCode, getDeviceId(), thisDeviceLabel()
      );
      if (!ok) {
        setNotice("");
        setError("That code is wrong or has expired. Check the email, or send a new one.");
        return;
      }
      if (challenge.role) {
        await signInRole(challenge.role, rolePass, personName.trim());
        setRoleSession(challenge.role.key, personName.trim());
      } else {
        await signIn(challenge.email, password);
      }
      /* useAuth() in App picks the session up from here. */
    } catch (e) {
      // The database raises a readable message once the code is locked out.
      showError(e, "The code could not be checked.");
    } finally {
      setBusy(false);
    }
  };

  const resendDeviceCode = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await sendLoginCode(challenge.email, personName.trim() || name.trim());
      if (res.setup) setError(CANNOT_MAIL);
      else setNotice(`A new code is on its way to ${challenge.email}.`);
    } catch (e) {
      showError(e, "The code could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const leaveChallenge = () => {
    setChallenge(null);
    setDevCode("");
    setError("");
    setNotice("");
  };

  /* ---- SIGNING IN WITH A CODE INSTEAD OF THE PASSWORD ---- */

  /* Ask for the code. No password is typed on this route at all, so there is
     nothing to prove first — the address itself is the claim, and the code going
     to that address is what tests it. The server refuses to send to an address
     with no account, so the button can't be used to make the shop mail
     strangers. */
  const requestOtp = async () => {
    setError("");
    setNotice("");
    const addr = name.trim().toLowerCase();
    if (!addr.includes("@")) {
      setError("Type your email address first — that's where the code goes.");
      return;
    }
    setBusy(true);
    try {
      const res = await startOtpLogin(addr, "");
      if (res.setup) {
        /* The shop can't email. Said in full, because the person is standing at
           a counter and needs to know that this route is shut today and the
           password is the way in — not that "something went wrong". */
        setError(
          (res.error ? res.error + " " : "") +
          "Use your password instead, and tell the admin."
        );
        return;
      }
      setOtpEmail(addr);
      setOtpCode("");
      setOtpStep(true);
      setNotice(`We sent a 6-digit code to ${addr}. It works for 10 minutes.`);
    } catch (e) {
      showError(e, "The code could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  /* Type it back, and be signed in. The code is checked on the server, which
     destroys it and hands back a one-time token the app swaps for a session — so
     one code opens the app exactly once, and a wrong one leaves it as shut as it
     was. Then the phone is remembered, because a code proved more than the
     password would have and it would be perverse to ask again next time. */
  const confirmOtp = async () => {
    setError("");
    if (otpCode.trim().length !== 6) { setError("The code is 6 digits."); return; }
    setBusy(true);
    try {
      await finishOtpLogin(otpEmail, otpCode);
      await trustMyDevice(getDeviceId(), thisDeviceLabel());
      /* useAuth() in App picks the session up from here. */
    } catch (e) {
      setNotice("");
      showError(e, "That code could not be checked.");
    } finally {
      setBusy(false);
    }
  };

  const leaveOtp = () => {
    setOtpStep(false);
    setOtpCode("");
    setError("");
    setNotice("");
  };

  const submitRole = async () => {
    setError("");
    setNotice("");
    if (!chosenRole) { setError("Pick your role first."); return; }
    if (!personName.trim()) { setError("Type your own name so your work is recorded under you."); return; }
    if (!rolePass) { setError("Enter the role password."); return; }
    setBusy(true);
    try {
      /* A role account is shared and its address was invented, so it can never
         receive a code and this returns false — but it is asked anyway rather
         than skipped, so there is no way in that quietly avoids the check. */
      if (await needsDeviceCode(chosenRole.email, chosenRole, rolePass)) return;
      await signInRole(chosenRole, rolePass, personName.trim());
      setRoleSession(chosenRole.key, personName.trim());
      // useAuth() in App picks up the session automatically.
    } catch (e) {
      const msg = e.message || "Login failed.";
      if (isNetworkError(msg)) {
        setError(NETWORK_HELP);
      } else if (/invalid login credentials|wrong password/i.test(msg)) {
        setError(`Wrong password for ${chosenRole.label}. Ask the admin to reset it.`);
      } else if (/email not confirmed/i.test(msg)) {
        setError("Turn off Supabase → Authentication → “Confirm email”, then try again.");
      } else if (/password/i.test(msg) && /6/.test(msg)) {
        setError("The role password must be at least 6 characters.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // Shared by both signup steps: turn a raw error into words a shop worker
  // can act on.
  const showError = (e, fallback) => {
    const msg = e.message || fallback;
    setError(isNetworkError(msg) ? NETWORK_HELP : msg);
  };

  /* STEP 1 of signing up: check the details, then email the code. The account
     is NOT created here - only after the code is confirmed. */
  const startSignup = async () => {
    setError("");
    setNotice("");
    const to = contact.trim().toLowerCase();
    if (!name.trim()) { setError("Enter your name."); return; }
    if (!to.includes("@") || !/@[^@]+\.[^@]+$/.test(to)) {
      setError("Enter your email address, e.g. name@gmail.com");
      return;
    }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPass) { setError("The two passwords don't match."); return; }

    setBusy(true);
    try {
      const res = await sendEmailCode(to, name.trim());
      /* Email sending isn't set up on this shop yet. That's a shop-side gap,
         not the person's mistake, so let them straight through to an account
         rather than stranding them on a code screen no code can reach. */
      if (res.setup) {
        setMailBroken(res.error || "Codes can't be emailed yet.");
        await createAccount();
        return;
      }
      setStep("code");
      setCode("");
      setNotice(`We sent a 6-digit code to ${to}. It works for 10 minutes.`);
    } catch (e) {
      showError(e, "The code could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  /* STEP 2: the code is right -> now the account gets made. Kept separate so
     the "email is broken" path above can reuse it. */
  const createAccount = async () => {
    const to = contact.trim().toLowerCase();
    try {
      await signUp(name.trim(), password, to);
      // Log them straight in - there's no second confirmation to fight, the
      // code already proved the address.
      try {
        await signIn(to, password);
      } catch {
        setNotice("Account created — now sign in with your email and password.");
        setStep("form");
        setMode("signin");
      }
    } catch (e) {
      const msg = e.message || "The account could not be created.";
      if (isNetworkError(msg)) {
        setError(NETWORK_HELP);
      } else if (/already registered/i.test(msg)) {
        setError("An account already uses that email. Try signing in instead.");
        setStep("form");
      } else {
        setError(msg);
        setStep("form");
      }
    }
  };

  const confirmCode = async () => {
    setError("");
    setNotice("");
    if (code.trim().length !== 6) { setError("The code is 6 digits."); return; }
    setBusy(true);
    try {
      /* The same call that proves the address also remembers this phone. The
         code was emailed to them and typed back here, which is precisely the
         proof the new-phone check asks for — so it would be perverse to demand
         a second code the next time they sign in on the phone they signed up on. */
      const ok = await verifyLoginCode(
        contact.trim().toLowerCase(), code, getDeviceId(), thisDeviceLabel()
      );
      if (!ok) {
        setError("That code is wrong or has expired. Check the email, or send a new one.");
        return;
      }
      await createAccount();
    } catch (e) {
      // The database raises a readable message once the code is locked out.
      showError(e, "The code could not be checked.");
    } finally {
      setBusy(false);
    }
  };

  // Signing in - unchanged: a name, an email or a phone all still work.
  const submit = async () => {
    setError("");
    setNotice("");
    if (mode === "signup") { startSignup(); return; }
    if (!name.trim()) { setError("Enter your name (or phone/email)."); return; }
    if (!password) { setError("Enter your password."); return; }
    setBusy(true);
    try {
      if (await needsDeviceCode(toLoginEmail(name.trim()), null, password)) return;
      await signIn(name.trim(), password);
      // useAuth() in App picks up the session automatically.
    } catch (e) {
      const msg = e.message || "Login failed.";
      if (isNetworkError(msg)) {
        setError(NETWORK_HELP);
      } else if (/invalid login credentials/i.test(msg)) {
        // Say both, because which one works depends on how the account was
        // made: with an email through signup, or by name by the admin.
        setError("That email/name and password don't match. New here? Tap “Create an account”.");
      } else if (/email not confirmed/i.test(msg)) {
        setError("Account needs confirming in Supabase → Authentication → turn off “Confirm email”.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#DCEBFF] via-[#F2F7FF] to-[#D7F4FB] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bp-pop">
        {/* ---------- THE WAY BACK ----------
            At the top, where a back button belongs and where a thumb looks for it.
            The link at the foot of this card says "not staff?" and is for a customer
            who was handed the staff address; this one is for the storekeeper who
            opened the WRONG SHOP's sign-in — which is a different mistake, made by
            somebody who does work here, and who was reading past the sentence about
            not being staff. It goes back to this shop's front page, where the shop
            list is. */}
        {onLeave && (
          <button
            onClick={onLeave}
            className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[#2563EB] hover:text-[#1B2430] transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
        )}

        {/* ---------- THE BOARD ----------
            Photographs of real parts under a blue-to-cyan wash, rather than the
            flat blue panel that was here before: this is a spare-parts shop and
            the first screen should say so at a glance. They turn over — Prado,
            LC300, Subaru, Mazda and the rest, see src/lib/slides.js — so the
            board shows the range rather than one lamp, and the strip at its foot
            says which part is on screen. The pictures are free to use; every one
            is credited in public/ads/CREDITS.md.

            THE SHOW ONLY DOWNLOADS WHAT IT REACHES — a slide is put in the page
            when its turn comes, so a phone on mobile data staring at this screen
            pays for one photograph every four seconds, not for eleven at once. */}
        <div className="relative overflow-hidden rounded-3xl mb-5 shadow-2xl ring-1 ring-white/50">
          <SlidePictures slides={slides} at={show.at} reached={show.reached} decorative />
          {/* The wash. Heavy at the top left so the shop name stays readable
              whatever the picture is doing underneath, thinning to cyan at the
              bottom right so the part itself still shows through. */}
          <div
            className="absolute inset-0"
            style={{ background: heroWashFor(currentShopSlug()) }}
          />
          {/* One band of light crossing the picture. The only movement on this
              screen, and it is what stops a photograph under a flat colour
              looking like a sticker. */}
          <div className="bp-sheen absolute top-0 bottom-0 left-0 w-1/4 bg-white/30 blur-lg pointer-events-none" />

          <div className="relative px-6 pt-6 pb-4 text-center">
            <div className="text-[#BFDBFE] text-[11px] font-bold tracking-[0.25em] uppercase">
              {SHOP_INFO.branch.tagline || shopTitle}
            </div>

            {/* Spare-part emblem (gear + piston) */}
            <div className="mx-auto my-3 w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-[#67E8F9]/60 shadow-lg">
              {/* The shop's own logo once it exists; the drawn emblem until then.
                  See src/ShopMark.jsx — dropping public/logo-<slug>.png in is the
                  whole job. */}
              <ShopMark size={38} fallback={<SparePartIcon />} />
            </div>

            <h1
              className="text-white text-3xl font-extrabold uppercase tracking-wide"
              style={{ textShadow: "0 2px 12px rgba(4,12,40,0.55)" }}
            >
              {shopTitle}
            </h1>
            <p className="text-[#E6F6FF] text-xs mt-1">Branch Inventory Management System</p>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur px-3 py-1.5">
              <ShieldCheck size={13} className="text-[#A5F3FC]" />
              <span className="text-[11px] font-semibold text-white">
                Every action is saved under your name
              </span>
            </div>
          </div>

          {/* What is on the picture at this moment. Without it the show is just
              wallpaper; with it the board is quietly telling somebody standing at
              the counter that this shop has Prado grilles. Keyed on the slide so
              the words arrive with their own picture rather than swapping under
              the one before. */}
          <div className="relative px-4 pb-4">
            <div
              key={onShow?.image}
              className="bp-fade-up flex items-center justify-center gap-2 rounded-xl bg-black/30 ring-1 ring-white/20 backdrop-blur px-3 py-2"
            >
              <Camera size={12} className="text-[#A5F3FC] shrink-0" />
              <span className="text-[11px] font-semibold text-white truncate">
                {onShow?.car ? <span className="text-[#A5F3FC]">{onShow.car} · </span> : null}
                {onShow?.part}
              </span>
            </div>
          </div>
        </div>

        {!isConfigured && (
          <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-lg p-3 text-xs mb-4 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Supabase keys are missing. Create a <span className="font-mono">.env</span> file
            from <span className="font-mono">.env.example</span> and restart the dev server.
          </div>
        )}

        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-2xl p-5 shadow-xl">
          {/* ---------- A NEW PHONE ----------
              Takes over the whole card. The password was right, but this
              account has not been used on this phone before, so nothing is
              open yet and there is nothing else to do on this screen. */}
          {challenge ? (
            <>
              <button
                onClick={leaveChallenge}
                className="text-[#5A6472] text-xs mb-3 flex items-center gap-1 hover:text-[#2563EB]"
              >
                <ArrowLeft size={13} /> Back
              </button>

              <div className="text-center mb-4">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-[#EAF1FF] flex items-center justify-center">
                  <Smartphone size={22} className="text-[#2563EB]" />
                </div>
                <div className="font-semibold text-[#1B2430]">A phone we haven&apos;t seen</div>
                <p className="text-[#5A6472] text-xs mt-1 leading-relaxed">
                  Your password was right. This account has not been used on this
                  phone before, so we emailed a 6-digit code to<br />
                  <span className="font-semibold text-[#1B2430] break-all">{challenge.email}</span>
                </p>
              </div>

              <Field label="Enter the code">
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
                  <input
                    value={devCode}
                    onChange={(e) => setDevCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && confirmDeviceCode()}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={inputCls + " pl-9 text-center text-lg font-mono tracking-[0.4em]"}
                    autoFocus
                  />
                </div>
              </Field>

              {error && (
                <div className="text-[#DC3B2E] text-sm mb-3 flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}
              {notice && !error && (
                <div className="text-[#15926A] text-sm mb-3 flex items-start gap-1.5">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {notice}
                </div>
              )}

              <button
                onClick={confirmDeviceCode}
                disabled={busy || devCode.length !== 6}
                className={primaryBtn}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Trust this phone &amp; log in
              </button>

              <button
                onClick={resendDeviceCode}
                disabled={busy}
                className="w-full text-[#5A6472] text-xs mt-3 hover:text-[#2563EB] disabled:opacity-50"
              >
                Didn&apos;t get it? Send a new code
              </button>

              {/* Said here, before five wrong tries, not after. There is no
                  override and no bypass password — that was chosen on purpose,
                  because an override is the first thing somebody who has stolen
                  a password goes looking for. */}
              <p className="text-[11px] text-[#5A6472] mt-3 leading-relaxed flex items-start gap-1.5">
                <AlertTriangle size={13} className="text-[#B45309] mt-0.5 shrink-0" />
                Five wrong tries and this code stops working. There is no way
                past this step — if you can&apos;t read the email, sign in on a
                phone you&apos;ve used before, or ask the admin.
              </p>
            </>
          ) : otpStep ? (
            /* ---------- SIGNED IN BY CODE, NO PASSWORD ----------
               Takes over the whole card. There is nothing else to do on this
               screen, and no password field, because the code IS the way in
               here — leaving one visible would only make people wonder whether
               they are meant to fill it. */
            <>
              <button
                onClick={leaveOtp}
                className="text-[#5A6472] text-xs mb-3 flex items-center gap-1 hover:text-[#2563EB]"
              >
                <ArrowLeft size={13} /> Use my password instead
              </button>

              <div className="text-center mb-4">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-[#EAF1FF] flex items-center justify-center">
                  <Mail size={22} className="text-[#2563EB]" />
                </div>
                <div className="font-semibold text-[#1B2430]">Check your email</div>
                <p className="text-[#5A6472] text-xs mt-1 leading-relaxed">
                  We sent a 6-digit code to<br />
                  <span className="font-semibold text-[#1B2430] break-all">{otpEmail}</span>
                  <br />No password needed — the code signs you in.
                </p>
              </div>

              <Field label="Enter the code">
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
                  <input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && confirmOtp()}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={inputCls + " pl-9 text-center text-lg font-mono tracking-[0.4em]"}
                    autoFocus
                  />
                </div>
              </Field>

              {error && (
                <div className="text-[#DC3B2E] text-sm mb-3 flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}
              {notice && !error && (
                <div className="text-[#15926A] text-sm mb-3 flex items-start gap-1.5">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {notice}
                </div>
              )}

              <button
                onClick={confirmOtp}
                disabled={busy || otpCode.length !== 6}
                className={primaryBtn}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Log in
              </button>

              <button
                onClick={requestOtp}
                disabled={busy}
                className="w-full text-[#5A6472] text-xs mt-3 hover:text-[#2563EB] disabled:opacity-50"
              >
                Didn&apos;t get it? Send a new code
              </button>

              {/* The "expired" people actually hit is almost never the clock. It
                  is typing the digits from an older email after asking for
                  another, because only one code per address is alive at a time.
                  Saying which email to read is worth more than saying how long
                  the code lasts. */}
              <p className="text-[11px] text-[#5A6472] mt-3 leading-relaxed">
                Use the digits from the <span className="font-semibold text-[#1B2430]">newest</span> email
                — asking for another code cancels the one before it. Each code
                works once, lasts 10 minutes, and dies after five wrong tries.
              </p>
            </>
          ) : (
          <>
          {/* Two ways in: a shared role login, or your own account. */}
          <div className="flex gap-2 mb-4 bg-[#EEF2F6] rounded-md p-1">
            {[
              { k: "role", label: "Role login" },
              { k: "own", label: "My own account" },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => { setTab(t.k); setError(""); setNotice(""); }}
                className={`flex-1 rounded py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  tab === t.k
                    ? "bg-white dark:bg-[#2A3546] text-[#2563EB] shadow-sm"
                    : "text-[#5A6472]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "role" ? (
            <>
              <div className="flex items-center gap-2 mb-3 text-[#1B2430] font-semibold">
                <ShieldCheck size={16} className="text-[#2563EB]" /> Pick your role
              </div>

              {/* This shop's shared logins, in the order the shop wants them. */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {roles.map((r) => {
                  const active = roleKey === r.key;
                  return (
                    <button
                      key={r.key}
                      onClick={() => { setRoleKey(r.key); setError(""); }}
                      className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                        active ? "border-transparent text-white" : "border-[#DEE3E9] text-[#1B2430] hover:border-[#C2CAD3]"
                      }`}
                      style={active ? { backgroundColor: r.color } : undefined}
                    >
                      <div className="text-sm font-bold">{r.label}</div>
                      <div className={`text-[10px] leading-tight mt-0.5 ${active ? "text-white/80" : "text-[#5A6472]"}`}>
                        {r.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {chosenRole && (
                <>
                  <Field label="Your own name (so your work is recorded under you)">
                    <div className="relative">
                      <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
                      <input
                        value={personName}
                        onChange={(e) => setPersonName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitRole()}
                        placeholder="e.g. Peter Njoroge"
                        className={inputCls + " pl-9"}
                        autoFocus
                      />
                    </div>
                  </Field>

                  <Field label={`${chosenRole.label} password`}>
                    <input
                      type="password"
                      value={rolePass}
                      onChange={(e) => setRolePass(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitRole()}
                      placeholder="••••••••"
                      className={inputCls}
                    />
                  </Field>

                  <button
                    onClick={() => setShowHelp((v) => !v)}
                    className="text-[#5A6472] text-[11px] mb-3 flex items-center gap-1 hover:text-[#2563EB]"
                  >
                    <HelpCircle size={12} /> Forgot the password?
                  </button>
                  {showHelp && (
                    <div className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-3 text-[11px] text-[#5A6472] mb-3 leading-relaxed">
                      Ask the admin — they can view and change every role password
                      under <span className="font-semibold text-[#1B2430]">Settings → Role Passwords</span>.
                      The starting password for each role is its name + 123
                      (e.g. <span className="font-mono">{defaultRolePassword(chosenRole.key)}</span>).
                    </div>
                  )}

                  {error && (
                    <div className="text-[#DC3B2E] text-sm mb-3 flex items-start gap-1.5">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
                    </div>
                  )}

                  <button
                    onClick={submitRole}
                    disabled={busy || !isConfigured}
                    className={primaryBtn}
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    Log in as {chosenRole.label}
                  </button>
                </>
              )}

              {!chosenRole && (
                <p className="text-[#5A6472] text-[11px] text-center leading-relaxed">
                  Tap a role above. You'll then type your own name and the role
                  password — no sign-up and no waiting for approval.
                </p>
              )}
            </>
          ) : (
          <>
          {/* ---------- STEP 2: the code we just emailed ----------
              Its own screen, the way every other app does it: nothing on it
              but the code, so there's no doubt about what to do next. */}
          {mode === "signup" && step === "code" ? (
            <>
              <button
                onClick={() => { setStep("form"); setError(""); setNotice(""); }}
                className="text-[#5A6472] text-xs mb-3 flex items-center gap-1 hover:text-[#2563EB]"
              >
                <ArrowLeft size={13} /> Back
              </button>

              <div className="text-center mb-4">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-[#EAF1FF] flex items-center justify-center">
                  <Mail size={22} className="text-[#2563EB]" />
                </div>
                <div className="font-semibold text-[#1B2430]">Check your email</div>
                <p className="text-[#5A6472] text-xs mt-1 leading-relaxed">
                  We sent a 6-digit code to<br />
                  <span className="font-semibold text-[#1B2430] break-all">{contact.trim().toLowerCase()}</span>
                </p>
              </div>

              <Field label="Enter the code">
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && confirmCode()}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={inputCls + " pl-9 text-center text-lg font-mono tracking-[0.4em]"}
                    autoFocus
                  />
                </div>
              </Field>

              {error && (
                <div className="text-[#DC3B2E] text-sm mb-3 flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}
              {notice && !error && (
                <div className="text-[#15926A] text-sm mb-3 flex items-start gap-1.5">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {notice}
                </div>
              )}

              <button
                onClick={confirmCode}
                disabled={busy || code.length !== 6}
                className={primaryBtn}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Verify &amp; create account
              </button>

              <button
                onClick={startSignup}
                disabled={busy}
                className="w-full text-[#5A6472] text-xs mt-3 hover:text-[#2563EB] disabled:opacity-50"
              >
                Didn't get it? Send a new code
              </button>
            </>
          ) : (
          <>
          <div className="flex items-center gap-2 mb-4 text-[#1B2430] font-semibold">
            <Lock size={16} className="text-[#2563EB]" />
            {mode === "signin" ? "Staff Login" : "Create Staff Account"}
          </div>

          {/* Sign IN still accepts either, because accounts made before this
              (and the ones an admin creates) have no real email and are found
              by name. Anyone who signed up with an email logs in with it. */}
          <Field label={mode === "signin" ? "Your email (or your name)" : "Your name"}>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={mode === "signin" ? "name@gmail.com" : "e.g. Josphat Kamau"}
                autoComplete={mode === "signin" ? "username" : "name"}
                className={inputCls + " pl-9"}
                autoFocus
              />
            </div>
          </Field>

          {/* Signing up now REQUIRES an email — it's what the code is sent to,
              and what lets the account be recovered later. */}
          {mode === "signup" && (
            <Field label="Your email">
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="name@gmail.com"
                  type="email"
                  autoComplete="email"
                  className={inputCls + " pl-9"}
                />
              </div>
            </Field>
          )}

          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={inputCls}
            />
          </Field>

          {mode === "signup" && (
            <Field label="Type the password again">
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="••••••••"
                autoComplete="new-password"
                className={inputCls}
              />
            </Field>
          )}

          {mode === "signup" && !mailBroken && (
            <p className="text-[#5A6472] text-[11px] -mt-1 mb-3 leading-relaxed">
              We'll email you a 6-digit code to check the address is really
              yours. Your account is created once you enter it.
            </p>
          )}

          {/* The shop's email sending isn't finished, so no code can arrive.
              Say so instead of leaving the person waiting on an inbox that
              will never get anything - the account was created anyway. */}
          {mode === "signup" && mailBroken && (
            <div className="-mt-1 mb-3 bg-[#FEF6E7] border border-[#E0A93B] rounded-md p-2.5 text-[11px] text-[#6B5417] leading-relaxed">
              This shop can't send codes by email yet, so your address wasn't
              confirmed — your account was created anyway. Tell the admin.
            </div>
          )}

          {error && (
            <div className="text-[#DC3B2E] text-sm mb-3 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {notice && (
            <div className="text-[#15926A] text-sm mb-3 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> {notice}
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy || !isConfigured}
            className={primaryBtn}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {mode === "signin" ? "Log In" : "Continue"}
          </button>

          {/* ---------- THE OTHER WAY IN ----------
              Sitting under the password button rather than in front of it, so
              the people who know their password lose nothing: they type it and
              tap Log In exactly as before. This is for the ones who don't. */}
          {mode === "signin" && otpOn && typedRealEmail && (
            <>
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-[#DEE3E9]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A6472]">or</span>
                <div className="flex-1 h-px bg-[#DEE3E9]" />
              </div>

              <button
                onClick={requestOtp}
                disabled={busy || !isConfigured}
                className="w-full border-2 border-[#2563EB] text-[#2563EB] font-bold uppercase tracking-wide rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                Email me a code
              </button>
              <p className="text-[11px] text-[#5A6472] mt-2 text-center leading-relaxed">
                Forgotten your password? Get a 6-digit code instead — it signs
                you in on its own.
              </p>
            </>
          )}

          {/* Offered, but not to this address. An account made from a name has an
              invented address behind it, so saying why beats a missing button
              that looks like the feature is broken. */}
          {mode === "signin" && otpOn && !typedRealEmail && name.trim().length > 1 && (
            <p className="text-[11px] text-[#5A6472] mt-3 text-center leading-relaxed">
              Type your real email address above if you&apos;d rather be sent a
              code than use your password.
            </p>
          )}

          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(""); setNotice(""); setStep("form"); setCode("");
            }}
            className="w-full text-[#5A6472] text-xs mt-3 hover:text-[#2563EB]"
          >
            {mode === "signin" ? "New staff member? Create an account" : "Already have an account? Sign in"}
          </button>
          </>
          )}
          </>
          )}
          </>
          )}

          {/* An installed app can get stuck on an old build whose requests no
              longer reach anything — this is the way out. */}
          {isNetworkError(error) && (
            <button
              onClick={hardReload}
              className="w-full mt-3 border border-[#DEE3E9] rounded-md py-2.5 text-xs font-bold uppercase tracking-wide text-[#5A6472] hover:border-[#2563EB] hover:text-[#2563EB]"
            >
              Still failing? Reset the app
            </button>
          )}
        </div>

        {/* "Put this on the home screen" — under the login card, not over it.
            It draws nothing at all unless there is one tap to gain, and it closes
            for good, because nothing may come between somebody and signing in. */}
        <div className="mt-3">
          <InstallNudge />
        </div>

        {/* For whoever answered "I work at the shop" and meant the other one, and
            for the customer who was handed the plain link. Small and at the
            bottom: it is the way out of a wrong turn, not an invitation to leave
            a screen somebody meant to be on. */}
        {onLeave && (
          <button
            onClick={onLeave}
            className="mx-auto mt-4 flex items-center gap-1.5 text-[12px] text-[#9FB3CC] hover:text-[#67E8F9] transition-colors"
          >
            <ShoppingBag size={13} />
            <span>Not staff? Looking for a part — see what the shop has</span>
          </button>
        )}

        <p className="text-center text-[11px] text-[#5A6472] mt-4">
          Developed by <span className="font-semibold text-[#1B2430]">Josphat Mbugua Kagiri</span>
        </p>
      </div>
    </div>
  );
}
