import React from "react";
import {
  Boxes, X, PackagePlus, ShoppingCart, Search, FileText, Bell,
  History, Zap, CheckCircle2, ArrowRight,
} from "lucide-react";

/* ---------------------------------------------------------
   WELCOME / GUIDE — the first thing a new staff member sees.
   Introduces the shop and explains how the system works.
   Shown automatically on first use (per device) and re-openable
   any time from the sidebar.
--------------------------------------------------------- */
const STEPS = [
  { icon: Search, title: "Find a part", body: "Use Search or open Inventory — tap a category, then the part. Every part has a unique code." },
  { icon: PackagePlus, title: "Receive new stock", body: "Add New Stock adds quantity to a part when it arrives from a supplier." },
  { icon: ShoppingCart, title: "Sell a part", body: "Sell Item records who bought it, the price, and whether it's paid. Stock drops automatically." },
  { icon: FileText, title: "Make a quotation", body: "Quotation lets you list parts with prices you type — the system adds up the total for the customer." },
  { icon: Bell, title: "Watch notifications", body: "Every sale, restock and low-stock alert is logged and shared with Jaspare Auto — Main Shop." },
  { icon: History, title: "Nothing is lost", body: "The Ledger shows the full history of any part: every add, sale and adjustment, with who did it." },
];

export default function Welcome({ user, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0A0F1AAA] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#FFFFFF] border border-[#DEE3E9] rounded-xl shadow-2xl bp-pop my-8">
        {/* header */}
        <div className="relative p-6 border-b border-[#DEE3E9] text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[#5A6472] hover:text-[#1B2430] p-1 rounded-md hover:bg-[#EEF2F6]"
            title="Close"
          >
            <X size={20} />
          </button>
          <div className="text-[#5A6472] text-[11px] font-bold tracking-[0.25em] uppercase">
            Jaspare Auto · Main Shop
          </div>
          <h1 className="text-[#1B2430] text-2xl font-extrabold uppercase tracking-wide flex items-center justify-center gap-2 mt-1">
            <Boxes size={24} className="text-[#2563EB]" /> Bypass Shop
          </h1>
          <p className="text-[#5A6472] text-sm mt-2">
            {user ? <>Welcome, <span className="font-semibold text-[#1B2430]">{user}</span>! </> : "Welcome! "}
            This is the branch inventory &amp; sales system for our spare-parts shop.
          </p>
        </div>

        {/* what it does */}
        <div className="p-6">
          <div className="text-[#2563EB] text-[11px] font-bold tracking-[0.2em] uppercase mb-3">
            What this system does
          </div>
          <p className="text-sm text-[#5A6472] leading-relaxed mb-5">
            It keeps a live, shared record of every spare part in the shop — how many we have,
            where they are, what sells, and what's running low. It works from any phone or
            computer, and everyone sees the same up-to-date stock instantly.
          </p>

          <div className="text-[#2563EB] text-[11px] font-bold tracking-[0.2em] uppercase mb-3">
            How to use it
          </div>
          <div className="space-y-3">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-md bg-[#2563EB22] flex items-center justify-center shrink-0">
                    <Icon size={17} className="text-[#2563EB]" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[#1B2430]">{s.title}</div>
                    <div className="text-xs text-[#5A6472] leading-relaxed">{s.body}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-start gap-2 text-xs text-[#15926A] bg-[#E6F6EF] border border-[#15926A] rounded-md p-3">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>
              Everything you do is saved to your name automatically. Take your time —
              you can reopen this guide any time from the <span className="font-semibold">Guide</span> button in the menu.
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-5 bg-[#2563EB] text-[#F3F5F8] font-bold uppercase tracking-wide rounded-md py-3 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
          >
            <Zap size={16} /> Start using Bypass Shop <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
