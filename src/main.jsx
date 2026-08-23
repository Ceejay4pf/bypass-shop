import React, { useState, useCallback, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Shopfront from "./shopfront.jsx";
import FrontDoor from "./FrontDoor.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { frontDoor, forgetDoor } from "./lib/publicRoute.js";
import "./index.css";

/* Two front doors on one build: the public parts list, and the shop's own
   system. Which one a visitor gets is decided in src/lib/publicRoute.js, where
   it can be tested — sending staff to the customer page, or the customer page
   to the street, are both serious.

   THE LINKS DID NOT CHANGE. /jaspare is still the parts list and /system is still
   the sign-in screen, both without a question — a link is somebody having already
   answered on the visitor's behalf.

   What the bare address does is ask, every time, and keep nothing. It used to
   remember the answer and go straight through afterwards, which was fewer taps
   and left a phone that once tapped "customer" unable to reach the sign-in screen
   at all. One tap on opening is the smaller price. A counter phone that should
   never be asked belongs on /system. */
function Root() {
  const [door, setDoor] = useState(() =>
    frontDoor({
      host: window.location.hostname,
      path: window.location.pathname,
      publicHost: import.meta.env.VITE_PUBLIC_HOST || "",
    })
  );

  const pick = useCallback((which) => setDoor(which), []);

  /* Back to the question, from either page. Also clears the answer saved by the
     old behaviour, so a phone that chose once under the previous build isn't
     carrying a setting nothing reads any more. */
  const reset = useCallback(() => {
    forgetDoor(window.localStorage);
    setDoor("choose");
  }, []);

  /* Same clean-up on arrival, for the phones that never press the back link. */
  useEffect(() => { forgetDoor(window.localStorage); }, []);

  if (door === "choose") return <FrontDoor onPick={pick} />;
  if (door === "customer") return <Shopfront onLeave={reset} />;
  return <App onLeave={reset} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
