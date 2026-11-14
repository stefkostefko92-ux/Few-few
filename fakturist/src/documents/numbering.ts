/**
 * Номерацията по чл. 114, ал. 1, т. 2 ЗДДС: десетразряден номер, само арабски цифри, по една или повече
 * серии. Серията е непрекъснат диапазон [rangeStart, rangeEnd]; номерът се взема в транзакцията на
 * издаването (src/documents/issue.ts) — rollback връща номера, затова пропуски няма.
 */
export const MAX_NUMBER = 9_999_999_999n;

export function formatNumber(value: bigint): string {
  if (value < 1n || value > MAX_NUMBER) throw new Error('Номерът е извън десетразрядния диапазон');
  return value.toString().padStart(10, '0');
}

export interface SeriesRange {
  rangeStart: bigint;
  rangeEnd: bigint;
}

/** Валиден диапазон: в 1…9 999 999 999 и началото не е след края. */
export function isValidRange(range: SeriesRange): boolean {
  return (
    range.rangeStart >= 1n && range.rangeEnd <= MAX_NUMBER && range.rangeStart <= range.rangeEnd
  );
}

/** Две серии на една фирма не могат да се застъпват — иначе един номер може да излезе два пъти. */
export function overlaps(a: SeriesRange, b: SeriesRange): boolean {
  return a.rangeStart <= b.rangeEnd && b.rangeStart <= a.rangeEnd;
}
