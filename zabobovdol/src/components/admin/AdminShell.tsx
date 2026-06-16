"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { RESOURCES } from "@/lib/admin/resources";
import { ROLE_LABELS } from "@/lib/categories";
import { logoutAction } from "@/lib/admin/auth-actions";
import type { SessionUser } from "@/lib/auth";

export function AdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const link = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={
          "block rounded-md px-3 py-2 text-sm font-medium " +
          (active
            ? "bg-brand-700 text-white"
            : "text-slate-700 hover:bg-slate-100")
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              className="rounded border border-slate-300 p-1.5 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Меню"
            >
              ☰
            </button>
            <Link href="/admin" className="font-bold">
              Администрация
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">
              {user.name} · {ROLE_LABELS[user.role]}
            </span>
            <Link href="/" target="_blank" className="text-brand-700 hover:underline">
              Виж сайта ↗
            </Link>
            <form action={logoutAction}>
              <button className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
                Изход
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside
          className={
            "w-60 shrink-0 lg:block " + (open ? "block" : "hidden")
          }
        >
          <nav className="space-y-1">
            {link("/admin", "Табло")}
            <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">
              Съдържание
            </div>
            {RESOURCES.filter((r) => !r.adminOnly || user.role === "ADMIN").map(
              (r) => (
                <div key={r.key}>{link(`/admin/${r.key}`, r.labelPlural)}</div>
              ),
            )}
            <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">
              Система
            </div>
            {link("/admin/novini", "Новини от общината")}
            {user.role === "ADMIN" && link("/admin/signali", "Сигнали до общината")}
            {user.role === "ADMIN" && link("/admin/reklami", "Заявки за реклама")}
            {link("/admin/search-misses", "Търсения без резултат")}
            {user.role === "ADMIN" && link("/admin/users", "Потребители")}
            {user.role === "ADMIN" && link("/admin/nastroyki", "Настройки")}
            {user.role === "ADMIN" && link("/admin/audit", "Одит лог")}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
