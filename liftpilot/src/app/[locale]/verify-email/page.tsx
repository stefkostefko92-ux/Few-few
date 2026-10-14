import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n/locales';
import { pageMetadata } from '@/lib/seo';
import AuthPage from '@/components/AuthPage';
import VerifyEmailForm from '@/components/VerifyEmailForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'verify' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: isLocale(locale) ? locale : 'it', path: '/verify-email', title: t('title'), description: t('lead'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: false });
}

export default async function VerifyEmailPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('verify');
  return <AuthPage title={t('title')} lead={t('lead')}><VerifyEmailForm /></AuthPage>;
}
