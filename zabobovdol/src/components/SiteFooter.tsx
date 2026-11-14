import Link from "next/link";
import { ChevronDown, Mail, Phone } from "@/components/icons";
import { SITE, FOOTER_GROUPS, LEGAL_NAV, isFeedHref, type NavGroup } from "@/lib/site";
import { getFacebookUrl, getPlayStoreUrl, getViberChannelUrl } from "@/lib/settings";
import { TrustCard, breakableAddress } from "@/components/TrustCard";
import { TelLink } from "@/components/TelLink";
import { PhoneButton } from "@/components/PhoneButton";
import { ViberButton } from "@/components/ViberButton";
import { VisitCounter } from "@/components/VisitCounter";
import { formatPhoneBg } from "@/lib/phone";

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

// „е-услуги“, „е-поща“: тирето след еднобуквена представка става неразделящо
// (U+2011) — иначе редът се пренася като „е-/услуги“. Само при показване:
// SITE.description отива и в метаданните, където остава с обикновено тире.
function noBreakPrefixes(text: string): string {
  return text.replace(/(^|[\s(„])(\p{L})-(?=\p{L})/gu, "$1$2‑");
}

// Плочките на всички раздели на началната (Section id="razdeli").
const ALL_SECTIONS_HREF = "/#razdeli";

// Връзка във футъра: цел ≥44px, подчертана (на тъмно фон само цветът не
// стига), без предварително зареждане за RSS (канал, не страница).
function FooterLink({ href, label }: { href: string; label: string }) {
  const cls = "link-on-dark inline-flex min-h-tap items-center [overflow-wrap:anywhere]";
  return isFeedHref(href) ? (
    <a href={href} type="application/rss+xml" className={cls}>
      {label}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

// Група връзки. На телефон (под sm) — сгъната <details> (затворена по
// подразбиране; цялото заглавие е бутон ≥44px със стрелка), за да не е
// футърът ~2000px; от sm — винаги отворена секция със заглавие. Двата вида
// са в DOM, но скритият е display:none — за четеца и клавиатурата е само
// единият. (::details-content за „винаги отворена“ още не е навсякъде.)
function FooterGroup({ group, id, more = false }: { group: NavGroup; id: string; more?: boolean }) {
  const list = (
    <ul className="space-y-1 text-base">
      {group.items.map((i) => (
        <li key={i.href}>
          <FooterLink href={i.href} label={i.label} />
        </li>
      ))}
      {/* Футърът е кратък (SPEC т. 8), но пълният списък е на една връзка и
          отдолу: плочките „Най-търсено“ + „Всички раздели“ на началната. */}
      {more && (
        <li>
          <Link href={ALL_SECTIONS_HREF} className="link-on-dark inline-flex min-h-tap items-center gap-1 font-semibold">
            Всички раздели <span aria-hidden="true">→</span>
          </Link>
        </li>
      )}
    </ul>
  );
  return (
    <div className="min-w-0">
      <details className="group/fg border-b border-white/20 sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-1 [&::-webkit-details-marker]:hidden">
          <span className="footer-heading text-base">{group.title}</span>
          <ChevronDown
            className="h-6 w-6 shrink-0 text-brand-200 transition-transform group-open/fg:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>
        <div className="pb-3">{list}</div>
      </details>
      <section aria-labelledby={id} className="hidden sm:block">
        <h2 id={id} className="footer-heading">
          {group.title}
        </h2>
        <div className="mt-2">{list}</div>
      </section>
    </div>
  );
}

// Футърът — тъмносин (brand-900), „затваря“ страницата под светлия хедър.
// Спешният номер е в свой блок САМО със 112; телефонът и имейлът на екипа са
// отделно, под ясно заглавие — да не се вземат за спешен номер. Правните
// връзки и независимостта са в долната лента.
export async function SiteFooter() {
  const year = new Date().getFullYear();
  const [facebookUrl, playStoreUrl, viberUrl] = await Promise.all([
    getFacebookUrl(),
    getPlayStoreUrl(),
    getViberChannelUrl(),
  ]);
  const emergency = SITE.emergency[0];
  const [mostWanted, aboutSite, ...rest] = FOOTER_GROUPS;

  return (
    <footer className="site-footer mt-8 bg-brand-900 text-white">
      {/* pb-28 на всички ширини — място за плаващия бутон на чата под
          последния ред (от sm той е широк бутон с надпис и при 125% стига
          ~90px от долния ръб; иначе покрива реквизитите на фирмата). */}
      <div className="container-content pb-28 pt-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 space-y-8 lg:col-span-4">
            <div>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/bobov-dol-grb-mark.png"
                  alt=""
                  width={34}
                  height={49}
                  className="h-12 w-auto shrink-0"
                />
                <p className="leading-tight">
                  <span className="block font-display text-xl font-bold text-white">
                    {SITE.name}
                  </span>
                  <span className="block text-sm text-brand-100">{SITE.tagline}</span>
                </p>
              </div>
              <p className="mt-3 max-w-md text-base text-brand-100">
                {noBreakPrefixes(SITE.description)}
              </p>
            </div>

            <section aria-labelledby="footer-emergency">
              <h2 id="footer-emergency" className="footer-heading">
                Спешен номер
              </h2>
              <p className="mt-2 text-base text-brand-100">{emergency.label}</p>
              <PhoneButton
                phone={emergency.phone}
                label="Спешност"
                variant="danger"
                className="mt-3 text-lg"
              />
            </section>

            <section aria-labelledby="footer-team">
              <h2 id="footer-team" className="footer-heading">
                Връзка с екипа на сайта
              </h2>
              <p className="mt-2 text-base text-brand-100">
                За грешки в сайта и предложения. При спешност — 112.
              </p>
              <ul className="mt-2 text-base">
                {SITE.contact.phone && (
                  <li>
                    <TelLink
                      phone={SITE.contact.phone}
                      className="link-on-dark inline-flex min-h-tap items-center gap-2 font-semibold tabular-nums"
                    >
                      <Phone className="h-5 w-5 shrink-0 text-brand-200" aria-hidden />
                      {formatPhoneBg(SITE.contact.phone)}
                    </TelLink>
                  </li>
                )}
                {SITE.contact.email && (
                  <li>
                    <a
                      href={`mailto:${SITE.contact.email}`}
                      className="link-on-dark inline-flex min-h-tap max-w-full items-center gap-2"
                    >
                      <Mail className="h-5 w-5 shrink-0 text-brand-200" aria-hidden />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {breakableAddress(SITE.contact.email)}
                      </span>
                    </a>
                  </li>
                )}
              </ul>
              {(facebookUrl || viberUrl || playStoreUrl) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {facebookUrl && (
                    <a
                      href={facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary"
                    >
                      <FacebookIcon className="h-5 w-5 shrink-0 text-[#1877F2]" />
                      Последвайте ни във Facebook
                    </a>
                  )}
                  {/* Viber каналът — само ако е зададен в /admin/nastroyki. */}
                  {viberUrl && <ViberButton url={viberUrl} />}
                  {playStoreUrl && (
                    <a
                      href={playStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary"
                    >
                      <GooglePlayIcon className="h-5 w-5 shrink-0" />
                      Приложението в Google Play
                    </a>
                  )}
                </div>
              )}
            </section>
          </div>

          <nav
            aria-label="Връзки в долната част на сайта"
            className="grid min-w-0 grid-cols-1 border-t border-white/20 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 sm:border-t-0 md:grid-cols-3 lg:col-span-8"
          >
            <FooterGroup group={mostWanted} id="footer-g0" more />
            <FooterGroup group={aboutSite} id="footer-g1" />
            <div className="min-w-0 sm:space-y-8">
              {rest.map((g, i) => (
                <FooterGroup key={g.title} group={g} id={`footer-g${i + 2}`} />
              ))}
            </div>
          </nav>
        </div>

        {/* Кратката „истински адрес / никога не искаме“ — на всяка страница. */}
        <TrustCard variant="compact" className="mt-10" />

        <div className="mt-8 flex flex-col gap-4 border-t border-white/20 pt-6 text-sm text-brand-100 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p>
              © {year} {SITE.name} — гражданска инициатива в полза на жителите на{" "}
              {SITE.geo.city}.
            </p>
            <p className="font-semibold text-white">
              Независим проект, не е официален сайт на Община {SITE.geo.city}.
            </p>
            <nav aria-label="Правна информация">
              <ul className="flex flex-wrap gap-x-6">
                {LEGAL_NAV.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="link-on-dark inline-flex min-h-tap items-center">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="min-w-0 space-y-1 lg:text-right">
            <VisitCounter className="text-brand-200" />
            <p>
              Изработка и поддръжка на сайта:{" "}
              <a
                href={SITE.company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="link-on-dark font-semibold"
              >
                {SITE.company.tradeName}
              </a>
            </p>
            <p className="text-xs text-brand-200">
              <span className="whitespace-nowrap">{SITE.company.legalName}</span> ·{" "}
              <span className="whitespace-nowrap">ЕИК {SITE.company.eik}</span> ·{" "}
              <span className="whitespace-nowrap">ДДС № {SITE.company.vat}</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
