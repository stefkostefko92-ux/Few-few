import type { Metadata } from "next";
import { DEFAULT_LOCALE, NON_DEFAULT_LOCALES, isLocale } from "../../i18n/locales";
import { KEYWORDS } from "../../lib/seo";

/**
 * Localized subtree (EN/IT). BG is served from the root; these prefixed routes
 * mirror the same pages/bodies, prerendered in each language at a distinct URL.
 * Only the enumerated locales are built (static export) — unknown prefixes 404.
 */
export const dynamicParams = false;

export function generateStaticParams(): Array<{ locale: string }> {
  return NON_DEFAULT_LOCALES.map((locale) => ({ locale }));
}

/** Pages set their own title/description; the keywords come from here, in the page's language. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { keywords: KEYWORDS[isLocale(locale) ? locale : DEFAULT_LOCALE] };
}

export default function LocaleLayout({ children }: { children: React.ReactNode }) {
  // Chrome + I18nProvider live in the root layout (locale is derived from the
  // pathname), so this segment only scopes the prefixed routes.
  return children;
}
