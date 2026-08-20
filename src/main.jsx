import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Shopfront from "./shopfront.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { isPublicRequest } from "./lib/publicRoute.js";
import "./index.css";

/* Two front doors on one build: the public parts list, and the shop's own
   system. Which one a visitor gets is decided in src/lib/publicRoute.js, where
   it can be tested — sending staff to the customer page, or the customer page
   to the street, are both serious. */
const isPublic = isPublicRequest({
  host: window.location.hostname,
  path: window.location.pathname,
  publicHost: import.meta.env.VITE_PUBLIC_HOST || "",
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isPublic ? <Shopfront /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
