// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Optional frontend error monitoring — enabled only when VITE_SENTRY_DSN is set
// at build time (mirrors the backend's opt-in SENTRY_DSN pattern).
if (import.meta.env.VITE_SENTRY_DSN) {
  import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
      });
      window.Sentry = Sentry;
    })
    .catch(() => { /* monitoring is best-effort */ });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
