// The English and Bulgarian texts of the versions accepted while the interface had those languages (up to version 4):
// kept in legal/terms/<version>/ as the record of what was accepted in them, shown only as that record — the page of the
// version links them (/<locale>/privacy/<version>), /api/terms/<version>/<lang> serves them as plain text. Never the
// version in force, which is Italian only.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LEGACY_LOCALES } from '@/i18n/locales';
import { TERMS_HISTORY, TERMS_VERSION } from './legal';

export type ArchivedLanguage = { lang: (typeof LEGACY_LOCALES)[number]; file: string };

/** The other languages kept for an earlier version, in the order of LEGACY_LOCALES; none for an unknown version. */
export function archivedLanguages(version: string): ArchivedLanguage[] {
  const h = TERMS_HISTORY.find((x) => x.version === version && x.version !== TERMS_VERSION);
  if (!h) return [];
  return LEGACY_LOCALES.map((lang) => ({ lang, file: join(process.cwd(), 'legal', 'terms', h.version, `${lang}.txt`) }))
    .filter((a) => existsSync(a.file));
}
