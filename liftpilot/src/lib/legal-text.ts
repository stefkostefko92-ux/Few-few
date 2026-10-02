// The legal page as plain text, word for word what the page shows: the text kept for each version (legal/terms/) and
// the one whose SHA-256 is kept with every acceptance, so that the words a company accepted can always be shown.
import { createHash } from 'node:crypto';
import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n/locales';
import it from '../../messages/it.json';
import en from '../../messages/en.json';
import bg from '../../messages/bg.json';
import { PRIVACY, TERMS, TERMS_VERSION, article, legalValues, termsDateText } from './legal';

// the three files have the same keys (the parity test in present.test.ts): the Italian one types them all
const MESSAGES = { it, en, bg } as const;

const paragraphs = (s: string): string[] => s.split('\n\n');

export function legalText(locale: Locale): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale] as typeof it, namespace: 'legal' });
  const v = legalValues();
  const out = [t('title'), t('updated', { version: TERMS_VERSION, date: termsDateText(locale) }), '', t('privacyTitle'), ''];
  for (const k of PRIVACY) out.push(t(`${k}Title`), ...paragraphs(t(`${k}Text`, v)), '');
  out.push(t('termsTitle'), '');
  for (const k of TERMS) out.push(`${t('art', { n: article(k) })} — ${t(`${k}Title`)}`, ...paragraphs(t(`${k}Text`, v)), '');
  return `${out.join('\n').trimEnd()}\n`;
}

/** The SHA-256 of the version in force in `locale` (hex). */
export const legalSha256 = (locale: Locale): string => createHash('sha256').update(legalText(locale), 'utf8').digest('hex');
