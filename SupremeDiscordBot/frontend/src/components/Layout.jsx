// frontend/src/components/Layout.jsx
import { useEffect, useRef, useState } from "react";
import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Ticket, FileText, Layout as LayoutIcon,
  Star, Shield, ShieldCheck, LogOut, ChevronLeft, Settings, Users, ExternalLink, Webhook,
  Zap, BookOpen, Lightbulb,
  LineChart, Key,
  Menu, X as CloseIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "../contexts/I18nContext";
import { getServers, logout } from "../api";
import LanguageSwitcher from "./LanguageSwitcher";
import PremiumToast from "./PremiumToast";
import ToastHost from "./ToastHost";
import TrialBanner from "./TrialBanner";
import PastDueBanner from "./PastDueBanner";
import GraceBanner from "./GraceBanner";
import SupremeLogo, { SupremeWordmark } from "./SupremeLogo";
import { APP_VERSION_LABEL, RELEASE_NAME } from "../version";

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

  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const currentServer = servers.find((s) => s.id === serverId);

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
          <a href="/dashboard" className="flex items-center gap-3 group">
            <SupremeLogo size={36} />
            <div>
              <SupremeWordmark className="text-base leading-none" />
              {/* Версията идва от package.json през Vite define — закованият низ
                  тук беше разминат с цял мажор (v2.3 при реални 3.1.0). */}
              <div className="font-mono text-[8px] tracking-[0.25em] uppercase text-cs-dim mt-0.5">
                {APP_VERSION_LABEL} {RELEASE_NAME}
              </div>
            </div>
          </a>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5" aria-label="Dashboard navigation">
          {serverId && (
            <NavLink to="/dashboard" className="flex items-center gap-2 mx-3 px-3 py-2 text-cs-dim hover:text-cs-cyan text-xs font-mono uppercase tracking-wider transition-colors border-l-2 border-transparent">
              <ChevronLeft className="w-3.5 h-3.5" />
              All Servers
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
              <SectionLabel truncate>{currentServer?.name || "Server"}</SectionLabel>
              <NavItem to={`/dashboard/${serverId}`}              icon={LayoutDashboard} end>{t("nav.overview")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/panels`}       icon={LayoutIcon}>{t("nav.panels")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/forms`}        icon={FileText}>{t("nav.forms")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/tickets`}      icon={Ticket}>{t("nav.tickets")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/applications`} icon={Users}>{t("nav.applications")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/verification`} icon={ShieldCheck}>{t("nav.verification")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/automation`} icon={Zap}>{t("nav.automation")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/analytics`} icon={LineChart}>{t("nav.analytics")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/apikeys`} icon={Key}>{t("nav.apikeys")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/commands`} icon={BookOpen}>{t("nav.commands")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/kb`} icon={Lightbulb}>{t("nav.knowledgeBase")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/webhooks`} icon={Webhook}>{t("nav.webhooks")}</NavItem>
              <NavItem to={`/dashboard/${serverId}/premium`}      icon={Star}>
                {t("nav.premium")}
                {currentServer?.isPremium && (
                  <span className="ml-auto cs-badge-premium !text-[8px] !px-1.5 !py-0">
                    Active
                  </span>
                )}
              </NavItem>
              <NavItem to={`/dashboard/${serverId}/settings`}     icon={Settings}>{t("nav.settings")}</NavItem>
            </>
          )}
        </nav>

        {/* Support link */}
        <div className="px-3 py-2 border-t border-cs-border">
          <a
            href={import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-wider text-cs-dim hover:text-cs-cyan transition-colors"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .038.058 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            <span>{t("nav.support")}</span>
            <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
          </a>
          <div className="flex gap-3 px-3 pt-1 pb-2">
            {/* Съкратени до буква заради тясната лента — но НАЗВАНИЕТО остава.
                Без него екранният четец обявява „Т“, „П“, „С“, „Е“: връзка без
                разпознаваема цел (WCAG 2.4.4), и то точно към документите,
                които по закон трябва да са намираеми. (Одит на екраните,
                07.08.2026) */}
            <LegalLink href="/terms"   label={t("privacy.terms")}>T</LegalLink>
            <LegalLink href="/privacy" label={t("privacy.privacyPolicy")}>P</LegalLink>
            <LegalLink href="/cookies" label={t("privacy.cookies")}>C</LegalLink>
            <LegalLink href="/eula"    label={t("privacy.eula")}>E</LegalLink>
            <a href="https://carbonstealth.eu" target="_blank" rel="noopener"
               className="ml-auto font-mono text-[9px] uppercase tracking-wider text-cs-dim hover:text-cs-cyan transition-colors">
              CS.EU
            </a>
          </div>
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-cs-border bg-cs-surface">
          <div className="flex items-center gap-3">
            {/* `src` НИКОГА не бива да е undefined: тогава браузърът рисува
                счупено изображение с alt текста, което разпъва реда и реже
                ролята — а `onError` не се задейства без src, значи резервата
                по-долу не пази. Backend-ът винаги връща avatarUrl (пада на
                аватара по подразбиране на Discord), но тук не разчитаме на това. */}
            <img
              src={user?.avatarUrl || DEFAULT_AVATAR}
              alt=""
              className="w-9 h-9 flex-shrink-0 border border-cs-cyan/30"
              onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_AVATAR; }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cs-text truncate leading-tight">{user?.username}</p>
              {/* Ролята беше суров enum („MAIN OWNER“) — непреведен и твърде
                  дълъг за лентата, затова се режеше на „MAIN O…“. Сега е къс
                  преведен етикет, който се събира без отрязване. */}
              <p className="text-[9px] font-mono uppercase tracking-wider text-cs-cyan truncate">
                {t(`role.${user?.globalRole || "USER"}`)}
              </p>
            </div>
            <LanguageSwitcher compact />
            <a
              href="/dashboard/privacy-settings"
              className="text-cs-dim hover:text-cs-cyan p-2 transition-colors"
              title={t("nav.privacy")}
            >
              <Shield className="w-4 h-4" />
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
        {/* Провалено плащане стои НАД пробния период — то е по-спешното. */}
        <PastDueBanner />
        {/* v40 — отменен, но платен до края: показваме докога работи. */}
        <GraceBanner />
        {/* v2.0 — Trial banner appears on per-server pages */}
        <TrialBanner />
        <div className="flex-1">
          <Outlet />
        </div>

        {/* Global Supreme footer — on every dashboard page */}
        <footer className="border-t border-cs-border bg-cs-bg mt-auto">
          <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <SupremeLogo size={28} />
              <div className="flex flex-col leading-tight">
                <SupremeWordmark className="text-sm" />
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-cs-dim">
                  Created and Designed by{" "}
                  <a
                    href="https://carbonstealth.eu"
                    target="_blank"
                    rel="noopener"
                    className="text-cs-cyan underline"
                  >
                    Carbon Stealth VCC
                  </a>
                </span>
                <span className="font-mono text-[9px] tracking-[0.12em] text-cs-dim mt-1">
                  Carbon Stealth VCC · ul. Samuil 3, 2670 Bobov dol, Bulgaria · EIK 208725180 · VAT BG208725180 ·{" "}
                  <a href="mailto:legal@carbonstealth.eu" className="text-cs-cyan underline">legal@carbonstealth.eu</a>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-5 text-[10px] font-mono uppercase tracking-widest text-cs-dim">
              <a href="/status"  className="hover:text-cs-cyan transition-colors">Status</a>
              <a href="/terms"   className="hover:text-cs-cyan transition-colors">Terms</a>
              <a href="/privacy" className="hover:text-cs-cyan transition-colors">Privacy</a>
              <a href="/cookies" className="hover:text-cs-cyan transition-colors">Cookies</a>
              <a href="/eula"    className="hover:text-cs-cyan transition-colors">EULA</a>
              <a href="/accessibility" className="hover:text-cs-cyan transition-colors">Accessibility</a>
            </div>
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
    <p className={`font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-cs-dim px-6 pt-4 pb-2 ${truncate ? "truncate" : ""}`}>
      → {children}
    </p>
  );
}

function NavItem({ to, icon: Icon, end, accent, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 mx-3 px-3 py-2.5 text-sm transition-colors border-l-2
         ${isActive
            ? "text-cs-cyan bg-cs-surface border-cs-cyan font-semibold"
            : "text-cs-muted hover:text-cs-text hover:bg-cs-surface border-transparent font-medium"
         }`
      }
    >
      <Icon className={`w-4 h-4 ${accent ? "text-cs-cyan" : ""}`} />
      <span className="flex-1 flex items-center gap-2">{children}</span>
    </NavLink>
  );
}

function LegalLink({ href, children, label }) {
  return (
    <a
      href={href}
      // `title` за мишката, `aria-label` за четеца. Буквата остава видима.
      title={label}
      aria-label={label}
      className="w-5 h-5 flex items-center justify-center font-mono text-[10px] font-bold
                 text-cs-dim hover:text-cs-cyan border border-cs-border hover:border-cs-cyan
                 transition-colors"
    >
      <span aria-hidden="true">{children}</span>
    </a>
  );
}
