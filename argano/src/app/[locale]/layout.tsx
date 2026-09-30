import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { indexingAllowed, publicBaseUrl } from '@/lib/env';
import '../globals.css';

// Every page is rendered per request: the Content-Security-Policy nonce is new each time (src/middleware.ts).
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    metadataBase: new URL(publicBaseUrl()),
    title: { default: t('title'), template: `%s · Argano` },
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
    applicationName: 'Argano',
    authors: [{ name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' }],
    creator: 'Carbon Stealth VCC',
    robots: indexingAllowed() ? undefined : { index: false, follow: false },
    icons: { icon: '/icon.svg' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef1f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0c111d' },
  ],
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
