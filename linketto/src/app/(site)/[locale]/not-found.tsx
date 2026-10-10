import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import { NotFoundView } from '@/components/NotFoundView';
import type { Locale } from '@/i18n/locales';

export default async function LocaleNotFound() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations({ locale, namespace: 'notFound' });
  return (
    <>
      <SiteHeader locale={locale} />
      <NotFoundView
        title={t('title')}
        body={t('body')}
        homeLabel={t('home')}
        homeHref={`/${locale}`}
        withHeader
      />
    </>
  );
}
