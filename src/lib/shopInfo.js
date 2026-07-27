/* ---------------------------------------------------------
   SHOP INFO — the details printed on receipts & documents.

   Everything a receipt / invoice / delivery note shows comes from
   here, so changing a phone number or email once updates every
   document automatically.
--------------------------------------------------------- */
export const SHOP_INFO = {
  branch: {
    name: "Jaspare Auto Bypass Shop",
    tagline: "Dealers in spare parts — Japanese cars",
    location: "Near Total Northlands",
    // Both counter lines, printed on every document.
    phone: "0724 450 852 / 0795 697 135",
    phoneIntl: "254724450852",      // digits only, for WhatsApp / tel links
    phone2Intl: "254795697135",
    email: "jasparebypass@gmail.com",
    kraPin: "",                      // TODO: KRA PIN once VAT-registered (e.g. P051234567X)
    // Vehicle makes we stock parts for.
    makes: "Suzuki, Toyota, Daihatsu, Subaru, Mitsubishi, Nissan, Honda, Mazda, Isuzu",
    // Part types we deal in.
    parts: "Headlights, Taillights, Bumpers, Boots, Shocks, Doors, Grilles, Bonnets, Side Mirrors",
  },
  // VAT is optional per receipt (off by default until VAT-registered).
  vatRate: 0.16,                     // Kenya standard rate = 16%
  // Head office this branch reports to.
  main: {
    name: "Jaspare Auto — Main Shop",
    location: "Nairobi",
    phone: "+254 729 695 400",
    phoneIntl: "254729695400",
    email: "jaspareauto@gmail.com",
  },
  footer: "Goods once sold are checked and confirmed by the customer. Thank you for your business.",
};
