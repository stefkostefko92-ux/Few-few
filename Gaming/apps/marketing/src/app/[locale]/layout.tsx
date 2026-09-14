import { NON_DEFAULT_LOCALES } from "../../i18n/locales";

/**
 * Localized subtree (EN/IT). BG is served from the root; these prefixed routes
 * mirror the same pages/bodies, prerendered in each language at a distinct URL.
 * Only the enumerated locales are built (static export) — unknown prefixes 404.
 */
export const dynamicParams = false;

export function generateStaticParams(): Array<{ locale: string }> {
  return NON_DEFAULT_LOCALES.map((locale) => ({ locale }));
}

export default function LocaleLayout({ children }: { children: React.ReactNode }) {
  // Chrome + I18nProvider live in the root layout (locale is derived from the
  // pathname), so this segment only scopes the prefixed routes.
  return children;
}
