/* ---------------------------------------------------------
   THE WAY IN — the rules behind src/EntryDoors.jsx.

   Kept out of the screen so they can be tested with plain node: the question
   "does a storekeeper see the doors again when they refresh?" is worth being
   sure about, and it cannot be answered by looking at JSX.

   THE RULE IN ONE LINE: the doors belong to a login, not to a phone.
--------------------------------------------------------- */

export const ENTRY_PREFIX = "bp_entered_";

/* Per person, so two people sharing the counter phone each get their own way in
   — and so one of them signing in cannot inherit the other's flag. */
export const entryKey = (id) => ENTRY_PREFIX + (id || "anon");

/* The beats, in order. `shut` is held for a blink first: an animation that has
   already started when the screen appears reads as a glitch rather than as a
   door. `parts` and `done` are reached by tapping, not by a clock — the person
   decides when to move on, which is the whole point of the Next button. */
export const STAGES = ["shut", "opening", "open", "parts", "done"];
export const SHUT_MS = 260;      // doors visibly closed before they move
export const ROLL_MS = 1600;     // the roll itself, matching bp-door-l in index.css

/* Has this person already come through on this tab? A storage object is passed
   in rather than reached for, so this is testable and so a browser with storage
   switched off (private mode, a locked-down work phone) is a caller's problem
   rather than a crash: it simply shows the doors again, which is harmless. */
export function alreadyEntered(store, id) {
  try { return Boolean(store && store.getItem(entryKey(id))); } catch { return false; }
}

export function markEntered(store, id) {
  try { store && store.setItem(entryKey(id), "1"); return true; } catch { return false; }
}

/* Wipe every entry flag, whoever it belongs to. Called on sign-out and on an
   admin's force-logout. Both stores are swept, not just the one that is written
   to: a flag left behind by an older build of this app in localStorage would
   stop the doors ever appearing again on that phone, and nobody would guess why.

   Returns how many it cleared, so a test can see it did something. */
export function forgetEntry(stores) {
  let gone = 0;
  for (const store of stores || []) {
    if (!store) continue;
    try {
      const dead = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(ENTRY_PREFIX)) dead.push(k);
      }
      for (const k of dead) { store.removeItem(k); gone += 1; }
    } catch { /* storage refused — nothing to clear and nothing to report */ }
  }
  return gone;
}

/* Where a tap takes you. Returned rather than assigned so the screen has one
   place to look and there is no third opinion about what follows what. */
export function afterStage(stage) {
  const i = STAGES.indexOf(stage);
  if (i < 0) return "done";
  return STAGES[Math.min(i + 1, STAGES.length - 1)];
}

/* Is the sheet still covering the app? Everything up to and including `parts`
   is; only `done` lets go. */
export const stillCovering = (stage) => stage !== "done";

/* Are the shutters on screen — as opposed to the shelves? */
export const showingDoors = (stage) => stage === "shut" || stage === "opening" || stage === "open";

/* Should the shutters be moving? Not while they are being shown as shut. */
export const doorsMoving = (stage) => showingDoors(stage) && stage !== "shut";
