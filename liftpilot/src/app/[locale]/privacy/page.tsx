import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale, INTL_LOCALE, type Locale } from '@/i18n/locales';
import { publicBaseUrl } from '@/lib/env';
import { TERMS_VERSION, UNCONFIRMED_DAYS } from '@/lib/legal';
import { SITE_NAME, breadcrumbLd, ldJson, organizationLd, pageMetadata, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';

// The privacy notice and the terms of use: one page, each answer under its question (the registration links here).
const PRIVACY = ['controller', 'data', 'projects', 'recipients', 'cookies', 'retention', 'rights'] as const;
const TERMS = ['service', 'results', 'accounts', 'subscription', 'liability', 'changes', 'contact', 'law'] as const;
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
  const date = new Intl.DateTimeFormat(INTL_LOCALE[loc(locale)], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${TERMS_VERSION}T00:00:00Z`));
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)), breadcrumbLd([{ name: SITE_NAME, url: `${base}/${locale}` }, { name: t('title'), url }])]);
  const section = (k: string) => (
    <section key={k} aria-labelledby={`q-${k}`}>
      <h3 id={`q-${k}`}>{t(`${k}Title`)}</h3>
      {t(`${k}Text`, { days: UNCONFIRMED_DAYS }).split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
    </section>
  );
  return (
    <>
      <SiteHeader />
      <main className="legal">
        <h1>{t('title')}</h1>
        <p className="note"><time dateTime={TERMS_VERSION}>{t('updated', { date })}</time></p>
        <h2>{t('privacyTitle')}</h2>
        {PRIVACY.map(section)}
        <h2>{t('termsTitle')}</h2>
        {TERMS.map(section)}
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
