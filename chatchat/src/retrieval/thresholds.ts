/**
 * Праговете на търсенето (§8.3) на едно място — retrieve.ts, levels.ts и хранилището ги четат
 * оттук. Промяна → нов GATE_VERSION (`safety/version.ts`) и прогон на оценъчния набор (evals/).
 */

export const MAX_PACK = 12;
export const DEFAULT_FULLTEXT_LIMIT = 8;
export const DEFAULT_SEMANTIC_LIMIT = 6;
/** Несъвместимото не изчезва (за да се види конфликтът), но пада под всяко съвместимо. */
export const NOT_APPLICABLE_FACTOR = 0.3;
/** Константата на RRF (Cormack, Clarke, Büttcher 2009): fused = Σ 1 / (k + ранг). */
export const RRF_K = 60;
/**
 * Под това косинусово сходство семантичният резултат е шум: най-близък съсед има винаги, а без
 * праг „нищо съвместимо“ (AC-04) никога не би настъпило. Прилага се и в SQL, и тук (защита в
 * дълбочина).
 */
export const SEMANTIC_MIN_SIMILARITY = 0.6;
/**
 * От това сходство нагоре семантичен източник ПОТВЪРЖДАВА лексикален за ниво „high“ (§8.3);
 * сам по себе си не стига (виж evidenceLevel).
 */
export const SEMANTIC_HIGH_SIMILARITY = 0.8;
/** Лексикалната релевантност, от която документ брои за „high“ (както преди семантичното). */
export const LEXICAL_SUPPORT_SCORE = 0.35;
/** Пълнотекстовото съвпадение тежи 0.7 × дял от най-високия ранг (`baseScore`). */
export const FULLTEXT_WEIGHT = 0.7;
