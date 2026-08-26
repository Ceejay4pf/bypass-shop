/* ---------------------------------------------------------
   WHERE A SHOP'S LOGO LIVES.

   One line of real logic, kept out of src/ShopMark.jsx for one reason: it decides a
   URL from something that arrives out of the address bar, and that is worth being
   able to check with plain node rather than by deploying and looking.

   THE CONTRACT, and it is deliberately dull:

       public/logo-<slug>.png   ->   /logo-<slug>.png

   So Sure Fit's logo is public/logo-surefit-autoparts.png and nothing else has to
   change when it arrives — no import, no list, no code. A file, a deploy, done.

   ONE FILE PER SHOP RATHER THAN A LOOKUP TABLE. A table is a second place to
   remember, and the person dropping the file in is not necessarily the person who
   reads this file.
--------------------------------------------------------- */

/* The slug comes out of the URL, so it is checked before it becomes a path. Anything
   that is not plain lower-case letters, digits and hyphens gets no logo rather than a
   guessed one: a slug is not user input today, and a path built out of one should not
   become the day it is.

   An empty slug means no shop has been chosen yet — the shop picker — and there is no
   shop whose logo it could be. */
export function shopLogoSrc(slug) {
  const s = String(slug || "").toLowerCase().trim();
  if (!s || !/^[a-z0-9-]+$/.test(s)) return "";
  return `/logo-${s}.png`;
}
