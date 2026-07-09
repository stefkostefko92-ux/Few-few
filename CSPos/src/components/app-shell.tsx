"use client";

// Обвивка на приложението: странична навигация (по роля), часовник,
// статус на фискалното устройство, изход.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Storefront,
  CashRegister,
  SquaresFour,
  Package,
  Truck,
  ChartBar,
  ClockCounterClockwise,
  GearSix,
  SignOut,
  Circle,
  ListMagnifyingGlass,
  Tag,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type { SessionData } from "@/lib/auth";
import { BGN_PER_EUR, ROLES, type RoleKey } from "@/lib/constants";

const NAV: Array<{
  href: string;
  label: string;
  icon: React.ReactNode;
  minRole: RoleKey;
}> = [
  { href: "/pos", label: "Продажби", icon: <CashRegister size={22} weight="duotone" />, minRole: "CASHIER" },
  { href: "/check", label: "Проверка цена", icon: <MagnifyingGlass size={22} weight="duotone" />, minRole: "CASHIER" },
  { href: "/dashboard", label: "Табло", icon: <SquaresFour size={22} weight="duotone" />, minRole: "MANAGER" },
  { href: "/products", label: "Стоки", icon: <Package size={22} weight="duotone" />, minRole: "MANAGER" },
  { href: "/promotions", label: "Промоции", icon: <Tag size={22} weight="duotone" />, minRole: "MANAGER" },
  { href: "/inventory", label: "Склад", icon: <Truck size={22} weight="duotone" />, minRole: "MANAGER" },
  { href: "/shifts", label: "Смени", icon: <ClockCounterClockwise size={22} weight="duotone" />, minRole: "CASHIER" },
  { href: "/reports", label: "Отчети", icon: <ChartBar size={22} weight="duotone" />, minRole: "MANAGER" },
  { href: "/journal", label: "Дневник", icon: <ListMagnifyingGlass size={22} weight="duotone" />, minRole: "MANAGER" },
  { href: "/settings", label: "Настройки", icon: <GearSix size={22} weight="duotone" />, minRole: "ADMIN" },
];

const ROLE_ORDER: Record<RoleKey, number> = { CASHIER: 0, MANAGER: 1, ADMIN: 2 };

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <div className="text-right leading-tight">
      <div className="font-mono font-bold text-lg tabular-nums">
        {now.toLocaleTimeString("bg-BG")}
      </div>
      <div className="text-xs text-ink-400">
        {now.toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" })}
      </div>
    </div>
  );
}

function FiscalDot() {
  const [status, setStatus] = useState<{ ok: boolean; detail: string } | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = () =>
      fetch("/api/fiscal")
        .then((r) => r.json())
        .then((j) => mounted && setStatus(j.fiscal ?? null))
        .catch(() => mounted && setStatus({ ok: false, detail: "няма връзка" }));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-ink-400"
      title={status?.detail ?? "проверка…"}
    >
      <Circle
        size={10}
        weight="fill"
        className={status ? (status.ok ? "text-mint-500" : "text-coral-500") : "text-ink-600"}
      />
      ФУ
    </div>
  );
}

export function AppShell({
  session,
  children,
}: {
  session: SessionData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.filter((n) => ROLE_ORDER[session.role] >= ROLE_ORDER[n.minRole]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-20 xl:w-56 shrink-0 border-r border-black/[0.06] bg-white/[0.55] backdrop-blur-2xl flex flex-col sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-3 xl:px-5 h-16 border-b border-black/[0.06]">
          <div className="size-9 rounded-2xl text-[#231a05] flex items-center justify-center shrink-0" style={{ background: "linear-gradient(180deg,#ffd166,#f5a623)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.45), 0 6px 18px -6px rgba(245,166,35,.6)" }}>
            <Storefront size={22} weight="fill" />
          </div>
          <span className="hidden xl:flex flex-col leading-none">
            <span className="font-black text-[15px] tracking-tight">Carbon Stealth</span>
            <span className="text-[10px] font-bold tracking-[0.22em] text-brand-600 mt-0.5">POS</span>
          </span>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2 xl:px-3 overflow-y-auto">
          {items.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 font-medium transition-all ${
                  active
                    ? "bg-white/[0.9] text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_6px_18px_-8px_rgba(23,32,58,.25)] border border-black/[0.07]"
                    : "text-ink-300 border border-transparent hover:bg-white/[0.6] hover:text-ink-100"
                }`}
              >
                {n.icon}
                <span className="hidden xl:block">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-black/[0.06] space-y-2">
          <div className="hidden xl:block px-2">
            <div className="font-semibold truncate">{session.name}</div>
            <div className="text-xs text-ink-400">
              {ROLES[session.role]} · код {session.operatorCode}
            </div>
          </div>
          <button onClick={logout} className="btn-ghost w-full !justify-start !px-3">
            <SignOut size={20} />
            <span className="hidden xl:block">Изход</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-black/[0.06] bg-white/[0.5] backdrop-blur-2xl flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <FiscalDot />
            <span className="chip !py-1.5 !px-3.5 text-xs font-semibold tabular-nums pointer-events-none">
              1 € = {BGN_PER_EUR.toFixed(5).replace(".", ",")} лв.
            </span>
          </div>
          <Clock />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
