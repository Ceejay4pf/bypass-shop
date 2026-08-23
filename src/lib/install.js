/* ---------------------------------------------------------
   "PUT THIS ON THE HOME SCREEN"

   The shop has been installable for months and nobody installed it, because the
   only way in was Chrome's ⋮ menu — four taps down a menu nobody opens, in a
   browser most staff treat as "the internet" rather than as a program with
   settings. So the app has to offer it itself.

   Three different worlds, and pretending otherwise is how you end up with a
   button that does nothing:

     Android / Chrome / Edge — the browser fires `beforeinstallprompt`, we keep
       that event, and pressing our button replays it. One tap, a system dialog,
       done. The event fires ONCE, so it must be caught at startup and held.

     iPhone / iPad — Safari has no such event and never will. There is no way to
       install from script. All that can be done is show the three taps. A button
       here would be a lie, so this returns instructions instead.

     Already installed — say so and offer nothing. An "install" button inside the
       installed app is the clearest possible sign nobody tested it.

   Everything is a plain function over values so it can be tested without a
   browser; the component passes the browser's answers in.
--------------------------------------------------------- */

export const DISMISS_KEY = "bp_install_hidden";

/* The three taps on an iPhone, in the words on the actual buttons. "Share" is
   the square with the arrow out of the top, and saying so saves a phone call. */
export const IOS_STEPS = [
  "Tap the Share button — the square with an arrow pointing up, at the bottom of Safari.",
  "Scroll down the list and tap \"Add to Home Screen\".",
  "Tap \"Add\". The Bypass Shop icon appears with your other apps.",
];

/* Which of the four situations we are in.
     "installed" — running from the home screen already
     "ready"     — the browser has offered us a prompt to replay
     "ios"       — no prompt exists; show the steps
     "waiting"   — a browser that may yet offer one, or one that never will */
export function installState({ standalone = false, promptReady = false, ios = false } = {}) {
  if (standalone) return "installed";
  if (promptReady) return "ready";
  if (ios) return "ios";
  return "waiting";
}

/* Is this window the installed app rather than a browser tab?

   Three separate tells, because no single one covers every platform: the
   standards one, Safari's own property, and Android's TWA wrapper — which is
   what a PWABuilder APK would report if one is ever made. */
export function isStandalone(win) {
  try {
    if (win?.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    if (win?.matchMedia?.("(display-mode: fullscreen)")?.matches) return true;
    if (win?.navigator?.standalone === true) return true;
    if (String(win?.document?.referrer || "").startsWith("android-app://")) return true;
  } catch { /* a browser that won't answer is treated as a browser tab */ }
  return false;
}

/* An iPhone or iPad.

   iPadOS 13 and later lies in its user agent and calls itself a Macintosh, so
   a touch count is the only way to tell an iPad from a real Mac. Being wrong
   towards "iPad" on a touchscreen Mac costs somebody three instructions that
   don't apply; being wrong the other way hides installing from every iPad in
   the shop. */
export function isIos({ ua = "", platform = "", maxTouchPoints = 0 } = {}) {
  const s = `${ua} ${platform}`;
  if (/iphone|ipod/i.test(s)) return true;
  if (/ipad/i.test(s)) return true;
  if (/mac/i.test(s) && Number(maxTouchPoints) > 1) return true;
  return false;
}

/* Whether to keep offering it. Hidden is remembered per device, because the
   answer is about this phone — a person who installed it on the counter tablet
   should still be asked on their own phone. */
export function readDismissed(storage) {
  try { return storage?.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

export function writeDismissed(storage, hidden) {
  try {
    if (hidden) storage?.setItem(DISMISS_KEY, "1");
    else storage?.removeItem(DISMISS_KEY);
  } catch { /* a phone refusing storage just gets asked again next time */ }
}

/* Should the nudge on the login screen be drawn at all?

   Deliberately stricter than the Settings card: Settings explains the app
   whatever the state, but the login screen only interrupts when there is one tap
   to gain. Nothing is shown to somebody already installed, to somebody who said
   no, or to a browser that hasn't offered a prompt — a nudge you cannot act on
   is just noise in front of a password box. */
export function showLoginNudge({ state = "waiting", dismissed = false } = {}) {
  if (dismissed) return false;
  return state === "ready" || state === "ios";
}
