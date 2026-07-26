/* ---------------------------------------------------------
   SHOP INFO — the details printed on receipts & documents.

   ⚠️ EDIT ME LATER: the branch shop has not been given an official
   name yet, and its email is still to be decided. The placeholders
   below are clearly marked — replace them the moment the name/email
   are confirmed, and every receipt updates automatically.
--------------------------------------------------------- */
export const SHOP_INFO = {
  // The branch this app runs. NAME PENDING — replace when decided.
  branch: {
    name: "Bypass Shop",            // TODO: official branch name (not yet chosen)
    tagline: "Branch — name to be confirmed",
    location: "Near Northlands, Nairobi",
    phone: "0724 450 852",
    phoneIntl: "254724450852",      // digits only, for WhatsApp / tel links
    email: "",                       // TODO: branch email (yet to be created)
    kraPin: "",                      // TODO: KRA PIN once VAT-registered (e.g. P051234567X)
  },
  // VAT: prices are entered VAT-INCLUSIVE, so the 16% is back-calculated
  // out of the total. Optional per receipt (off by default until registered).
  vatRate: 0.16,                     // Kenya standard rate = 16%
  // Head office this branch reports to.
  main: {
    name: "Jaspare Auto — Main Shop",
    location: "Nairobi",
    phone: "+254 729 695 400",
    phoneIntl: "254729695400",
    email: "addamsjmk@gmail.com",
  },
  footer: "Goods once sold are checked and confirmed by the customer. Thank you for your business.",
};
