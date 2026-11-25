import { scelto, SLOTS } from './registry.js';

/**
 * Проверките на пратената карта за модулите с втори избор (registry.ts — кой модул при коя марка): „Sì“
 * на въпроса, без който модулът няма кой лист да отвори. Викат се от проверката на картата (validation.ts).
 */

/**
 * „Sì“ на въпрос с модели, но без избран модел (Mastech без NG120 / QI Touch): няма кой модул да се
 * отвори — полетата на моделите, които липсват (празно — нищо не липсва).
 */
export function modelliMancanti(
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): string[] {
  const missing = new Set<string>();
  for (const s of SLOTS) {
    if (
      !s.modello ||
      !active.has(s.question) ||
      !active.has(s.modello.field) ||
      valueOf(s.question) !== 'si' ||
      (s.marca && valueOf(s.marca.field) !== s.marca.value)
    )
      continue;
    const chosen = valueOf(s.modello.field);
    if (typeof chosen !== 'string' || chosen === '') missing.add(s.modello.field);
  }
  return [...missing];
}

/**
 * „Sì“ на поръчката при марка, чийто модул зависи от вида на уредбата (Elettroquadri), но без отметнат
 * вид: няма кой модул да се отвори — полето на вида, иначе null.
 */
export function impiantoMancante(
  active: ReadonlySet<string>,
  valueOf: (key: string) => unknown,
): string | null {
  const slots = SLOTS.filter(
    (s) =>
      s.impianto &&
      active.has(s.question) &&
      valueOf(s.question) === 'si' &&
      (!s.marca || valueOf(s.marca.field) === s.marca.value),
  );
  const field = slots[0]?.impianto?.field;
  if (!field) return null;
  return slots.some((s) => s.impianto && scelto(valueOf(field), s.impianto.value)) ? null : field;
}
