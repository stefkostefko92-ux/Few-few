import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import { resolveLocale, type LocaleParams } from '@/lib/page-params';
import { LegalPage } from '@/components/LegalPage';

const UPDATED = '2026-09-08';

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  return pageMetadata({ locale, path: '/termini', title: t('title'), description: t('title') });
}

export default async function Page(props: LocaleParams) {
  await resolveLocale(props);
  return <LegalPage ns="terms" updated={UPDATED} />;
}
