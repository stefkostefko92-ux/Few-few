// frontend/src/pages/NotFoundPage.jsx
// Custom 404 page with navigation links per SEO standards 6.1.
// React Router renders this for unmatched routes. SPA returns HTTP 200 to
// nginx (because index.html was served), but the client side correctly
// indicates "not found" status to the user.

import { Home, AlertCircle, Compass } from "lucide-react";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo from "../components/Seo";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-cs-black flex flex-col">
      <Seo
        title="Page Not Found — Supreme Bot"
        description="The page you are looking for does not exist."
        path={window.location.pathname}
        noindex
      />
      <header className="border-b border-cs-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <a href="/" className="flex items-center gap-3">
            <SupremeLogo size={36} />
            <SupremeWordmark className="text-base" />
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl text-center">
          <AlertCircle className="w-16 h-16 text-cs-cyan mx-auto mb-6" />
          <h1 className="text-5xl font-display font-black text-cs-text mb-4">
            404
          </h1>
          <h2 className="text-xl font-semibold text-cs-text mb-3">
            Page not found
          </h2>
          <p className="text-cs-muted mb-8">
            The page you're looking for doesn't exist or has been moved.
            Try one of the links below to find what you need.
          </p>

          <nav aria-label="Navigation" className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            <a href="/"        className="cs-btn-secondary text-sm flex items-center justify-center gap-2">
              <Home className="w-4 h-4" /> Home
            </a>
            <a href="/dashboard" className="cs-btn-secondary text-sm flex items-center justify-center gap-2">
              <Compass className="w-4 h-4" /> Dashboard
            </a>
            <a href="/status"  className="cs-btn-secondary text-sm">Service status</a>
            <a href="/terms"   className="cs-btn-secondary text-sm">Terms</a>
            <a href="/privacy" className="cs-btn-secondary text-sm">Privacy</a>
            <a href="/cookies" className="cs-btn-secondary text-sm">Cookies</a>
          </nav>

          <div className="text-xs text-cs-dim font-mono">
            If you believe this is an error, please{" "}
            <a
              href="https://discord.gg/wpCRpy8B"
              target="_blank"
              rel="noopener"
              className="text-cs-cyan underline"
            >
              report it on our Discord
            </a>
            .
          </div>
        </div>
      </main>

      <footer className="border-t border-cs-border bg-cs-bg">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SupremeLogo size={24} />
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-cs-dim">
              Created and Designed by{" "}
              <a
                href="https://carbonstealth.eu"
                target="_blank"
                rel="noopener"
                className="text-cs-cyan underline"
              >
                Carbon Stealth VCC
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
