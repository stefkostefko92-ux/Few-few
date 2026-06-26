import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../lib/store";

/** Gates the authenticated shell. Waits for the initial /me check to resolve. */
export function RequireAuth() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const initializing = useAuthStore((s) => s.initializing);

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        {t("common.loading")}
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
