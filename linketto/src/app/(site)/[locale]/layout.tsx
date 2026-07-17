import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { DIALECT_LOCALES, dirFor, isLocale } from '@/i18n/locales';
import { fontVariables } from '@/app/fonts';
import { SITE_URL } from '@/lib/seo';
import { ConsentBanner } from '@/components/ConsentBanner';
import '../../globals.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: tSeo('metaTitle'), template: `%s · ${t('appName')}` },
    description: tSeo('metaDescription'),
    keywords: tSeo('keywords'),
    applicationName: t('appName'),
    // Диалектите (nap/scn/lmo) са само за ръчен избор и падат към en до правен
    // преглед → thin-content риск; държим ги извън индекса, но следваеми.
    ...(DIALECT_LOCALES.includes(locale)
      ? { robots: { index: false, follow: true } }
      : {}),
    // Domain verification (Meta BM + Google) — само при зададени env кодове.
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
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return (
    <html lang={locale} dir={dirFor(locale)} className={fontVariables}>
      <body className="min-h-screen bg-slate-50 font-ui text-slate-900">
        {/* next-intl v4: клиентските компоненти (ConsentBanner) изискват ИЗРИЧЕН
            NextIntlClientProvider — без него всяка страница гърми при рендер
            (build-ът не го хваща: страниците са динамични). Без props: провайдърът
            наследява locale+messages от request конфигурацията. */}
        <NextIntlClientProvider>
          {children}
          {/* CMP: рекламните тагове (Google Consent Mode v2 / Meta Pixel) се зареждат само
              със съгласие И само при зададени NEXT_PUBLIC_* ID-та. Собствената аналитика
              на linketto е без бисквитки и не зависи от този банер. */}
          <ConsentBanner
            googleAdsId={process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}
            metaPixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
