// frontend/src/main.jsx
// Канонизация на порта — ПЪРВОТО нещо, което пипва (преди React). Продукционният
// домейн се сервира само без порт; отворен стар bookmark/таб/OAuth редирект с
// порт (:8080 е 127.0.0.1-only) → location.replace към чистия URL, така че
// относителните линкове (футър и т.н.) наследяват чист origin. Живее ТУК, а не
// като inline <script> в index.html — nginx CSP-то е script-src 'self' и блокира
// inline скриптове (затова първият опит не работеше на живо).
(function () {
  const l = window.location;
  if (l.hostname === "supremebot.carbonstealth.eu" && l.port) {
    l.replace("https://supremebot.carbonstealth.eu" + l.pathname + l.search + l.hash);
  }
})();

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
