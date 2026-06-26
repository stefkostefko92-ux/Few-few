import Link from "next/link";
import { Phone, Mail } from "@/components/icons";
import { SITE, PRIMARY_NAV, FOOTER_NAV } from "@/lib/site";
import { getFacebookUrl, getPlayStoreUrl } from "@/lib/settings";

// Вградена иконка на Google Play.
function GooglePlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#00d2ff" d="M3.6 1.8a1.9 1.9 0 0 0-.5 1.3v17.8c0 .5.2 1 .5 1.3l12-10.1z" />
      <path fill="#4fd55d" d="M3.6 1.8 15.6 12l3.4-2.9-13-7.5a2 2 0 0 0-2.4.2z" />
      <path fill="#ffd400" d="M19 9.1 15.6 12l3.4 2.9 3.1-1.8c1-.6 1-2.1 0-2.7z" />
      <path fill="#ff3333" d="M3.6 22.2 15.6 12l3.4 2.9-13 7.5a2 2 0 0 1-2.4-.2z" />
    </svg>
  );
}

// Вградена иконка на Facebook (lucide премахна брандовите икони).
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export async function SiteFooter() {
  const year = new Date().getFullYear();
  const [facebookUrl, playStoreUrl] = await Promise.all([
    getFacebookUrl(),
    getPlayStoreUrl(),
  ]);
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
            {SITE.contact.phone && (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <Phone className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                <a
                  href={`tel:${SITE.contact.phone.replace(/\s/g, "")}`}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {SITE.contact.phone}
                </a>
              </p>
            )}
            {SITE.contact.email && (
              <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-700">
                <Mail className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                <a
                  href={`mailto:${SITE.contact.email}`}
                  className="break-all text-brand-700 hover:underline"
                >
                  {SITE.contact.email}
                </a>
              </p>
            )}
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <FacebookIcon className="h-4 w-4" />
                Последвайте ни във Facebook
              </a>
            )}
            {playStoreUrl && (
              <a
                href={playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <GooglePlayIcon className="h-5 w-5" />
                Изтегли приложението от Google Play
              </a>
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
            Изработка и поддръжка на сайта:{" "}
            <a
              href={SITE.company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-700 underline decoration-gold-400 decoration-2 underline-offset-2 hover:text-brand-700"
            >
              {SITE.company.tradeName}
            </a>
            <br />
            <span className="text-xs text-slate-400">
              {SITE.company.legalName} · ЕИК {SITE.company.eik} · ДДС №{" "}
              {SITE.company.vat}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
