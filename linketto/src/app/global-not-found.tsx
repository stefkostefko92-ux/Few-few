import type { Metadata } from 'next';
import { fontVariables } from '@/app/fonts';
import { NotFoundView } from '@/components/NotFoundView';
import { ThemeScript } from '@/components/ui/ThemeScript';
import './globals.css';
import '@/components/landing/lx.css';

export const metadata: Metadata = {
  title: '404 · Linketto',
  keywords: ['Linketto', 'link in bio', 'multilingual link in bio', 'bio link', 'Carbon Stealth'],
  robots: { index: false },
};

// Глобалната 404 (адрес извън всички маршрути, напр. /нещо). Тук няма
// езиков контекст → кратък двуезичен текст, а не гол екран на Next.
export default function GlobalNotFound() {
  return (
    <html lang="bg" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-bg font-ui text-fg">
        {/* Същият тъмен свят като лендинга и вътрешните страници (LxPage). */}
        <div className="lx lx-page text-fg" data-theme="dark">
          <div aria-hidden className="lx-page-bg">
            <div className="lx-grain" />
          </div>
          <NotFoundView
            title="Страницата не е намерена · Page not found"
            body="Линкът е грешен или страницата вече не съществува. This link is wrong or the page no longer exists."
            homeLabel="Linketto"
            homeHref="/"
          />
        </div>
      </body>
    </html>
  );
}
