import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';
import { SITE_NAME } from '@/lib/seo';
import { PUBLIC_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';
import '../globals.css';

// Every page is rendered per request: the Content-Security-Policy nonce is new each time (src/middleware.ts).
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    metadataBase: new URL(publicBaseUrl()),
    title: { default: t('title'), template: `%s · ${SITE_NAME}` },
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
    applicationName: SITE_NAME,
    authors: [{ name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' }],
    creator: 'Carbon Stealth VCC',
    robots: indexingAllowed() ? undefined : { index: false, follow: false },
    // scripts/brand-assets.py makes them from the Premium pack's branding (brand/premium/)
    icons: { icon: [{ url: '/favicon.ico', sizes: '16x16 32x32 48x48' }, { url: '/img/icon-192.png', type: 'image/png', sizes: '192x192' }], apple: '/apple-touch-icon.png' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // the one dark theme (globals.css: --bg), whatever the device prefers
  themeColor: '#030a11',
  colorScheme: 'dark',
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // the public pages' client components read only these; the application's layout gives its pages every message
  const messages = pickMessages(await getMessages(), PUBLIC_CLIENT_NAMESPACES);
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
