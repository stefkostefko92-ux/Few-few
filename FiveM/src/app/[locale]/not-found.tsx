import Link from 'next/link';
import { headers } from 'next/headers';

import { Mascot } from '@/components/Mascot';
import { getDictionary } from '@/i18n';
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER } from '@/i18n/config';

/**
 * 404 вътре в сайта — с хедъра, подвала и `lang` на езиковия layout.
 *
 * Дотук непознат адрес (`/bg/nyama-takava-stranica`) изобщо не стигаше тук:
 * нямаше маршрут, който да го хване, и Next рисуваше СВОЯТА бяла страница на
 * английски — без `<html lang>`, без бранд, без път назад. Този файл се
 * викаше само при изричен `notFound()` отвътре (непознат сървър, новина).
 * Сега `[...rest]/page.tsx` хваща всичко останало и вика `notFound()`.
 *
 * `not-found` няма `params`, затова езикът идва от хедъра, който middleware
 * задава за всеки път с езиков префикс.
 */
export default async function NotFound() {
  const raw = (await headers()).get(LOCALE_HEADER) ?? undefined;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const t = getDictionary(locale);

  return (
    <div className="flex flex-col items-center gap-7 py-16 text-center">
      <Mascot detail="medium" size={140} expression="surprised" title={null} />

      <div>
        <p className="font-display text-6xl font-semibold leading-none tracking-[-0.03em] text-silver-600" aria-hidden="true">
          404
        </p>
        <h1 className="page-title mt-4">{t.notFound.h1}</h1>
        <p className="mx-auto mt-3 max-w-md text-silver-400">{t.notFound.body}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={`/${locale}/servers`}
          className="btn-primary"
        >
          {t.notFound.toList}
        </Link>
        <Link
          href={`/${locale}/submit`}
          className="btn-ghost"
        >
          {t.notFound.submit}
        </Link>
      </div>
    </div>
  );
}
