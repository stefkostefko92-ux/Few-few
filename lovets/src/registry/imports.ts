import { normalizeEmail, normalizePhone } from '../compliance/normalize.js';
import type { RegistryName } from '../compliance/types.js';

/**
 * Внос и износ за регистрите за отказ. Публичен API нямат: RPO връща резултат за качен списък с
 * номера през портала за оператори; регистърът на КЗП се води по наредба и няма машинен достъп.
 * Затова: износ на списък → проверка в регистъра → внос на резултата с датата на проверката.
 * Форматът на файла на RPO не е фиксиран тук: вносът приема „стойност;статус“ (или със запетая).
 */
export const MAX_IMPORT_LINES = 200_000;

export interface ImportEntry {
  value: string;
  listed: boolean;
}

export interface ImportError {
  line: number;
  reason: string;
}

const YES = new Set(['1', 'да', 'si', 'sì', 'yes', 'y', 'true', 'iscritto', 'вписан', 'listed']);
const NO = new Set(['0', 'не', 'no', 'n', 'false', 'non iscritto', 'невписан', 'not_listed']);
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

function lines(text: string): string[] {
  const all = text.split(/\r?\n/);
  if (all.length > MAX_IMPORT_LINES + 1) {
    throw new Error(`Файлът има над ${MAX_IMPORT_LINES} редове — раздели го.`);
  }
  return all;
}

/** Стойност за регистъра: телефон (RPO) или имейл/домейн (КЗП). */
export function normalizeRegistryValue(raw: string, registry: RegistryName): string | null {
  if (registry === 'RPO') {
    const p = normalizePhone(raw, 'IT');
    return p && p.startsWith('+39') ? p : null;
  }
  const v = raw.trim().toLowerCase();
  if (v.includes('@')) return normalizeEmail(v);
  return DOMAIN_RE.test(v) ? v : null;
}

export function parseRegistryResults(
  text: string,
  registry: RegistryName,
): { entries: ImportEntry[]; errors: ImportError[] } {
  const entries: ImportEntry[] = [];
  const errors: ImportError[] = [];
  lines(text).forEach((row, i) => {
    const line = i + 1;
    if (!row.trim() || row.trim().startsWith('#')) return;
    const sep = row.includes(';') ? ';' : ',';
    const [rawValue = '', rawStatus = ''] = row.split(sep);
    const status = rawStatus.trim().toLowerCase();
    const value = normalizeRegistryValue(rawValue, registry);
    if (!value) {
      if (line > 1) errors.push({ line, reason: 'невалидна стойност' });
      return;
    }
    if (YES.has(status)) entries.push({ value, listed: true });
    else if (NO.has(status)) entries.push({ value, listed: false });
    else errors.push({ line, reason: 'неясен статус (очаква се да/не)' });
  });
  return { entries, errors };
}

/** Пълна снимка на регистъра на КЗП: по един вписан имейл или домейн на ред. */
export function parseKzpSnapshot(text: string): { values: string[]; errors: ImportError[] } {
  const values = new Set<string>();
  const errors: ImportError[] = [];
  lines(text).forEach((row, i) => {
    if (!row.trim() || row.trim().startsWith('#')) return;
    const v = normalizeRegistryValue(row, 'KZP');
    if (v) values.add(v);
    else errors.push({ line: i + 1, reason: 'невалиден имейл или домейн' });
  });
  return { values: [...values], errors };
}

/**
 * Списък с италиански номера за качване в RPO, по един на ред, без повторения. `national` — без
 * +39 (както се пишат в Италия); `e164` — с +39. Провери формата в ръководството за оператори.
 */
export function exportRpoList(numbers: string[], format: 'national' | 'e164'): string {
  const unique = new Set<string>();
  for (const n of numbers) {
    const p = normalizeRegistryValue(n, 'RPO');
    if (p) unique.add(format === 'national' ? p.slice(3) : p);
  }
  return unique.size ? `${[...unique].join('\n')}\n` : '';
}
