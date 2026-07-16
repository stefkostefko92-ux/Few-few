import type { Metadata } from 'next';
import '../globals.css';
import { fontVariables } from '@/app/fonts';
import { SITE_URL } from '@/lib/seo';

// Без metadataBase относителните hreflang/OG URL падат към localhost.
// Domain verification (Meta Business Manager + Google Search Console): включва се
// само при зададени env кодове — нужни за Meta business verification/AEM и за
// Google Ads dev token доверието. Кодовете идват от съответните конзоли (човек).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION
      ? {
          other: {
            'facebook-domain-verification': [process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION],
          },
        }
      : {}),
  },
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
