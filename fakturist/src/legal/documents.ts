import type { Locale } from '../i18n.js';

/**
 * Правните документи — ЕДИНСТВЕНИЯТ списък: рутерът, футърите, регистрацията, sitemap и llms.txt четат
 * оттук. Текстът е в `views/legal/<документ>/<език>.ejs`. **Съществена промяна на текста = нова
 * `version`** (датата, от която важи) — регистрацията записва приетата версия (`LegalAcceptance`), а
 * старата остава в историята на git. Съществената промяна се съобщава по имейл 30 дни преди да влезе
 * (общите условия, т. „Промени“).
 */
export const LEGAL_DOCUMENTS = {
  terms: {
    version: '2026-11-13',
    paths: { bg: '/obshti-usloviya', en: '/en/terms' },
  },
  privacy: {
    version: '2026-11-13',
    paths: { bg: '/poveritelnost', en: '/en/privacy' },
  },
  dpa: {
    version: '2026-11-13',
    paths: { bg: '/dogovor-za-obrabotvane', en: '/en/data-processing' },
  },
} as const satisfies Record<string, { version: string; paths: Record<Locale, string> }>;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;
export const LEGAL_DOCUMENT_IDS = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentId[];

export function isLegalDocumentId(value: unknown): value is LegalDocumentId {
  return typeof value === 'string' && Object.hasOwn(LEGAL_DOCUMENTS, value);
}

/** Адресът на документ на даден език (относителен; с `base` — пълен). */
export function legalPath(id: LegalDocumentId, locale: Locale): string {
  return LEGAL_DOCUMENTS[id].paths[locale];
}

/** Документите, които регистрацията приема изрично (договор) и тези, за които само уведомява. */
export const ACCEPTED_ON_REGISTRATION: readonly LegalDocumentId[] = ['terms', 'dpa'];
export const ACKNOWLEDGED_ON_REGISTRATION: readonly LegalDocumentId[] = ['privacy'];
