import React from "react";
import { Clock, LogOut, ShieldCheck } from "lucide-react";

/* Shown to a signed-in account that an admin hasn't approved yet.
   It listens (via the parent's realtime profile subscription) and unlocks
   automatically the moment an admin approves — no refresh needed. */
export default function PendingGate({ user, onSignOut }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF1FF] via-[#F3F5F8] to-[#F3F5F8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bp-pop text-center">
        <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-[#2563EB] flex items-center justify-center shadow-lg">
          <Clock size={30} className="text-white" />
        </div>
        <h1 className="text-xl font-extrabold uppercase tracking-wide text-[#1B2430]">
          Waiting for approval
        </h1>
        <p className="text-[#5A6472] text-sm mt-2 leading-relaxed">
          {user ? `Hi ${user}, your` : "Your"} account has been created. An admin at Jaspare Auto
          must approve it before you can use Bypass Shop.
        </p>

        <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mt-5 text-left flex items-start gap-3">
          <ShieldCheck size={18} className="text-[#15926A] mt-0.5 shrink-0" />
          <div className="text-xs text-[#5A6472] leading-relaxed">
            This screen unlocks <span className="font-semibold text-[#1B2430]">automatically</span> the
            moment you're approved — you don't need to refresh. Ask an admin to open
            <span className="font-semibold text-[#1B2430]"> Staff Approvals</span> and approve you.
          </div>
        </div>

        <button
          onClick={onSignOut}
          className="mt-6 inline-flex items-center gap-2 text-[#5A6472] font-semibold text-sm hover:text-[#DC3B2E]"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
