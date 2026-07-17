import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import type { Locale } from '@/i18n/locales';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata(locale as Locale, '/privacy', {
    title: t('privacyTitle'),
    description: tSeo('metaDescription'),
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('legal');
  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbJsonLd(locale as Locale, [
                { name: t('privacyTitle'), path: '/privacy' },
              ]),
            ),
          }}
        />
        <h1 className="text-2xl font-bold">{t('privacyTitle')}</h1>
        <p className="mt-6 whitespace-pre-line leading-relaxed text-slate-700">
          {t('privacyBody')}
        </p>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="/privacy" />
    </>
  );
}
