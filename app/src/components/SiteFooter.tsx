import Link from "next/link";
import { SITE, FOOTER_NAV } from "@/lib/site";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white no-print">
      <div className="container-content grid gap-8 py-10 sm:grid-cols-2">
        <div>
          <p className="font-display text-lg font-extrabold text-slate-900">
            {SITE.name}
          </p>
          <p className="mt-2 max-w-sm text-base text-slate-600">
            {SITE.description}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Независима гражданска инициатива. Това не е официалният сайт на
            община Дупница.
          </p>
        </div>
        <nav aria-label="Долно меню">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FOOTER_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-base text-slate-700 hover:text-brand-700 hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-slate-100">
        <div className="container-content py-4 text-sm text-slate-500">
          © {year} {SITE.name}. При спешност се обаждайте на 112.
        </div>
      </div>
    </footer>
  );
}
