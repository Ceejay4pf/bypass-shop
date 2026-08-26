import React from "react";
import { hardReload as doHardReload } from "./lib/hardReload.js";

/* ---------------------------------------------------------
   Crash-recovery screen.

   A PWA that's been installed on a phone can get "stuck" on an old,
   broken copy of the app after a new deploy (the cached files point at
   JavaScript the server has since replaced → a blank white screen with
   no way out). This boundary catches any render/load error and shows a
   friendly recovery screen instead of a white page, with a one-tap
   button that clears every cache + the service worker and reloads fresh.
--------------------------------------------------------- */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, busy: false, why: "" };
  }

  /* The error's own words are kept, and shown. This screen used to say only that
     the device was holding an old copy — which is one cause and was, the last time
     it appeared, the wrong one: a genuine bug in a new deploy read as a stale cache
     and sent everybody looking in the wrong place. A phone at a shop counter has no
     console to open, so the one line that says what actually broke has to be on the
     screen the person is looking at. */
  static getDerivedStateFromError(error) {
    let why = "";
    try {
      why = String((error && (error.message || error)) || "").slice(0, 200);
    } catch {
      /* an error whose own message throws is still an error worth reporting */
    }
    return { hasError: true, why };
  }

  componentDidCatch(error, info) {
    // Keep a breadcrumb in the console for debugging, but never crash here.
    try {
      console.error("[Shop] App error:", error, info);
    } catch {
      /* ignore */
    }
  }

  hardReload = async () => {
    this.setState({ busy: true });
    await doHardReload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    /* This screen is drawn with plain inline styles on purpose — it has to
       work even when the app's own stylesheet is part of what broke. So it
       reads the dark/light choice straight off <html> rather than through
       the theme module. */
    const dark = document.documentElement.classList.contains("dark");
    const C = dark
      ? { page: "#0F141B", card: "#161C25", line: "#2A333F", ink: "#E8EDF4", dim: "#98A3B2" }
      : { page: "#F3F5F8", card: "#FFFFFF", line: "#DEE3E9", ink: "#1B2430", dim: "#5A6472" };

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.page,
          padding: "1rem",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "22rem",
            background: C.card,
            border: "1px solid " + C.line,
            borderRadius: "0.75rem",
            padding: "1.5rem",
            textAlign: "center",
            boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 1rem",
              borderRadius: "1rem",
              background: dark ? "#2563EB38" : "#2563EB22",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            🔧
          </div>
          <h1 style={{ fontSize: "1.15rem", fontWeight: 800, color: C.ink, margin: "0 0 0.5rem" }}>
            Let's refresh the app
          </h1>
          <p style={{ fontSize: "0.85rem", color: C.dim, lineHeight: 1.5, margin: "0 0 0.75rem" }}>
            The app could not draw this screen. Usually this device is holding an
            old copy — tap below to clear it and load the latest version. Your data
            is safe in the cloud.
          </p>
          {this.state.why && (
            <p
              style={{
                fontSize: "0.7rem",
                color: C.dim,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: dark ? "#0F141B" : "#F3F5F8",
                border: "1px solid " + C.line,
                borderRadius: "0.4rem",
                padding: "0.5rem",
                margin: "0 0 1rem",
                wordBreak: "break-word",
                textAlign: "left",
              }}
            >
              {this.state.why}
            </p>
          )}
          <button
            onClick={this.hardReload}
            disabled={this.state.busy}
            style={{
              width: "100%",
              background: "#2563EB",
              color: "#fff",
              fontWeight: 700,
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.85rem",
              fontSize: "0.95rem",
              cursor: "pointer",
              opacity: this.state.busy ? 0.6 : 1,
            }}
          >
            {this.state.busy ? "Refreshing…" : "Clear cache & reload"}
          </button>
        </div>
      </div>
    );
  }
}
