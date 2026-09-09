'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, LOCALE_NAMES, isLocale } from '@/i18n/locales';
import { usePathname, useRouter } from '@/i18n/routing';

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t('language')}</span>
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
        value={locale}
        aria-label={t('language')}
        onChange={(e) => {
          const next = e.target.value;
          if (isLocale(next)) router.replace(pathname, { locale: next });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
