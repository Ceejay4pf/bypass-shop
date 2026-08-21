import React, { useState } from "react";
import { Wrench, Copy, Check, ExternalLink, ShieldAlert } from "lucide-react";
import { projectUrl } from "./lib/supabase.js";
import { SETUP_ALL_FILE, sqlEditorLink } from "./lib/setupNeeded.js";

/* ---------------------------------------------------------
   "THIS SCREEN NEEDS ONE SETUP STEP"

   Shown in place of a screen whose table was never created in the live
   database. It replaces what used to happen there — either nothing at all, or
   `Could not find the table 'public.transfers' in the schema cache` in red,
   which tells whoever is standing at the counter that the app is broken.

   IT IS NOT AN ERROR AND IT DOES NOT LOOK LIKE ONE. Amber, not red; a spanner,
   not a warning triangle. Nothing has gone wrong and nothing has been lost —
   one file has not been pasted yet.

   AND IT IS ONLY ADDRESSED TO SOMEBODY WHO CAN DO IT. Staff get one plain line
   telling them who to ask, because a set of database instructions given to
   somebody with no way to follow them is just a screen they now distrust.
--------------------------------------------------------- */

export default function SetupNotice({ step, admin, error }) {
  const [copied, setCopied] = useState("");
  const editor = sqlEditorLink(projectUrl);

  const copy = (text, what) => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch { /* a browser that won't allow it — the text is on screen to read */ }
  };

  if (!admin) {
    return (
      <div className="bg-[#FFF7E6] border border-[#E0A100] rounded-lg p-4 text-sm text-[#7A5A00] flex gap-2.5">
        <ShieldAlert size={17} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-bold">
            {step?.screen || "This screen"} isn't switched on yet
          </div>
          <p className="mt-1 leading-relaxed">
            Nothing is wrong with your phone and nothing has been lost — the shop
            has one setup step left on this one. Ask the admin to finish it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFF7E6] border border-[#E0A100] rounded-lg p-4 text-sm text-[#7A5A00]">
      <div className="flex gap-2.5">
        <Wrench size={17} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-bold text-[15px]">
            {step?.screen || "This screen"} needs one setup step
          </div>
          <p className="mt-1 leading-relaxed">
            The screen is finished. What it saves into —{" "}
            {step?.what || "its table"} — has never been created in the live
            database, so there is nothing for it to read or write yet. This is one
            paste, once, and it is safe to run twice.
          </p>
        </div>
      </div>

      <ol className="mt-3 space-y-2 list-decimal list-inside leading-relaxed">
        <li>
          Open the file{" "}
          <code className="bg-[#FFFFFF] border border-[#E0A100]/50 rounded px-1.5 py-0.5 text-[12px] font-mono text-[#1B2430]">
            {step?.file || SETUP_ALL_FILE}
          </code>{" "}
          from the shop's project folder and copy everything in it.
          <button
            onClick={() => copy(step?.file || SETUP_ALL_FILE, "file")}
            className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[#7A5A00] hover:text-[#1B2430]"
          >
            {copied === "file" ? <Check size={12} /> : <Copy size={12} />}
            {copied === "file" ? "Copied" : "Copy the name"}
          </button>
        </li>
        <li>
          Open the Supabase SQL editor for this shop
          {editor ? (
            <>
              {" — "}
              <a
                href={editor}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold underline text-[#1B2430]"
              >
                here <ExternalLink size={11} />
              </a>
            </>
          ) : null}
          .
        </li>
        <li>Paste it in and press <span className="font-bold">Run</span>.</li>
        <li>
          Come back to this screen and pull down to refresh. It will be working.
        </li>
      </ol>

      <p className="mt-3 text-[12px] leading-relaxed border-t border-[#E0A100]/40 pt-2.5">
        <span className="font-bold">{SETUP_ALL_FILE}</span> does every step still
        outstanding at once, so there is one paste rather than one per screen.
      </p>

      {/* Kept, small and last. The message underneath is what a developer will
          ask for first, and hiding it to make the screen tidy just means it gets
          asked for over the phone instead. */}
      {error ? (
        <details className="mt-2 text-[11px]">
          <summary className="cursor-pointer text-[#7A5A00]/80 hover:text-[#1B2430]">
            What the database actually said
          </summary>
          <pre className="mt-1.5 whitespace-pre-wrap break-words bg-[#FFFFFF] border border-[#E0A100]/40 rounded p-2 text-[#5A6472] font-mono">
            {String(error.message || error)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
