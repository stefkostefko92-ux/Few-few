import type { Metadata } from 'next';
import '../globals.css';
import { fontVariables } from '@/app/fonts';
import { SITE_URL } from '@/lib/seo';

// Без metadataBase относителните hreflang/OG URL падат към localhost.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

// Root layout за публичните профили (/u/...). Езикът на конкретния профил
// се решава чак в страницата (профилен език + ?hl + Accept-Language),
// затова тук lang е неутрално "en", а страницата слага lang/dir на <main>.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
