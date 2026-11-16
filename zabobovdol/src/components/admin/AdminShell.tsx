"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROLE_LABELS } from "@/lib/categories";
import { logoutAction } from "@/lib/admin/auth-actions";
import type { SessionUser } from "@/lib/auth";
import { activeItem, DASHBOARD, matchesQuery, navFor, type NavIcon, type NavItem } from "@/lib/admin/nav";
import {
  AlertTriangle,
  BarChart,
  BookOpen,
  Building2,
  CalendarDays,
  Car,
  ChevronDown,
  Clock,
  Coins,
  Cross,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Hand,
  HeartHandshake,
  HeartPulse,
  Images,
  Landmark,
  LayoutGrid,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Newspaper,
  Phone,
  PhoneOff,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Users,
  Zap,
  type LucideIcon,
} from "@/components/icons";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutGrid,
  complaint: Landmark,
  dump: Trash2,
  phoneOff: PhoneOff,
  message: MessageSquare,
  megaphone: Coins,
  listing: FileText,
  help: HeartHandshake,
  memory: Clock,
  volunteer: Hand,
  car: Car,
  images: Images,
  cross: Cross,
  book: BookOpen,
  phone: Phone,
  store: Building2,
  pharmacy: HeartPulse,
  zap: Zap,
  shield: AlertTriangle,
  calendar: CalendarDays,
  news: Newspaper,
  import: Download,
  send: Send,
  chart: BarChart,
  search: Search,
  globe: Globe,
  banner: Megaphone,
  qr: QrCode,
  mail: Mail,
  assistant: MessageCircle,
  mobile: Smartphone,
  settings: SlidersHorizontal,
  users: Users,
  audit: ShieldCheck,
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "А";
}

// Рамката на админ панела: тъмносиня лента с менюто по задачи (Входящи,
// Публикации от хората, Справочник…), търсачка в менюто („/“ или Ctrl+K),
// броячи на чакащото, горна лента с пътя до страницата и менюто на профила.
export function AdminShell({
  user,
  pending = {},
  children,
}: {
  user: SessionUser;
  pending?: Record<string, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDetailsElement>(null);

  const groups = useMemo(() => navFor(user.role), [user.role]);
  const current = activeItem(pathname, groups);
  const inboxTotal = (groups.find((g) => g.id === "inbox")?.items ?? []).reduce(
    (n, i) => n + (i.pendingKey ? pending[i.pendingKey] ?? 0 : 0),
    0,
  );

  // Смяна на страницата → менюто на телефон се затваря, търсенето се чисти.
  useEffect(() => {
    setOpen(false);
    setQuery("");
    if (userMenuRef.current) userMenuRef.current.open = false;
  }, [pathname]);

  // Менюто на профила се затваря при щракване извън него.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const d = userMenuRef.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  // „/“ или Ctrl+K — към търсенето в менюто; Esc — затваря менюто на телефон.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => matchesQuery(i, query)) }))
    .filter((g) => g.items.length > 0);

  const navLink = (item: NavItem) => {
    const isActive = current?.item.href === item.href;
    const count = item.pendingKey ? pending[item.pendingKey] ?? 0 : 0;
    const Icon = ICONS[item.icon];
    return (
      <Link
        href={item.href}
        title={item.hint}
        aria-current={isActive ? "page" : undefined}
        className={
          "admin-nav-link group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[0.9375rem] leading-snug transition-colors " +
          (isActive
            ? "bg-white/[0.12] font-semibold text-white"
            : "text-brand-100 hover:bg-white/[0.07] hover:text-white")
        }
      >
        {isActive && (
          <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-gold-400" />
        )}
        <Icon
          className={
            "h-5 w-5 shrink-0 " + (isActive ? "text-gold-300" : "text-brand-300 group-hover:text-brand-100")
          }
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {count > 0 && (
          <span className="ml-auto rounded-full bg-gold-400 px-2 py-0.5 text-xs font-bold tabular-nums text-brand-900">
            {count}
            <span className="sr-only"> чакат</span>
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-brand-900/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="admin-nav"
        className={
          "fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col bg-brand-900 text-brand-100 shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <Link
          href="/admin"
          className="flex items-center gap-3 border-b border-white/10 px-5 py-4 hover:bg-white/[0.04]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bobov-dol-grb-mark.png" alt="" width={36} height={44} className="h-11 w-auto" />
          <span className="leading-tight">
            <span className="block font-display text-lg font-bold text-white">За Бобов дол</span>
            <span className="block text-sm text-brand-200">Администрация</span>
          </span>
        </Link>

        <div className="px-4 pb-2 pt-4">
          <label htmlFor="admin-nav-search" className="sr-only">
            Намери раздел
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-300" />
            <input
              ref={searchRef}
              id="admin-nav-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Намери раздел"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.07] pl-9 pr-12 text-sm text-white placeholder:text-brand-300 focus:border-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-300/40"
            />
            {!query && (
              <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-white/15 px-1.5 text-[0.6875rem] text-brand-300 lg:block">
                /
              </kbd>
            )}
          </div>
        </div>

        <nav aria-label="Админ меню" className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
          {!query && (
            <ul className="mt-1">
              <li>
                {navLink(DASHBOARD)}
              </li>
            </ul>
          )}
          {visible.map((g) => (
            <div key={g.id} className="mt-5">
              <p
                id={`nav-${g.id}`}
                className="flex items-center justify-between px-3 pb-1.5 font-sans text-[0.8125rem] font-semibold text-brand-300"
              >
                {g.label}
                {g.id === "inbox" && inboxTotal > 0 && !query && (
                  <span className="text-xs font-medium text-gold-300">
                    {inboxTotal} {inboxTotal === 1 ? "чака" : "чакат"}
                  </span>
                )}
              </p>
              <ul aria-labelledby={`nav-${g.id}`} className="space-y-0.5">
                {g.items.map((i) => (
                  <li key={i.href}>
                    {navLink(i)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="mt-6 px-3 text-sm text-brand-200">
              Няма раздел с „{query}“. Опитайте с друга дума — например „поща“ или „аптеки“.
            </p>
          )}
        </nav>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-controls="admin-nav"
              aria-expanded={open}
              className="-ml-1 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 lg:hidden"
            >
              <LayoutGrid aria-hidden className="h-4 w-4" />
              Меню
              {inboxTotal > 0 && (
                <span className="rounded-full bg-gold-400 px-1.5 text-xs font-bold text-brand-900">{inboxTotal}</span>
              )}
            </button>

            <nav aria-label="Къде сте" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-1.5 text-sm">
                {current?.group && (
                  <li className="hidden shrink-0 text-slate-500 sm:block">
                    {current.group.label}
                    <span aria-hidden className="mx-1.5 text-slate-300">/</span>
                  </li>
                )}
                <li className="truncate font-semibold text-slate-900" aria-current="page">
                  {current?.item.label ?? "Администрация"}
                </li>
              </ol>
            </nav>

            <Link
              href="/"
              target="_blank"
              className="hidden h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand-700 hover:bg-brand-50 sm:inline-flex"
            >
              Виж сайта
              <ExternalLink aria-hidden className="h-4 w-4" />
              <span className="sr-only">(отваря се в нов раздел)</span>
            </Link>

            <details ref={userMenuRef} className="admin-user relative">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg pl-1 pr-2 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white"
                >
                  {initials(user.name)}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block max-w-[12rem] truncate text-sm font-semibold text-slate-900">{user.name}</span>
                  <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
                </span>
                <ChevronDown aria-hidden className="h-4 w-4 text-slate-500" />
                <span className="sr-only">Профил и изход</span>
              </summary>
              <div className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="border-b border-slate-100 px-3 pb-2 pt-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
                <Link
                  href="/admin/profil"
                  className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Users aria-hidden className="h-4 w-4" /> Моят профил
                </Link>
                <Link
                  href="/"
                  target="_blank"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 sm:hidden"
                >
                  <ExternalLink aria-hidden className="h-4 w-4" /> Виж сайта
                </Link>
                <form action={logoutAction}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <LogOut aria-hidden className="h-4 w-4" /> Изход
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>

        {/* Не <main>: страницата вече е в <main id="main"> на основния layout. */}
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
