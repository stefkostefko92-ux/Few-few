import type { Metadata } from "next";

import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SessionBar from "@/components/SessionBar";
import { KEYWORDS, PUBLISHER, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — проверка на IP адрес`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Провери публичен IP адрес: мрежа и регистър (RDAP), автономна система, обявено от оператора местоположение, обратен DNS, облак или CDN, Tor изход. Без реклами и без проследяване.",
  keywords: KEYWORDS,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "bg_BG",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — проверка на IP адрес`,
    description: SITE_TAGLINE,
  },
  robots: { index: true, follow: true },
  authors: [{ name: PUBLISHER.legalName, url: PUBLISHER.url }],
};

/**
 * Тъмната тема е по подразбиране (тя е брандът). Този скрипт се изпълнява ПРЕДИ
 * рисуването и слага `.light` само ако потребителят го е избрал — иначе
 * страницата за миг би светнала в грешната тема. Стойността живее в
 * `localStorage`, не в бисквитка: това е предпочитание за изглед, а не
 * проследяване, и обещанието „без бисквитки“ остава вярно.
 */
const THEME_SCRIPT = `
try {
  if (localStorage.getItem('carbonip-theme') === 'light') {
    document.documentElement.classList.add('light');
  }
} catch (e) {}
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-on-accent"
        >
          Към съдържанието
        </a>
        <SessionBar />
        <Header />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
