/* ---------------------------------------------------------
   BYPASS SHOP — telling one phone from another

   A password alone means anybody holding it can open the shop's stock and
   takings from any phone in the world. So the shop can ask for an emailed code
   the first time an account is used on a phone it has never seen.

   For that, a phone needs a name of its own. This is NOT a fingerprint and
   identifies nobody: it is a random string this app makes once and keeps in the
   phone's own storage. Two things follow from that, and both are on purpose:

     - Clearing the browser's data makes the phone new again. That costs one
       emailed code, which is the right price for something that also protects a
       phone that has been sold on or reset.
     - It cannot be used to recognise the same person somewhere else, because it
       is not derived from anything about them or their hardware.

   The label is only there so a list of trusted phones reads like something a
   human can act on. "Samsung, Chrome" is enough to know which one to remove;
   the full user-agent string is not.

   The functions that do the guessing are pure and take their input, so they can
   be tested without a browser.
--------------------------------------------------------- */

const KEY = "bp_device_id";

/* A random id from bytes handed in. Hex rather than base64 so it survives being
   put in a URL, a log line or a SQL console without needing to be escaped. */
export function makeDeviceId(bytes) {
  return Array.from(bytes || [])
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* This phone's id, made once and kept. Everything is wrapped because a browser
   in private mode, or one with storage blocked, throws on touching
   localStorage rather than returning nothing — and a thrown error here would
   stop somebody logging in at all.

   The fallback is a per-session id, which means a private window is treated as
   a new phone every time. That is the honest answer: a window that forgets
   everything cannot be a phone the shop remembers. */
let memoryId = "";
export function getDeviceId() {
  try {
    const held = localStorage.getItem(KEY);
    if (held && held.length >= 16) return held;
  } catch {
    /* storage blocked — fall through to the session id below */
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    /* No crypto at all is a browser far older than this app supports. A weaker
       id is still better than none: the id is not a secret, it only has to be
       unlikely to collide with another phone's. */
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const id = makeDeviceId(bytes);

  try {
    localStorage.setItem(KEY, id);
  } catch {
    memoryId = memoryId || id;
    return memoryId;
  }
  return id;
}

/* Has this phone got an id already? Asked by the admin screen, which must not
   create one as a side effect of looking. */
export function hasDeviceId() {
  try {
    return String(localStorage.getItem(KEY) || "").length >= 16;
  } catch {
    return false;
  }
}

/* Something a person recognises, read out of the user-agent.

   Deliberately coarse. A version number would make "Chrome 120" become
   "Chrome 121" overnight and the list would look like a new phone appeared,
   when nothing happened but an update. */
export function deviceLabel(ua = "") {
  const s = String(ua);

  const device =
    /iPhone/i.test(s) ? "iPhone" :
    /iPad/i.test(s) ? "iPad" :
    /SM-|Samsung/i.test(s) ? "Samsung" :
    /Infinix/i.test(s) ? "Infinix" :
    /TECNO/i.test(s) ? "Tecno" :
    /itel/i.test(s) ? "itel" :
    /Redmi|Xiaomi|POCO/i.test(s) ? "Xiaomi" :
    /Huawei/i.test(s) ? "Huawei" :
    /Oppo/i.test(s) ? "Oppo" :
    /vivo/i.test(s) ? "vivo" :
    /Android/i.test(s) ? "Android phone" :
    /Windows/i.test(s) ? "Windows PC" :
    /Macintosh/i.test(s) ? "Mac" :
    /Linux/i.test(s) ? "Linux PC" : "";

  /* Order matters. Every one of these browsers puts "Safari" in its string, and
     the Chrome-based ones put "Chrome" in it too, so the most specific has to
     be asked about first or everything comes back as Chrome. */
  const browser =
    /Edg\//i.test(s) ? "Edge" :
    /OPR\/|Opera/i.test(s) ? "Opera" :
    /SamsungBrowser/i.test(s) ? "Samsung Internet" :
    /Firefox\//i.test(s) ? "Firefox" :
    /Chrome\//i.test(s) ? "Chrome" :
    /Safari\//i.test(s) ? "Safari" : "";

  return [device, browser].filter(Boolean).join(", ") || "Unknown phone";
}

/* This phone, labelled. Separate from deviceLabel so the guessing stays pure. */
export function thisDeviceLabel() {
  try {
    return deviceLabel(navigator.userAgent);
  } catch {
    return "Unknown phone";
  }
}

/* "3 days ago" for the trusted-phone list. A date on its own makes somebody do
   arithmetic to answer the only question they are asking, which is whether that
   was them this morning or a stranger last month. */
export function agoText(ts, now = 0) {
  const then = new Date(ts).getTime();
  if (!then || !now) return "";
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
