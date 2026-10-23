import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ToolPage } from '@/components/ToolPage';
import { BioTool } from '@/components/BioTool';
import { HREFLANG_LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { safeJsonLd } from '@/lib/jsonld';
import { pageMetadata, SITE_URL } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tools' });
  return pageMetadata(locale as Locale, '/tools/bio', {
    title: t('bioMetaTitle'),
    description: t('bioMetaDescription'),
    keywords: t('bioKeywords').split(', '),
  });
}

export default async function BioToolPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('tools');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('bioName'),
    url: `${SITE_URL}/${locale}/tools/bio`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    inLanguage: locale,
    description: t('bioMetaDescription'),
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
        title={t('bioTitle')}
        intro={t('bioIntro')}
        cta={{
          title: t('ctaTitle'),
          text: t('ctaText'),
          href: `/${locale}/register`,
          label: t('ctaButton'),
        }}
      >
        <BioTool
          locale={(HREFLANG_LOCALES as readonly string[]).includes(locale) ? locale : 'en'}
          languages={HREFLANG_LOCALES.map((code) => ({
            code,
            name: LOCALE_NAMES[code],
          }))}
          labels={{
            name: t('bioNameLabel'),
            about: t('bioAbout'),
            aboutPlaceholder: t('bioAboutPlaceholder'),
            language: t('bioLanguage'),
            generate: t('bioGenerate'),
            generating: t('bioGenerating'),
            result: t('bioResult'),
            copy: t('bioCopy'),
            copied: t('bioCopied'),
            notice: t('bioNotice'),
            errors: {
              rate: t('bioErrRate'),
              input: t('bioErrInput'),
              ai: t('bioErrAi'),
              off: t('bioErrOff'),
            },
          }}
        />
      </ToolPage>
      <SiteFooter locale={locale as Locale} currentPath="/tools/bio" />
    </>
  );
}
