import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { preload } from 'react-dom';

import { JsonLd } from '@/components/JsonLd';
import { Icon } from '@/components/Icon';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Mascot } from '@/components/Mascot';
import { MobileNav } from '@/components/MobileNav';
import { NavLink } from '@/components/NavLink';
import { HTML_LANG, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { BASE_KEYWORDS, SITE_NAME, SITE_URL, siteJsonLd } from '@/lib/seo';
import { DISCORD_INVITE } from '@/lib/site';

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
  for (const font of ['unbounded', 'onest']) {
    preload(`/fonts/${font}-${locale === 'bg' ? 'cyrillic' : 'latin'}.woff2`, {
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    });
  }

  // Типът е явен, защото `exact` днес не се ползва от нито един раздел и без
  // анотация TS го изхвърля от извода — а той пази реален капан: върне ли се
  // връзка към `/{locale}`, без него тя свети активна на целия сайт.
  const nav: { href: string; label: string; icon: string; exact?: boolean }[] = [
    // „Начало“ НЯМА свой раздел нарочно: логото води там. „Добави сървър“ също
    // излезе от реда — то е ДЕЙСТВИЕ, не раздел, и стои като бутон вдясно;
    // така навигацията е шест думи и се събира от `xl` нагоре с въздух.
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

  const footerLink = 'inline-flex min-h-8 items-center text-silver-400 transition-colors hover:text-cyan-300';

  return (
    <html lang={HTML_LANG[locale]}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-cyan-400 focus:px-3 focus:py-2 focus:text-ink-950"
        >
          {t.nav.skipToContent}
        </a>

        {/* `sticky`: на телефон навигацията е на един палец разстояние през целия
            списък. Размиването е ТУК и само тук — под хедъра минава съдържание,
            значи има какво да се размие (за разлика от панелите). */}
        <header className="sticky top-0 z-40">
          {/* Трикольорът — нишка над целия сайт, не лента върху текст. */}
          <div className="flag-rule-x h-[2px]" aria-hidden="true" />
          <div className="border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl backdrop-saturate-150">
            <nav
              aria-label={t.nav.main}
              className="mx-auto flex h-16 max-w-site items-center gap-6 px-4 sm:h-[4.5rem] sm:px-6"
            >
              <Link
                href={`/${locale}`}
                className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
              >
                {/* Пътят е низ, а не статичен импорт: типът на `*.png` идва от
                    `next-env.d.ts`, който се генерира от `next build` и е
                    git-ignored — а гейтът пуска typecheck ПРЕДИ build.
                    `logo-alpha.png`, не `logo.png`: оригиналът е на черен фон без
                    алфа и стоеше като правоъгълник върху синкавия хедър.
                    `mix-blend-screen` не помага тук — хедърът е собствен
                    контекст (backdrop-filter) и смесването става с полупрозрачния
                    му фон, не със страницата. Прозрачността е изчислена веднъж:
                    `npm run brand:logo-alpha`. */}
                <Image
                  src="/brand/logo-alpha.png"
                  alt={SITE_NAME}
                  width={1280}
                  height={324}
                  priority
                  sizes="(min-width: 640px) 170px, 142px"
                  className="h-9 w-auto sm:h-[2.6rem]"
                />
              </Link>

              {/* ── Настолна навигация ───────────────────────────────────── */}
              <ul className="hidden shrink-0 flex-nowrap items-center gap-1 text-[0.9375rem] text-silver-300 xl:flex">
                {nav.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      href={item.href}
                      exact={item.exact}
                      className="flex min-h-10 items-center rounded-full px-3.5 transition-colors hover:bg-white/[0.05] hover:text-silver-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                      activeClassName="bg-white/[0.07] text-silver-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
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
                  className="flex size-10 items-center justify-center rounded-full border border-white/[0.1] text-silver-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
                >
                  <Icon group="brand" name="discord" size={18} />
                </a>
                <LanguageSwitch locale={locale} label={t.nav.language} />
                <Link href={`/${locale}/submit`} className="btn-primary min-h-10 rounded-full px-4 text-sm">
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
                  <ul className="flex flex-col gap-1 text-[1.0625rem] text-silver-200">
                    {nav.map((item) => (
                      <li key={item.href}>
                        <NavLink
                          href={item.href}
                          exact={item.exact}
                          // 48 px висока цел за пръст (WCAG 2.5.8 иска ≥24, но
                          // 44+ е употребимото на телефон).
                          className="flex min-h-12 items-center gap-3 rounded-xl px-3 hover:bg-white/[0.05] hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                          activeClassName="bg-cyan-400/[0.08] text-cyan-200"
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

                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-4">
                    <a
                      href={DISCORD_INVITE}
                      rel="noopener nofollow"
                      className="flex min-h-11 items-center gap-2 text-sm text-silver-300 hover:text-cyan-300"
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

        <footer className="mt-16 border-t border-white/[0.06] bg-ink-950/70">
          <div className="mx-auto grid max-w-site gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
            <div>
              <Image
                src="/brand/logo-alpha.png"
                alt={SITE_NAME}
                width={1280}
                height={324}
                sizes="220px"
                className="h-12 w-auto"
              />
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-silver-400">{t.meta.tagline}</p>
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
                  <h2 className="font-display text-sm font-semibold tracking-[-0.01em] text-silver-100">
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
          <div className="mx-auto max-w-site px-4 pb-10 pt-6 text-sm text-silver-500 sm:px-6">
            <p className="flex flex-wrap items-center gap-2">
              <Mascot detail="icon" size={22} title={null} />© {new Date().getFullYear()} {SITE_NAME} ·{' '}
              {t.footer.product}{' '}
              <a href="https://carbonstealth.eu" className="link">
                Carbon Stealth VCC
              </a>
            </p>
            {/* Контрастът е проверен: silver-500 върху ink-950 дава 6,7:1. */}
            <p className="mt-3 max-w-4xl text-xs leading-relaxed text-silver-500">{t.footer.disclaimer}</p>
          </div>
        </footer>

        <JsonLd data={siteJsonLd(locale)} />
      </body>
    </html>
  );
}
