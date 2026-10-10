'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { LOCALES } from '@/i18n/locales';

// Same page in another language; the query string is dropped (it only carries transient messages).
export default function LangSwitch() {
  const locale = useLocale(), pathname = usePathname(), t = useTranslations('common');
  return (
    <nav className="langs" aria-label={t('language')}>
      {LOCALES.map((l) => (
        <Link key={l} href={pathname} locale={l} aria-current={l === locale ? 'true' : undefined} hrefLang={l} lang={l}>
          {l.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
