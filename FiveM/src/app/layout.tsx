import type { Metadata } from 'next';
import Link from 'next/link';

import { BASE_KEYWORDS, jsonLdString, SITE_NAME, SITE_URL, siteJsonLd } from '@/lib/seo';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — всички български FiveM сървъри на едно място`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    'Жива директория на българските FiveM RP сървъри: онлайн статус, брой играчи, рамка (ESX/QBCore/Qbox), правила и Discord. Плюс туториали за начинаещи.',
  keywords: BASE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' }],
  publisher: 'Carbon Stealth VCC',
};

const NAV = [
  { href: '/', label: 'Сървъри' },
  { href: '/news', label: 'Новини и туториали' },
  { href: '/submit', label: 'Добави сървър' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:m-3 focus:rounded focus:bg-fivem-500 focus:px-3 focus:py-2 focus:text-fivem-950"
        >
          Към съдържанието
        </a>

        <header className="border-b border-white/10">
          <nav
            aria-label="Основна навигация"
            className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4"
          >
            <Link href="/" className="text-lg font-semibold tracking-tight">
              FiveM<span className="text-fivem-400">Bulgaria</span>
            </Link>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-fivem-400">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
          {children}
        </main>

        <footer className="border-t border-white/10 px-4 py-8 text-sm text-slate-400">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
            <p>
              © {new Date().getFullYear()} {SITE_NAME} · продукт на{' '}
              <a
                href="https://carbonstealth.eu"
                className="text-fivem-400 underline underline-offset-2"
              >
                Carbon Stealth VCC
              </a>
            </p>
            <ul className="flex flex-wrap gap-4">
              <li>
                <Link href="/impresum" className="underline underline-offset-2 hover:text-fivem-400">
                  Импресум
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="underline underline-offset-2 hover:text-fivem-400">
                  Поверителност
                </Link>
              </li>
              <li>
                <Link href="/terms" className="underline underline-offset-2 hover:text-fivem-400">
                  Условия
                </Link>
              </li>
              <li>
                <Link href="/report" className="underline underline-offset-2 hover:text-fivem-400">
                  Сигнал
                </Link>
              </li>
            </ul>
          </div>
          {/* Контрастът тук е проверен: slate-400 върху fivem-950 = 7.65:1.
              slate-500 дава 4.12:1 и пада под 4.5:1 (WCAG 1.4.3) — точно на
              реда с търговско-марковия дисклеймър, който трябва да е видим. */}
          <p className="mx-auto mt-4 max-w-5xl text-sm text-slate-400">
            Независим проект. Не е свързан с Rockstar Games, Take-Two Interactive Software, Inc. или
            Cfx.re. GTA V, Grand Theft Auto и Rockstar Games са марки на Take-Two Interactive
            Software, Inc.; FiveM и Cfx.re са марки на съответните им притежатели. Употребата им тук
            е само за обозначаване на платформата, за която се отнася съдържанието.
          </p>
        </footer>

        <script
          type="application/ld+json"
          // Съдържанието е наше, не идва от потребител.
          dangerouslySetInnerHTML={{ __html: jsonLdString(siteJsonLd()) }}
        />
      </body>
    </html>
  );
}
