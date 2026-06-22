import Link from "next/link";
import { SITE, PRIMARY_NAV } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="container-content flex items-center justify-between gap-4 py-3">
        <Link href="/" className="group flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-lg bg-brand-700 font-display text-lg font-extrabold text-white shadow-sm"
          >
            Д
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg font-extrabold text-slate-900">
              {SITE.name}
            </span>
            <span className="block text-xs text-slate-500">{SITE.slogan}</span>
          </span>
        </Link>

        <nav aria-label="Главно меню" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-base font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Мобилна навигация — проста, винаги видима лента с връзки. */}
      <nav
        aria-label="Меню за телефон"
        className="border-t border-slate-100 md:hidden"
      >
        <ul className="container-content flex flex-wrap gap-x-4 gap-y-1 py-2 text-base">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex min-h-[40px] items-center font-medium text-brand-700 hover:underline"
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
