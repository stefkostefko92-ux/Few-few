'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LOCALE_NAMES, LOCALES, switchLocalePath, type Locale } from '@/i18n/config';

/**
 * Превключвателят пази ТЕКУЩАТА страница, а не праща към началната — иначе
 * смяната на езика губи мястото ти, което е най-бързият начин никой да не я
 * ползва.
 */
export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() ?? `/${locale}`;

  return (
    <div className="flex items-center gap-1 text-sm" role="group" aria-label={label}>
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <Link
            key={option}
            href={switchLocalePath(pathname, option)}
            hrefLang={option}
            aria-current={active ? 'true' : undefined}
            className={
              active
                ? 'rounded px-2 py-1 font-semibold text-cyan-300'
                : 'rounded px-2 py-1 text-silver-500 underline underline-offset-2 hover:text-cyan-300'
            }
          >
            <span className="sr-only">{LOCALE_NAMES[option]}</span>
            <span aria-hidden="true">{option.toUpperCase()}</span>
          </Link>
        );
      })}
    </div>
  );
}
