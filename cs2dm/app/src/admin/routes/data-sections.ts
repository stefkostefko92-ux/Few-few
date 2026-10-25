import type { Prisma } from '@prisma/client';

/**
 * Разделите на „Всичко, което пазим за играча“ (`player-data.ts`): суровите редове с имената на колоните в базата.
 */
export type Cell = string | number | bigint | boolean | Date | null | Prisma.JsonValue;

export interface DataSection {
  id: string;
  /** Общият брой, ако показваме само последните (иначе = редовете). */
  total: number;
  columns: string[];
  rows: Cell[][];
}

export const LIMIT = 200;

/** camelCase (Prisma) → snake_case (колоната в базата). */
export function columnName(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

export function section<T extends object>(
  id: string,
  rows: T[],
  keys: Array<keyof T & string>,
  total = rows.length,
): DataSection {
  return {
    id,
    total,
    columns: keys.map(columnName),
    rows: rows.map((row) => keys.map((key) => row[key] as Cell)),
  };
}
