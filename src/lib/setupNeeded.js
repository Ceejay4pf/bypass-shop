/* ---------------------------------------------------------
   "THIS SCREEN NEEDS ONE SETUP STEP" — telling the difference.

   Two screens in this system are finished code sitting on a table that was
   never created in the live database. Until somebody pastes one file into the
   Supabase SQL editor, Branch Transfers and the staff directory answer every
   request with `Could not find the table 'public.transfers' in the schema
   cache` — which reads, to whoever is standing at the counter, as "the app is
   broken".

   It is not broken and it is not their fault, so this tells them apart:

     a missing table   -> one setup step, and here is exactly what it is
     anything else     -> a real error, shown as one

   WHY THIS IS SEPARATE FROM THE SCREENS. Guessing "the table isn't there" from
   the wording of an error message is the kind of thing that is quietly wrong for
   a year. Here it can be tested against the actual codes Postgres and PostgREST
   send, and there is one copy of the judgement rather than one per screen.
--------------------------------------------------------- */

/* Postgres says 42P01. PostgREST, which is what the app actually talks to, says
   PGRST205 and often never reaches Postgres at all — the table is not in its
   schema cache, so it refuses before asking. Both mean the same thing to
   somebody looking at a blank screen. */
export const MISSING_TABLE_CODES = ["42P01", "PGRST205"];

/* The same for a function that was never created: an RPC the app calls that the
   database has never heard of. */
export const MISSING_FUNCTION_CODES = ["42883", "PGRST202"];

/* Where each screen's one step lives. `file` is the file to paste; `all` is the
   single file that does every outstanding step at once, which is what anybody
   doing this actually wants — one paste, not three.

   No SQL is copied in here on purpose. Two copies of a migration is how the one
   that gets run stops being the one that was reviewed. */
export const SETUP_STEPS = {
  transfers: {
    key: "transfers",
    screen: "Branch Transfers",
    file: "supabase/transfers.sql",
    what: "a record of stock taken to, or received from, another branch",
  },
  staff_contacts: {
    key: "staff_contacts",
    screen: "Staff Directory",
    file: "supabase/staff_directory.sql",
    what: "the shop's phone directory, grouped by department",
  },
  staff_reachability: {
    key: "staff_reachability",
    screen: "Who can be sent a code",
    file: "supabase/SETUP_REMAINING.sql",
    what: "which staff accounts have an address a login code can actually reach",
  },
};

/* The one file that does the lot. */
export const SETUP_ALL_FILE = "supabase/SETUP_REMAINING.sql";

const codeOf = (err) => String(err?.code ?? err?.error?.code ?? "").toUpperCase();

const textOf = (err) =>
  String(err?.message ?? err?.error?.message ?? err?.details ?? err ?? "").toLowerCase();

/* Is this error "the database has never been given this table"?

   The codes are checked first because they are exact. The wording is checked as
   well because a Supabase client that has been through a proxy, or an older
   PostgREST, can arrive with the message and no code — and a screen that shows a
   raw error because a code was missing is the whole problem this file exists to
   fix. */
export function isMissingTable(err) {
  if (!err) return false;
  if (MISSING_TABLE_CODES.includes(codeOf(err))) return true;
  const t = textOf(err);
  return (
    /could not find the table/.test(t) ||
    (/relation .* does not exist/.test(t) && !/function/.test(t))
  );
}

export function isMissingFunction(err) {
  if (!err) return false;
  if (MISSING_FUNCTION_CODES.includes(codeOf(err))) return true;
  const t = textOf(err);
  return /could not find the function/.test(t) || /function .* does not exist/.test(t);
}

/* Either of them: something the app asked for was never created. */
export function needsSetup(err) {
  return isMissingTable(err) || isMissingFunction(err);
}

/* The step for a screen, if this error is one of ours. Returns null for a real
   error — a permission refusal, a dropped connection — so the screen shows that
   as an error, which is what it is.

   The screen passes its own key rather than the name being read out of the
   message, because the message names the table and a screen may read more than
   one. */
export function setupFor(err, key) {
  if (!needsSetup(err)) return null;
  return SETUP_STEPS[key] || null;
}

/* The Supabase SQL editor for this project, so the notice can be a link rather
   than a set of directions. Derived from the URL the app is already configured
   with — there is no second place to keep the project's name. */
export function sqlEditorLink(supabaseUrl = "") {
  const m = String(supabaseUrl).match(/^https?:\/\/([a-z0-9]+)\.supabase\./i);
  return m ? `https://supabase.com/dashboard/project/${m[1]}/sql/new` : "";
}
