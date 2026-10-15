import { SECTIONS, type SectionKey } from './fields.js';

/**
 * Редът на разделите на картата (без база — тества се само): „Impianto“ е идентификацията на уредбата
 * и табелата ѝ — винаги първи; другите се подреждат по фирма (`Azienda.ordineSezioni`,
 * src/aziende/sezioni.ts). Празно — редът от fields.ts.
 */

export const FISSE: readonly SectionKey[] = ['impianto'];
export const ORDINABILI: readonly SectionKey[] = SECTIONS.map((s) => s.key).filter(
  (key) => !FISSE.includes(key),
);

const isOrdinabile = (key: unknown): key is SectionKey =>
  typeof key === 'string' && (ORDINABILI as readonly string[]).includes(key);

/**
 * Записаният ред, изчистен: само познатите раздели, всеки веднъж; разделите, които ги няма в него
 * (нов раздел след записа), са накрая — в реда по подразбиране.
 */
export function ordineEffettivo(saved: readonly string[]): SectionKey[] {
  const out = new Set<SectionKey>();
  for (const key of saved) if (isOrdinabile(key)) out.add(key);
  for (const key of ORDINABILI) out.add(key);
  return [...out];
}

/** Разделите (на fields.ts или вече за показ) в реда на фирмата: идентификацията, после подредените. */
export function sezioniOrdinate<T extends { key: SectionKey }>(
  sections: readonly T[],
  saved: readonly string[],
): T[] {
  const rank = new Map([...FISSE, ...ordineEffettivo(saved)].map((key, i) => [key, i]));
  return [...sections].sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
}

/** Пратеният ред: точно разделите за подреждане, всеки по веднъж — иначе null (подправена форма). */
export function parseOrdine(raw: unknown): SectionKey[] | null {
  const list: unknown[] = Array.isArray(raw) ? raw : [raw];
  if (list.length !== ORDINABILI.length || !list.every(isOrdinabile)) return null;
  return new Set(list).size === list.length ? list : null;
}

export type Verso = 'su' | 'giu';

/** Бутонът „нагоре/надолу“ на раздел: „funi:su“ — иначе null. */
export function parseMossa(raw: unknown): { key: SectionKey; verso: Verso } | null {
  if (typeof raw !== 'string') return null;
  const [key, verso] = raw.split(':');
  if (!isOrdinabile(key) || (verso !== 'su' && verso !== 'giu')) return null;
  return { key, verso };
}

/** Една стъпка нагоре или надолу; на ръба — без промяна. */
export function sposta(ordine: readonly SectionKey[], key: SectionKey, verso: Verso): SectionKey[] {
  const out = [...ordine];
  const from = out.indexOf(key);
  const to = verso === 'su' ? from - 1 : from + 1;
  const other = out[to];
  if (from < 0 || other === undefined) return out;
  out[to] = key;
  out[from] = other;
  return out;
}

/**
 * Разделите на листа (печат и PDF): без идентификацията — тя е в заглавната лента и в табелата — и без
 * изключените в картата (изборът в края на формата, `sezioniEscluse`).
 */
export function sezioniStampate<T extends { key: SectionKey }>(
  sections: readonly T[],
  escluse: readonly string[],
): T[] {
  return sections.filter(
    (section) => !FISSE.includes(section.key) && !escluse.includes(section.key),
  );
}
