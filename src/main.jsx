import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Shopfront from "./shopfront.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./index.css";

/* Two front doors on one build.
   /shop  → the public enquiry list. No account, no password.
   anything else → the shop's own system, which asks you to sign in.

   vercel.json rewrites every path to index.html, so the path is read here
   rather than by a router — one line is cheaper than a routing library for
   exactly two pages. Trailing slashes and capitals are both allowed, because
   this link gets typed by hand and read off a WhatsApp message. */
const path = window.location.pathname.replace(/\/+$/, "").toLowerCase();
const PUBLIC_PATHS = ["/shop", "/parts", "/catalogue"];
const isPublic = PUBLIC_PATHS.includes(path);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isPublic ? <Shopfront /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
