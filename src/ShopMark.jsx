import { useState } from "react";
import { currentShopSlug } from "./lib/shopScope.js";
import { shopLogoSrc } from "./lib/shopLogo.js";

/* ---------------------------------------------------------
   SHOP MARK — the shop's own logo, where it has one.

   Sure Fit is having a logo drawn. It does not exist in this repository yet, and the
   screens that will carry it are on the live site now, so this component is written
   so that dropping the file in is the ONLY step:

       public/logo-surefit-autoparts.png     <- drop it here, deploy, done

   No code change, no import, no list to add it to.

   HOW THE FALLBACK WORKS, AND WHY IT IS AN onError AND NOT A CHECK
   There is no way for a browser to ask "does this file exist" without fetching it,
   and this component is drawn on the sign-in screen before anything else. So it
   tries the image and listens for the failure: a missing file fires `onError`, the
   component switches to whatever the screen was drawing before, and nobody sees a
   broken-image icon. That is why `fallback` is required rather than optional — a
   mark that can vanish needs something to vanish into.

   The state starts at "show the image" rather than "show the fallback", because the
   normal case once the file exists is that it loads. Starting the other way round
   would flash the old emblem on every page load forever.

   The path itself is worked out in src/lib/shopLogo.js, which is a plain module so
   the rule can be checked with node instead of by deploying and looking.
--------------------------------------------------------- */

export default function ShopMark({ size = 20, fallback = null, className = "", alt = "" }) {
  const src = shopLogoSrc(currentShopSlug());
  const [failed, setFailed] = useState(false);

  if (!src || failed) return fallback;

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      /* object-contain, so a logo that is not square is letterboxed rather than
         squashed. A stretched logo is worse than no logo. */
      className={`object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
      /* Decorative wherever the shop's name is already written beside it, which is
         every place this is used. A screen reader announcing "Sure Fit Auto Spares
         Ltd logo, Sure Fit Auto Spares Ltd" is worse than silence. */
      aria-hidden={alt ? undefined : "true"}
    />
  );
}
