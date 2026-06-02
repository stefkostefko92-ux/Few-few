import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { VerifyBanner } from "../features/auth/VerifyBanner";
import { StoreModal } from "../features/shop/StoreModal";

/** Authenticated app chrome: skip-link + header + routed content + footer. */
export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-brass-300 focus:px-4 focus:py-2 focus:text-charcoal-900"
      >
        {t("a11y.skipToContent")}
      </a>
      <VerifyBanner />
      <Header />
      <main id="main" className="flex-1 px-4 py-8 sm:px-8">
        <Outlet />
      </main>
      <Footer />
      <StoreModal />
    </div>
  );
}
