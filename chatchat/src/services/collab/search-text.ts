/**
 * Търсене в историята (FR-16) — чистите части: заявката към Postgres и откъсът с подчертаване.
 *
 * Заявката: думите (букви/цифри на всеки език) от въведеното, всяка като литерал в кавички —
 * операторите на to_tsquery (&, |, !, <->, :) от потребителя никога не стигат до парсера. Последната
 * дума е префикс (`:*`) — търсене „докато пишеш“. Конфигурацията `chatchat_search` (simple +
 * unaccent) прави сравнението без регистър и ударения — еднакво за it/en/bg и за кодове (E37, K1).
 *
 * Откъсът: сървърът връща ЧАСТИ `{ text, match }`, не HTML — UI ги слага като текстови възли
 * (<mark> за съвпаденията). Подчертаването е по същите думи, сгънати като в базата (без ударения
 * и регистър), с индекс към оригиналния текст — нищо от текста не се губи и не се добавя.
 */

export const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 64;
const WORD = /[\p{L}\p{N}]+/gu;

/** Думите от въведеното (уникални, до 8, всяка до 64 знака) в реда на въвеждане. */
export function searchTerms(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of raw.normalize('NFC').matchAll(WORD)) {
    const term = m[0].slice(0, MAX_TERM_LENGTH);
    const key = fold(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length === MAX_TERMS) break;
  }
  return out;
}

/** Текстът на to_tsquery: `'дума' & 'друга':*` — null, ако няма нито една дума. */
export function toTsQuery(terms: readonly string[]): string | null {
  if (terms.length === 0) return null;
  return terms
    .map((t, i) => `'${t.replace(/'/g, '')}'${i === terms.length - 1 ? ':*' : ''}`)
    .join(' & ');
}

/** Сгъване като в базата: малки букви, без диакритика (è→e, ё→е). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('und');
}

export interface SnippetPart {
  text: string;
  match: boolean;
}

/**
 * Сгънатият текст + индекс към оригинала (всеки сгънат знак сочи знака, от който е дошъл).
 * Сгъването е по ЗНАК (code point) — дължините на оригинала и сгънатото може да се разминават.
 */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const ch of text) {
    const f = fold(ch);
    folded += f;
    for (let i = 0; i < f.length; i += 1) origin.push(index);
    index += ch.length;
  }
  return { folded, origin };
}

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Срещанията на думите (начало на дума, като в базата; последната — и като префикс). */
function matches(text: string, terms: readonly string[]): Array<[number, number]> {
  const { folded, origin } = foldWithMap(text);
  const ranges: Array<[number, number]> = [];
  terms.forEach((term, i) => {
    const needle = fold(term);
    if (!needle) return;
    const prefix = i === terms.length - 1;
    for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + 1)) {
      if (isWordChar(folded[at - 1])) continue;
      const end = at + needle.length;
      if (!prefix && isWordChar(folded[end])) continue;
      // Цялата дума при префикс — подчертава се „E370“, не само „E37“.
      let stop = end;
      while (prefix && isWordChar(folded[stop])) stop += 1;
      const from = origin[at] ?? 0;
      const last = origin[stop - 1] ?? from;
      const lastChar = String.fromCodePoint(text.codePointAt(last) ?? 0);
      ranges.push([from, last + lastChar.length]);
    }
  });
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const prev = merged.at(-1);
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/**
 * Откъс около първото съвпадение (± `radius` знака, по граница на дума), като части. Без
 * съвпадение (напр. AI отговор, намерен по друга форма) — началото на текста, без подчертаване.
 */
export function snippetOf(text: string, terms: readonly string[], radius = 70): SnippetPart[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return [];
  const ranges = matches(flat, terms);
  const first = ranges[0];
  let start = first ? Math.max(0, first[0] - radius) : 0;
  let end = first ? Math.min(flat.length, first[1] + radius) : Math.min(flat.length, radius * 2);
  // До граница на дума (без да режем дума наполовина), и без да делим сурогатна двойка.
  while (start > 0 && isWordChar(flat[start - 1])) start -= 1;
  while (end < flat.length && isWordChar(flat[end])) end += 1;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(flat[start] ?? '')) start -= 1;
  if (end < flat.length && /[\uDC00-\uDFFF]/.test(flat[end] ?? '')) end += 1;
  const parts: SnippetPart[] = [];
  const push = (s: string, match: boolean) => {
    if (s) parts.push({ text: s, match });
  };
  if (start > 0) push('…', false);
  let at = start;
  for (const [from, to] of ranges) {
    if (to <= start || from >= end) continue;
    push(flat.slice(at, Math.max(at, from)), false);
    push(flat.slice(Math.max(at, from), Math.min(to, end)), true);
    at = Math.min(to, end);
  }
  push(flat.slice(at, end), false);
  if (end < flat.length) push('…', false);
  return parts;
}
