import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ErrorBoundary } from "./ErrorBoundary";
import { useConnectionStore } from "../lib/store";
import { VerifyBanner } from "../features/auth/VerifyBanner";
import { AnnouncementBanner } from "../features/social/AnnouncementBanner";
import { StoreModal } from "../features/shop/StoreModal";
import { CosmeticsModal } from "../features/shop/CosmeticsModal";
import { InviteWatcher } from "../features/social/InviteWatcher";
import { LobbyWatcher } from "../features/lobby/LobbyWatcher";
import { ErrorToasts } from "./ErrorToasts";

/** Authenticated app chrome: skip-link + header + routed content + footer. */
export function Layout() {
  const { t } = useTranslation();
  const netDown = useConnectionStore((s) => s.down);
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-brass-300 focus:px-4 focus:py-2 focus:text-charcoal-900"
      >
        {t("a11y.skipToContent")}
      </a>
      {netDown ? (
        <div role="status" className="bg-amber-900/80 px-4 py-1.5 text-center text-sm text-amber-100">
          {t("net.reconnecting")}
        </div>
      ) : null}
      <VerifyBanner />
      <AnnouncementBanner />
      <Header />
      <main id="main" className="flex-1 px-4 py-8 sm:px-8">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
      <StoreModal />
      <CosmeticsModal />
      <InviteWatcher />
      <LobbyWatcher />
      <ErrorToasts />
    </div>
  );
}
