import React from "react";
import { ShoppingBag, Boxes, ArrowRight } from "lucide-react";
import { SHOP_INFO } from "./lib/shopInfo.js";
import { SlidePictures, useSlideshow } from "./PartsShow.jsx";
import { slidesFor } from "./lib/slides.js";
import { currentShopSlug } from "./lib/shopScope.js";

/* ---------------------------------------------------------
   THE FRONT DOOR — customer, or working here?

   One address serves both the parts list and the shop's own system. When the
   address alone does not say which — somebody typed the bare link, or tapped the
   installed app for the first time — this asks instead of guessing.

   IT ASKS EVERY TIME AND KEEPS NOTHING. It used to answer once per device and
   remember, which was fewer taps and meant a phone that tapped "customer" once
   could no longer reach the sign-in screen at all — the way out was a path nobody
   had been told about. One tap on opening is the smaller price.

   A LINK STILL BEATS THIS, and that is the answer for anybody who resents the
   tap: /jaspare goes straight to the parts list and /system straight to the
   sign-in, no question asked. A shop phone's home-screen shortcut belongs on
   /system, and the link handed to a customer belongs on /jaspare.
--------------------------------------------------------- */

export default function FrontDoor({ onPick, shop, onChooseShop }) {
  /* Whose door this is. One build serves more than one business, and the two
     buttons below lead into whichever shop the address named — so this line has to
     be that shop's name, not a constant. Getting it wrong sends a Surefit customer
     into Jaspare's parts list believing it is Surefit's shelf. */
  const shopName = shop?.name || SHOP_INFO.branch.name;
  const shopTagline = shop?.tagline || SHOP_INFO.branch.tagline;
  /* The same show as the login board and the way in. Behind the two doors here
     because a customer who has just tapped a WhatsApp link has no idea what this
     shop sells until something shows them. */
  /* This shop's cars. Same photographs at both shops, different opening — see
     src/lib/slides.js. */
  const slides = slidesFor(currentShopSlug());
  const show = useSlideshow(slides.length);
  const onShow = slides[show.at] || slides[0];

  return (
    <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
      <div className="w-full max-w-md bp-pop">
        {/* ---------- THE SHOP ---------- */}
        <div className="relative overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/15 mb-4">
          <SlidePictures slides={slides} at={show.at} reached={show.reached} decorative />
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
              {shopName}
            </div>
            <h1
              className="text-white text-3xl font-extrabold uppercase tracking-wide mt-1.5"
              style={{ textShadow: "0 2px 12px rgba(4,12,40,0.55)" }}
            >
              {shop?.name || SHOP_INFO.branch.name}
            </h1>
            {shopTagline ? (
              <p className="text-[#E6F6FF] text-xs mt-1.5">{shopTagline}</p>
            ) : null}
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
        {/* THE WAY BACK TO THE SHOP CHOICE.

            Not an afterthought. This screen is what the bare link opens after a shop
            has been chosen, and somebody who tapped the wrong business here has no
            other way out — expecting them to know the address of the picker is
            expecting them to type a path they have never been shown. */}
        {onChooseShop && (
          <button
            onClick={onChooseShop}
            className="mx-auto mt-4 block text-[12px] text-[#9FB3CC] hover:text-[#67E8F9] transition-colors underline"
          >
            This isn&apos;t the shop I wanted — choose again
          </button>
        )}

        <p className="text-[#6F8299] text-[11px] text-center mt-4 leading-relaxed">
          Nothing is saved and nothing is remembered — you&apos;ll be asked again next
          time you open it. Both pages have a small link at the bottom that brings
          you straight back here.
        </p>
      </div>
    </div>
  );
}
