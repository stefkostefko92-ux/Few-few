import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import { Badge, Button, cn } from "../ui";
import { useAuthStore, useStoreModal } from "../lib/store";
import { api } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SettingsToggle } from "./SettingsToggle";
import { NotificationsBell } from "../features/social/NotificationsBell";

/** Below this, the wallet nudges the player toward a top-up. */
const LOW_CHIPS = 500;

export function Header() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const openStore = useStoreModal((s) => s.openStore);

  async function onLogout() {
    await api.logout().catch(() => undefined);
    disconnectSocket(); // drop the authenticated socket so the next login re-handshakes
    setUser(null);
  }

  const lowChips = user ? Number(user.chips) < LOW_CHIPS : false;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-brass-400/10 px-4 py-3 sm:px-8">
      <div className="flex items-center gap-6">
        <Link to="/" className="font-display text-2xl tracking-wide text-brass-300">
          {t("brand")}
        </Link>
        {user ? (
          <nav className="hidden items-center gap-4 sm:flex">
            {(
              [
                ["/", t("nav.lobby")],
                ["/rooms", t("nav.rooms")],
                ["/shop", t("nav.shop")],
                ["/friends", t("nav.friends")],
                ["/leaderboard", t("nav.leaderboard")],
                ...(["MODERATOR", "ADMIN", "OWNER"].includes(user.role)
                  ? ([["/admin", t("nav.admin")]] as const)
                  : []),
              ] as const
            ).map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "text-sm font-medium transition-colors",
                    isActive ? "text-brass-300" : "text-ink-300 hover:text-ink-100",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <Badge tone="brass" className="tnum hidden sm:inline-flex">
              ♟ {t("wallet.level", { level: user.level })}
            </Badge>

            {/* Wallet bar: chips + gems with a one-tap top-up (works mid-match,
                since the header renders during games). */}
            <button
              type="button"
              onClick={() => openStore(lowChips ? "chips" : "default")}
              title={t("store.topUp")}
              className={cn(
                "group flex items-center gap-2 rounded-full border bg-felt-800/80 py-1 pl-3 pr-1 transition-colors",
                lowChips ? "border-loss/50" : "border-brass-400/20 hover:border-brass-300",
              )}
            >
              <span className="tnum text-sm text-ink-100">🪙 {user.chips.toLocaleString()}</span>
              <span className="tnum hidden text-sm text-ink-100 sm:inline">💎 {user.gems.toLocaleString()}</span>
              <span
                className="grid size-6 place-items-center rounded-full bg-gradient-to-b from-brass-300 to-brass-400 text-sm font-bold text-charcoal-900"
                aria-hidden
              >
                +
              </span>
            </button>

            {user.vipTier !== "NONE" ? <Badge tone="vip">VIP {user.vipTier}</Badge> : null}
            <NotificationsBell />
            <Link
              to="/account"
              className="hidden text-sm text-ink-300 hover:text-brass-100 sm:inline"
              title={t("nav.profile")}
            >
              {user.displayName}
            </Link>
            <Button variant="ghost" onClick={() => void onLogout()}>
              {t("nav.logout")}
            </Button>
          </>
        ) : null}
        <SettingsToggle />
        <LanguageSwitcher />
      </div>
    </header>
  );
}
