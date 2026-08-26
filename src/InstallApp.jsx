import { shopName } from "./lib/shopInfo.js";
import React, { useEffect, useState, useCallback } from "react";
import { Download, Share, Plus, Check, X, Smartphone } from "lucide-react";
import {
  installState, isStandalone, isIos, readDismissed, writeDismissed,
  showLoginNudge, IOS_STEPS,
} from "./lib/install.js";

/* ---------------------------------------------------------
   INSTALLING THE APP

   useInstall() catches the browser's one-shot `beforeinstallprompt` and holds
   it. It has to be mounted from the moment the page loads, because the browser
   fires that event once, early, and a component that mounts later has already
   missed it — which is why this lives at the top of both screens rather than
   behind a tab somebody navigates to.

   See src/lib/install.js for why iPhones get words instead of a button.
--------------------------------------------------------- */
export function useInstall() {
  const [prompt, setPrompt] = useState(null);
  const [standalone, setStandalone] = useState(() => isStandalone(window));
  const [dismissed, setDismissed] = useState(() => readDismissed(window.localStorage));

  useEffect(() => {
    const onPrompt = (e) => {
      // Stop Chrome's own bar so there is one offer, in our words, not two.
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => { setStandalone(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const ios = isIos({
    ua: navigator.userAgent || "",
    platform: navigator.platform || "",
    maxTouchPoints: navigator.maxTouchPoints || 0,
  });
  const state = installState({ standalone, promptReady: Boolean(prompt), ios });

  /* Replay the held event. It can only be used once — after that the browser
     wants a fresh gesture — so it is dropped either way, and the state falls
     back to "waiting" rather than leaving a button that silently does nothing. */
  const install = useCallback(async () => {
    if (!prompt) return "unavailable";
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      setPrompt(null);
      return outcome;              // "accepted" | "dismissed"
    } catch {
      setPrompt(null);
      return "failed";
    }
  }, [prompt]);

  const hide = useCallback(() => {
    writeDismissed(window.localStorage, true);
    setDismissed(true);
  }, []);

  return { state, ios, dismissed, install, hide };
}

/* The three iPhone taps. Shared by both screens so the wording can't drift. */
function IosSteps() {
  return (
    <ol className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
      {IOS_STEPS.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 w-4 h-4 rounded-full bg-[#2563EB] text-white text-[9px] font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="flex-1">
            {s}
            {i === 0 && <Share size={11} className="inline ml-1 -mt-0.5" />}
            {i === 1 && <Plus size={11} className="inline ml-1 -mt-0.5" />}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---- the small nudge above the password box ----
   Only drawn when there is something to gain by tapping it; see
   showLoginNudge(). It must never come between somebody and signing in, so it
   closes for good on one tap and the login screen looks exactly as it did. */
export function InstallNudge() {
  const { state, dismissed, install, hide } = useInstall();
  const [openSteps, setOpenSteps] = useState(false);
  if (!showLoginNudge({ state, dismissed })) return null;

  return (
    <div className="bg-[#FFFFFF]/95 border border-[#2563EB]/40 rounded-lg p-3 mb-3 text-[#1B2430] shadow-sm">
      <div className="flex items-start gap-2.5">
        <Smartphone size={16} className="text-[#2563EB] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold">Keep the shop on this phone</div>
          <p className="text-[11px] text-[#5A6472] leading-relaxed mt-0.5">
            Add it to the home screen and it opens like any other app — full
            screen, one tap, same login.
          </p>

          {state === "ready" ? (
            <button
              onClick={install}
              className="mt-2 w-full bg-[#2563EB] text-white text-[11px] font-bold uppercase tracking-wide rounded-md py-2 flex items-center justify-center gap-1.5"
            >
              <Download size={12} /> Install it
            </button>
          ) : openSteps ? (
            <IosSteps />
          ) : (
            <button
              onClick={() => setOpenSteps(true)}
              className="mt-2 w-full border border-[#2563EB] text-[#2563EB] text-[11px] font-bold uppercase tracking-wide rounded-md py-2"
            >
              Show me how
            </button>
          )}
        </div>
        <button
          onClick={hide}
          aria-label="Don't show this again"
          className="text-[#5A6472] hover:text-[#1B2430] shrink-0 p-0.5"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* ---- the Settings card ----
   Always present, in every state, because this is where somebody goes to look
   for it on purpose — including after dismissing the nudge, and including to
   confirm the phone they are holding is already the installed app. */
export function InstallCard() {
  const { state, install } = useInstall();
  const [msg, setMsg] = useState("");

  const go = async () => {
    const r = await install();
    if (r === "accepted") setMsg(`Installed. Look for the ${shopName()} icon with your other apps.`);
    else if (r === "dismissed") setMsg("No problem — nothing was installed. You can do it any time.");
    else setMsg("Your browser wouldn't offer it just now. Try Chrome's ⋮ menu → Install app.");
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#DEE3E9] rounded-lg p-4 mb-4">
      <div className="text-sm font-bold uppercase tracking-wide mb-1 flex items-center gap-2">
        <Smartphone size={15} className="text-[#2563EB]" /> Install On This Phone
        {state === "installed" && (
          <span className="ml-auto text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-[#15926A22] text-[#15926A]">
            Installed
          </span>
        )}
      </div>

      {state === "installed" ? (
        <p className="text-xs text-[#5A6472] leading-relaxed flex items-start gap-1.5">
          <Check size={13} className="text-[#15926A] mt-0.5 shrink-0" />
          You&apos;re using the installed app right now. It updates itself — there is
          nothing to download again when the shop gets new features.
        </p>
      ) : (
        <>
          <p className="text-xs text-[#5A6472] mb-2 leading-relaxed">
            Add the shop to the home screen and it opens like any other app: full
            screen, no address bar, its own icon. It is the same shop and the same
            login, so the link still works on a computer and it is still the same
            account.
          </p>
          {/* Said plainly, because it is the question everybody asks next. */}
          <p className="text-[11px] text-[#5A6472] mb-3 leading-relaxed">
            It still needs the internet to sell or change stock — installing puts
            the app on the phone, not the shop&apos;s records.
          </p>

          {state === "ready" ? (
            <button
              onClick={go}
              className="w-full bg-[#2563EB] text-white text-xs font-bold uppercase tracking-wide rounded-md py-2.5 flex items-center justify-center gap-1.5"
            >
              <Download size={13} /> Install it
            </button>
          ) : state === "ios" ? (
            <div className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#5A6472]">
                On an iPhone, Safari does it
              </div>
              <IosSteps />
            </div>
          ) : (
            <div className="bg-[#EEF2F6] border border-[#DEE3E9] rounded-md p-2.5 text-[11px] text-[#5A6472] leading-relaxed">
              This browser hasn&apos;t offered to install it. In Chrome or Edge, open
              the <span className="font-bold">⋮</span> menu and choose{" "}
              <span className="font-bold">Install app</span> — or open the shop in
              Chrome and come back here.
            </div>
          )}

          {msg && <p className="text-[11px] text-[#5A6472] mt-2 leading-relaxed">{msg}</p>}
        </>
      )}
    </div>
  );
}
