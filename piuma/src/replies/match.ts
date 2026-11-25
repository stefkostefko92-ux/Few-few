import type { CommentEvent } from './events.js';

/** Ключовата дума: 2–30 знака, само букви, цифри и тире (PR8). */
const KEYWORD = /^[\p{L}\p{N}-]{2,30}$/u;
/** Думите в коментара — всичко друго е разделител. */
const TOKEN = /[\p{L}\p{N}-]+/gu;

const normalize = (text: string): string => text.normalize('NFKC').toLocaleLowerCase('und');

export function normalizeKeyword(raw: string): string | null {
  const keyword = normalize(raw).trim();
  return KEYWORD.test(keyword) ? keyword : null;
}

export function tokenize(text: string): string[] {
  return normalize(text).match(TOKEN) ?? [];
}

export interface RuleCandidate {
  id: string;
  keyword: string;
  /** Публикацията, която обявява думата — правило без медия няма (ЗЕС чл. 261, ал. 1). */
  mediaId: string;
  createdAt: Date;
}

/**
 * Най-много едно правило на коментар (PR9): само правило за СЪЩАТА медия, после по-дългата
 * дума, после по-старото. Подава се само списъкът АКТИВНИ правила на акаунта.
 */
export function matchRule<T extends RuleCandidate>(
  rules: readonly T[],
  event: Pick<CommentEvent, 'text' | 'mediaId'>,
): T | null {
  const words = new Set(tokenize(event.text));
  if (!event.mediaId) return null;
  const hits = rules.filter((rule) => rule.mediaId === event.mediaId && words.has(rule.keyword));
  hits.sort(
    (a, b) => b.keyword.length - a.keyword.length || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return hits[0] ?? null;
}
