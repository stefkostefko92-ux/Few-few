// The search: one normaliser for the record (`searchText`) and for the query — lower case, no accents ("Città" =
// "citta"), everything but letters and digits becomes a space. So `%`, `_` or `\` never reach the LIKE pattern — they
// are not letters. Ported 1:1 from rilievi (src/schede/search.ts).
import { SEARCHABLE } from './fields';

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

/** The words of the query (each must be found somewhere in the sheet). */
export function queryTokens(query: string): string[] {
  const unique = new Set(normalizeSearch(query.slice(0, MAX_QUERY_LENGTH)).split(' '));
  return [...unique].filter(Boolean).slice(0, MAX_TOKENS);
}

type SearchSource = Partial<Record<(typeof SEARCHABLE)[number], string | null>>;

/** The search text of one sheet — written only by the service when a sheet is created or changed. */
export function searchTextOf(scheda: SearchSource): string {
  return SEARCHABLE.map((key) => normalizeSearch(scheda[key] ?? ''))
    .filter(Boolean)
    .join(' ');
}

/** `%`, `_` and `\` of the raw query — literally, for the prefix match of the numbers. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Marks the query's words in the shown text, the accents not in the way ("citta" marks "Città"). Returns pieces — the
 * page writes them escaped (a hit in <mark>), so there is no HTML here.
 */
export function highlight(text: string | null | undefined, tokens: readonly string[]): Segment[] {
  if (!text) return [];
  const useful = tokens.filter((token) => token.length >= 2);
  if (useful.length === 0) return [{ text, hit: false }];
  // The normalised string character by character, with a map to the position in the original.
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const norm = char.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
    for (let i = 0; i < norm.length; i += 1) origin.push(index);
    folded += norm;
    index += char.length;
  }
  const marks = new Array<boolean>(text.length).fill(false);
  for (const token of useful) {
    let from = folded.indexOf(token);
    while (from !== -1) {
      const start = origin[from] ?? 0;
      const lastOrigin = origin[from + token.length - 1] ?? 0;
      const end = lastOrigin + ((text.codePointAt(lastOrigin) ?? 0) > 0xffff ? 2 : 1);
      for (let i = start; i < end; i += 1) marks[i] = true;
      from = folded.indexOf(token, from + token.length);
    }
  }
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const hit = marks[i] === true;
    const last = segments[segments.length - 1];
    if (last && last.hit === hit) last.text += text.charAt(i);
    else segments.push({ text: text.charAt(i), hit });
  }
  return segments;
}
