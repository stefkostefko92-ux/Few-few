import Link from "next/link";
import { SITE, HEADER_NAV } from "@/lib/site";
import { MobileMenu } from "@/components/MobileMenu";

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
            <span className="hidden text-xs text-slate-500 sm:block">
              {SITE.slogan}
            </span>
          </span>
        </Link>

        <nav aria-label="Главно меню" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {HEADER_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-base font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/razdeli"
                className="rounded-lg px-3 py-2 text-base font-semibold text-brand-700 hover:bg-brand-50"
              >
                Всички раздели
              </Link>
            </li>
          </ul>
        </nav>

        {/* Мобилно/таблет меню — пълен списък в изскачащ панел. */}
        <div className="lg:hidden">
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
