import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../lib/store";

const STAFF = new Set(["MODERATOR", "SUPPORT", "ADMIN", "OWNER"]);

/** Gate routes to staff roles. Assumes it sits inside <RequireAuth>. */
export function RequireRole() {
  const user = useAuthStore((s) => s.user);
  if (!user || !STAFF.has(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** True when the signed-in user may mutate (ADMIN/OWNER). */
export const isAdmin = (role: string | undefined): boolean => role === "ADMIN" || role === "OWNER";
