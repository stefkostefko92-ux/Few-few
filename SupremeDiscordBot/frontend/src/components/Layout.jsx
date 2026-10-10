// frontend/src/components/Layout.jsx
// Рамката на таблото — по одобрената концепция (10.10.2026): групирана
// странична лента (dashboardNav.js) и горна лента с превключвател на сървъра,
// търсене и профил (DashboardTopbar.jsx). На телефон горната лента е
// хамбургер + лого, а превключвателят и профилът са в чекмеджето.
import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Shield, LogOut, ExternalLink, Menu, X as CloseIcon, KeyRound,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "../contexts/I18nContext";
import { getServers, getServer, logout } from "../api";
import LanguageSwitcher from "./LanguageSwitcher";
import PremiumToast from "./PremiumToast";
import ToastHost from "./ToastHost";
import PastDueBanner from "./PastDueBanner";
import GraceBanner from "./GraceBanner";
import SupremeLogo, { SupremeWordmark } from "./SupremeLogo";
import DashboardTopbar, { ServerSwitcher } from "./DashboardTopbar";
import { buildServerNav } from "./dashboardNav";
import { APP_VERSION_LABEL, RELEASE_NAME } from "../version";
import { openCookiePreferences } from "./CookieConsent";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";

// Аватар по подразбиране на Discord — резерва, когато потребителят няма свой
// или отговорът не носи avatarUrl.
const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

export default function Layout() {
  const { serverId } = useParams();
  const { user, setUser } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();

  const { data: servers = [], isSuccess: serversLoaded } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const currentServer = servers.find((s) => s.id === serverId);
  const isPlatformAdmin = ["MAIN_OWNER", "SUPER_USER"].includes(user?.globalRole);
  // Платформен админ в чужд сървър (от админ конзолата → „Open dashboard“):
  // сървърът не е в неговия списък, затова името се взима отделно, а горе
  // стои ясна лента, че работи от чуждо име (одит 26.09.2026).
  const foreignServer = isPlatformAdmin && !!serverId && serversLoaded && !currentServer;
  const { data: foreignInfo } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
    enabled: foreignServer,
  });
  const serverName = currentServer?.name || foreignInfo?.name || "Server";

  const handleLogout = async () => {
    await logout();
    setUser(null);
    navigate("/");
  };

  const isSuperUser = ["MAIN_OWNER", "SUPER_USER"].includes(user?.globalRole);
  const serverIcon = currentServer?.icon || foreignInfo?.icon || null;
  const navGroups = useMemo(() => (serverId ? buildServerNav(serverId, t) : [
    {
      key: "root",
      items: [
        { to: "/dashboard", icon: LayoutDashboard, label: t("nav.allServers"), end: true },
        ...(isSuperUser ? [{ to: "/dashboard/admin", icon: Shield, label: "Super Admin" }] : []),
      ],
    },
  ]), [serverId, t, isSuperUser]);
  const searchItems = useMemo(() => [
    ...navGroups.flatMap((g) => g.items),
    { to: "/dashboard/privacy-settings", icon: Shield, label: t("nav.privacy") },
    { to: "/dashboard/security", icon: KeyRound, label: t("nav.security") },
  ], [navGroups, t]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef(null);
  const toggleBtnRef = useRef(null);

  // Drawer a11y (mirrors Modal.jsx): Escape closes, Tab is trapped inside the
  // drawer while open, and focus returns to the hamburger toggle on close.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const node = drawerRef.current;
    const focusables = node?.querySelectorAll(FOCUSABLE);
    focusables?.[0]?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMobileOpen(false);
        return;
      }
      if (e.key === "Tab" && node) {
        const items = node.querySelectorAll(FOCUSABLE);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      toggleBtnRef.current?.focus?.();
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen bg-cs-bg overflow-hidden">
      {/* Skip link — first focusable element, visible on keyboard focus (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-cs-cyan focus:text-black focus:font-semibold"
      >
        Skip to main content
      </a>
      {/* Mobile top bar — brand + hamburger, visible only on small screens */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-cs-bg border-b border-cs-line h-14 flex items-center justify-between px-4">
        <button
          ref={toggleBtnRef}
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-lg text-cs-text hover:text-cs-cyan"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="dashboard-sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <a href="/dashboard" className="flex items-center gap-2">
          <SupremeLogo size={26} />
          <SupremeWordmark className="text-sm" />
        </a>
        <div className="w-9" /> {/* spacer for visual balance */}
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/70 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, static on md+ */}
      <aside
        id="dashboard-sidebar"
        ref={drawerRef}
        onClick={(e) => {
          // Auto-close drawer when user clicks a nav link on mobile
          if (e.target.tagName === "A" || e.target.closest("a")) {
            setMobileOpen(false);
          }
        }}
        className={`
          w-64 bg-cs-deep flex flex-col border-r border-cs-line flex-shrink-0
          fixed md:static inset-y-0 left-0 z-50
          transform transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden absolute top-3 right-3 p-2 text-cs-muted hover:text-white z-10"
          aria-label="Close menu"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <a href="/dashboard" className="flex items-center gap-3 group no-underline">
            <SupremeLogo size={36} />
            <div className="min-w-0 leading-tight">
              <SupremeWordmark className="text-base leading-none" />
              {/* Версията идва от package.json през Vite define — закованият низ
                  тук беше разминат с цял мажор (v2.3 при реални 3.1.0). */}
              <div className="text-[13px] font-semibold text-cs-text">{RELEASE_NAME}</div>
              <div className="text-xs text-cs-dim tabular-nums mt-0.5">{APP_VERSION_LABEL}</div>
            </div>
          </a>
        </div>

        {/* На телефон няма горна лента — превключвателят на сървъра е тук. */}
        <div className="md:hidden px-3 pb-3">
          <ServerSwitcher servers={servers} serverId={serverId} serverName={serverName} serverIcon={serverIcon} />
        </div>

        {/* Nav — групите на концепцията (dashboardNav.js) */}
        <nav className="flex-1 overflow-y-auto pb-4" aria-label="Dashboard navigation">
          {navGroups.map((g) => (
            <div key={g.key} className="mt-1">
              {g.label && <SectionLabel>{g.label}</SectionLabel>}
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.to || it.href}>
                    {it.external ? (
                      <a href={it.href} target="_blank" rel="noopener noreferrer" className={`${NAV_BASE} ${NAV_IDLE}`}>
                        <it.icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        <span className="flex-1 min-w-0 truncate">{it.label}</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-60 flex-none" aria-hidden="true" />
                      </a>
                    ) : (
                      <NavItem to={it.to} icon={it.icon} end={it.end}>
                        {it.label}
                        {it.premium && currentServer?.isPremium && (
                          <span className="ml-auto cs-badge-premium !text-[11px] !px-2 !py-0">Active</span>
                        )}
                      </NavItem>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Профилът — на телефон (на десктоп е в горната лента). */}
        <div className="md:hidden p-3 border-t border-cs-line bg-cs-surface">
          {/* ДВА реда, не един. Лентата е 256px; аватар (36) + четири икони по
              32 + пет междини по 12 = 224 → за името оставаха 7px и то се
              режеше до една буква („Z“), а ролята — до „0“. (17.09.2026) */}
          <div className="flex items-center gap-3">
            {/* `src` НИКОГА не бива да е undefined: тогава браузърът рисува
                счупено изображение с alt текста, което разпъва реда. */}
            <img
              src={user?.avatarUrl || DEFAULT_AVATAR}
              alt=""
              className="w-9 h-9 flex-shrink-0 rounded-full border border-cs-cyan/30 bg-cs-panel"
              onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_AVATAR; }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cs-text truncate leading-tight">{user?.username}</p>
              <p className="text-xs text-cs-cyan truncate">
                {t(`role.${user?.globalRole || "USER"}`)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            {/* Менюто за език се отваря НАЛЯВО спрямо иконата (align="left"):
                иначе 160px списък излиза извън екрана (17.09.2026). */}
            <LanguageSwitcher compact align="left" />
            <a
              href="/dashboard/privacy-settings"
              className="text-cs-dim hover:text-cs-cyan p-2 transition-colors"
              title={t("nav.privacy")}
              aria-label={t("nav.privacy")}
            >
              <Shield className="w-4 h-4" aria-hidden="true" />
            </a>
            <a
              href="/dashboard/security"
              className="text-cs-dim hover:text-cs-cyan p-2 transition-colors"
              title={t("nav.security")}
              aria-label={t("nav.security")}
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" />
            </a>
            <button
              onClick={handleLogout}
              className="text-cs-dim hover:text-danger p-2 transition-colors"
              title={t("nav.logout")}
              aria-label={t("nav.logout")}
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-y-auto bg-cs-bg flex flex-col">
        <DashboardTopbar
          servers={servers}
          serverId={serverId}
          serverName={serverName}
          serverIcon={serverIcon}
          searchItems={searchItems}
          user={user}
          onLogout={handleLogout}
        />
        {/* Провалено плащане стои най-отгоре — то е по-спешното. */}
        <PastDueBanner />
        {/* v40 — отменен, но платен до края: показваме докога работи. */}
        <GraceBanner />
        {foreignServer && (
          <div className="border-b border-premium/40 bg-premium/10 px-4 sm:px-6 py-2 text-xs text-premium flex items-center gap-2" role="status">
            <Shield className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>{t("nav.adminView")}</span>
          </div>
        )}
        <div className="flex-1">
          <Outlet />
        </div>

        {/* Global Supreme footer — on every dashboard page.
            Тук живеят и правните документи (махнати от лентата като букви).
            Връзките са ПРЕВЕДЕНИ — дотук бяха зашити на английски, само
            „Настройки за бисквитки“ беше на езика на човека. Реквизитите на
            фирмата са на редове, не в моно низ с точки по средата. */}
        <footer className="border-t border-cs-line bg-cs-deep mt-auto">
          <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <SupremeLogo size={28} />
              <div className="min-w-0 text-xs leading-relaxed text-cs-dim">
                <SupremeWordmark className="text-sm" />
                <p>
                  {t("footer.made")}{" "}
                  <a
                    href="https://carbonstealth.eu"
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-cs-text underline underline-offset-2 decoration-cs-dim/60 hover:text-cs-cyan"
                  >
                    {COMPANY_NAME}
                  </a>
                </p>
                <address className="not-italic mt-1">
                  Carbon Stealth VCC, ul. Samuil 3, 2670 Bobov dol, Bulgaria
                  <br />
                  EIK 208725180, VAT BG208725180,{" "}
                  <a href="mailto:legal@carbonstealth.eu" className="text-cs-muted underline underline-offset-2 decoration-cs-dim/60 hover:text-cs-cyan">legal@carbonstealth.eu</a>
                </address>
              </div>
            </div>
            <nav aria-label={t("footer.legalNav")} className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-cs-dim">
              <a href="/status"  className="no-underline hover:underline hover:text-cs-text">{t("footer.status")}</a>
              <a href="/terms"   className="no-underline hover:underline hover:text-cs-text">{t("footer.terms")}</a>
              <a href="/privacy" className="no-underline hover:underline hover:text-cs-text">{t("footer.privacy")}</a>
              <a href="/cookies" className="no-underline hover:underline hover:text-cs-text">{t("footer.cookies")}</a>
              {/* Чл. 7(3) ОРЗД: оттеглянето трябва да е толкова лесно, колкото
                  даването. Дотук банерът се показваше само веднъж и решението
                  беше необратимо. (Одит 07.08.2026) */}
              <button
                type="button"
                onClick={openCookiePreferences}
                className="hover:underline hover:text-cs-text"
              >
                {t("privacy.cookiePrefs")}
              </button>
              <a href="/eula"    className="no-underline hover:underline hover:text-cs-text">{t("footer.eula")}</a>
              <a href="/accessibility" className="no-underline hover:underline hover:text-cs-text">{t("footer.accessibility")}</a>
            </nav>
          </div>
        </footer>
      </main>

      {/* Premium upgrade toasts */}
      <PremiumToast />
      {/* Success/error toasts for mutations (Panels, Forms, Settings, …) */}
      <ToastHost />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="px-6 pt-5 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cs-dim">
      {children}
    </p>
  );
}

const NAV_BASE = "flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm transition-colors no-underline";
const NAV_IDLE = "text-cs-muted hover:text-cs-text hover:bg-cs-surface font-medium";

// Активната страница — лайм хапче с фина лайм рамка, както в концепцията;
// иконата светва заедно с текста.
function NavItem({ to, icon: Icon, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `${NAV_BASE} ${isActive
          ? "bg-cs-cyan/10 text-cs-cyan font-semibold ring-1 ring-inset ring-cs-cyan/35"
          : NAV_IDLE}`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 flex items-center gap-2 min-w-0 truncate">{children}</span>
    </NavLink>
  );
}
