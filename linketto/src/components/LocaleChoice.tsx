'use client';

import type { ReactNode } from 'react';

// Ръчен избор на език: само той записва бисквитката NEXT_LOCALE (строго
// необходима — изрично поискана услуга, чл. 4а, ал. 4, т. 2 ЗЕТ). Автоматичният
// избор (геолокация/Accept-Language) не записва нищо.
export function LocaleChoice({
  locale,
  href,
  className,
  children,
}: {
  locale: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      hrefLang={locale}
      className={className}
      onClick={() => {
        document.cookie = `NEXT_LOCALE=${encodeURIComponent(locale)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }}
    >
      {children}
    </a>
  );
}
