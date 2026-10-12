/**
 * Строителните блокове на шаблоните (Unicode, сгънат текст): разделители, италианските членове,
 * „глагол до N думи до обект“. Ползват ги terms.ts (данните) и lexicon.ts (правилата).
 */

export const alt = (list: readonly string[]): string => list.join('|');

/** Разделител между думи в едно изречение: точка, запетая, „;“, „:“ и нов ред го прекъсват. */
export const SEP = String.raw`[^\p{L}\p{N}.,;:!?\n]+`;
export const TOK = String.raw`[\p{L}\p{N}]+`;
/** Интервал и член/предлог между съществителните в италианските словосъчетания („contatto della porta“). */
export const DI = String.raw`[ ']+(?:(?:di|del|dello|della|dei|degli|delle|dell|d|in|nel|nella|nei|nelle|nell|sul|sulla|sui|sulle|sull|al|alla|ai|alle|all)[ ']+)?`;
/** Обектът не броим, ако е след „с/con/with“ — „disattivare l'impianto con lo stop“ не е мост. */
export const NOT_INSTRUMENT = String.raw`(?<!(?:^|[^\p{L}\p{N}])(?:con|col|coi|per|with|using|via|for|tramite|mediante|със|с|чрез)(?:${SEP}(?:il|lo|la|le|i|gli|l|un|una|uno|the|a|an))?${SEP})`;

/** Глагол, до `gap` думи, обект — в едно изречение. */
export function near(
  verbs: readonly string[],
  objects: readonly string[],
  gap: number,
  guardObject = false,
): string {
  return String.raw`(?:${alt(verbs)})(?:${SEP}${TOK}){0,${gap}}${SEP}${guardObject ? NOT_INSTRUMENT : ''}(?:${alt(objects)})`;
}

/** Обект, до `gap` думи, причастие („il contatto porta va escluso“). */
export function after(
  objects: readonly string[],
  participles: readonly string[],
  gap: number,
): string {
  return String.raw`(?:${alt(objects)})(?:${SEP}${TOK}){0,${gap}}${SEP}(?:${alt(participles)})`;
}
