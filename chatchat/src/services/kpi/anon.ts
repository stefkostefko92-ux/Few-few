/**
 * k-анонимност на KPI (§16.1): числото не бива да стане средство за наблюдение на отделен служител
 * (чл. 4 Statuto dei Lavoratori — същото основание като скриването на входовете в одита). Клетка с
 * 1…4 случая се показва като „<5“; дял със скрит числител или знаменател под 5 няма стойност.
 * Нулата се показва — „0 нарушения“ е самата цел на метриката, не издава човек.
 */

export const K_MIN = 5;
export const SUPPRESSED = '<5' as const;

/** Брой или „<5“. */
export type Cell = number | typeof SUPPRESSED;

/** Дял: числител/знаменател като клетки и стойност 0…1 (null — скрит или без знаменател). */
export interface Rate {
  num: Cell;
  den: Cell;
  value: number | null;
}

const small = (n: number): boolean => n > 0 && n < K_MIN;

export function cell(n: number): Cell {
  return small(n) ? SUPPRESSED : n;
}

/** Четири знака след запетаята — достатъчно за проценти с един знак, без фалшива точност. */
const round4 = (x: number): number => Math.round(x * 10000) / 10000;

/** `num` може да е клетка от `partition` — скритата остава скрита. */
export function rate(num: Cell, den: number): Rate {
  const n = typeof num === 'number' ? cell(num) : num;
  const d = cell(den);
  const value = n === SUPPRESSED || d === SUPPRESSED || den === 0 ? null : round4(n / den);
  return { num: n, den: d, value };
}

/** Сборът на скритите клетки се извежда като „общо − показаните“; еднозначен ли е разказът? */
function decomposable(hidden: number[]): boolean {
  if (hidden.length === 1) return true;
  const sum = hidden.reduce((a, b) => a + b, 0);
  const maxEach = Math.max(...hidden);
  // Всички скрити са 1…4: сбор = брой (всички по 1) или 4×брой (всички по 4) дава точните стойности.
  return maxEach < K_MIN && (sum === hidden.length || sum === (K_MIN - 1) * hidden.length);
}

/**
 * Разбивка на едно цяло (нива на доказателства, оценки, ескалация по източник, кофи във времето):
 * първо малките клетки, после вторично скриване — щом цялото е показано, една скрита клетка (или
 * еднозначен сбор) се изчислява като разлика, затова скриваме и най-малката видима ненулева,
 * докато разликата престане да е еднозначна.
 */
export function partition<K extends string>(counts: Record<K, number>): Record<K, Cell> {
  const keys = Object.keys(counts) as K[];
  const hidden = new Set<K>(keys.filter((k) => small(counts[k])));
  while (hidden.size > 0 && decomposable([...hidden].map((k) => counts[k]))) {
    const next = keys
      .filter((k) => !hidden.has(k) && counts[k] > 0)
      .sort((a, b) => counts[a] - counts[b])[0];
    if (next === undefined) break;
    hidden.add(next);
  }
  const out = {} as Record<K, Cell>;
  for (const k of keys) out[k] = hidden.has(k) ? SUPPRESSED : counts[k];
  return out;
}
