import Link from "next/link";
import { Phone, Mail } from "@/components/icons";
import { SITE, PRIMARY_NAV, FOOTER_NAV, isFeedHref } from "@/lib/site";
import { getFacebookUrl, getPlayStoreUrl, getViberChannelUrl } from "@/lib/settings";
import { TrustCard } from "@/components/TrustCard";
import { TelLink } from "@/components/TelLink";
import { ViberButton } from "@/components/ViberButton";
import { VisitCounter } from "@/components/VisitCounter";

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

// Във футъра „Информация“ показва само страниците, които ги няма в „Раздели“ —
// иначе половината връзки се повтаряха и футърът ставаше по-дълъг от екран.
const FOOTER_ONLY = FOOTER_NAV.filter((i) => !PRIMARY_NAV.some((p) => p.href === i.href));

export async function SiteFooter() {
  const year = new Date().getFullYear();
  const [facebookUrl, playStoreUrl, viberUrl] = await Promise.all([
    getFacebookUrl(),
    getPlayStoreUrl(),
    getViberChannelUrl(),
  ]);
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="container-content py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-12">
          {/* Гербът и спешните телефони са в една колона: на компютър колоните
              излизат с близка височина, а на телефон спешните са преди
              дългите списъци с връзки. */}
          <div className="grid content-start gap-8 sm:col-span-2 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
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
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Спешни телефони
              </h2>
              <ul className="mt-4 space-y-2.5 text-base">
                {SITE.emergency.map((e) => (
                  <li key={e.phone} className="text-slate-700">
                    {e.label}:{" "}
                    <TelLink phone={e.phone} className="font-bold text-brand-700">
                      {e.phone}
                    </TelLink>
                  </li>
                ))}
              </ul>
              {SITE.contact.phone && (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <Phone className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                  <TelLink
                    phone={SITE.contact.phone}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {SITE.contact.phone}
                  </TelLink>
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
              {/* Viber каналът — само ако е зададен в /admin/nastroyki. */}
              {viberUrl && (
                <div className="mt-3">
                  <ViberButton url={viberUrl} />
                </div>
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
          <div className="lg:col-span-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Раздели
            </h2>
            {/* На две колони (освен на съвсем тесен таблет) — половин височина. */}
            <ul className="mt-4 columns-2 gap-x-6 text-base sm:columns-1 md:columns-2">
              {PRIMARY_NAV.map((i) => (
                <li key={i.href} className="mb-2.5 break-inside-avoid">
                  <Link href={i.href} className="text-slate-700 underline-offset-4 hover:text-brand-700 hover:underline">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Информация
            </h2>
            <ul className="mt-4 columns-2 gap-x-6 text-base sm:columns-1 md:columns-2">
              {FOOTER_ONLY.map((i) => (
                <li key={i.href} className="mb-2.5 break-inside-avoid">
                  {/* RSS е канал, не страница — обикновена връзка, без
                      предварително зареждане от Next. */}
                  {isFeedHref(i.href) ? (
                    <a
                      href={i.href}
                      type="application/rss+xml"
                      className="text-slate-700 underline-offset-4 hover:text-brand-700 hover:underline"
                    >
                      {i.label}
                    </a>
                  ) : (
                    <Link href={i.href} className="text-slate-700 underline-offset-4 hover:text-brand-700 hover:underline">
                      {i.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Кратката „истински адрес / никога не искаме“ — на всяка страница. */}
        <TrustCard variant="compact" className="mt-8" />
        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-600 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p>
              © {year} {SITE.name}. Гражданска инициатива в полза на жителите на{" "}
              {SITE.geo.city}.
            </p>
            <p>
              Независим проект, който не е официален сайт на община{" "}
              {SITE.geo.city}.
            </p>
            <VisitCounter />
          </div>
          <p className="text-slate-600">
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
            <span className="text-xs text-slate-600">
              {SITE.company.legalName} · ЕИК {SITE.company.eik} · ДДС №{" "}
              {SITE.company.vat}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
