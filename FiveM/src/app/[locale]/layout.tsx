import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Icon } from '@/components/Icon';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Mascot } from '@/components/Mascot';
import { HTML_LANG, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { BASE_KEYWORDS, jsonLdString, SITE_NAME, SITE_URL, siteJsonLd } from '@/lib/seo';
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
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);

  const nav = [
    { href: `/${locale}`, label: t.nav.servers, icon: 'servers' },
    { href: `/${locale}/rules`, label: t.nav.rules, icon: 'rules' },
    { href: `/${locale}/tutorials`, label: t.nav.tutorials, icon: 'tutorials' },
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

        <header className="border-b border-white/10">
          {/* Трикольорът от логото — тънка лента, за да не се повтаря знамето. */}
          <div className="flag-rule h-[3px]" aria-hidden="true" />
          <nav
            aria-label={t.nav.main}
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4"
          >
            <Link href={`/${locale}`} className="flex items-center">
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
                className="h-8 w-auto"
              />
            </Link>

            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-silver-400">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="flex items-center gap-1.5 hover:text-cyan-300">
                    <Icon group="ui" name={item.icon} size={15} />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="ms-auto flex items-center gap-4">
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
          </nav>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
          {children}
        </main>

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

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(siteJsonLd(locale)) }}
        />
      </body>
    </html>
  );
}
