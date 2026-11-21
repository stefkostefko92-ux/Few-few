import type { Metadata } from 'next';
import { fontVariables } from '@/app/fonts';
import { NotFoundView } from '@/components/NotFoundView';
import { ThemeScript } from '@/components/ui/ThemeScript';
import './globals.css';

export const metadata: Metadata = {
  title: '404 · Linketto',
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
        <NotFoundView
          title="Страницата не е намерена · Page not found"
          body="Линкът е грешен или страницата вече не съществува. This link is wrong or the page no longer exists."
          homeLabel="Linketto"
          homeHref="/"
        />
      </body>
    </html>
  );
}
