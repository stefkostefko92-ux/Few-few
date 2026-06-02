import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore, useCosmeticsStore } from "../lib/store";
import { AuthScreen } from "../features/auth/AuthScreen";
import { ForgotPassword } from "../features/auth/ForgotPassword";
import { ResetPassword } from "../features/auth/ResetPassword";
import { VerifyEmail } from "../features/auth/VerifyEmail";
import { Lobby } from "../features/lobby/Lobby";
import { GameView } from "../features/game/GameView";
import { Shop } from "../features/shop/Shop";
import { Leaderboard } from "../features/leaderboard/Leaderboard";
import { CardGallery } from "../features/game/cards/CardGallery";
import { CarbonBadge } from "./CarbonBadge";
import { Layout } from "./Layout";
import { RequireAuth } from "./RequireAuth";

export function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const setInitializing = useAuthStore((s) => s.setInitializing);
  const setEquipped = useCosmeticsStore((s) => s.setEquipped);
  const user = useAuthStore((s) => s.user);

  // Restore session from the httpOnly cookie on first load.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
        // Load equipped cosmetics so games render the player's chosen themes.
        api.equippedCosmetics().then((c) => {
          if (!cancelled) setEquipped(c.equipped);
        }).catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser, setInitializing, setEquipped]);

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
            <Route path="play/:game" element={<GameView />} />
            <Route path="shop" element={<Shop />} />
            <Route path="leaderboard" element={<Leaderboard />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CarbonBadge />
    </>
  );
}
