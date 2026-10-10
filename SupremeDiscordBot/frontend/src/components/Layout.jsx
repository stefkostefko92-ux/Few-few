// frontend/src/components/Layout.jsx
import { useEffect, useRef, useState } from "react";
import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Ticket, FileText, Layout as LayoutIcon,
  Star, Shield, ShieldCheck, LogOut, ChevronLeft, Settings, Users, ExternalLink, Webhook,
  Zap, BookOpen, Lightbulb,
  LineChart, Key,
  Menu, X as CloseIcon, MessageSquareText,
 KeyRound, Gamepad2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "../contexts/I18nContext";
import { getServers, getServer, logout } from "../api";
import LanguageSwitcher from "./LanguageSwitcher";
import PremiumToast from "./PremiumToast";
import ToastHost from "./ToastHost";
import PastDueBanner from "./PastDueBanner";
import GraceBanner from "./GraceBanner";
import SupremeLogo, { SupremeWordmark } from "./SupremeLogo";
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
    <div className="flex h-screen bg-cs-black overflow-hidden">
      {/* Skip link — first focusable element, visible on keyboard focus (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-cs-cyan focus:text-black focus:font-semibold"
      >
        Skip to main content
      </a>
      {/* Mobile top bar — brand + hamburger, visible only on small screens */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-cs-bg border-b border-cs-border h-14 flex items-center justify-between px-4">
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
          w-64 bg-cs-bg flex flex-col border-r border-cs-border flex-shrink-0
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
        <div className="px-5 pt-5 pb-5 border-b border-cs-border">
          <a href="/dashboard" className="flex items-center gap-3 group no-underline">
            <SupremeLogo size={36} />
            <div className="min-w-0 leading-tight">
              <SupremeWordmark className="text-base leading-none" />
              {/* Версията идва от package.json през Vite define — закованият низ
                  тук беше разминат с цял мажор (v2.3 при реални 3.1.0).
                  Два тихи реда вместо „v3.5.0 SUPREMACY“ с главни букви:
                  името на изданието е име, а номерът е данни (табличните
                  цифри не подскачат при смяна на версията). */}
              <div className="text-[13px] font-semibold text-cs-text">{RELEASE_NAME}</div>
              <div className="text-xs text-cs-dim tabular-nums mt-0.5">{APP_VERSION_LABEL}</div>
            </div>
          </a>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5" aria-label="Dashboard navigation">
          {serverId && (
            <NavLink to="/dashboard" end className="flex items-center gap-2 mx-3 px-3 py-2 rounded-lg text-[13px] font-medium text-cs-dim hover:text-cs-text hover:bg-cs-surface/60 transition-colors no-underline">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              {t("nav.allServers")}
            </NavLink>
          )}

          {!serverId ? (
            <>
              <SectionLabel>Navigation</SectionLabel>
              <NavItem to="/dashboard" icon={LayoutDashboard} end>Dashboard</NavItem>
              {isSuperUser && (
                <NavItem to="/dashboard/admin" icon={Shield} accent>Super Admin</NavItem>
              )}
            </>
          ) : (
            <>
              {/* Сървърът, в който си — с иконата му, а не „→ T19C“: стрелката
                  беше шаблонна украса, а иконата е това, по което човек
                  разпознава сървъра си и в самия Discord. */}
              <div className="mx-3 mt-2 mb-3 flex items-center gap-3 rounded-xl border border-cs-border bg-cs-surface/60 px-3 py-2.5">
                {currentServer?.icon || foreignInfo?.icon ? (
                  <img src={currentServer?.icon || foreignInfo?.icon} alt="" className="w-8 h-8 rounded-lg flex-shrink-0" />
                ) : (
                  <span aria-hidden="true" className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-cs-cyan/15 text-cs-cyan text-sm font-bold">
                    {serverName.trim().charAt(0).toUpperCase() || "S"}
                  </span>
                )}
                <span className="min-w-0 text-sm font-semibold text-cs-text truncate">{serverName}</span>
              </div>
              <NavItem to={`/dashboard/${serverId}`}              icon={LayoutDashboard} end>{t("nav.overview")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/panels`}       icon={LayoutIcon}>{t("nav.panels")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/forms`}        icon={FileText}>{t("nav.forms")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/tickets`}      icon={Ticket}>{t("nav.tickets")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/applications`} icon={Users}>{t("nav.applications")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/verification`} icon={ShieldCheck}>{t("nav.verification")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/automation`} icon={Zap}>{t("nav.automation")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/game`} icon={Gamepad2}>{t("nav.game")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/analytics`} icon={LineChart}>{t("nav.analytics")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/apikeys`} icon={Key}>{t("nav.apikeys")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/commands`} icon={BookOpen}>{t("nav.commands")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/kb`} icon={Lightbulb}>{t("nav.knowledgeBase")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/tags`}         icon={MessageSquareText}>{t("nav.tags")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/webhooks`} icon={Webhook}>{t("nav.webhooks")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/premium`}      icon={Star}>
                {t("nav.premium")}
                {currentServer?.isPremium && (
                  <span className="ml-auto cs-badge-premium !text-[10px] !px-1.5 !py-0">
                    Active
                  </span>
                )}
              </NavItem>
              <NavItem to={`/dashboard/${serverId}/settings`}     icon={Settings}>{t("nav.settings")}</NavItem>
            </>
          )}
        </nav>

        {/* Support link. Правните документи вече НЕ са тук като букви
            „T P C E“ в кутийки: стоят с пълните си (преведени) имена във
            футъра под всяка страница на таблото — намираеми, без съкращения,
            които четецът чете като „Т“, „П“… (WCAG 2.4.4). */}
        <div className="px-3 py-2 border-t border-cs-border">
          <a
            href={import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-cs-dim hover:text-cs-text hover:bg-cs-surface/60 transition-colors no-underline"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .038.058 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            <span>{t("nav.support")}</span>
            <ExternalLink className="w-3.5 h-3.5 ml-auto opacity-60" aria-hidden="true" />
          </a>
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-cs-border bg-cs-surface">
          {/* ДВА реда, не един. Лентата е 256px; аватар (36) + четири икони по
              32 + пет междини по 12 = 224 → за името оставаха 7px и то се
              режеше до една буква („Z“), а ролята — до „0“. Дефектът се появи с
              четвъртата икона (Сигурност, 3.4.0) и се вижда само на екран —
              статичният гейт не мери ширини. Мерено с Chromium на 1280 и 390:
              clientWidth 7 / scrollWidth 54. (17.09.2026) */}
          <div className="flex items-center gap-3">
            {/* `src` НИКОГА не бива да е undefined: тогава браузърът рисува
                счупено изображение с alt текста, което разпъва реда и реже
                ролята — а `onError` не се задейства без src, значи резервата
                по-долу не пази. Backend-ът винаги връща avatarUrl (пада на
                аватара по подразбиране на Discord), но тук не разчитаме на това. */}
            <img
              src={user?.avatarUrl || DEFAULT_AVATAR}
              alt=""
              className="w-9 h-9 flex-shrink-0 rounded-full border border-cs-cyan/30 bg-cs-panel"
              onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_AVATAR; }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cs-text truncate leading-tight">{user?.username}</p>
              {/* Ролята беше суров enum („MAIN OWNER“) — непреведен и твърде
                  дълъг за лентата, затова се режеше на „MAIN O…“. Сега е къс
                  преведен етикет, който се събира без отрязване. */}
              <p className="text-xs text-cs-cyan truncate">
                {t(`role.${user?.globalRole || "USER"}`)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            {/* Менюто за език се отваря НАЛЯВО спрямо иконата (align="left"):
                с right-0 при икона в левия край 160px списък излизаше на
                −49px извън екрана и се режеше („ски“, „ch“, „ol“). */}
            <LanguageSwitcher compact align="left" />
            <a
              href="/dashboard/privacy-settings"
              className="text-cs-dim hover:text-cs-cyan p-2 transition-colors"
              title={t("nav.privacy")}
            >
              <Shield className="w-4 h-4" />
            </a>
            <a
              href="/dashboard/security"
              className="text-cs-dim hover:text-cs-cyan p-2 transition-colors"
              title={t("nav.security")}
            >
              <KeyRound className="w-4 h-4" />
            </a>
            <button
              onClick={handleLogout}
              className="text-cs-dim hover:text-danger p-2 transition-colors"
              title={t("nav.logout")}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-y-auto bg-cs-black flex flex-col">
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
        <footer className="border-t border-cs-border bg-cs-bg mt-auto">
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

function SectionLabel({ children, truncate }) {
  return (
    <p className={`text-[13px] font-semibold text-cs-dim px-6 pt-4 pb-2 ${truncate ? "truncate" : ""}`}>
      {children}
    </p>
  );
}

// Активната страница: мек фон, заоблени ъгли и тънка лайм черта отляво, която
// стои ВЪТРЕ в реда (не като ръб на квадратна кутия). Иконата светва заедно с
// текста — човек намира мястото си по цвета, без да чете.
function NavItem({ to, icon: Icon, end, accent, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm transition-colors no-underline
         ${isActive
            ? "text-cs-text bg-cs-surface font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-cs-cyan"
            : "text-cs-muted hover:text-cs-text hover:bg-cs-surface/60 font-medium"
         }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive || accent ? "text-cs-cyan" : ""}`} aria-hidden="true" />
          <span className="flex-1 flex items-center gap-2 min-w-0">{children}</span>
        </>
      )}
    </NavLink>
  );
}
