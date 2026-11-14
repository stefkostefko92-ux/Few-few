// Оператори (Прил. № 29, т. 6): уникален код, поне две имена, роля и период на активност.

/** Поне две имена — инициалите („И. И.“) не се броят. */
export function hasTwoNames(name: string): boolean {
  const names = name
    .trim()
    .split(/\s+/)
    .filter((t) => (t.match(/\p{L}/gu) ?? []).length >= 2);
  return names.length >= 2;
}
