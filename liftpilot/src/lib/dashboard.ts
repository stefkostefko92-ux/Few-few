// The dashboard's figures and the shell's small helpers, pure: the search words of the top bar's field, the counts of
// the company's active installations by the result of their latest record, the initials on the avatar. The queries
// are in src/server/dashboard.ts; nothing here reads the database.
import type { ProjectKind } from '@/lib/schemas';

/** At most this many characters and words of a search are used: a longer one is cut, never refused. */
export const SEARCH_MAX_CHARS = 80;
export const SEARCH_MAX_WORDS = 5;

/** The words of the top bar's search (`?q=`): trimmed, cut to 80 characters and 5 words; each must be found. */
export function searchWords(q: unknown): string[] {
  if (typeof q !== 'string') return [];
  return q.slice(0, SEARCH_MAX_CHARS).trim().split(/\s+/u).filter(Boolean).slice(0, SEARCH_MAX_WORDS);
}

/** A searched word as the text it is inside a LIKE pattern (Prisma's `contains` does not escape): `%` and `_` are
 *  themselves, not wildcards, and the escape character `\` (PostgreSQL's default) is itself too — «MI_2291» or «50%»
 *  find those plants only. */
export function likeEscape(word: string): string {
  return word.replace(/[\\%_]/gu, '\\$&');
}

/** The rows of the dashboard's list (the latest changed): the rest behind «show all». */
export const DASH_ROWS = 10;
/** The rows of «show all»: beyond them the search finds the rest (the list says so). */
export const ALL_ROWS = 500;

/** The latest record of an installation as the list reads it: its verdict and whether the engines moved on since. */
export interface LatestResult {
  verdict: 'OK' | 'WARN' | 'FAIL';
  old: boolean;
}

export interface ProjectRow {
  kind: ProjectKind;
  latest: LatestResult | null;
}

/** What the dashboard's tiles count among the active installations: how many, by module, without a saved result yet,
 *  whose latest result does not pass or passes with warnings, whose latest result the engines no longer reproduce, and
 *  the installations to review — any of the three (one installation counted once). */
export interface ProjectStats {
  active: number;
  replacement: number;
  full: number;
  noResult: number;
  fail: number;
  warn: number;
  outdated: number;
  review: number;
}

export function projectStats(rows: readonly ProjectRow[]): ProjectStats {
  const s: ProjectStats = { active: rows.length, replacement: 0, full: 0, noResult: 0, fail: 0, warn: 0, outdated: 0, review: 0 };
  for (const r of rows) {
    if (r.kind === 'REPLACEMENT') s.replacement++;
    else s.full++;
    if (!r.latest) s.noResult++;
    else {
      if (r.latest.verdict === 'FAIL') s.fail++;
      else if (r.latest.verdict === 'WARN') s.warn++;
      if (r.latest.old) s.outdated++;
    }
    if (!r.latest || r.latest.verdict === 'FAIL' || r.latest.old) s.review++;
  }
  return s;
}

/** Up to two initials of a name (its first two words), in capitals, whatever the script. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = (w: string | undefined): string => (w ? Array.from(w)[0] ?? '' : '');
  return (first(words[0]) + first(words.length > 1 ? words[words.length - 1] : undefined)).toLocaleUpperCase() || '?';
}

/** The pages of an installation's records: in the sidebar they belong to the dashboard, where the installations are. */
const RECORD_PAGES = ['/app/projects/', '/app/calculations/', '/app/lift-designs/', '/app/shaft-designs/', '/app/room-designs/', '/app/drawing-sets/'];

/** Which entry of the sidebar the page is (its key: `dashboard`, `archived`, `new-replacement`, `new-full`, or the path
 *  of a section such as `/app/norme`); null for a page none of them names (the chooser of a new installation). */
export function shellSection(pathname: string, search: { archived: boolean; kind: string | null }, sections: readonly string[]): string | null {
  if (pathname === '/app') return search.archived ? 'archived' : 'dashboard';
  if (pathname === '/app/projects/new') return search.kind === 'replacement' ? 'new-replacement' : search.kind === 'full' ? 'new-full' : null;
  if (RECORD_PAGES.some((p) => pathname.startsWith(p))) return 'dashboard';
  return sections.find((s) => pathname === s || pathname.startsWith(`${s}/`)) ?? null;
}

/** The sidebar entry's aria-current: `page` when the address is the entry's own page, `true` when the page only belongs
 *  to it (an installation's record under «Dashboard», a sub-page of a section) — a reader is not told it is on «Dashboard». */
export function navCurrent(key: string, pathname: string): 'page' | 'true' {
  if (key === 'dashboard' || key === 'archived') return pathname === '/app' ? 'page' : 'true';
  if (key.startsWith('/')) return pathname === key ? 'page' : 'true';
  return 'page';
}
