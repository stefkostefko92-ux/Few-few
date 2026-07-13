import Link from "next/link";
import { NAV, SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="container-content grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <p className="text-base font-extrabold text-slate-900">{SITE.name}</p>
          <p className="mt-2 max-w-md text-sm text-slate-600">{SITE.description}</p>
          <p className="mt-3 text-xs text-slate-500">
            Независим граждански проект. Не е официален сайт на държавен орган или
            предприятие. Данните са с образователна цел — проверявайте в посочените
            официални източници.
          </p>
        </div>
        <nav aria-label="Долна навигация">
          <p className="text-sm font-semibold text-slate-900">Раздели</p>
          <ul className="mt-3 space-y-2 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-slate-600 hover:text-brand-700">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-slate-900">Проект</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a
                href={SITE.authorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-brand-700"
              >
                {SITE.author}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4">
        <p className="container-content text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {SITE.author}. Съдържанието е с информативна и
          образователна цел.
        </p>
      </div>
    </footer>
  );
}
