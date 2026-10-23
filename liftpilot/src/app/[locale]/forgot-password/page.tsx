import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n/locales';
import { mailConfigured } from '@/lib/mail';
import { pageMetadata } from '@/lib/seo';
import AuthPage from '@/components/AuthPage';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'forgot' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: isLocale(locale) ? locale : 'it', path: '/forgot-password', title: t('title'), description: t('lead'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: false });
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, te] = await Promise.all([getTranslations('forgot'), getTranslations('errors')]);
  return (
    <AuthPage title={t('title')} lead={t('lead')}>
      {mailConfigured() ? <ForgotPasswordForm /> : <p className="alert alert-warn" role="status">{te('mailUnavailable')}</p>}
    </AuthPage>
  );
}
