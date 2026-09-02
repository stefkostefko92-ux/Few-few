import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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

  // Типът е явен, защото `exact` днес не се ползва от нито един раздел и без
  // анотация TS го изхвърля от извода — а той пази реален капан: върне ли се
  // връзка към `/{locale}`, без него тя свети активна на целия сайт.
  const nav: { href: string; label: string; icon: string; exact?: boolean }[] = [
    // „Начало“ НЯМА свой раздел нарочно: логото води там, а осмият раздел
    // чупи прага, който е измерен — седем искат 1120 px само за навигацията,
    // осем не се събират и при 1280. Каталогът вече е /servers, защото от
    // landing-а насам началната убеждава, а /servers е инструментът.
    { href: `/${locale}/servers`, label: t.nav.servers, icon: 'servers' },
    { href: `/${locale}/rules`, label: t.nav.rules, icon: 'rules' },
    { href: `/${locale}/tutorials`, label: t.nav.tutorials, icon: 'tutorials' },
    { href: `/${locale}/streamers`, label: t.nav.streamers, icon: 'share' },
    { href: `/${locale}/news`, label: t.nav.news, icon: 'news' },
    { href: `/${locale}/submit`, label: t.nav.submit, icon: 'submit' },
    { href: `/${locale}/faq`, label: t.nav.faq, icon: 'info' },
  ];

  const legal = [
    { href: `/${locale}/team`, label: t.nav.team },
    { href: `/${locale}/contact`, label: t.nav.contact },
    { href: `/${locale}/support`, label: t.nav.support },
    { href: `/${locale}/impresum`, label: t.footer.impresum },
    { href: `/${locale}/privacy`, label: t.footer.privacy },
    { href: `/${locale}/terms`, label: t.footer.terms },
    { href: `/${locale}/report`, label: t.footer.report },
  ];

  return (
    <html lang={HTML_LANG[locale]}>
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:m-3 focus:rounded focus:bg-cyan-500 focus:px-3 focus:py-2 focus:text-ink-950"
        >
          {t.nav.skipToContent}
        </a>

        {/* `sticky` + `backdrop-blur`: на телефон навигацията е на един палец
            разстояние през целия списък, а не на върха на дълга страница.
            `z-40` е под панела на менюто, който е `z-40` в СЪЩИЯ контекст. */}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/85 backdrop-blur">
          {/* Трикольорът от логото — тънка лента, за да не се повтаря знамето. */}
          <div className="flag-rule h-[3px]" aria-hidden="true" />
          <nav
            aria-label={t.nav.main}
            className="mx-auto flex max-w-6xl items-center gap-x-6 gap-y-3 px-4 py-3"
          >
            <Link
              href={`/${locale}`}
              className="flex shrink-0 items-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
            >
              {/* Пътят е низ, а не статичен импорт: типът на `*.png` идва от
                  `next-env.d.ts`, който се генерира от `next build` и е
                  git-ignored — а гейтът пуска typecheck ПРЕДИ build, тоест в
                  CI импортът няма тип. Размерът е реалният на файла. */}
              <Image
                src="/brand/logo.png"
                alt={SITE_NAME}
                width={1280}
                height={324}
                priority
                // Логото расте, но не безразборно: при 1280×324 (≈3,95:1)
                // `h-12` дава ≈190 px ширина — още се събира до хамбургера на
                // 360 px екран. `sizes` пази Next да не сервира 1280 px файл
                // за 190 px кутия.
                sizes="(min-width: 640px) 190px, 158px"
                className="h-10 w-auto sm:h-12"
              />
            </Link>

            {/* ── Настолна навигация ─────────────────────────────────────── */}
            {/* `flex-nowrap` + `shrink-0`: като flex-елемент `ul`-ът се свиваше
                до 714 px при налични 1248 и се пренасяше ВЪТРЕШНО на два реда,
                макар да има място (измерено). Прагът е `lg`, а не `md`: при
                768 px, нито при 1024, седемте раздела не се събират: измерено,
                нужни са 1120 px само за навигацията, тоест до 1152 виждаше
                хоризонтален прелив. Там хамбургерът е по-добрият отговор. */}
            <ul className="hidden shrink-0 flex-nowrap gap-x-4 text-sm text-silver-400 xl:flex">
              {nav.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    exact={item.exact}
                    className="flex items-center gap-1.5 rounded py-1 transition-colors hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                    activeClassName="text-cyan-300 underline decoration-cyan-400 decoration-2 underline-offset-8"
                  >
                    <Icon group="ui" name={item.icon} size={15} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            <div className="ms-auto hidden items-center gap-4 xl:flex">
              {/* Външна покана: `noopener` е задължителен, `nofollow` — защото
                  не предаваме тежест на чужд домейн. */}
              <a
                href={DISCORD_INVITE}
                rel="noopener nofollow"
                className="flex items-center gap-1.5 text-sm text-silver-400 hover:text-cyan-300"
              >
                <Icon group="brand" name="discord" size={16} />
                {t.nav.discord}
              </a>
              <LanguageSwitch locale={locale} label={t.nav.language} />
            </div>

            {/* ── Телефон: хамбургер ─────────────────────────────────────── */}
            <div className="ms-auto xl:hidden">
              <MobileNav
                label={t.nav.menu}
                openIcon={<Icon group="ui" name="menu" size={22} />}
                closeIcon={<Icon group="ui" name="close" size={22} />}
              >
                <ul className="flex flex-col gap-1 text-base text-silver-300">
                  {nav.map((item) => (
                    <li key={item.href}>
                      <NavLink
                        href={item.href}
                        exact={item.exact}
                        // 44 px висока цел за пръст (WCAG 2.5.8 иска ≥24, но
                        // 44 е употребимото на телефон).
                        className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 hover:bg-white/5 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                        activeClassName="bg-cyan-500/10 text-cyan-300"
                      >
                        <Icon group="ui" name={item.icon} size={18} />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <a
                    href={DISCORD_INVITE}
                    rel="noopener nofollow"
                    className="flex min-h-11 items-center gap-2 text-sm text-silver-400 hover:text-cyan-300"
                  >
                    <Icon group="brand" name="discord" size={18} />
                    {t.nav.discord}
                  </a>
                  <LanguageSwitch locale={locale} label={t.nav.language} />
                </div>
              </MobileNav>
            </div>
          </nav>
        </header>

        {/* Обвивката с `overflow-x-clip` е предпазителят за героя на началната,
            който излиза от контейнера до ръба на екрана
            (`mx-[calc(50%-50vw)] w-screen`). `100vw` включва вертикалната лента
            за скролиране там, където тя заема място (класическа лента на
            Windows/Linux) — тоест героят е с ~15 px по-широк от видимото и се
            появява ХОРИЗОНТАЛЕН скрол на целия сайт.
            Клипът е на ПЪЛНОШИРОК предшественик, НЕ на `main` — и това е
            поправка на реален дефект, не стил: `overflow: clip` реже по padding
            box-а на елемента, а `main` е `max-w-6xl` (1152 px). Сложен там, той
            режеше героя до 1152 px на всеки по-широк екран, тоест „до ръба“ беше
            вярно само на тесни екрани; измерено с пиксели на 1920 px.
            `clip`, а не `hidden`: `hidden` прави скрол-контейнер и чупи
            `position: sticky` вътре, а `clip` само реже. Другата ос остава
            `visible`, затова нищо не се отрязва вертикално. */}
        <div className="flex-1 overflow-x-clip">
          <main id="main" className="mx-auto w-full max-w-6xl px-4 py-10">
            {children}
          </main>
        </div>

        <footer className="border-t border-white/10 px-4 py-8 text-sm text-silver-500">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-2">
              <Mascot detail="icon" size={22} title={null} />© {new Date().getFullYear()} {SITE_NAME}{' '}
              · {t.footer.product}{' '}
              <a
                href="https://carbonstealth.eu"
                className="text-cyan-300 underline underline-offset-2"
              >
                Carbon Stealth VCC
              </a>
            </p>
            <ul className="flex flex-wrap gap-4">
              <li>
                <a
                  href={DISCORD_INVITE}
                  rel="noopener nofollow"
                  className="flex items-center gap-1.5 underline underline-offset-2 hover:text-cyan-300"
                >
                  <Icon group="brand" name="discord" size={15} />
                  {t.footer.discord}
                </a>
              </li>
              {legal.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="underline underline-offset-2 hover:text-cyan-300">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* Контрастът е проверен: silver-500 върху ink-950 минава 4.5:1. */}
          <p className="mx-auto mt-4 max-w-6xl text-sm text-silver-500">{t.footer.disclaimer}</p>
        </footer>

        <JsonLd data={siteJsonLd(locale)} />
      </body>
    </html>
  );
}
