import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/store";
import { afterLogin } from "../lib/session";
import { AuthScreen } from "../features/auth/AuthScreen";
import { ForgotPassword } from "../features/auth/ForgotPassword";
import { ResetPassword } from "../features/auth/ResetPassword";
import { VerifyEmail } from "../features/auth/VerifyEmail";
import { Lobby } from "../features/lobby/Lobby";
import { RoomsPage } from "../features/lobby/RoomsPage";
import { Shop } from "../features/shop/Shop";
import { Leaderboard } from "../features/leaderboard/Leaderboard";
import { CardGallery } from "../features/game/cards/CardGallery";
import { CarbonBadge } from "./CarbonBadge";
import { CookieBanner } from "./CookieBanner";
import { PwaManager } from "./PwaManager";
import { Layout } from "./Layout";
import { RequireAuth } from "./RequireAuth";
import { RequireRole } from "./RequireRole";
import { AdminPanel } from "../features/admin/AdminPanel";
import { AccountPage } from "../features/account/AccountPage";
import { FriendsPage } from "../features/social/FriendsPage";

// Game tables (hall shader, 3D cores, per-game views) load only when a table
// is opened — never on /login or the lobby.
const GameView = lazy(() => import("../features/game/GameView").then((m) => ({ default: m.GameView })));

export function App() {
  const setInitializing = useAuthStore((s) => s.setInitializing);
  const user = useAuthStore((s) => s.user);

  // Restore session from the httpOnly cookie on first load.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((res) => {
        if (cancelled) return;
        // Общият път „след вход“: потребител + облеклите облици (като при вход с парола).
        void afterLogin(res.user);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setInitializing]);

  return (
    <>
      <Routes>
        {/* Dev-only visual QA route (stripped from production by dead-code elimination). */}
        {import.meta.env.DEV ? <Route path="/__gallery" element={<CardGallery />} /> : null}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthScreen mode="login" />} />
        <Route
          path="/register"
          element={user ? <Navigate to="/" replace /> : <AuthScreen mode="register" />}
        />
        {/* Public auth-flow pages: reachable from email links whether or not
            a session exists. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Lobby />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route
              path="play/:game"
              element={
                <Suspense fallback={null}>
                  <GameView />
                </Suspense>
              }
            />
            <Route path="shop" element={<Shop />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="friends" element={<FriendsPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route element={<RequireRole />}>
              <Route path="admin" element={<AdminPanel />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CarbonBadge />
      <CookieBanner />
      <PwaManager />
    </>
  );
}
