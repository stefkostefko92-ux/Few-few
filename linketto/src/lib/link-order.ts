// Подреждане на блоковете на профила — чисти функции (тестват се без база).
// Позицията на блок = индексът му в подредения списък (0..n-1).

/** Горна граница: защита от огромен вход към действието (профил има много по-малко блокове). */
export const MAX_BLOCKS = 500;

/** Мести `id` с едно нагоре/надолу. null = нищо за местене (ръб или непознат id). */
export function moveInOrder(ids: readonly string[], id: string, dir: 'up' | 'down'): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = dir === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Новият ред от клиента е валиден само ако е ТОЧНО същото множество блокове на профила
 * (без чужди, липсващи или дублирани id). Връща реда или null.
 */
export function validReorder(current: readonly string[], ordered: readonly unknown[]): string[] | null {
  if (ordered.length !== current.length || ordered.length > MAX_BLOCKS) return null;
  if (!ordered.every((value): value is string => typeof value === 'string')) return null;
  const set = new Set(ordered);
  if (set.size !== ordered.length) return null;
  for (const id of current) if (!set.has(id)) return null;
  return [...ordered];
}
