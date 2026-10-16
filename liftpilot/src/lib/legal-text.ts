// The legal page as plain text, word for word what the page shows: the text kept for each version (legal/terms/) and
// the one whose SHA-256 is kept with every acceptance, so that the words a company accepted can always be shown.
import { createHash } from 'node:crypto';
import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n/locales';
import it from '../../messages/it.json';
import { PRIVACY, TERMS, TERMS_VERSION, article, legalValues, termsDateText, type TermsArticle } from './legal';

// Italian, the only language served; the English and Bulgarian texts kept in legal/terms/<version>/ stay as the record
// of what was accepted in those languages, no longer shown
const MESSAGES: Record<Locale, typeof it> = { it };

const paragraphs = (s: string): string[] => s.split('\n\n');

export function legalText(locale: Locale): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'legal' });
  const v = legalValues();
  const out = [t('title'), t('updated', { version: TERMS_VERSION, date: termsDateText(locale) }), '', t('privacyTitle'), ''];
  for (const k of PRIVACY) out.push(t(`${k}Title`), ...paragraphs(t(`${k}Text`, v)), '');
  out.push(t('termsTitle'), '');
  for (const k of TERMS) out.push(`${t('art', { n: article(k) })} — ${t(`${k}Title`)}`, ...paragraphs(t(`${k}Text`, v)), '');
  return `${out.join('\n').trimEnd()}\n`;
}

/** The SHA-256 of the version in force in `locale` (hex). */
export const legalSha256 = (locale: Locale): string => createHash('sha256').update(legalText(locale), 'utf8').digest('hex');

/** The articles whose clauses the owner approves specifically (arts. 1341–1342 c.c.): the placeholders of
 *  register.clauses, in its order (src/lib/__tests__/clauses-proof.test.ts keeps the two the same). */
export const CLAUSE_ARTICLES = ['accounts', 'license', 'subscription', 'liability', 'exit', 'changes', 'misc', 'law'] as const satisfies readonly TermsArticle[];

/** The clauses as the page of the approval shows them in `locale`: register.clauses with today's article numbers. */
export function clausesText(locale: Locale): string {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: 'register' })('clauses', legalValues());
}

/** What proves which clauses were approved: the SHA-256 of their text as shown (register.clauses is outside the terms'
 *  hash and changes by hand, docs/terms-changes.md) and the numbers of their articles. Kept in the activity log with
 *  every approval (USER_REGISTERED, TERMS_ACCEPTED, CLAUSES_APPROVED). */
export interface ClausesProof {
  clausesSha256: string;
  clauseArticles: number[];
}

export const clausesProof = (locale: Locale): ClausesProof => ({
  clausesSha256: createHash('sha256').update(clausesText(locale), 'utf8').digest('hex'),
  clauseArticles: CLAUSE_ARTICLES.map(article),
});
