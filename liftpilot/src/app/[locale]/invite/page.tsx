import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n/locales';
import { pageMetadata } from '@/lib/seo';
import AuthPage from '@/components/AuthPage';
import InviteAcceptForm from '@/components/InviteAcceptForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'invite' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: isLocale(locale) ? locale : 'it', path: '/invite', title: t('title'), description: t('lead'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: false });
}

// A colleague's invitation: the link of the e-mail, the company that invites and the password chosen.
export default async function InvitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invite');
  return <AuthPage title={t('title')} lead={t('lead')}><InviteAcceptForm /></AuthPage>;
}
