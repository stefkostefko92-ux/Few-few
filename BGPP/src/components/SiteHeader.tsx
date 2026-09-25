import Link from "next/link";
import { NAV, SITE } from "@/lib/site";
import { Scale } from "./icons";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="container-content flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Scale className="h-5 w-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-base">{SITE.name}</span>
            <span className="block text-[11px] font-medium text-slate-500">
              прозрачност на държавните предприятия
            </span>
          </span>
        </Link>
        <nav aria-label="Основна навигация" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {/* Компактна навигация за телефон */}
      <nav aria-label="Навигация (мобилна)" className="border-t border-slate-100 md:hidden">
        <ul className="container-content flex items-center gap-1 overflow-x-auto py-2">
          {NAV.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
