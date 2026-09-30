import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { pageMetadata } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import LoginForm from '@/components/LoginForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: isLocale(locale) ? locale : 'it', path: '/login', title: t('title'), description: t('description'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: false });
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getSessionUser()) redirect(`/${locale}/app`);
  const t = await getTranslations('auth');
  return (
    <>
      <SiteHeader showLogin={false} />
      <main className="page page-narrow">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Argano</p>
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead')}</p>
        </div>
        <LoginForm />
      </main>
      <Footer />
    </>
  );
}
