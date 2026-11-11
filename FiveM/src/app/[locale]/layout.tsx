import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { preload } from 'react-dom';

import { JsonLd } from '@/components/JsonLd';
import { Icon } from '@/components/Icon';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { MobileNav } from '@/components/MobileNav';
import { NavLink } from '@/components/NavLink';
import { HTML_LANG, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { BASE_KEYWORDS, SITE_NAME, SITE_URL, siteJsonLd } from '@/lib/seo';
import { DISCORD_INVITE, PUBLISHER } from '@/lib/site';

import '../globals.css';

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

// Нарочно БЕЗ `generateStaticParams`: с него Next пререндира и страниците със
// ЖИВ статус на билд (при празна база → празен списък, докато не изтече
// revalidate). Езиците са само два и се резолвират на заявка — цената е нула.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const t = getDictionary(raw);

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${SITE_NAME} — ${t.meta.tagline}`, template: `%s · ${SITE_NAME}` },
    description: t.home.description,
    keywords: BASE_KEYWORDS[raw],
    applicationName: SITE_NAME,
    authors: [{ name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' }],
    publisher: 'Carbon Stealth VCC',
    icons: { apple: '/brand/apple-touch-icon.png' },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);

  // Сабсетът на дисплей шрифта, в който е LCP заглавието на ТОЗИ език —
  // предварително, за да пристигне преди първото рисуване и замяната на
  // резервния шрифт да не мести страницата (CLS). Другият сабсет се тегли
  // само ако страницата реално има знаци от него (`unicode-range`).
  // Двата шрифта — дисплеят носи заглавието, текстовият — абзаца под него;
  // и двата са на първия екран.
  preload(locale === 'bg' ? '/fonts/playfair-700-cyrillic.woff' : '/fonts/cinzel-var.ttf', {
    as: 'font',
    type: locale === 'bg' ? 'font/woff' : 'font/ttf',
    crossOrigin: 'anonymous',
  });
  preload(`/fonts/onest-${locale === 'bg' ? 'cyrillic' : 'latin'}.woff2`, {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  });

  // Типът е явен, защото `exact` днес не се ползва от нито един раздел и без
  // анотация TS го изхвърля от извода — а той пази реален капан: върне ли се
  // връзка към `/{locale}`, без него тя свети активна на целия сайт.
  const nav: { href: string; label: string; icon: string; exact?: boolean; highlight?: boolean }[] = [
    // „Начало“ НЯМА свой раздел нарочно: логото води там. „Добави сървър“ също
    // излезе от реда — то е ДЕЙСТВИЕ, не раздел, и стои като бутон вдясно;
    // така навигацията е шест думи и се събира от `xl` нагоре с въздух.
    { href: `/${locale}/thraex`, label: t.nav.thraex, icon: 'join', highlight: true },
    { href: `/${locale}/servers`, label: t.nav.servers, icon: 'servers' },
    { href: `/${locale}/rules`, label: t.nav.rules, icon: 'rules' },
    { href: `/${locale}/tutorials`, label: t.nav.tutorials, icon: 'tutorials' },
    { href: `/${locale}/streamers`, label: t.nav.streamers, icon: 'share' },
    { href: `/${locale}/news`, label: t.nav.news, icon: 'news' },
    { href: `/${locale}/faq`, label: t.nav.faq, icon: 'info' },
  ];

  const project = [
    { href: `/${locale}/team`, label: t.nav.team },
    { href: `/${locale}/contact`, label: t.nav.contact },
    { href: `/${locale}/support`, label: t.nav.support },
    { href: `/${locale}/submit`, label: t.nav.submit },
  ];
  const legal = [
    { href: `/${locale}/impresum`, label: t.footer.impresum },
    { href: `/${locale}/privacy`, label: t.footer.privacy },
    { href: `/${locale}/terms`, label: t.footer.terms },
    { href: `/${locale}/report`, label: t.footer.report },
  ];

  const footerLink = 'inline-flex min-h-8 items-center text-ivory-400 transition-colors hover:text-bronze-300';

  return (
    <html lang={HTML_LANG[locale]}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-bronze-400 focus:px-3 focus:py-2 focus:text-ink-950"
        >
          {t.nav.skipToContent}
        </a>

        {/* `sticky`: на телефон навигацията е на един палец разстояние през целия списък. */}
        <header className="sticky top-0 z-40">
          {/* Трикольорът — нишка над целия сайт, не лента върху текст. */}
          <div className="flag-rule-x h-1.5" aria-hidden="true" />
          <div className="border-b border-bronze-400/20 bg-ink-950/95">
            <nav
              aria-label={t.nav.main}
              className="mx-auto flex h-16 max-w-site items-center gap-6 px-4 sm:h-[4.5rem] sm:px-6"
            >
              <Link
                href={`/${locale}`}
                className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze-400"
              >
                {/* Логото на сървъра. Пътят е низ, а не статичен импорт: типът на `*.png` идва от
                    `next-env.d.ts`, който се генерира от `next build`, а гейтът пуска typecheck ПРЕДИ build. */}
                <Image
                  src="/brand/logo-thraex.webp"
                  alt="Thraex PVP"
                  width={900}
                  height={259}
                  priority
                  sizes="(min-width: 640px) 170px, 142px"
                  className="h-10 w-auto sm:h-12"
                />
              </Link>

              {/* ── Настолна навигация ───────────────────────────────────── */}
              <ul className="hidden shrink-0 flex-nowrap items-center gap-1 text-[0.9375rem] text-ivory-300 xl:flex">
                {nav.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      href={item.href}
                      exact={item.exact}
                      className={`flex min-h-10 items-center rounded-lg px-3.5 transition-colors hover:bg-bronze-400/10 hover:text-ivory-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze-400 ${item.highlight ? 'font-semibold text-bronze-200' : ''}`}
                      activeClassName="bg-bronze-400/15 text-ivory-100"
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>

              <div className="ms-auto hidden items-center gap-3 xl:flex">
                {/* Външна покана: `noopener` е задължителен, `nofollow` — защото
                    не предаваме тежест на чужд домейн. */}
                <a
                  href={DISCORD_INVITE}
                  rel="noopener nofollow"
                  aria-label={t.nav.discord}
                  title={t.nav.discord}
                  className="flex size-10 items-center justify-center rounded-lg border border-bronze-400/20 text-ivory-300 transition-colors hover:border-bronze-400/60 hover:text-bronze-200"
                >
                  <Icon group="brand" name="discord" size={18} />
                </a>
                <LanguageSwitch locale={locale} label={t.nav.language} />
                <Link href={`/${locale}/submit`} className="btn-primary min-h-10 px-4 text-sm">
                  {t.nav.submit}
                </Link>
              </div>

              {/* ── Телефон: хамбургер ───────────────────────────────────── */}
              <div className="ms-auto xl:hidden">
                <MobileNav
                  label={t.nav.menu}
                  openIcon={<Icon group="ui" name="menu" size={22} />}
                  closeIcon={<Icon group="ui" name="close" size={22} />}
                >
                  <ul className="flex flex-col gap-1 text-[1.0625rem] text-ivory-200">
                    {nav.map((item) => (
                      <li key={item.href}>
                        <NavLink
                          href={item.href}
                          exact={item.exact}
                          // 48 px висока цел за пръст (WCAG 2.5.8 иска ≥24, но
                          // 44+ е употребимото на телефон).
                          className="flex min-h-12 items-center gap-3 rounded-xl px-3 hover:bg-white/[0.05] hover:text-bronze-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bronze-400"
                          activeClassName="bg-bronze-400/[0.08] text-bronze-200"
                        >
                          <Icon group="ui" name={item.icon} size={19} />
                          {item.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>

                  <Link href={`/${locale}/submit`} className="btn-primary mt-4 w-full">
                    {t.nav.submit}
                  </Link>

                  <div className="mt-4 flex items-center justify-between border-t border-bronze-400/20 pt-4">
                    <a
                      href={DISCORD_INVITE}
                      rel="noopener nofollow"
                      className="flex min-h-11 items-center gap-2 text-sm text-ivory-300 hover:text-bronze-300"
                    >
                      <Icon group="brand" name="discord" size={18} />
                      {t.nav.discord}
                    </a>
                    <LanguageSwitch locale={locale} label={t.nav.language} />
                  </div>
                </MobileNav>
              </div>
            </nav>
          </div>
        </header>

        {/* Обвивката с `overflow-x-clip` е предпазителят за героите, които излизат
            от контейнера до ръба на екрана (`mx-[calc(50%-50vw)] w-screen`).
            `100vw` включва вертикалната лента за скролиране там, където тя заема
            място — тоест героят е с ~15 px по-широк от видимото и се появява
            ХОРИЗОНТАЛЕН скрол на целия сайт.
            Клипът е на ПЪЛНОШИРОК предшественик, НЕ на `main`: `overflow: clip`
            реже по padding box-а, а `main` е `max-w-site` — сложен там, той
            режеше героя до тази ширина на всеки по-широк екран.
            `clip`, а не `hidden`: `hidden` прави скрол-контейнер и чупи
            `position: sticky` вътре. */}
        <div className="flex-1 overflow-x-clip">
          <main id="main" className="mx-auto w-full max-w-site px-4 py-10 sm:px-6 sm:py-14">
            {children}
          </main>
        </div>

        <footer className="mt-16 border-t border-bronze-400/20 bg-ink-950/70">
          <div className="mx-auto grid max-w-site gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
            <div>
              <Image
                src="/brand/logo-thraex.webp"
                alt="Thraex PVP"
                width={900}
                height={259}
                sizes="220px"
                className="h-16 w-auto"
              />
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-ivory-400">{t.meta.tagline}</p>
              <a href={DISCORD_INVITE} rel="noopener nofollow" className="btn-ghost mt-6">
                <Icon group="brand" name="discord" size={18} />
                {t.footer.discord}
              </a>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
              {[
                { heading: t.footer.colBrowse, items: nav },
                { heading: t.footer.colProject, items: project },
                { heading: t.footer.colLegal, items: legal },
              ].map((column) => (
                <div key={column.heading}>
                  <h2 className="font-display text-sm font-semibold text-ivory-100">
                    {column.heading}
                  </h2>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {column.items.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className={footerLink}>
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-site px-4 sm:px-6">
            <div className="hairline" aria-hidden="true" />
          </div>
          <div className="mx-auto max-w-site px-4 pb-10 pt-6 text-sm text-ivory-500 sm:px-6">
            <p className="flex flex-wrap items-center gap-2">
              © {new Date().getFullYear()} {SITE_NAME} ·{' '}
              {t.footer.product}{' '}
              <a href="https://carbonstealth.eu" className="link">
                Carbon Stealth VCC
              </a>
            </p>
            {/* Контрастът е проверен: ivory-500 върху ink-950 дава 6,7:1. */}
            <p className="mt-3 max-w-4xl text-xs leading-relaxed text-ivory-500">{t.footer.disclaimer}</p>
            {/* Логото е на сървъра, затова текстът и контактът по §2.3 от лиценза на платформата са на всяка страница. */}
            <p className="mt-3 max-w-4xl text-xs leading-relaxed text-ivory-500">
              {t.footer.thraexOperator}{' '}
              <a href={`mailto:${PUBLISHER.email}`} className="link">
                {PUBLISHER.email}
              </a>
              . THRAEX PVP IS NOT APPROVED, SPONSORED, OR ENDORSED BY ROCKSTAR GAMES.
            </p>
          </div>
        </footer>

        <JsonLd data={siteJsonLd(locale)} />
      </body>
    </html>
  );
}
