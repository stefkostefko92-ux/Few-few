import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { NotFoundView } from '@/components/NotFoundView';
import { bestLocale, DEFAULT_LOCALE, LOCALES } from '@/i18n/locales';

// 404 на публичните маршрути (/u/…, /d/…): езикът е по Accept-Language.
export default async function PublicNotFound() {
  const requestHeaders = await headers();
  const locale = bestLocale(
    requestHeaders.get('accept-language'),
    LOCALES,
    DEFAULT_LOCALE,
  );
  const t = await getTranslations({ locale, namespace: 'notFound' });
  return (
    <NotFoundView
      title={t('title')}
      body={t('body')}
      homeLabel={t('home')}
      homeHref="/"
    />
  );
}
