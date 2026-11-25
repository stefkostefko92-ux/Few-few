import { SEARCHABLE } from './fields.js';

/**
 * Търсачката: един и същ нормализатор за записа (`searchText`) и за заявката — малки букви, без
 * ударения („Città“ = „citta“), всичко освен букви и цифри става интервал. Затова в шаблона за LIKE
 * никога не стига `%`, `_` или `\` — те не са букви.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const MAX_QUERY_LENGTH = 100;
const MAX_TOKENS = 8;

/** Думите на заявката (всяка трябва да се намери някъде в схемата). */
export function queryTokens(query: string): string[] {
  const unique = new Set(normalizeSearch(query.slice(0, MAX_QUERY_LENGTH)).split(' '));
  return [...unique].filter(Boolean).slice(0, MAX_TOKENS);
}

type SearchSource = Partial<Record<(typeof SEARCHABLE)[number], string | null>>;

/** Текстът за търсене на една схема — пише го само услугата при създаване и промяна. */
export function searchTextOf(scheda: SearchSource): string {
  return SEARCHABLE.map((key) => normalizeSearch(scheda[key] ?? ''))
    .filter(Boolean)
    .join(' ');
}

/** `%`, `_` и `\` от суровата заявка — буквално, за сравнението по префикс на номерата. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Отбелязва думите от заявката в показания текст, без ударенията да пречат („citta“ огражда „Città“).
 * Връща парчета — шаблонът ги изписва с екраниране, затова тук HTML няма.
 */
export function highlight(text: string | null | undefined, tokens: readonly string[]): Segment[] {
  if (!text) return [];
  const useful = tokens.filter((token) => token.length >= 2);
  if (useful.length === 0) return [{ text, hit: false }];
  // Нормализираният низ знак по знак, с карта към позицията в оригинала.
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const norm = char
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase();
    for (let i = 0; i < norm.length; i += 1) origin.push(index);
    folded += norm;
    index += char.length;
  }
  const marks = new Array<boolean>(text.length).fill(false);
  for (const token of useful) {
    let from = folded.indexOf(token);
    while (from !== -1) {
      const start = origin[from]!;
      const lastOrigin = origin[from + token.length - 1]!;
      const end = lastOrigin + (text.codePointAt(lastOrigin)! > 0xffff ? 2 : 1);
      for (let i = start; i < end; i += 1) marks[i] = true;
      from = folded.indexOf(token, from + token.length);
    }
  }
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const hit = marks[i]!;
    const last = segments[segments.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else segments.push({ text: text[i]!, hit });
  }
  return segments;
}
