import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { isLocale, type Locale } from '@/i18n/locales';
import { publicBaseUrl } from '@/lib/env';
import { PRIVACY, TERMS, TERMS_DATE, TERMS_HISTORY, TERMS_VERSION, article, dateText, legalValues, termsDateText } from '@/lib/legal';
import { SITE_NAME, breadcrumbLd, ldJson, organizationLd, pageMetadata, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import PrintButton from '@/components/PrintButton';
import LegalPage, { type TocItem } from '@/components/LegalPage';

// The privacy notice and the terms of use: one page, the notice's answers under their questions, the terms in numbered
// articles (the registration, the terms' page and the subscription link here; src/lib/legal-text.ts is the same text).
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: loc(locale), path: '/privacy', title: t('title'), description: t('metaDescription'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: true });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal');
  const base = publicBaseUrl(), url = `${base}/${locale}/privacy`;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)), breadcrumbLd([{ name: SITE_NAME, url: `${base}/${locale}` }, { name: t('title'), url }])]);
  const v = legalValues();
  const toc: TocItem[] = [
    { id: 'privacy', label: t('privacyTitle') }, ...PRIVACY.map((k) => ({ id: `q-${k}`, label: t(`${k}Title`), sub: true })),
    { id: 'terms', label: t('termsTitle') }, ...TERMS.map((k) => ({ id: `q-${k}`, label: `${t('art', { n: article(k) })} — ${t(`${k}Title`)}`, sub: true })),
  ];
  const body = (k: (typeof PRIVACY)[number] | (typeof TERMS)[number]) => t(`${k}Text`, v).split('\n\n').map((p, i) => <p key={i}>{p}</p>);
  return (
    <>
      <SiteHeader />
      <LegalPage eyebrow={t('eyebrow')} title={t.rich('headline', { em: (c) => <em>{c}</em> })} tocLabel={t('toc')} toc={toc} head={(
        <>
          <div className="legal-meta">
            <p className="note"><time dateTime={TERMS_DATE}>{t('updated', { version: TERMS_VERSION, date: termsDateText(locale) })}</time></p>
            <PrintButton label={t('print')} />
          </div>
          <nav aria-label={t('archiveTitle')} className="note legal-archive">
            {t('archiveTitle')}:{' '}
            {TERMS_HISTORY.filter((h) => h.version !== TERMS_VERSION).reverse().map((h, i) => (
              <span key={h.version}>{i ? ' · ' : ''}<Link href={`/privacy/${h.version}`}>{t('archiveItem', { label: h.label, date: dateText(locale, h.date) })}</Link></span>
            ))}
          </nav>
        </>
      )}>
        <h2 id="privacy">{t('privacyTitle')}</h2>
        {PRIVACY.map((k) => (
          <section key={k} aria-labelledby={`q-${k}`}>
            <h3 id={`q-${k}`}>{t(`${k}Title`)}</h3>
            {body(k)}
          </section>
        ))}
        <h2 id="terms">{t('termsTitle')}</h2>
        {TERMS.map((k) => (
          <section key={k} aria-labelledby={`q-${k}`}>
            <h3 id={`q-${k}`}>{t('art', { n: article(k) })} — {t(`${k}Title`)}</h3>
            {body(k)}
          </section>
        ))}
      </LegalPage>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
