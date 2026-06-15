import Link from "next/link";
import { SITE, PRIMARY_NAV, FOOTER_NAV } from "@/lib/site";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-content py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/bobov-dol-grb.png"
                alt="Герб на Бобов дол"
                width={28}
                height={40}
                className="h-10 w-auto"
              />
              <span className="text-lg font-bold">{SITE.name}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{SITE.description}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Раздели
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PRIMARY_NAV.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="text-slate-700 hover:text-brand-700">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Информация
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {FOOTER_NAV.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="text-slate-700 hover:text-brand-700">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Спешни телефони
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {SITE.emergency.map((e) => (
                <li key={e.phone} className="text-slate-700">
                  {e.label}:{" "}
                  <a href={`tel:${e.phone}`} className="font-bold text-brand-700">
                    {e.phone}
                  </a>
                </li>
              ))}
            </ul>
            {SITE.contact.email && (
              <p className="mt-3 text-sm text-slate-700">
                Имейл:{" "}
                <a
                  href={`mailto:${SITE.contact.email}`}
                  className="text-brand-700 hover:underline"
                >
                  {SITE.contact.email}
                </a>
              </p>
            )}
          </div>
        </div>
        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p>
              © {year} {SITE.name}. Гражданска инициатива в полза на жителите на{" "}
              {SITE.geo.city}.
            </p>
            <p>
              Независим проект, който не е официален сайт на община{" "}
              {SITE.geo.city}.
            </p>
          </div>
          <p className="text-slate-500">
            Изработка на сайта:{" "}
            <span className="font-semibold text-slate-700">Carbon Stealth VCC</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
