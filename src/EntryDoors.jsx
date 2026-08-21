import React, { useState, useEffect } from "react";
import { ArrowRight, Boxes } from "lucide-react";
import { SHOP_INFO } from "./lib/shopInfo.js";
import { getRolePersonName } from "./lib/roleAccounts.js";
import SlideShow from "./PartsShow.jsx";
import {
  alreadyEntered, markEntered, forgetEntry as clearEntryFlags, afterStage,
  showingDoors, doorsMoving, stillCovering, SHUT_MS, ROLL_MS,
} from "./lib/entry.js";

/* ---------------------------------------------------------
   THE WAY IN — what happens between the password and the system.

   Two shutter doors roll open, then a Next button, then a slide show of the
   parts this shop deals in, then the system. Three beats, in that order, because
   that is how walking into the shop actually goes: the door comes up, you step
   through, you see the shelves.

   IT IS SHOWN ON A LOGIN, NOT ON A RELOAD. The flag lives in sessionStorage
   under this browser tab, so somebody who refreshes mid-shift — or whose phone
   reopens the installed app — goes straight to work. Signing out clears it (see
   `forgetEntry`), so the next person to sign in on this phone gets the doors.

   THE SYSTEM IS LOADING BEHIND THIS. It is drawn as a sheet over the app rather
   than in place of it, so the inventory is being fetched while the doors are
   rolling. By the time somebody taps through, the shelves are already there —
   the animation costs nothing but the animation.
--------------------------------------------------------- */

/* Called on sign-out and on an admin's force-logout, so the doors belong to a
   login rather than to a phone. The rules are in src/lib/entry.js; this is only
   where the browser's two stores are handed over. */
export function forgetEntry() {
  try { clearEntryFlags([sessionStorage, localStorage]); } catch { /* storage off */ }
}

export default function EntryDoors({ session }) {
  const id = session?.user?.id || "";
  /* The person, not the login. On a shared role login the account is called
     "Storekeeper" and greeting somebody by their job title is worse than not
     greeting them, so their own typed name wins where there is one. */
  const who = getRolePersonName() || session?.user?.user_metadata?.full_name || "";

  /* "shut" for a blink so the doors are seen to be shut before they move — an
     animation that has already started when the screen appears reads as a glitch.
     Then "opening" while they roll, "open" once the Next button is warranted,
     and "parts" for the shelves. */
  const [stage, setStage] = useState(() => {
    let store = null;
    try { store = sessionStorage; } catch { /* storage off — show the doors */ }
    return alreadyEntered(store, id) ? "done" : "shut";
  });

  /* Both beats are set up once, on mount, and NOT on every stage change: an
     effect that watched `stage` would tear its own second timer down the moment
     the first one fired, and the Next button would never arrive. */
  useEffect(() => {
    if (stage !== "shut") return;
    const a = setTimeout(() => setStage("opening"), SHUT_MS);
    /* Matches the roll in index.css. A timer rather than an animationend
       listener, so a browser that refuses the animation — an old phone, or one
       set to reduce motion — still gets its Next button. */
    const b = setTimeout(() => setStage("open"), SHUT_MS + ROLL_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    try { markEntered(sessionStorage, id); } catch { /* nothing to do */ }
    setStage("done");
  };

  if (!stillCovering(stage)) return null;

  const rolling = showingDoors(stage);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#070B12]">
      {rolling ? (
        /* ---------- THE DOORS ---------- */
        <div className="relative min-h-full flex items-center justify-center p-4">
          {/* What is behind them: the shop's own light. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 40%, #2563EB 0%, #1230A8 42%, #070B12 100%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-40"
            style={{ background: "radial-gradient(45% 35% at 50% 45%, #67E8F9 0%, transparent 70%)" }}
          />

          <div className="relative text-center px-6">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-white/15 ring-1 ring-white/30 backdrop-blur flex items-center justify-center">
              <Boxes size={38} className="text-white" />
            </div>
            <h1 className="text-white text-3xl sm:text-4xl font-extrabold uppercase tracking-wide mt-4">
              Bypass Shop
            </h1>
            <p className="text-[#BFDBFE] text-xs tracking-[0.3em] uppercase mt-2">
              {SHOP_INFO.branch.name}
            </p>

            {stage === "open" ? (
              <div className="bp-fade-up mt-8">
                <p className="text-white/90 text-sm mb-4">
                  {who ? <>The shop is open, <span className="font-bold">{who}</span>.</> : "The shop is open."}
                </p>
                <button
                  onClick={() => setStage(afterStage("open"))}
                  className="inline-flex items-center gap-2 bg-white text-[#1230A8] font-extrabold uppercase tracking-wide rounded-full px-8 py-3.5 shadow-2xl active:scale-[0.98] transition-transform"
                >
                  Next <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              /* Held open with the same height as the button above, or the name
                 jumps up the screen the moment the doors finish. */
              <div className="mt-8 h-[6.5rem] flex items-start justify-center">
                <span className="text-white/60 text-xs tracking-[0.2em] uppercase">Opening up…</span>
              </div>
            )}
          </div>

          {/* The two shutters. Above everything, and they leave the screen. */}
          <Shutter side="left" moving={doorsMoving(stage)} />
          <Shutter side="right" moving={doorsMoving(stage)} />
        </div>
      ) : (
        /* ---------- WHAT THIS SHOP DEALS IN ---------- */
        <div className="min-h-full bg-gradient-to-b from-[#0B1220] via-[#101A2E] to-[#070B12]">
          <div className="max-w-3xl mx-auto px-4 py-8 bp-fade-up">
            <div className="text-center mb-6">
              <div className="text-[#7DD3FC] text-[11px] font-bold tracking-[0.3em] uppercase">
                {SHOP_INFO.branch.name}
              </div>
              <h2 className="text-white text-2xl sm:text-3xl font-extrabold mt-1">
                What is on the shelves
              </h2>
              {/* The makes come from shopInfo.js, the same place the receipts
                  take them from, so this screen can never end up advertising a
                  car the shop stopped stocking. */}
              <p className="text-[#9FB3CC] text-sm mt-2 max-w-md mx-auto leading-relaxed">
                {SHOP_INFO.branch.parts}.<br />
                <span className="text-[#7DD3FC]">{SHOP_INFO.branch.makes}</span>
              </p>
            </div>

            {/* The show, not a wall of tiles. One part at a time, big enough to
                actually see, and it says what car each one came off — a grille
                is only useful when you know which front it fits.

                SlideShow also carries the line about these being photographs of
                parts LIKE the shop's rather than of its own stock: a storekeeper
                who thinks otherwise will go looking for a red Mazda that was
                never in the building. */}
            <SlideShow />

            <button
              onClick={finish}
              className="w-full max-w-sm mx-auto mt-7 flex items-center justify-center gap-2 bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white font-extrabold uppercase tracking-wide rounded-full py-4 shadow-2xl active:scale-[0.99] transition-transform"
            >
              <ArrowRight size={18} /> Go to the system
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* One shutter. Rolled steel, a handle, and the diagonal hazard stripe every
   shop door in town has on it. */
function Shutter({ side, moving }) {
  const left = side === "left";
  return (
    <div
      className={`absolute top-0 bottom-0 w-1/2 ${left ? "left-0" : "right-0"} ${
        moving ? (left ? "bp-door-l" : "bp-door-r") : ""
      }`}
      style={{
        background: left
          ? "linear-gradient(100deg, #1B2430 0%, #2A3546 55%, #10161F 100%)"
          : "linear-gradient(260deg, #1B2430 0%, #2A3546 55%, #10161F 100%)",
        boxShadow: left ? "8px 0 30px rgba(0,0,0,0.55)" : "-8px 0 30px rgba(0,0,0,0.55)",
      }}
    >
      {/* the ribs of a roller door */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 2px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 14px)",
        }}
      />
      {/* the hazard stripe down the closing edge */}
      <div
        className={`absolute top-0 bottom-0 w-3 ${left ? "right-0" : "left-0"}`}
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #E0A93B 0px, #E0A93B 10px, #1B2430 10px, #1B2430 20px)",
        }}
      />
      {/* the handle */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 ${left ? "right-6" : "left-6"} w-2.5 h-16 rounded-full`}
        style={{ background: "linear-gradient(to bottom, #E8EDF4, #8E9AA9)" }}
      />
    </div>
  );
}
