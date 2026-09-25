// frontend/src/pages/NotFoundPage.jsx
// Custom 404 page with navigation links per SEO standards 6.1.
// React Router renders this for unmatched routes. SPA returns HTTP 200 to
// nginx (because index.html was served), but the client side correctly
// indicates "not found" status to the user.

import { Home, AlertCircle, Compass } from "lucide-react";
import Seo from "../components/Seo";
import PublicPageLayout from "../components/PublicPageLayout";

export default function NotFoundPage() {
  return (
    <PublicPageLayout crumb="404" maxWidth="max-w-4xl">
      <Seo
        title="Page Not Found — Supreme Bot"
        description="The page you are looking for does not exist."
        path={window.location.pathname}
        noindex
      />

      <div className="flex items-center justify-center py-10">
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
      </div>

    </PublicPageLayout>
  );
}
