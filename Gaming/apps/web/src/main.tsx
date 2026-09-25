import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import "./styles/global.css";
import { App } from "./app/App";
import { installGfxPanel } from "./features/game/gl/gfxGui";
import { registerServiceWorker } from "./pwa/pwa";
import { applyFourColor } from "./lib/a11y";

// Opt-in live graphics tuning (press ` or ?gfx=1); lil-gui loads only on demand.
installGfxPanel();

// Apply persisted accessibility preferences (four-colour deck) before first paint.
applyFourColor();

// Register the app-shell service worker (production only) for offline + installability.
registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// In production the app is mounted under /app/ (see vite.config base); Vite
// exposes that path via BASE_URL. Strip the trailing slash for the router.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
