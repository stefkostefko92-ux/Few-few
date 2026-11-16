import type { Metadata } from 'next';
import { fontVariables } from '@/app/fonts';
import { NotFoundView } from '@/components/NotFoundView';
import './globals.css';

export const metadata: Metadata = {
  title: '404 · Linketto',
  robots: { index: false },
};

// Глобалната 404 (адрес извън всички маршрути, напр. /нещо). Тук няма
// езиков контекст → кратък двуезичен текст, а не гол екран на Next.
export default function GlobalNotFound() {
  return (
    <html lang="bg" className={fontVariables}>
      <body className="min-h-screen bg-slate-950 font-ui">
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
