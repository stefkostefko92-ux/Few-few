/**
 * Нормализация на въпроса (§8.1 „context normalization“). Вади идентификатори за ТОЧНО
 * търсене (§8.2): кодове за грешка, клеми, референции на компоненти, версии. Един и същ вид
 * токен (E37, K1, X3) може да е код или компонент — кое е кое решава базата при точното търсене,
 * не догадка тук. Никакво размито съвпадение: E37 ≠ E38 ≠ E73 (§16.3).
 */

export interface NormalizedQuery {
  /** Текстът за пълнотекстовото търсене — без излишни интервали, до 1000 знака. */
  text: string;
  /** Главни букви, без разделител: „e 37“ → „E37“, „X-3“ → „X3“. */
  identifiers: string[];
  firmware: string | null;
  hardwareRevision: string | null;
}

/** Залепено („E37“, „e37“, „X3“) — всеки регистър. */
const ATTACHED = /\b([A-Za-z]{1,3})(\d{1,4})\b/g;
/**
 * С разделител („E 37“, „X-3“) — само с главни букви: иначе „tra 3 e 5 secondi“ или
 * „tensione di 230“ стават фалшиви кодове E5 / DI230.
 */
const SEPARATED = /\b([A-Z]{1,3})[\s-](\d{1,4})\b/g;
const FIRMWARE = /\b(?:fw|firmware|versione)\s*[:=]?\s*v?(\d+(?:\.\d+){1,3})\b/i;
const HW_REVISION = /\b(?:hw\s*)?rev(?:isione|ision)?\.?\s*[:=]?\s*([A-Za-z]|\d{1,2})\b/i;

/** Префикси, които приличат на идентификатор, но са мерни единици или думи. */
const NOT_IDENTIFIERS = new Set(['V', 'A', 'MA', 'KW', 'HZ', 'MM', 'CM', 'S', 'MS', 'FW', 'REV']);

/** Всички идентификатори в текст (въпрос или парче от документ), в канонична форма. */
export function extractIdentifiers(text: string, max = 200): string[] {
  const identifiers = new Set<string>();
  for (const match of [...text.matchAll(ATTACHED), ...text.matchAll(SEPARATED)]) {
    const prefix = (match[1] ?? '').toUpperCase();
    const digits = match[2] ?? '';
    if (NOT_IDENTIFIERS.has(prefix)) continue;
    identifiers.add(`${prefix}${digits}`);
    if (identifiers.size >= max) break;
  }
  // „S12“ е валиден компонент, но „S“ сам е и секунди: пазим го само ако е залепено („S12“).
  for (const match of text.matchAll(/\bS(\d{1,3})\b/g)) {
    if (identifiers.size >= max) break;
    identifiers.add(`S${match[1] ?? ''}`);
  }
  return [...identifiers];
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 1000);
  return {
    text,
    identifiers: extractIdentifiers(text, 20),
    firmware: FIRMWARE.exec(text)?.[1] ?? null,
    hardwareRevision: HW_REVISION.exec(text)?.[1]?.toUpperCase() ?? null,
  };
}

/** Канонична форма на идентификатор от базата/документите — същата като при въпроса. */
export function canonicalIdentifier(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}
