/* ---------------------------------------------------------
   SHOP INFO — the details printed on receipts & documents.

   Everything a receipt / invoice / delivery note / stock list shows comes from
   here, so changing a phone number once updates every document.

   IT IS NO LONGER A CONSTANT, and that is the whole point of this file now.
   Two businesses share this build. A constant here would print Jaspare's name,
   address and phone number on Sure Auto Spares' receipts — handing a customer a
   document headed with another company's details, which is worse than a document
   with no heading at all.

   So SHOP_INFO reads the shop currently on screen. It is exported as an object of
   GETTERS rather than a plain object, which means the twenty-odd existing call
   sites (`SHOP_INFO.branch.name`, `SHOP_INFO.footer`, ...) keep working unchanged
   and every one of them becomes shop-aware. A function would have been tidier and
   would also have meant editing twenty files, each an opportunity to miss one — and
   the one missed would be a wrong company name on a printed receipt.

   WHERE THE VALUES COME FROM
   The `shops` row for the current slug, loaded once at start-up and handed to
   setShop() in main.jsx. See supabase/multishop/08_shop_letterhead.sql.

   WHEN THERE IS NO ROW, the JASPARE constants below are used. That is the
   pre-migration world: one shop, no `shops` table, and these values were the truth.
   Note the deliberate asymmetry — a shop that HAS a row but is missing a field gets
   BLANK for that field, never Jaspare's. Falling back field-by-field is how
   Jaspare's phone number would end up on Sure Auto Spares' invoice.
--------------------------------------------------------- */
import { currentShop } from "./shopScope.js";

/* Digits only, for tel: and WhatsApp links, which reject spaces and plus signs. */
const digits = (v) => String(v || "").replace(/\D/g, "");

/* The values that were hardcoded here when there was one shop. Kept as the
   no-database fallback, and copied into Jaspare's row by step 08 so the database is
   the single source once the migration has run. */
const JASPARE = {
  name: "Jaspare Auto Bypass Shop",
  tagline: "Dealers in spare parts — Japanese cars",
  location: "Near Total Northlands",
  poBox: "",
  phone: "0724 450 852 / 0795 697 135",
  phoneIntl: "254724450852",
  phone2Intl: "254795697135",
  email: "jasparebypass@gmail.com",
  kraPin: "",
  makes: "Suzuki, Toyota, Daihatsu, Subaru, Mitsubishi, Nissan, Honda, Mazda, Isuzu",
  parts: "Headlights, Taillights, Bumpers, Boots, Shocks, Doors, Grilles, Bonnets, Side Mirrors",
};

const JASPARE_MAIN = {
  name: "Jaspare Auto — Main Shop",
  location: "Nairobi",
  phone: "+254 729 695 400",
  phoneIntl: "254729695400",
  email: "jaspareauto@gmail.com",
};

const JASPARE_FOOTER =
  "Goods once sold are checked and confirmed by the customer. Thank you for your business.";

/* The letterhead of the shop on screen, or null before one is known. */
function row() {
  const s = currentShop();
  /* A slug alone is not a letterhead. Until the shops row has actually arrived
     there is nothing to print from, and the caller should get the fallback rather
     than a heading of empty strings. */
  return s && s.name ? s : null;
}

function branchOf(s) {
  if (!s) return JASPARE;
  return {
    name: s.name || "",
    tagline: s.tagline || "",
    location: s.address || "",
    poBox: s.po_box || "",
    /* What is printed is phone_display, spaced the way it is read out locally. It
       falls back to the dialable number rather than to blank, because a receipt with
       no phone number on it is a receipt a customer cannot follow up. */
    phone: s.phone_display || s.phone || "",
    phoneIntl: digits(s.phone),
    phone2Intl: digits(s.phone2),
    email: s.email || "",
    kraPin: s.kra_pin || "",
    makes: s.makes || "",
    parts: s.parts_dealt || "",
  };
}

export const SHOP_INFO = {
  get branch() {
    return branchOf(row());
  },
  /* The head office a shop reports to. Only Jaspare has one; for any other shop the
     shop IS the office, so it answers with itself rather than with Jaspare's
     address, which would put a second unrelated business on the document. */
  get main() {
    const s = row();
    if (!s) return JASPARE_MAIN;
    if (s.slug === "jaspare-auto") return JASPARE_MAIN;
    const b = branchOf(s);
    return {
      name: b.name,
      location: b.location,
      phone: b.phone,
      phoneIntl: b.phoneIntl,
      email: b.email,
    };
  },
  /* The small line printed ABOVE the shop's name on a receipt, a quotation and a
     stock list. It used to be the head office, which was right when there was one
     shop reporting to one office. A shop that IS its own office would otherwise
     have its name printed twice, one line above the other — so that shop gets its
     own strapline there instead, and the masthead reads as a letterhead rather than
     as a mistake. */
  get eyebrow() {
    const b = this.branch;
    const office = this.main.name;
    return office && office !== b.name ? office : b.tagline || "";
  },
  get footer() {
    const s = row();
    return s ? s.footer || "" : JASPARE_FOOTER;
  },
  /* Kenya standard rate. One tax authority, so not a per-shop value. */
  vatRate: 0.16,
};

/* The shop's name on its own, for headers, menus and page titles — the places that
   used to say "Bypass Shop" in the markup. Falls back to the old wording so a build
   running against a database with no shops table looks exactly as it did before. */
export function shopName() {
  const s = row();
  return (s && s.name) || "Bypass Shop";
}
