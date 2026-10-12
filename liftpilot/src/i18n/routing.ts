import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { DEFAULT_LOCALE, LOCALES } from './locales';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  // one language: no hreflang alternates in the HTTP Link header, and no language cookie (NEXT_LOCALE) to remember a
  // choice there is no longer (src/middleware.ts drops the one a browser still holds from before)
  alternateLinks: false,
  localeCookie: false,
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
