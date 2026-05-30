import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/store";
import { AuthScreen } from "../features/auth/AuthScreen";
import { Lobby } from "../features/lobby/Lobby";
import { Layout } from "./Layout";
import { RequireAuth } from "./RequireAuth";

export function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const setInitializing = useAuthStore((s) => s.setInitializing);
  const user = useAuthStore((s) => s.user);

  // Restore session from the httpOnly cookie on first load.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser, setInitializing]);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthScreen mode="login" />} />
      <Route
        path="/register"
        element={user ? <Navigate to="/" replace /> : <AuthScreen mode="register" />}
      />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Lobby />} />
          <Route path="play/:game" element={<GameView />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
