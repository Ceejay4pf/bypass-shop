import React, { useState } from "react";
import { Boxes, Lock, User, AlertTriangle, ArrowRight, Loader2, Phone, CheckCircle2 } from "lucide-react";
import { Field, inputCls } from "./ui.jsx";
import { signIn, signUp } from "./lib/auth.js";
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
  const [mode, setMode] = useState("signin"); // signin | signup
  const [name, setName] = useState("");        // name OR phone/email — the login id
  const [contact, setContact] = useState("");  // optional phone or email (signup only)
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const submit = async () => {
    setError("");
    setNotice("");
    if (!name.trim()) {
      setError(mode === "signin" ? "Enter your name (or phone/email)." : "Enter your name.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(name.trim(), password);
        // useAuth() in App picks up the session automatically.
      } else {
        await signUp(name.trim(), password, contact.trim());
        // Immediately log them in so there's no confirmation step to fight.
        try {
          await signIn(contact.includes("@") ? contact.trim() : name.trim(), password);
        } catch {
          setNotice("Account created — now sign in with your name and password.");
          setMode("signin");
        }
      }
    } catch (e) {
      const msg = e.message || "Login failed.";
      if (/already registered/i.test(msg)) {
        setError("That name is already taken — try signing in, or add your phone to make it unique.");
      } else if (/invalid login credentials/i.test(msg)) {
        setError("Name or password is wrong. New here? Tap “Create an account”.");
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
          <div className="flex items-center gap-2 mb-4 text-[#1B2430] font-semibold">
            <Lock size={16} className="text-[#2563EB]" />
            {mode === "signin" ? "Staff Login" : "Create Staff Account"}
          </div>

          <Field label={mode === "signin" ? "Your name (or phone / email)" : "Your name"}>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="e.g. Josphat Kamau"
                className={inputCls + " pl-9"}
                autoFocus
              />
            </div>
          </Field>

          {mode === "signup" && (
            <Field label="Phone or email (optional)">
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6472]" />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="0712 345 678"
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
              className={inputCls}
            />
          </Field>

          {mode === "signup" && (
            <p className="text-[#5A6472] text-[11px] -mt-1 mb-3 leading-relaxed">
              Just pick a name and password — no email needed. The system saves
              your name and stamps it on everything you do.
            </p>
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
            {mode === "signin" ? "Log In" : "Create Account"}
          </button>

          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}
            className="w-full text-[#5A6472] text-xs mt-3 hover:text-[#2563EB]"
          >
            {mode === "signin" ? "New staff member? Create an account" : "Already have an account? Sign in"}

          </button>
        </div>
      </div>
    </div>
  );
}
