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
    <div className="min-h-screen bg-[#F3F5F8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bp-pop">
        <div className="text-center mb-6">
          <div className="text-[#5A6472] text-[11px] font-bold tracking-[0.25em] uppercase">
            Jaspare Auto · Main Shop
          </div>
          <h1 className="text-[#1B2430] text-2xl font-extrabold uppercase tracking-wide flex items-center justify-center gap-2 mt-1">
            <Boxes size={22} className="text-[#2563EB]" /> Bypass Shop
          </h1>
          <p className="text-[#5A6472] text-xs mt-1">Branch Inventory Management System</p>
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
