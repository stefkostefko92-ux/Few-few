import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import { isLocale, type Locale } from '@/i18n/locales';
import { publicBaseUrl } from '@/lib/env';
import { mailConfigured } from '@/lib/mail';
import { billingConfig } from '@/lib/billing-config';
import { termsDateText } from '@/lib/legal';
import { SITE_NAME, breadcrumbLd, ldJson, organizationLd, pageMetadata, websiteLd } from '@/lib/seo';
import AuthPage from '@/components/AuthPage';
import RegisterForm from '@/components/RegisterForm';

const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'register' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: loc(locale), path: '/register', title: t('title'), description: t('metaDescription'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: true });
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getSessionUser()) redirect(`/${locale}/app`);
  const t = await getTranslations('register');
  const base = publicBaseUrl();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)),
    breadcrumbLd([{ name: SITE_NAME, url: `${base}/${locale}` }, { name: t('title'), url: `${base}/${locale}/register` }])]);
  return (
    <>
      <AuthPage title={t('title')} lead={t('lead')}>
        {mailConfigured()
          ? <RegisterForm date={termsDateText(locale)} trialDays={billingConfig()?.trialDays ?? null} />
          : <p className="alert alert-warn" role="status">{t('closed')}</p>}
      </AuthPage>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
