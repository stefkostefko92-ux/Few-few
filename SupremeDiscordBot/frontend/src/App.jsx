// frontend/src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import CookieConsent from "./components/CookieConsent";

// Eager: the landing page is the LCP-critical entry point — keep it in the
// main chunk. Everything else is code-split so the public landing loads fast
// (Core Web Vitals are a Google ranking signal).
import Login from "./pages/Login";

const LandingLocalized = lazy(() => import("./pages/LandingLocalized"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const CookiesPage = lazy(() => import("./pages/CookiesPage"));
const EulaPage = lazy(() => import("./pages/EulaPage"));
const AccessibilityPage = lazy(() => import("./pages/AccessibilityPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const Layout = lazy(() => import("./components/Layout"));
const PrivacySettingsPage = lazy(() => import("./pages/PrivacySettingsPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ServerHome = lazy(() => import("./pages/ServerHome"));
const PanelsPage = lazy(() => import("./pages/PanelsPage"));
const FormsPage = lazy(() => import("./pages/FormsPage"));
const TicketsPage = lazy(() => import("./pages/TicketsPage"));
const ApplicationsPage = lazy(() => import("./pages/ApplicationsPage"));
const PremiumPage = lazy(() => import("./pages/PremiumPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const VerificationPage = lazy(() => import("./pages/VerificationPage"));
const CommandsPage = lazy(() => import("./pages/CommandsPage"));
const AutomationPage = lazy(() => import("./pages/AutomationPage"));
const WebhooksPage = lazy(() => import("./pages/WebhooksPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
// AffiliatePage изключен за launch (одит C1/C2 — да не се рекламира неплащана комисионна)
// const AffiliatePage = lazy(() => import("./pages/AffiliatePage"));
const ApiKeysPage = lazy(() => import("./pages/ApiKeysPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-cs-bg">
      <div className="w-8 h-8 border-2 border-cs-cyan border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function RequireSuperUser({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!["MAIN_OWNER", "SUPER_USER"].includes(user?.globalRole)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Login />} />

              {/* Localized landing pages — keep in sync with LANDING_LOCALES
                  (components/Seo.jsx) and public/sitemap.xml hreflang. */}
              <Route path="/bg" element={<LandingLocalized locale="bg" />} />
              <Route path="/de" element={<LandingLocalized locale="de" />} />
              <Route path="/es" element={<LandingLocalized locale="es" />} />
              <Route path="/fr" element={<LandingLocalized locale="fr" />} />
              <Route path="/it" element={<LandingLocalized locale="it" />} />
              <Route path="/nl" element={<LandingLocalized locale="nl" />} />
              <Route path="/pl" element={<LandingLocalized locale="pl" />} />

              <Route path="/dashboard" element={<RequireAuth><Layout /></RequireAuth>}>
                <Route index element={<Dashboard />} />
                <Route path=":serverId" element={<ServerHome />} />
                <Route path=":serverId/panels" element={<PanelsPage />} />
                <Route path=":serverId/forms" element={<FormsPage />} />
                <Route path=":serverId/tickets" element={<TicketsPage />} />
                <Route path=":serverId/applications" element={<ApplicationsPage />} />
                <Route path=":serverId/verification" element={<VerificationPage />} />
                <Route path=":serverId/automation" element={<AutomationPage />} />
                <Route path=":serverId/commands" element={<CommandsPage />} />
                <Route path=":serverId/webhooks" element={<WebhooksPage />} />
                <Route path=":serverId/analytics" element={<AnalyticsPage />} />
                <Route path=":serverId/apikeys" element={<ApiKeysPage />} />
                {/* Affiliate route изключен за launch — програмата не плаща комисионни (одит C1/C2) */}
                <Route path=":serverId/premium" element={<PremiumPage />} />
                <Route path=":serverId/settings" element={<SettingsPage />} />
                <Route path="privacy-settings" element={<PrivacySettingsPage />} />
                <Route
                  path="admin"
                  element={<RequireSuperUser><AdminPage /></RequireSuperUser>}
                />
              </Route>

              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/cookies" element={<CookiesPage />} />
              <Route path="/eula" element={<EulaPage />} />
              <Route path="/accessibility" element={<AccessibilityPage />} />
              <Route path="/status" element={<StatusPage />} />
              {/* Catch-all */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <CookieConsent />
        </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
