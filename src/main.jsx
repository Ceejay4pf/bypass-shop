import React, { useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Shopfront from "./shopfront.jsx";
import FrontDoor from "./FrontDoor.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { frontDoor, readDoor, rememberDoor, forgetDoor } from "./lib/publicRoute.js";
import "./index.css";

/* Two front doors on one build: the public parts list, and the shop's own
   system. Which one a visitor gets is decided in src/lib/publicRoute.js, where
   it can be tested — sending staff to the customer page, or the customer page
   to the street, are both serious.

   THE SHOP'S LINK DID NOT CHANGE. https://bypass-shop.vercel.app still opens the
   sign-in screen on any device that has answered "I work at the shop" once, and
   /system opens it on any device at all. What is new is that a device which has
   never answered is asked, instead of being dropped on a sign-in screen it may
   have no business seeing. */
function Root() {
  const [door, setDoor] = useState(() =>
    frontDoor({
      host: window.location.hostname,
      path: window.location.pathname,
      publicHost: import.meta.env.VITE_PUBLIC_HOST || "",
      remembered: readDoor(window.localStorage),
    })
  );

  /* Remembered, so the question is asked once per device and not once per visit.
     A storekeeper's phone answers on the first morning and behaves like the old
     link forever after. */
  const pick = useCallback((which) => {
    rememberDoor(window.localStorage, which);
    setDoor(which);
  }, []);

  /* The way back for a phone that answered wrong. Offered on the SIGN-IN screen
     only: a customer who ended up there needs a way out, and the parts list is
     nothing to hide.

     Not offered on the parts list, because that page gets handed to strangers and
     a button to the shop's own system is not part of what they were given. A
     staff phone that answered "customer" is still not stuck — /system beats any
     remembered answer. */
  const reset = useCallback(() => {
    forgetDoor(window.localStorage);
    setDoor("choose");
  }, []);

  if (door === "choose") return <FrontDoor onPick={pick} />;
  if (door === "customer") return <Shopfront />;
  return <App onLeave={reset} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
