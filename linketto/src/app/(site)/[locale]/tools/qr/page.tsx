import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ToolPage } from '@/components/ToolPage';
import { QrTool } from '@/components/QrTool';
import type { Locale } from '@/i18n/locales';
import { safeJsonLd } from '@/lib/jsonld';
import { pageMetadata, SITE_URL } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tools' });
  return pageMetadata(locale as Locale, '/tools/qr', {
    title: t('qrMetaTitle'),
    description: t('qrMetaDescription'),
    keywords: t('qrKeywords').split(', '),
  });
}

export default async function QrToolPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('tools');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('qrName'),
    url: `${SITE_URL}/${locale}/tools/qr`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    inLanguage: locale,
    description: t('qrMetaDescription'),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    publisher: { '@type': 'Organization', name: 'Carbon Stealth VCC' },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <SiteHeader locale={locale as Locale} />
      <ToolPage
        eyebrow={t('eyebrow')}
        title={t('qrTitle')}
        intro={t('qrIntro')}
        cta={{
          title: t('ctaTitle'),
          text: t('ctaText'),
          href: `/${locale}/register`,
          label: t('ctaButton'),
        }}
      >
        <QrTool
          labels={{
            url: t('qrUrlLabel'),
            placeholder: 'https://',
            color: t('qrColor'),
            transparent: t('qrTransparent'),
            downloadSvg: t('qrDownloadSvg'),
            downloadPng: t('qrDownloadPng'),
            empty: t('qrEmpty'),
            preview: t('qrPreview'),
          }}
        />
      </ToolPage>
      <SiteFooter locale={locale as Locale} currentPath="/tools/qr" />
    </>
  );
}
