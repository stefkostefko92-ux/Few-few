// Interface language: Italian only (the market; the owner's decision of 2026-10-12). The addresses keep the /it prefix.
export const LOCALES = ['it'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

/** The former interface languages: their addresses (old e-mails, bookmarks, indexed pages) answer with a permanent
 *  redirect to the same page in Italian (src/middleware.ts), and robots.txt keeps their private paths closed. */
export const LEGACY_LOCALES = ['en', 'bg'] as const;

/** A stored or requested language that is not the interface's (e.g. 'en' or 'bg' kept on an account) is not a Locale:
 *  callers fall back to DEFAULT_LOCALE. */
export const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (LOCALES as readonly string[]).includes(x);

/** BCP 47 tags for number and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { it: 'it-IT' };
