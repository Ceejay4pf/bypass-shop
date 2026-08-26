import React from "react";
import { Store, ArrowRight, Phone, Clock } from "lucide-react";
import { SlidePictures, useSlideshow } from "./PartsShow.jsx";
import { SLIDES } from "./lib/slides.js";

/* ---------------------------------------------------------
   WHICH SHOP? — the landing page

   One build, one address, more than one business. This is the first thing the link
   opens, and its whole job is to let somebody choose the shop before anything else
   happens — before the customer-or-staff question, and before any sign-in. The shop
   chosen here is the shop every query for the rest of the visit is narrowed to.

   THE OLD LINKS SKIP IT ENTIRELY. /jaspare, /shop and /system still go straight
   where they always went. This page is for the bare address and for the installed
   app's icon, where nobody has said anything yet.

   A SHOP THAT IS NOT OPEN YET IS SHOWN AND SAID SO. Surefit Autoparts Ltd has a
   name and a phone number in this build before it has a single row in the database.
   Hiding it would mean nobody could tell the link worked; opening it would show
   Jaspare's 604 parts under Surefit's name, which is the one outcome worth
   preventing at any cost. So it is listed, it is not tappable, and it says why in
   words rather than by being greyed out and mute.
--------------------------------------------------------- */

export default function ShopPicker({ shops = [], onPick, loading = false }) {
  const show = useSlideshow(SLIDES.length);
  const onShow = SLIDES[show.at] || SLIDES[0];

  return (
    <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
      <div className="w-full max-w-md bp-pop">
        {/* ---------- THE BOARD ---------- */}
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
              Spare parts
            </div>
            <h1
              className="text-white text-3xl font-extrabold uppercase tracking-wide mt-1.5"
              style={{ textShadow: "0 2px 12px rgba(4,12,40,0.55)" }}
            >
              Which shop?
            </h1>
            <p className="text-[#E6F6FF] text-xs mt-1.5">
              Choose the shop you are here for. Everything after this — the parts
              list, and signing in — is that shop only.
            </p>
            <p className="text-[#A5F3FC] text-[11px] mt-3 font-semibold">
              {onShow?.car ? `${onShow.car} · ` : ""}{onShow?.part}
            </p>
          </div>
        </div>

        {/* Only while the real list is still coming. The app already knows two
            shops, so this is never an empty screen — it is the difference between
            "these are the two" and "these are the two, and there may be more". */}
        {loading && (
          <p className="text-center text-[#6F8299] text-[11px] mb-3">Checking for other shops…</p>
        )}

        {shops.map((s) => {
          const open = s.ready !== false;
          const tel = String(s.phone || "").replace(/[^\d+]/g, "");

          if (open) {
            return (
              <button
                key={s.slug}
                onClick={() => onPick(s)}
                className="w-full text-left rounded-2xl p-4 mb-3 bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white shadow-xl active:scale-[0.99] transition-transform flex items-center gap-3.5"
              >
                <span className="w-12 h-12 rounded-xl bg-white/20 ring-1 ring-white/30 flex items-center justify-center shrink-0">
                  <Store size={22} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold uppercase tracking-wide">{s.name}</span>
                  {s.tagline ? (
                    <span className="block text-[12px] text-[#E6F6FF] leading-snug mt-0.5">
                      {s.tagline}
                    </span>
                  ) : null}
                  {s.phone ? (
                    <span className="block text-[11px] text-[#CFEAFF] mt-1">{s.phone}</span>
                  ) : null}
                </span>
                <ArrowRight size={20} className="shrink-0" />
              </button>
            );
          }

          /* Not a button. A tile that looks tappable and does nothing is read as a
             broken app; this one carries the reason and a number that works. */
          return (
            <div
              key={s.slug}
              className="w-full rounded-2xl p-4 mb-3 bg-[#0C1424] ring-1 ring-white/10"
            >
              <div className="flex items-center gap-3.5">
                <span className="w-12 h-12 rounded-xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center shrink-0">
                  <Clock size={20} className="text-[#9FB3CC]" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold uppercase tracking-wide text-[#C7D6E8]">
                    {s.name}
                  </div>
                  <div className="text-[12px] text-[#8298B2] leading-snug mt-0.5">
                    Not on the system yet — its parts list hasn&apos;t been loaded.
                    Please ring the shop.
                  </div>
                </div>
              </div>
              {tel ? (
                <a
                  href={`tel:${tel}`}
                  className="mt-3 w-full rounded-xl bg-[#101A2E] ring-1 ring-white/15 py-2.5 text-center text-[13px] font-bold text-[#67E8F9] flex items-center justify-center gap-2"
                >
                  <Phone size={15} />
                  {s.phone}
                </a>
              ) : null}
            </div>
          );
        })}

        <p className="text-[#6F8299] text-[11px] text-center mt-4 leading-relaxed">
          Nothing is saved and nothing is remembered — you&apos;ll be asked again
          next time you open this. Every page after this has a small link back to
          here.
        </p>
      </div>
    </div>
  );
}
