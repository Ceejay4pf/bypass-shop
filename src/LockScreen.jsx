import React, { useEffect, useState } from "react";
import { Fingerprint, Boxes, Loader2, AlertTriangle } from "lucide-react";
import { unlock } from "./lib/appLock.js";

/* Full-screen biometric gate shown when the app-lock is on and the
   current session hasn't been unlocked yet. */
export default function LockScreen({ user, onUnlocked }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const tryUnlock = async () => {
    setErr("");
    setBusy(true);
    try {
      await unlock();
      onUnlocked();
    } catch (e) {
      setErr(e?.message || "Couldn't verify. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Offer the biometric prompt automatically on open.
  useEffect(() => {
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-[#F3F5F8] flex flex-col items-center justify-center p-6 text-center">
      <div className="flex items-center gap-2 mb-8">
        <Boxes size={26} className="text-[#2563EB]" />
        <span className="text-xl font-extrabold uppercase tracking-wide text-[#1B2430]">Bypass Shop</span>
      </div>

      <button
        onClick={tryUnlock}
        disabled={busy}
        className="w-24 h-24 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-70"
        title="Unlock"
      >
        {busy ? <Loader2 size={40} className="animate-spin" /> : <Fingerprint size={44} />}
      </button>

      <div className="mt-6 text-[#1B2430] font-semibold">
        {user ? `Welcome back, ${user}` : "Locked"}
      </div>
      <div className="text-[#5A6472] text-sm mt-1">
        {busy ? "Verifying…" : "Use your fingerprint or Face ID to unlock."}
      </div>

      {err && (
        <div className="mt-5 text-[#DC3B2E] text-sm flex items-center gap-1.5">
          <AlertTriangle size={14} /> {err}
        </div>
      )}

      {!busy && (
        <button onClick={tryUnlock} className="mt-6 text-[#2563EB] font-semibold text-sm hover:underline">
          Tap to unlock
        </button>
      )}
    </div>
  );
}
