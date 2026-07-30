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
    this.state = { hasError: false, busy: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep a breadcrumb in the console for debugging, but never crash here.
    try {
      console.error("[Bypass Shop] App error:", error, info);
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

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F3F5F8",
          padding: "1rem",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "22rem",
            background: "#FFFFFF",
            border: "1px solid #DEE3E9",
            borderRadius: "0.75rem",
            padding: "1.5rem",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 1rem",
              borderRadius: "1rem",
              background: "#2563EB22",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            🔧
          </div>
          <h1 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#1B2430", margin: "0 0 0.5rem" }}>
            Let's refresh the app
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#5A6472", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
            This device was holding an old copy of Bypass Shop. Tap the button
            below to clear it and load the latest version — your data is safe in
            the cloud.
          </p>
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
