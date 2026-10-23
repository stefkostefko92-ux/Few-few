// frontend/src/components/DashboardTopbar.jsx
// Горната лента на таблото — по одобрената концепция (10.10.2026): превключвател
// на сървъра, търсене и профилът вдясно. Търсенето прескача до страница от
// навигацията (същите групи като страничната лента — dashboardNav.js), не търси
// в данните: казва точно какво прави.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronDown, LogOut, Search, Shield, KeyRound } from "lucide-react";
import { useT } from "../contexts/I18nContext";
import LanguageSwitcher from "./LanguageSwitcher";

const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

/** Затваря падащото меню при клик извън него или Esc (и връща фокуса). */
function useDismiss(ref, open, setOpen, buttonRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); buttonRef?.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
}

export function ServerAvatar({ icon, name, className = "w-7 h-7" }) {
  return icon ? (
    <img src={icon} alt="" className={`${className} rounded-lg flex-none bg-cs-panel`} />
  ) : (
    <span aria-hidden="true" className={`${className} rounded-lg flex-none flex items-center justify-center bg-cs-cyan/15 text-cs-cyan text-xs font-bold`}>
      {String(name || "S").trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
}

// Шаблон „разкриване“ (бутон + списък с връзки), не ARIA меню: това е
// навигация, а връзките се обхождат с Tab като всички останали.
export function ServerSwitcher({ servers, serverId, serverName, serverIcon, className = "" }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  useDismiss(ref, open, setOpen, btnRef);
  const label = serverId ? serverName : t("nav.allServers");
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="server-switcher-list"
        className="w-full flex items-center gap-2.5 h-10 pl-1.5 pr-3 rounded-lg border border-cs-line bg-cs-surface/70 hover:border-cs-cyan/40 transition-colors"
      >
        <ServerAvatar icon={serverId ? serverIcon : null} name={label} />
        <span className="min-w-0 flex-1 text-left">
          <span className="sr-only">{t("nav.switchServer")}: </span>
          <span className="block text-sm font-semibold text-cs-text truncate">{label}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-cs-dim flex-none transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul id="server-switcher-list" className="absolute left-0 top-full mt-2 w-72 max-h-[60vh] overflow-y-auto rounded-xl border border-cs-line bg-cs-surface shadow-cs-lift p-1.5 z-50">
          <li>
            <Link to="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-cs-muted no-underline hover:bg-cs-panel hover:text-cs-text">
              {t("nav.allServers")}
            </Link>
          </li>
          {servers.map((s) => (
            <li key={s.id}>
              <Link
                to={`/dashboard/${s.id}`}
                onClick={() => setOpen(false)}
                aria-current={s.id === serverId ? "page" : undefined}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-cs-text no-underline hover:bg-cs-panel"
              >
                <ServerAvatar icon={s.icon} name={s.name} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.id === serverId && <Check className="w-4 h-4 text-cs-cyan flex-none" aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Комбобокс (WAI-ARIA 1.2): стрелките местят избора, Enter отваря страницата,
// Esc затваря списъка. Резултатите са страниците от навигацията.
function PageSearch({ items }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const n = q.trim().toLocaleLowerCase();
    if (!n) return [];
    return items.filter((i) => i.label.toLocaleLowerCase().includes(n)).slice(0, 8);
  }, [q, items]);
  const shown = open && q.trim() !== "";

  const go = (item) => {
    setQ("");
    setOpen(false);
    if (item.external) window.open(item.href, "_blank", "noopener,noreferrer");
    else navigate(item.to);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-dim pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        role="combobox"
        aria-label={t("nav.searchLabel")}
        aria-expanded={shown && results.length > 0}
        aria-controls="page-search-list"
        aria-autocomplete="list"
        aria-activedescendant={shown && results[active] ? `page-search-${active}` : undefined}
        placeholder={t("nav.search")}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className="cs-input !h-10 !py-0 !pl-9"
      />
      {shown && (
        results.length ? (
          <ul id="page-search-list" role="listbox" aria-label={t("nav.searchLabel")} className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-cs-line bg-cs-surface shadow-cs-lift p-1.5 z-50">
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <li
                  key={r.to || r.href}
                  id={`page-search-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); go(r); }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${i === active ? "bg-cs-cyan/10 text-cs-cyan" : "text-cs-text"}`}
                >
                  <Icon className="w-4 h-4 flex-none" aria-hidden="true" />
                  <span className="truncate">{r.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p role="status" className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-cs-line bg-cs-surface px-4 py-3 text-sm text-cs-dim z-50">
            {t("nav.noResults")}
          </p>
        )
      )}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  useDismiss(ref, open, setOpen, btnRef);
  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="user-menu-list"
        aria-label={t("nav.account")}
        className="flex items-center gap-2.5 h-10 pl-1 pr-2 rounded-lg hover:bg-cs-surface transition-colors"
      >
        <img
          src={user?.avatarUrl || DEFAULT_AVATAR}
          alt=""
          className="w-8 h-8 rounded-full border border-cs-cyan/30 bg-cs-panel flex-none"
          onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_AVATAR; }}
        />
        <span className="hidden lg:block text-left leading-tight max-w-[10rem]">
          <span className="block text-sm font-semibold text-cs-text truncate">{user?.username}</span>
          <span className="block text-xs text-cs-dim truncate">{t(`role.${user?.globalRole || "USER"}`)}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-cs-dim transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul id="user-menu-list" className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-cs-line bg-cs-surface shadow-cs-lift p-1.5 z-50">
          <li>
            <Link to="/dashboard/privacy-settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-cs-text no-underline hover:bg-cs-panel">
              <Shield className="w-4 h-4 text-cs-dim" aria-hidden="true" /> {t("nav.privacy")}
            </Link>
          </li>
          <li>
            <Link to="/dashboard/security" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-cs-text no-underline hover:bg-cs-panel">
              <KeyRound className="w-4 h-4 text-cs-dim" aria-hidden="true" /> {t("nav.security")}
            </Link>
          </li>
          <li className="border-t border-cs-line mt-1.5 pt-1.5">
            <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10">
              <LogOut className="w-4 h-4" aria-hidden="true" /> {t("nav.logout")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export default function DashboardTopbar({ servers, serverId, serverName, serverIcon, searchItems, user, onLogout }) {
  return (
    <header className="hidden md:flex items-center gap-3 lg:gap-4 h-16 px-4 lg:px-6 border-b border-cs-line bg-cs-bg/90 backdrop-blur sticky top-0 z-30">
      <ServerSwitcher servers={servers} serverId={serverId} serverName={serverName} serverIcon={serverIcon} className="w-56 lg:w-64 flex-none" />
      <PageSearch items={searchItems} />
      <div className="ml-auto flex items-center gap-1">
        <LanguageSwitcher compact direction="down" />
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
