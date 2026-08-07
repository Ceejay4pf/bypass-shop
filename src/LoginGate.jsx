import React, { useState } from "react";
import { Boxes, Lock, User, AlertTriangle, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ShieldCheck, HelpCircle, Mail, KeyRound } from "lucide-react";
import { Field, inputCls } from "./ui.jsx";
import { signIn, signUp, signInRole, sendEmailCode, checkEmailCode } from "./lib/auth.js";
import { ROLE_ACCOUNTS, defaultRolePassword, setRoleSession } from "./lib/roleAccounts.js";
import { hardReload } from "./lib/hardReload.js";
import { isConfigured } from "./lib/supabase.js";

/* ---------------------------------------------------------
   REAL LOGIN — backed by Supabase Auth.

   Each staff member has their own email/password account, so
   every action is attributed to an authenticated user, not a
   self-typed name. Passwords are hashed server-side by Supabase;
   the app never sees or stores them.
--------------------------------------------------------- */
/* A spare-part emblem — a cog/gear with a piston, drawn in white so it sits
   cleanly on the blue hero. */
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

export default function LoginGate() {
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

  const chosenRole = ROLE_ACCOUNTS.find((r) => r.key === roleKey) || null;

  /* "Failed to fetch" means the browser never reached Supabase at all — the
     password was never even checked. Say so in plain words, because the raw
     message makes staff think they typed something wrong. */
  const isNetworkError = (msg) =>
    /failed to fetch|networkerror|network request failed|load failed|timeout|err_internet|connection/i.test(msg);

  const NETWORK_HELP =
    "Can't reach the internet. Check your data or Wi-Fi is on and try again — " +
    "your password is fine, the phone just couldn't connect.";

  const submitRole = async () => {
    setError("");
    setNotice("");
    if (!chosenRole) { setError("Pick your role first."); return; }
    if (!personName.trim()) { setError("Type your own name so your work is recorded under you."); return; }
    if (!rolePass) { setError("Enter the role password."); return; }
    setBusy(true);
    try {
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
      setNotice(`We sent a 6-digit code to ${to}. It works for 15 minutes.`);
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
      const ok = await checkEmailCode(contact.trim().toLowerCase(), code);
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
    <div className="min-h-screen bg-gradient-to-b from-[#EAF1FF] via-[#F3F5F8] to-[#F3F5F8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bp-pop">
        {/* Branded blue hero with a spare-part graphic */}
        <div className="relative overflow-hidden rounded-2xl mb-5 shadow-lg bg-gradient-to-br from-[#1E4FD6] via-[#2563EB] to-[#3B82F6]">
          {/* soft decorative circles */}
          <div className="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 -left-10 w-40 h-40 rounded-full bg-white/5" />

          <div className="relative px-6 pt-6 pb-7 text-center">
            <div className="text-white/70 text-[11px] font-bold tracking-[0.25em] uppercase">
              Jaspare Auto · Main Shop
            </div>

            {/* Spare-part emblem (gear + piston) */}
            <div className="mx-auto my-3 w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
              <SparePartIcon />
            </div>

            <h1 className="text-white text-3xl font-extrabold uppercase tracking-wide">
              Bypass Shop
            </h1>
            <p className="text-white/80 text-xs mt-1">Branch Inventory Management System</p>
          </div>
        </div>

        {!isConfigured && (
          <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-lg p-3 text-xs mb-4 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Supabase keys are missing. Create a <span className="font-mono">.env</span> file
            from <span className="font-mono">.env.example</span> and restart the dev server.
          </div>
        )}

        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-5 shadow-xl">
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

              {/* The four shared logins. */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {ROLE_ACCOUNTS.map((r) => {
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
                    className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-50"
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
                className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-50"
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
            className="w-full bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {mode === "signin" ? "Log In" : "Continue"}
          </button>

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

        <p className="text-center text-[11px] text-[#5A6472] mt-4">
          Developed by <span className="font-semibold text-[#1B2430]">Josphat Mbugua Kagiri</span>
        </p>
      </div>
    </div>
  );
}
