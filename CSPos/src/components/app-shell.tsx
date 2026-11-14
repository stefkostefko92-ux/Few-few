"use client";

// Обвивка на приложението: групирано странично меню (по роля и одиторски профил),
// лента със състоянието на касата (ФУ, терминал, смяна, СУПТО, лиценз), търсачка
// на командите (Ctrl+K), преки пътища Alt+1…9 и „За програмата“.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Storefront,
  SignOut,
  Circle,
  MagnifyingGlass,
  Info,
  SidebarSimple,
  ShieldCheck,
  ShieldWarning,
  Eye,
  CreditCard,
  Coins,
  Seal,
  WifiSlash,
  CaretRight,
} from "@phosphor-icons/react";
import type { SessionData } from "@/lib/auth";
import { BGN_PER_EUR, DUAL_DISPLAY_END, ROLES } from "@/lib/constants";
import { activeHref, flatNav, visibleNav } from "@/lib/nav";
import { NavGlyph } from "./nav-glyph";
import { CommandPalette } from "./command-palette";
import { AboutDialog } from "./about-dialog";
import { useShellStatus, type ShellStatus } from "./shell-status";

const COLLAPSE_KEY = "cspos.navCollapsed";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <div className="text-right leading-tight hidden sm:block">
      <div className="font-bold text-lg tabular-nums">{now.toLocaleTimeString("bg-BG")}</div>
      <div className="text-xs text-ink-400">
        {now.toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" })}
      </div>
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "idle";
const DOT: Record<Tone, string> = {
  ok: "text-mint-500",
  warn: "text-brand-600",
  bad: "text-coral-500",
  idle: "text-ink-600",
};

function Pill({
  tone,
  icon,
  label,
  short,
  detail,
  href,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  /** Кратък етикет за по-тесни екрани — пълният е в подсказката. */
  short?: string;
  detail?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className={`relative flex ${DOT[tone]}`}>
        {icon}
        <Circle size={8} weight="fill" className="absolute -right-0.5 -bottom-0.5" />
      </span>
      {short ? (
        <>
          <span className="hidden lg:inline 2xl:hidden">{short}</span>
          <span className="hidden 2xl:inline">{label}</span>
        </>
      ) : (
        <span className="hidden lg:inline">{label}</span>
      )}
    </>
  );
  const cls = `chip !py-1.5 !px-3 text-xs font-semibold whitespace-nowrap ${tone === "bad" ? "!text-coral-600" : ""}`;
  return href ? (
    <Link href={href} className={cls} title={detail ?? label} aria-label={detail ?? label}>
      {body}
    </Link>
  ) : (
    <span className={`${cls} pointer-events-none`} title={detail ?? label} aria-label={detail ?? label}>
      {body}
    </span>
  );
}

function StatusBar({
  status,
  offline,
  session,
}: {
  status: ShellStatus | null;
  offline: boolean;
  session: SessionData;
}) {
  if (offline) {
    return (
      <Pill tone="bad" icon={<WifiSlash size={18} />} label="Няма връзка със сървъра на касата" />
    );
  }
  if (!status) return <Pill tone="idle" icon={<Circle size={18} />} label="Проверка на устройствата…" />;

  const isAdmin = session.role === "ADMIN" && !session.readOnly;
  const pills: React.ReactNode[] = [];
  pills.push(
    <Pill
      key="fu"
      tone={status.fiscal.ok ? "ok" : "bad"}
      icon={<Seal size={18} weight="duotone" />}
      label={status.fiscal.ok ? `ФУ ${status.fiscal.serial}` : "ФУ без връзка"}
      short="ФУ"
      detail={`Фискално устройство: ${status.fiscal.detail}`}
      href={isAdmin ? "/settings" : undefined}
    />
  );
  if (status.terminal) {
    pills.push(
      <Pill
        key="pos"
        tone={status.terminal.ok ? "ok" : "bad"}
        icon={<CreditCard size={18} weight="duotone" />}
        label={status.terminal.ok ? "ПОС терминал" : "ПОС без връзка"}
        short="ПОС"
        detail={`ПОС терминал: ${status.terminal.detail}`}
      />
    );
  }
  if (!session.readOnly) {
    const opened = status.shift ? new Date(status.shift.openedAt) : null;
    pills.push(
      <Pill
        key="shift"
        tone={opened ? "ok" : "warn"}
        icon={<Coins size={18} weight="duotone" />}
        label={
          opened
            ? `Смяна от ${opened.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })}`
            : "Няма открита смяна"
        }
        short={opened ? opened.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" }) : "Без смяна"}
        href="/shifts"
      />
    );
  }
  pills.push(
    <Pill
      key="supto"
      tone={status.supto.mode ? "ok" : "warn"}
      icon={status.supto.mode ? <ShieldCheck size={18} weight="duotone" /> : <ShieldWarning size={18} weight="duotone" />}
      label={status.supto.mode ? "СУПТО" : "СУПТО изключен"}
      short="СУПТО"
      detail={
        status.supto.mode
          ? "Режим СУПТО: всяка продажба носи УНП, данните не се изтриват"
          : "Режим СУПТО е изключен — УНП не се печата на бона"
      }
      href={isAdmin ? "/settings" : undefined}
    />
  );
  if (status.license.status !== "active" && session.role === "ADMIN") {
    const text = { none: "Без лиценз", expired: "Лицензът изтече", invalid: "Невалиден лиценз" }[status.license.status];
    pills.push(
      <Pill
        key="lic"
        tone={status.license.status === "none" ? "warn" : "bad"}
        icon={<Info size={18} weight="duotone" />}
        label={text}
        short="Лиценз"
        href={isAdmin ? "/settings" : undefined}
      />
    );
  }
  return <div className="flex items-center gap-2 min-w-0">{pills}</div>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toLocaleUpperCase("bg-BG") || "?";
}

export function AppShell({ session, children }: { session: SessionData; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const readOnly = Boolean(session.readOnly);
  const groups = useMemo(() => visibleNav(session.role, readOnly), [session.role, readOnly]);
  const items = useMemo(() => flatNav(groups), [groups]);
  const current = activeHref(pathname, items);
  const currentGroup = groups.find((g) => g.items.some((i) => i.href === current));
  const currentItem = items.find((i) => i.href === current);

  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { status, offline } = useShellStatus();
  const dualDisplay = new Date().toISOString().slice(0, 10) <= DUAL_DISPLAY_END;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // няма достъп до хранилището — менюто остава разгърнато
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // само удобство — без хранилище просто не се помни
      }
      return !c;
    });
  };

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  // Клавиатура: Ctrl/⌘+K — търсачка; Alt+1…9 — пряк преход по реда в менюто.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const target = items[Number(e.code.slice(5)) - 1];
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, router]);

  // „Лещата“ — стъклото зад активния елемент се плъзга към новия при преход.
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [lens, setLens] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = current ? linkRefs.current.get(current) : undefined;
      setLens(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [current, collapsed, groups]);

  const wide = !collapsed;
  const label = wide ? "hidden xl:block" : "hidden";

  return (
    <div className="flex min-h-screen">
      <aside
        className={`shrink-0 border-r border-black/[0.06] bg-white/[0.55] backdrop-blur-2xl flex flex-col sticky top-0 h-screen z-30 transition-[width] duration-300 w-[84px] ${
          wide ? "xl:w-[272px]" : ""
        }`}
        aria-label="Главно меню"
      >
        <div className="flex items-center h-16 border-b border-black/[0.06] shrink-0 pr-2.5">
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="flex flex-1 min-w-0 items-center gap-3 pl-[22px] h-full text-left"
          title="За програмата"
        >
          <span
            className="size-10 rounded-2xl text-[#231a05] flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg,#ffd166,#f5a623)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.45), 0 6px 18px -6px rgba(245,166,35,.6)",
            }}
          >
            <Storefront size={22} weight="fill" />
          </span>
          <span className={`${wide ? "hidden xl:flex" : "hidden"} flex-col leading-none`}>
            <span className="font-black text-[16px] tracking-tight">Carbon Stealth</span>
            <span className="text-[11px] font-bold text-brand-700 mt-1">POS {status?.app.version ?? ""}</span>
          </span>
        </button>
        {wide && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="btn-ghost !p-0 size-11 shrink-0 hidden xl:inline-flex !shadow-none !bg-transparent hover:!bg-white/70"
            title="Свий менюто"
            aria-label="Свий менюто"
            aria-pressed={false}
          >
            <SidebarSimple size={20} />
          </button>
        )}
        </div>

        <nav className="relative flex-1 py-3 px-3 overflow-y-auto overflow-x-hidden">
          {lens && (
            <span
              aria-hidden
              className="nav-lens"
              style={{ transform: `translateY(${lens.top}px)`, height: lens.height }}
            />
          )}
          {groups.map((g, gi) => (
            <div key={g.id} className={gi > 0 ? "mt-2.5" : ""} role="group" aria-label={g.label}>
              {wide ? (
                <div className="hidden xl:block px-3 pt-1 pb-1 text-[12px] font-semibold text-ink-500">
                  {g.label}
                </div>
              ) : null}
              {gi > 0 && <div className={`${wide ? "xl:hidden" : ""} mx-3 mb-2.5 h-px bg-black/[0.07]`} />}
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const shortcut = items.indexOf(n) + 1;
                  const active = n.href === current;
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        ref={(el) => {
                          if (el) linkRefs.current.set(n.href, el);
                          else linkRefs.current.delete(n.href);
                        }}
                        aria-current={active ? "page" : undefined}
                        title={`${n.label} — ${n.hint}`}
                        aria-label={n.label}
                        className={`relative z-[1] flex items-center gap-3 rounded-2xl px-[17px] min-h-[48px] font-semibold transition-colors outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 ${
                          active ? "text-ink-100" : "text-ink-300 hover:text-ink-100 hover:bg-white/[0.45]"
                        }`}
                      >
                        <span className={active ? "text-brand-700" : ""}>
                          <NavGlyph icon={n.icon} active={active} />
                        </span>
                        <span className={`${label} flex-1 truncate`}>{n.label}</span>
                        {shortcut <= 9 && (
                          <span className={`${wide ? "hidden 2xl:inline" : "hidden"} text-[11px] font-medium text-ink-500 tabular-nums`}>
                            Alt {shortcut}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div
          className={`p-3 border-t border-black/[0.06] shrink-0 flex gap-2 ${
            wide ? "flex-col items-center xl:flex-row xl:items-center" : "flex-col items-center"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 xl:flex-1 px-1">
            <span
              title={`${session.name}, ${readOnly ? "одитор, само четене" : ROLES[session.role]}, код ${String(session.operatorCode).padStart(4, "0")}`}
              className={`size-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${
                readOnly ? "bg-sky2-500/15 text-sky2-500" : "bg-white/[0.8] text-ink-200"
              } shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_2px_8px_-3px_rgba(23,32,58,.2)]`}
              aria-hidden
            >
              {initials(session.name)}
            </span>
            <span className={`${label} min-w-0`}>
              <span className="block font-semibold truncate leading-tight">{session.name}</span>
              <span
                className="block text-xs text-ink-400 truncate"
                title={`Код на оператор ${String(session.operatorCode).padStart(4, "0")}`}
              >
                {readOnly ? "Одитор, само четене" : ROLES[session.role]}
              </span>
            </span>
          </div>
          <div className={`flex ${wide ? "flex-col xl:flex-row" : "flex-col"} gap-1.5`}>
            {collapsed && (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="btn-ghost !p-0 size-11 hidden xl:inline-flex"
                title="Разгъни менюто"
                aria-label="Разгъни менюто"
                aria-pressed
              >
                <SidebarSimple size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="btn-ghost !p-0 size-11"
              title="Изход"
              aria-label="Изход"
            >
              <SignOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-black/[0.06] bg-white/[0.5] backdrop-blur-2xl flex items-center justify-between gap-4 px-4 md:px-6 sticky top-0 z-40">
          <div className="flex items-center gap-3 min-w-0">
            {currentItem && (
              // тиха пътечка: голямото заглавие е на самата страница, тук е само ориентирът
              <nav aria-label="Пътечка" className="flex items-center gap-1.5 text-sm min-w-0">
                <span className="text-ink-400 hidden md:inline">{currentGroup?.label}</span>
                <CaretRight size={12} weight="bold" className="text-ink-600 hidden md:inline" aria-hidden />
                <span className="font-semibold text-ink-200 truncate" aria-current="page">
                  {currentItem.label}
                </span>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <StatusBar status={status} offline={offline} session={session} />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="chip !py-1.5 !px-3 text-xs font-semibold hidden md:inline-flex"
              aria-label="Търсене на екран (Ctrl+K)"
            >
              <MagnifyingGlass size={16} />
              <span className="hidden xl:inline">Търсене</span>
              <kbd className="hidden xl:inline text-[11px] text-ink-400">Ctrl K</kbd>
            </button>
            {dualDisplay && (
              <span className="chip !py-1.5 !px-3 text-xs font-semibold tabular-nums pointer-events-none hidden 2xl:inline-flex">
                1 € = {BGN_PER_EUR.toFixed(5).replace(".", ",")} лв.
              </span>
            )}
            <Clock />
          </div>
        </header>
        {readOnly && (
          <div
            role="status"
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-sky2-500 bg-sky2-500/10 border-b border-sky2-500/20"
          >
            <Eye size={18} weight="duotone" />
            Одиторски профил: можете да преглеждате и изнасяте данните, но не и да ги променяте.
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      <CommandPalette
        open={paletteOpen}
        items={items}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(href) => router.push(href)}
        onAbout={() => setAboutOpen(true)}
        onLogout={logout}
      />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} status={status} />
    </div>
  );
}
