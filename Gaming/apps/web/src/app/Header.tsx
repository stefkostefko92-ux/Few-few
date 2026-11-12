import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Badge, Button, cn } from "../ui";
import { useAuthStore, useStoreModal } from "../lib/store";
import { api } from "../lib/api";
import { afterLogout } from "../lib/session";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SettingsToggle } from "./SettingsToggle";
import { NotificationsBell } from "../features/social/NotificationsBell";

/** Below this, the wallet nudges the player toward a top-up. */
const LOW_CHIPS = 500;

export function Header() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const openStore = useStoreModal((s) => s.openStore);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Мобилното меню се затваря при смяна на страницата и с Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function onLogout() {
    await api.logout().catch(() => undefined);
    // Общият път „след изход“: сокет, облици, стая, мач и потребител се нулират,
    // за да не наследи следващият вход нищо от този играч.
    afterLogout();
  }

  const lowChips = user ? Number(user.chips) < LOW_CHIPS : false;

  const links = user
    ? ([
        ["/", t("nav.lobby")],
        ["/rooms", t("nav.rooms")],
        ["/shop", t("nav.shop")],
        ["/friends", t("nav.friends")],
        ["/leaderboard", t("nav.leaderboard")],
        ...(["MODERATOR", "SUPPORT", "ADMIN", "OWNER"].includes(user.role)
          ? ([["/admin", t("nav.admin")]] as const)
          : []),
      ] as const)
    : [];

  return (
    <header className="relative flex items-center justify-between gap-3 border-b border-brass-400/10 px-4 py-3 sm:gap-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label={t("brand")}>
          <img
            src={`${import.meta.env.BASE_URL}logo-mark-128.png`}
            alt=""
            width={38}
            height={38}
            decoding="async"
            className="h-9 w-9 drop-shadow-[0_0_10px_rgba(255,170,90,0.35)]"
          />
          <span className="font-display text-2xl tracking-wide text-brass-300">{t("brand")}</span>
        </Link>
        {user ? (
          <nav className="hidden items-center gap-4 sm:flex">
            {links.map(([to, label]) => (
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

      <div className="flex items-center gap-2 sm:gap-3">
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
              aria-label={t("store.topUp")}
              className={cn(
                "group flex items-center gap-2 rounded-full border bg-felt-800/80 py-1 pl-3 pr-1 transition-colors",
                lowChips ? "border-loss/50" : "border-brass-400/20 hover:border-brass-300",
              )}
            >
              <span className="tnum text-sm text-ink-100">🪙 {Number(user.chips).toLocaleString(i18n.language)}</span>
              <span className="tnum hidden text-sm text-ink-100 sm:inline">💎 {user.gems.toLocaleString(i18n.language)}</span>
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
            <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => void onLogout()}>
              {t("nav.logout")}
            </Button>
          </>
        ) : null}
        <div className={cn("items-center gap-3", user ? "hidden sm:flex" : "flex")}>
          <SettingsToggle />
          <LanguageSwitcher />
        </div>
        {user ? (
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-brass-400/25 text-lg text-ink-100 sm:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={t("nav.menu")}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span aria-hidden>{menuOpen ? "✕" : "☰"}</span>
          </button>
        ) : null}
      </div>

      {user && menuOpen ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-50 border-b border-brass-400/15 bg-felt-900/95 px-4 pb-5 pt-3 backdrop-blur sm:hidden"
        >
          <nav className="grid gap-1" aria-label={t("nav.menu")}>
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-2.5 text-base font-medium",
                    isActive ? "bg-brass-400/10 text-brass-300" : "text-ink-100",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
            <NavLink to="/account" className="rounded-lg px-3 py-2.5 text-base text-ink-100">
              {t("nav.profile")} · {user.displayName}
            </NavLink>
          </nav>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-brass-400/10 pt-3">
            <div className="flex items-center gap-3">
              <SettingsToggle />
              <LanguageSwitcher />
            </div>
            <Button variant="ghost" onClick={() => void onLogout()}>
              {t("nav.logout")}
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
