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
    <div className="flex items-center rounded-lg border border-bronze-400/20 p-1 text-xs font-semibold" role="group" aria-label={label}>
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
                ? 'flex min-h-8 min-w-9 items-center justify-center rounded-lg bg-white/[0.09] px-2 text-ivory-100'
                : 'flex min-h-8 min-w-9 items-center justify-center rounded-lg px-2 text-ivory-400 transition-colors hover:text-bronze-300'
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
