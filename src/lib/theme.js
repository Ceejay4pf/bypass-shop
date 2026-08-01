/* ---------------------------------------------------------
   Light mode / dark mode.

   The whole app is styled with fixed colours written straight into
   the class names (bg-[#FFFFFF], text-[#5A6472] and so on). Rather
   than rewrite every screen, dark mode re-points those exact classes
   to darker colours inside a `.dark` block in index.css. So this file
   only has one job: decide whether `.dark` belongs on <html>, and
   remember the staff member's choice on that device.

   Three choices:
     light   - always bright
     dark    - always dark
     system  - follow whatever the phone or laptop is set to

   The choice is per-device (saved in the browser), not per-account,
   because it's about the screen in your hand, not who you are.
--------------------------------------------------------- */
import { useEffect, useState } from "react";

const KEY = "bypass-theme";

export const THEME_CHOICES = [
  { key: "light", label: "Light", hint: "Bright — easiest to read in daylight" },
  { key: "dark", label: "Dark", hint: "Gentle on the eyes at night" },
  { key: "system", label: "Match my device", hint: "Follows your phone or laptop setting" },
];

/* The colour behind the phone's status bar, so the notch area matches. */
const BAR_COLOR = { light: "#2563EB", dark: "#0F141B" };

function readStored() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private browsing / storage blocked */
  }
  return "system";
}

/* Does the device itself ask for dark? */
export function deviceWantsDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/* Turn a choice into the mode actually shown right now. */
export function resolveTheme(choice) {
  return choice === "system" ? (deviceWantsDark() ? "dark" : "light") : choice;
}

/* Put the mode on <html> and match the status-bar colour to it. */
export function applyTheme(choice) {
  const mode = resolveTheme(choice);
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", BAR_COLOR[mode]);
  return mode;
}

/* ---- one shared value, so the header button and Settings agree ---- */

let current = readStored();
const listeners = new Set();

export function getTheme() {
  return current;
}

export function setTheme(choice) {
  current = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* ignore — the look just won't stick after a restart */
  }
  applyTheme(choice);
  listeners.forEach((fn) => fn(choice));
}

/* Apply the saved choice as early as possible. index.html also does this
   inline before the first paint, so the screen never flashes white. */
applyTheme(current);

/* Follow the device if the staff member picked "Match my device". */
try {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (current === "system") {
      applyTheme("system");
      listeners.forEach((fn) => fn("system"));
    }
  };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else if (mq.addListener) mq.addListener(onChange); // older phone browsers
} catch {
  /* ignore */
}

/* React hook: [choice, setChoice, mode] */
export function useTheme() {
  const [choice, setChoice] = useState(current);
  useEffect(() => {
    listeners.add(setChoice);
    return () => listeners.delete(setChoice);
  }, []);
  return [choice, setTheme, resolveTheme(choice)];
}

/* Re-renders whenever the mode flips. For components that must know the
   mode to draw (charts, coloured labels written with inline styles). */
export function useThemeMode() {
  return useTheme()[2];
}

/* ---------------------------------------------------------
   Brightening a MEANINGFUL colour for a dark background.

   Some colours in this system belong to the data, not the design: the
   colour of each part category, the four role colours, the colour of
   each kind of stock movement, the condition badge. Those must stay
   recognisable, so dark mode does not replace them.

   The catch is that a mid-tone like the blue #2563EB is too dark to read
   as small text on a near-black card. So on dark screens we lighten it
   just enough to be legible while keeping the SAME hue — it's still
   visibly "the blue one", only brighter.
--------------------------------------------------------- */
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relLuminance([r, g, b]) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/* Mix a colour toward white by `amount` (0..1) — this keeps the hue. */
function lighten(rgb, amount) {
  return rgb.map((v) => Math.round(v + (255 - v) * amount));
}

const brightCache = new Map();

/* Lighten `hex` until it is comfortably readable on the dark card colour.
   Pass mode === "light" (or leave it out) and the colour comes back
   untouched, so callers can use this everywhere without a branch. */
export function readableOnDark(hex, mode = "dark") {
  if (mode !== "dark" || !hex) return hex;
  if (brightCache.has(hex)) return brightCache.get(hex);
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const cardLum = relLuminance([0x16, 0x1c, 0x25]); // #161C25, the dark card
  const contrast = (c) => {
    const l = relLuminance(c);
    return (Math.max(l, cardLum) + 0.05) / (Math.min(l, cardLum) + 0.05);
  };

  let out = rgb;
  // Step toward white in small amounts until small text is readable (4.5:1),
  // stopping well before the colour would wash out.
  for (let a = 0; a <= 0.62 && contrast(out) < 4.5; a += 0.02) {
    out = lighten(rgb, a);
  }
  const hexOut =
    "#" + out.map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("").toUpperCase();
  brightCache.set(hex, hexOut);
  return hexOut;
}
