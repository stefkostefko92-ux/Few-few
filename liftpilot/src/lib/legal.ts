// The privacy notice and the terms of use (src/app/[locale]/privacy): their version, kept with every acceptance, the
// order of their sections — the terms' sections are numbered articles, and the texts cite one another by number — and
// the values the texts state. Every version's text is kept in legal/terms/<version>/ (src/lib/__tests__/legal.test.ts).
//
// A new version binds a company that accepted an earlier one only once its owner was told by e-mail, at least
// NOTICE_DAYS before (npm run legal:notice, docs/terms-changes.md), and never before TERMS_EFFECTIVE; until then the
// accepted version stays in force and the company works as before (src/lib/auth.ts). A new company accepts the version
// in force when it registers.
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { TOKEN_TTL_MS } from './token-shape';

/** The version in force for new companies, the day it was published, and the earliest day it binds the others. */
export const TERMS_VERSION = '3';
export const TERMS_DATE = '2026-10-06';
export const TERMS_EFFECTIVE = '2026-11-16';

/** Every version kept in legal/terms/<version>/, oldest first: the day it was published and the number the pages call it
 *  by (the first one was named after its day). The last is the version in force; an owner who has not accepted it yet
 *  is bound by an earlier one, which /<locale>/privacy/<version> shows word for word. */
export const TERMS_HISTORY: readonly { version: string; label: string; date: string }[] = [
  { version: '2026-10-02', label: '1', date: '2026-10-02' },
  { version: '2', label: '2', date: '2026-10-02' },
  { version: TERMS_VERSION, label: TERMS_VERSION, date: TERMS_DATE },
];

/** Days between the owner's e-mail about a new version and the day it binds the company (terms, article «changes»). */
export const NOTICE_DAYS = 30;

const DAY_MS = 24 * 3600_000;

/** A day (YYYY-MM-DD or a Date) as the pages and the e-mails write it in `locale`. */
export const dateText = (locale: string, day: string | Date): string =>
  new Intl.DateTimeFormat(INTL_LOCALE[isLocale(locale) ? locale : 'it'], { dateStyle: 'long', timeZone: 'UTC' })
    .format(typeof day === 'string' ? new Date(`${day}T00:00:00Z`) : day);

/** The day of the version in force as the page shows it in `locale`. */
export const termsDateText = (locale: string): string => dateText(locale, TERMS_DATE);

/** The day the version in force binds an owner told of it at `noticeAt`: TERMS_EFFECTIVE, or the start of the day
 *  NOTICE_DAYS whole days after the e-mail when that is later. */
export function termsBinding(noticeAt: Date): Date {
  const start = Date.UTC(noticeAt.getUTCFullYear(), noticeAt.getUTCMonth(), noticeAt.getUTCDate());
  return new Date(Math.max(new Date(`${TERMS_EFFECTIVE}T00:00:00Z`).getTime(), start + (NOTICE_DAYS + 1) * DAY_MS));
}

/** The company's acceptance of the terms in force, by its owner: accepted (`ok`); an older version accepted, the new
 *  one not binding yet — not announced, or announced and its day still ahead (`pending`); an older version accepted
 *  and the new one binding (`changed`: read-only until accepted); none ever (`never`). */
export type TermsState = 'ok' | 'pending' | 'changed' | 'never';

export interface OwnerTerms {
  termsVersion: string | null;
  termsNoticeVersion: string | null;
  termsNoticeAt: Date | null;
}

export function termsStateOf(o: OwnerTerms, now: Date): { state: TermsState; binding: Date | null } {
  if (o.termsVersion === TERMS_VERSION) return { state: 'ok', binding: null };
  if (o.termsVersion === null) return { state: 'never', binding: null };
  if (o.termsNoticeVersion !== TERMS_VERSION || !o.termsNoticeAt) return { state: 'pending', binding: null };
  const binding = termsBinding(o.termsNoticeAt);
  return { state: now.getTime() >= binding.getTime() ? 'changed' : 'pending', binding };
}

/** Self-registrations never confirmed are deleted after this many days (src/lib/purge.ts). */
export const UNCONFIRMED_DAYS = 30;

/** Days the web server's logs are kept (deploy/deploy.sh rotates and deletes them). */
export const LOG_DAYS = 14;

/** Days a copy of the database is kept, the nightly ones and those before a deploy (deploy/backup.sh deletes them). */
export const BACKUP_DAYS = 30;

/** A company without a subscription in force where nobody signed in for this many months is deleted, after its owner
 *  was told by e-mail INACTIVE_NOTICE_DAYS before (src/lib/inactive.ts). */
export const INACTIVE_MONTHS = 24;
export const INACTIVE_NOTICE_DAYS = 30;

/** Years the accounting records of the subscription are kept at least (Bulgarian Accountancy Act, art. 12); the tax
 *  documents among them longer when the Tax and Social Security Procedure Code (art. 38) asks it. */
export const ACCOUNTING_YEARS = 10;

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
  return {
    ...Object.fromEntries(TERMS.map((k) => [k, article(k)])), days: UNCONFIRMED_DAYS, logDays: LOG_DAYS, backupDays: BACKUP_DAYS,
    inactiveMonths: INACTIVE_MONTHS, inactiveNoticeDays: INACTIVE_NOTICE_DAYS, noticeDays: NOTICE_DAYS, accountingYears: ACCOUNTING_YEARS,
    inviteDays: TOKEN_TTL_MS.INVITE / DAY_MS, version: TERMS_VERSION,
  };
}
