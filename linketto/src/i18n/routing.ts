import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { DEFAULT_LOCALE, LOCALES } from './locales';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  // Бисквитката за език се записва само при ръчен избор (LocaleChoice), не
  // при всяко посещение — иначе не е „изрично поискана“ (чл. 4а ЗЕТ).
  localeCookie: false,
});

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
