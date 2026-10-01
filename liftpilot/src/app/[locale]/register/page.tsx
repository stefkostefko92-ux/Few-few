import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { mailConfigured } from '@/lib/mail';
import { pageMetadata } from '@/lib/seo';
import AuthPage from '@/components/AuthPage';
import RegisterForm from '@/components/RegisterForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'register' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: isLocale(locale) ? locale : 'it', path: '/register', title: t('title'), description: t('metaDescription'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: true });
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getSessionUser()) redirect(`/${locale}/app`);
  const t = await getTranslations('register');
  return (
    <AuthPage title={t('title')} lead={t('lead')}>
      {mailConfigured() ? <RegisterForm /> : <p className="alert alert-warn" role="status">{t('closed')}</p>}
    </AuthPage>
  );
}
