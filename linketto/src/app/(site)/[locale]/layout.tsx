import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { dirFor, isLocale } from '@/i18n/locales';
import { fontVariables } from '@/app/fonts';
import { SITE_URL } from '@/lib/seo';
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
        {children}
      </body>
    </html>
  );
}
