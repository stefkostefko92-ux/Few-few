import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { pageMetadata } from '@/lib/seo';
import AuthPage from '@/components/AuthPage';
import LoginForm from '@/components/LoginForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: isLocale(locale) ? locale : 'it', path: '/login', title: t('title'), description: t('description'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: false });
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ reset?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getSessionUser()) redirect(`/${locale}/app`);
  const t = await getTranslations('auth');
  // People sign in every day: the still of the machine (AuthPage), not the 3D stage.
  return <AuthPage title={t('title')} lead={t('lead')}><LoginForm reset={(await searchParams).reset === '1'} /></AuthPage>;
}
