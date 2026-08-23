import React from "react";
import { ShoppingBag, Boxes, ArrowRight } from "lucide-react";
import { SHOP_INFO } from "./lib/shopInfo.js";
import { SlidePictures, useSlideshow } from "./PartsShow.jsx";
import { SLIDES } from "./lib/slides.js";

/* ---------------------------------------------------------
   THE FRONT DOOR — customer, or working here?

   One address serves both the parts list and the shop's own system. When the
   address alone does not say which — somebody typed the bare link, or tapped the
   installed app for the first time — this asks instead of guessing.

   IT IS ASKED ONCE PER DEVICE. The answer is kept in localStorage (see
   `rememberDoor` in src/lib/publicRoute.js), so a storekeeper taps "I work here"
   on their first morning and the shop's link behaves exactly as it always did
   from then on. A customer taps the other one and never sees a sign-in screen.

   A LINK STILL BEATS THIS. /jaspare goes straight to the parts list and /system
   straight to the sign-in, whatever this device answered — which is why the link
   handed to a customer is the one that matters, not this screen.
--------------------------------------------------------- */

export default function FrontDoor({ onPick }) {
  /* The same show as the login board and the way in. Behind the two doors here
     because a customer who has just tapped a WhatsApp link has no idea what this
     shop sells until something shows them. */
  const show = useSlideshow(SLIDES.length);
  const onShow = SLIDES[show.at] || SLIDES[0];

  return (
    <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
      <div className="w-full max-w-md bp-pop">
        {/* ---------- THE SHOP ---------- */}
        <div className="relative overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/15 mb-4">
          <SlidePictures slides={SLIDES} at={show.at} reached={show.reached} decorative />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(160deg, rgba(9,20,64,0.90) 0%, rgba(37,99,235,0.78) 55%, rgba(6,182,212,0.55) 100%)",
            }}
          />
          <div className="bp-sheen absolute top-0 bottom-0 left-0 w-1/4 bg-white/25 blur-lg pointer-events-none" />
          <div className="relative px-6 pt-7 pb-6 text-center">
            <div className="text-[#BFDBFE] text-[11px] font-bold tracking-[0.25em] uppercase">
              Jaspare Auto · Main Shop
            </div>
            <h1
              className="text-white text-3xl font-extrabold uppercase tracking-wide mt-1.5"
              style={{ textShadow: "0 2px 12px rgba(4,12,40,0.55)" }}
            >
              Bypass Shop
            </h1>
            <p className="text-[#E6F6FF] text-xs mt-1.5">{SHOP_INFO.branch.tagline}</p>
            <p className="text-[#A5F3FC] text-[11px] mt-3 font-semibold">
              {onShow?.car ? `${onShow.car} · ` : ""}{onShow?.part}
            </p>
          </div>
        </div>

        <p className="text-center text-[#9FB3CC] text-sm mb-3">Which are you?</p>

        {/* The customer first, and the bigger of the two. Far more people
            arriving at this address are looking for a headlight than are coming
            to key in a sale, and the one who works here only ever taps it once. */}
        <button
          onClick={() => onPick("customer")}
          className="w-full text-left rounded-2xl p-4 mb-3 bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white shadow-xl active:scale-[0.99] transition-transform flex items-center gap-3.5"
        >
          <span className="w-12 h-12 rounded-xl bg-white/20 ring-1 ring-white/30 flex items-center justify-center shrink-0">
            <ShoppingBag size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-extrabold uppercase tracking-wide">I'm looking for a part</span>
            <span className="block text-[12px] text-[#E6F6FF] leading-snug mt-0.5">
              See what the shop has by section, and send an order. No sign-in.
            </span>
          </span>
          <ArrowRight size={20} className="shrink-0" />
        </button>

        <button
          onClick={() => onPick("staff")}
          className="w-full text-left rounded-2xl p-4 bg-[#101A2E] ring-1 ring-white/15 text-white active:scale-[0.99] transition-transform flex items-center gap-3.5"
        >
          <span className="w-12 h-12 rounded-xl bg-[#2563EB]/25 ring-1 ring-[#67E8F9]/40 flex items-center justify-center shrink-0">
            <Boxes size={22} className="text-[#67E8F9]" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-extrabold uppercase tracking-wide">I work at the shop</span>
            <span className="block text-[12px] text-[#9FB3CC] leading-snug mt-0.5">
              Sign in to the inventory system.
            </span>
          </span>
          <ArrowRight size={20} className="shrink-0 text-[#9FB3CC]" />
        </button>

        {/* Said plainly, because a screen that silently remembers an answer is a
            screen somebody thinks is broken when it stops appearing. */}
        <p className="text-[#6F8299] text-[11px] text-center mt-4 leading-relaxed">
          This phone will remember your answer and go straight there next time.
          Both pages have a small link at the bottom that brings you back here, so
          a wrong answer costs one tap.
        </p>
      </div>
    </div>
  );
}
