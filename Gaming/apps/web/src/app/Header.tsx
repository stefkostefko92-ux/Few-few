import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { levelFromXp } from "@aso/shared";
import { Badge, cn } from "../ui";
import { useAuthStore, useStoreModal } from "../lib/store";
import { api } from "../lib/api";
import { afterLogout } from "../lib/session";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SettingsToggle } from "./SettingsToggle";
import { NotificationsBell } from "../features/social/NotificationsBell";

/** Below this, the wallet nudges the player toward a top-up. */
const LOW_CHIPS = 500;

// ── Икони (inline SVG, 20×20, currentColor) ─────────────────────────────────
const ICON_PATHS: Record<string, ReactNode> = {
  lobby: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </>
  ),
  rooms: (
    <>
      <path d="M4 17V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V17" />
      <path d="M2.5 17h15" />
      <circle cx="12.5" cy="11" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  shop: (
    <>
      <path d="M4.5 7h11l-.9 9.2a1.5 1.5 0 0 1-1.5 1.3H6.9a1.5 1.5 0 0 1-1.5-1.3Z" />
      <path d="M7.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  friends: (
    <>
      <circle cx="7.5" cy="7" r="2.8" />
      <path d="M2.5 16.5c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3" />
      <circle cx="14" cy="7.8" r="2.2" />
      <path d="M13.4 12.3c2.1.1 3.6 1.4 4.1 3.7" />
    </>
  ),
  leaderboard: (
    <>
      <path d="M6 3.5h8v3.8a4 4 0 0 1-8 0Z" />
      <path d="M6 5H3.5v1a2.5 2.5 0 0 0 2.6 2.5M14 5h2.5v1a2.5 2.5 0 0 1-2.6 2.5" />
      <path d="M10 11.3v2.7M7 17h6M8 14h4" />
    </>
  ),
  admin: (
    <>
      <path d="M10 2.8 16 5v4.6c0 3.7-2.5 6.5-6 7.6-3.5-1.1-6-3.9-6-7.6V5Z" />
      <path d="m7.4 10 1.8 1.8 3.5-3.6" />
    </>
  ),
  profile: (
    <>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 17c.8-3.2 3.2-4.9 6.2-4.9s5.4 1.7 6.2 4.9" />
    </>
  ),
  shield: (
    <>
      <path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" />
      <path d="M10 6.5V10l2.5 1.6" />
    </>
  ),
  logout: (
    <>
      <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
      <path d="M12 6.5 15.5 10 12 13.5M15.5 10H8" />
    </>
  ),
};

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-[18px] shrink-0", className)}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** Нивото като пръстен: запълнената дъга е напредъкът на XP към следващото ниво. */
function LevelRing({ xp, label }: { xp: number; label: string }) {
  const { level, intoLevel, needed } = levelFromXp(xp);
  const share = needed > 0 ? Math.min(1, intoLevel / needed) : 0;
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative hidden size-10 place-items-center sm:grid"
      title={label}
      aria-label={label}
      role="img"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-10 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(217,178,95,.15)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="url(#aso-level-grad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`}
        />
        <defs>
          <linearGradient id="aso-level-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brass-100)" />
            <stop offset="1" stopColor="var(--brass-400)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="tnum font-display text-sm font-semibold text-brass-100">{level}</span>
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : name.trim().slice(0, 2);
  return s.toUpperCase();
}

export function Header() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const openStore = useStoreModal((s) => s.openStore);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Менютата се затварят при смяна на страницата, с Escape и с клик извън тях.
  useEffect(() => {
    setMenuOpen(false);
    setProfileOpen(false);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!menuOpen && !profileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      setProfileOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen, profileOpen]);

  async function onLogout() {
    await api.logout().catch(() => undefined);
    // Общият път „след изход“: сокет, облици, стая, мач и потребител се нулират,
    // за да не наследи следващият вход нищо от този играч.
    afterLogout();
  }

  const lowChips = user ? Number(user.chips) < LOW_CHIPS : false;
  const staff = user ? ["MODERATOR", "SUPPORT", "ADMIN", "OWNER"].includes(user.role) : false;

  const links: Array<{ to: string; label: string; icon: string }> = user
    ? [
        { to: "/", label: t("nav.lobby"), icon: "lobby" },
        { to: "/rooms", label: t("nav.rooms"), icon: "rooms" },
        { to: "/shop", label: t("nav.shop"), icon: "shop" },
        { to: "/friends", label: t("nav.friends"), icon: "friends" },
        { to: "/leaderboard", label: t("nav.leaderboard"), icon: "leaderboard" },
        ...(staff ? [{ to: "/admin", label: t("nav.admin"), icon: "admin" }] : []),
      ]
    : [];

  const progress = user ? levelFromXp(user.xp) : null;
  const levelLabel = progress
    ? t("nav.levelProgress", {
        level: progress.level,
        into: progress.intoLevel,
        needed: progress.needed,
      })
    : "";

  return (
    <header
      className="relative z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-charcoal-900/95 to-felt-900/80 px-4 py-2.5 shadow-[0_10px_30px_-18px_rgba(0,0,0,.9)] backdrop-blur-md sm:gap-4 sm:px-6 lg:px-8"
      data-testid="app-header"
    >
      {/* Месингова линия отдолу — тънка, избледняваща към краищата. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brass-300/45 to-transparent"
      />

      <div className="flex min-w-0 items-center gap-5 xl:gap-8">
        <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label={t("brand")}>
          <img
            src={`${import.meta.env.BASE_URL}logo-mark-128.png`}
            alt=""
            width={38}
            height={38}
            decoding="async"
            className="h-9 w-9 drop-shadow-[0_0_10px_rgba(255,170,90,0.35)] transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
          />
          <span className="font-display text-2xl tracking-[0.12em] text-brass-300">
            {t("brand")}
          </span>
        </Link>
        {user ? (
          <nav
            aria-label={t("nav.menu")}
            className="hidden items-center gap-0.5 rounded-full border border-brass-400/15 bg-charcoal-900/50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] md:flex"
          >
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 motion-reduce:transition-none lg:px-3.5",
                    isActive
                      ? "bg-gradient-to-b from-brass-300/25 to-brass-400/10 text-brass-100 shadow-[0_0_18px_-6px_rgba(217,178,95,.75)] ring-1 ring-brass-300/40"
                      : "text-ink-300 hover:bg-brass-400/[0.07] hover:text-ink-100",
                  )
                }
              >
                <Icon name={l.icon} className="opacity-80 group-hover:opacity-100" />
                <span className="hidden lg:inline">{l.label}</span>
                <span className="sr-only lg:hidden">{l.label}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {user ? (
          <>
            <LevelRing xp={user.xp} label={levelLabel} />

            {/* Портфейлът: чипове + диаманти и „+“ за зареждане (работи и по време на мач). */}
            <button
              type="button"
              onClick={() => openStore(lowChips ? "chips" : "default")}
              title={t("store.topUp")}
              aria-label={t("store.topUp")}
              className={cn(
                "group flex items-center gap-2.5 rounded-full border bg-charcoal-900/60 py-1 pl-3 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] transition-colors",
                lowChips ? "border-loss/50" : "border-brass-400/20 hover:border-brass-300/70",
              )}
            >
              <span className="tnum flex items-center gap-1.5 text-sm font-medium text-ink-100">
                <span
                  aria-hidden
                  className="size-3.5 rounded-full bg-gradient-to-br from-brass-100 to-brass-400 shadow-[0_0_6px_rgba(217,178,95,.6)] ring-2 ring-brass-400/40"
                />
                {Number(user.chips).toLocaleString(i18n.language)}
              </span>
              <span className="hidden h-4 w-px bg-brass-400/20 sm:block" aria-hidden />
              <span className="tnum hidden items-center gap-1.5 text-sm font-medium text-ink-100 sm:flex">
                <span
                  aria-hidden
                  className="size-3 rotate-45 rounded-[3px] bg-gradient-to-br from-sky-200 to-sky-500 shadow-[0_0_6px_rgba(125,200,255,.6)]"
                />
                {user.gems.toLocaleString(i18n.language)}
              </span>
              <span
                className="grid size-7 place-items-center rounded-full bg-gradient-to-b from-brass-300 to-brass-400 text-base font-bold text-charcoal-900 shadow-[0_2px_8px_-2px_rgba(217,178,95,.8)] transition-transform group-hover:scale-105 motion-reduce:transition-none"
                aria-hidden
              >
                +
              </span>
            </button>

            {user.vipTier !== "NONE" ? (
              <Badge tone="vip" className="hidden lg:inline-flex">
                VIP {user.vipTier}
              </Badge>
            ) : null}
            <NotificationsBell />

            {/* Профилът: аватар + падащо меню (профил, отговорна игра, звук, език, изход). */}
            <div ref={profileRef} className="relative hidden md:block">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-controls="profile-menu"
                onClick={() => setProfileOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 transition-colors",
                  profileOpen
                    ? "border-brass-300/60 bg-brass-400/10"
                    : "border-brass-400/15 hover:border-brass-300/50",
                )}
                data-testid="profile-button"
              >
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brass-300 via-brass-400 to-charcoal-900 text-xs font-bold tracking-wide text-charcoal-900 ring-2 ring-brass-300/30"
                >
                  {initials(user.displayName)}
                </span>
                <span className="hidden max-w-[9rem] truncate text-sm text-ink-100 xl:inline">
                  {user.displayName}
                </span>
                <svg
                  viewBox="0 0 12 12"
                  aria-hidden
                  className={cn(
                    "size-3 text-ink-300 transition-transform",
                    profileOpen && "rotate-180",
                  )}
                >
                  <path
                    d="M2.5 4.5 6 8l3.5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="sr-only">{t("nav.account")}</span>
              </button>
              {profileOpen ? (
                <div
                  id="profile-menu"
                  role="menu"
                  className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-2xl border border-brass-400/20 bg-charcoal-900 shadow-[0_24px_60px_-20px_rgba(0,0,0,.95)]"
                >
                  <div className="border-b border-brass-400/10 bg-gradient-to-br from-brass-400/10 to-transparent px-4 py-3.5">
                    <p className="truncate font-display text-lg text-brass-100">
                      {user.displayName}
                    </p>
                    <p className="tnum mt-0.5 text-xs text-ink-300">{levelLabel}</p>
                    {progress ? (
                      <div
                        className="mt-2 h-1 overflow-hidden rounded-full bg-felt-700"
                        aria-hidden
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brass-100 to-brass-400"
                          style={{
                            width: `${Math.round((progress.intoLevel / Math.max(1, progress.needed)) * 100)}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="p-1.5">
                    <MenuLink to="/account" icon="profile" label={t("nav.profile")} />
                    <MenuLink
                      to="/account#responsible"
                      icon="shield"
                      label={t("nav.responsible")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-brass-400/10 px-4 py-3">
                    <SettingsToggle />
                    <LanguageSwitcher />
                  </div>
                  <div className="border-t border-brass-400/10 p-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void onLogout()}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-300 transition-colors hover:bg-loss/10 hover:text-loss"
                    >
                      <Icon name="logout" />
                      {t("nav.logout")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        <div className={cn("items-center gap-3", user ? "hidden" : "flex")}>
          <SettingsToggle />
          <LanguageSwitcher />
        </div>
        {user ? (
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-brass-400/25 bg-charcoal-900/50 text-ink-100 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={t("nav.menu")}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 20 20" aria-hidden className="size-5">
              {menuOpen ? (
                <path
                  d="M5 5l10 10M15 5 5 15"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3.5 6h13M3.5 10h13M3.5 14h13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        ) : null}
      </div>

      {user && menuOpen ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-50 border-b border-brass-400/15 bg-charcoal-900 px-4 pb-5 pt-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,.95)] md:hidden"
        >
          <div className="mb-4 flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-brass-300 via-brass-400 to-charcoal-900 text-sm font-bold text-charcoal-900 ring-2 ring-brass-300/30"
            >
              {initials(user.displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-lg text-brass-100">{user.displayName}</p>
              <p className="tnum text-xs text-ink-300">{levelLabel}</p>
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-2" aria-label={t("nav.menu")}>
            {[...links, { to: "/account", label: t("nav.profile"), icon: "profile" }].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm font-medium",
                    isActive
                      ? "border-brass-300/40 bg-brass-400/10 text-brass-100"
                      : "border-brass-400/10 bg-felt-900/40 text-ink-100",
                  )
                }
              >
                <Icon name={l.icon} />
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brass-400/10 pt-4">
            <div className="flex items-center gap-3">
              <SettingsToggle />
              <LanguageSwitcher />
            </div>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-ink-300 hover:text-loss"
            >
              <Icon name="logout" />
              {t("nav.logout")}
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MenuLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <Link
      to={to}
      role="menuitem"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-100 transition-colors hover:bg-brass-400/10 hover:text-brass-100"
    >
      <Icon name={icon} className="text-brass-300" />
      {label}
    </Link>
  );
}
