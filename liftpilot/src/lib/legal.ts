// The privacy notice and the terms of use (src/app/[locale]/privacy): their version, kept with every acceptance (an
// owner who accepted another one works read-only until accepting this one, src/lib/auth.ts), the order of their
// sections — the terms' sections are numbered articles, and the texts cite one another by number — and the values the
// texts state. Every version's text is kept in legal/terms/<version>/ (src/lib/__tests__/legal.test.ts).
import { INTL_LOCALE, isLocale } from '@/i18n/locales';

/** The version in force (the one accepted is kept with each owner) and the day it was published. */
export const TERMS_VERSION = '2';
export const TERMS_DATE = '2026-10-02';

/** The day of the version in force as the page shows it in `locale`. */
export const termsDateText = (locale: string): string =>
  new Intl.DateTimeFormat(INTL_LOCALE[isLocale(locale) ? locale : 'it'], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${TERMS_DATE}T00:00:00Z`));

/** Self-registrations never confirmed are deleted after this many days (src/lib/purge.ts). */
export const UNCONFIRMED_DAYS = 30;

/** Days the web server's logs are kept (deploy/deploy.sh rotates and deletes them). */
export const LOG_DAYS = 14;

/** The privacy notice's sections, in order (their keys in messages/<locale>.json: legal.<key>Title, legal.<key>Text). */
export const PRIVACY = ['controller', 'data', 'interest', 'projects', 'recipients', 'cookies', 'retention', 'rights'] as const;

/** The terms' articles, in order: article n is TERMS[n - 1]. */
export const TERMS = ['service', 'conclusion', 'results', 'accounts', 'content', 'license', 'subscription', 'liability', 'dpa', 'exit', 'marks',
  'changes', 'misc', 'contact', 'law'] as const;

export type TermsArticle = (typeof TERMS)[number];

/** The number of an article of the terms. */
export const article = (k: TermsArticle): number => TERMS.indexOf(k) + 1;

/** The values every legal text may use: the articles by name, the periods, the version. */
export function legalValues(): Record<string, string | number> {
  return { ...Object.fromEntries(TERMS.map((k) => [k, article(k)])), days: UNCONFIRMED_DAYS, logDays: LOG_DAYS, version: TERMS_VERSION };
}
