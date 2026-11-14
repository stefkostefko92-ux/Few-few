import type { Request } from 'express';
import { ID } from '../ids.js';

/**
 * Страниране по ключ (keyset): редът е по поле + id, курсорът е двойката на последния показан ред.
 * Без OFFSET — нов документ отгоре не измества страницата и не дублира/губи редове (CLAUDE.md, API).
 * Курсорът е base64url на `[ключ, id]`; всичко друго в адреса се отказва тихо (първа страница).
 */
export const PAGE_SIZE = 50;
const MAX_CURSOR = 800;

export type Cursor = { key: string; id: string };
export type Page<T> = { items: T[]; next: string | null };
type Direction = 'asc' | 'desc';

export function readCursor(value: unknown): Cursor | null {
  if (typeof value !== 'string' || value.length > MAX_CURSOR || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      parsed[0].length <= 300 &&
      ID.test(parsed[1])
    ) {
      return { key: parsed[0], id: parsed[1] };
    }
  } catch {
    // Повреден курсор — първата страница.
  }
  return null;
}

export function writeCursor(key: string, id: string): string {
  return Buffer.from(JSON.stringify([key, id]), 'utf8').toString('base64url');
}

function cursorDate(cursor: Cursor): Date | null {
  if (!/^\d{1,15}$/.test(cursor.key)) return null;
  const date = new Date(Number(cursor.key));
  return Number.isNaN(date.getTime()) ? null : date;
}

const beyond = (direction: Direction) => (direction === 'desc' ? 'lt' : 'gt');

/** Условието „след курсора“ при подредба по поле-дата и id в същата посока. */
export function afterDate<F extends string>(field: F, cursor: Cursor | null, direction: Direction) {
  const at = cursor ? cursorDate(cursor) : null;
  if (!cursor || !at) return {};
  const op = beyond(direction);
  return {
    OR: [
      { [field]: { [op]: at } } as Record<F, Record<typeof op, Date>>,
      { [field]: at, id: { [op]: cursor.id } } as Record<F, Date> & {
        id: Record<typeof op, string>;
      },
    ],
  };
}

/** Същото при подредба по текстово поле (име) — сравнението е в базата, със същата подредба. */
export function afterText<F extends string>(field: F, cursor: Cursor | null, direction: Direction) {
  if (!cursor) return {};
  const op = beyond(direction);
  return {
    OR: [
      { [field]: { [op]: cursor.key } } as Record<F, Record<typeof op, string>>,
      { [field]: cursor.key, id: { [op]: cursor.id } } as Record<F, string> & {
        id: Record<typeof op, string>;
      },
    ],
  };
}

/** Редовете са взети с `take: size + 1` — излишният казва, че има следваща страница. */
export function pageOf<T extends { id: string }>(
  rows: T[],
  size: number,
  keyOf: (row: T) => string | Date,
): Page<T> {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  if (rows.length <= size || !last) return { items, next: null };
  const key = keyOf(last);
  return { items, next: writeCursor(key instanceof Date ? String(key.getTime()) : key, last.id) };
}

export type PagerLinks = { next: string | null; first: string | null };

/**
 * Връзките „По-стари“ и „Към началото“: пазят филтрите и курсорите на другите списъци на страницата
 * (`keep`), сменят само своя параметър.
 */
export function pagerLinks(
  req: Request,
  path: string,
  param: string,
  keep: readonly string[],
  next: string | null,
): PagerLinks {
  const base = new URLSearchParams();
  for (const name of keep) {
    const value = req.query[name];
    if (name !== param && typeof value === 'string' && value !== '' && value.length <= MAX_CURSOR) {
      base.set(name, value);
    }
  }
  const href = (cursor: string | null) => {
    const query = new URLSearchParams(base);
    if (cursor) query.set(param, cursor);
    const text = query.toString();
    return text ? `${path}?${text}` : path;
  };
  return {
    next: next ? href(next) : null,
    first: readCursor(req.query[param]) ? href(null) : null,
  };
}
