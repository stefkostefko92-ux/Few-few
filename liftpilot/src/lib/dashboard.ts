// The dashboard's figures and the shell's small helpers, pure: the search words of the top bar's field, the counts of
// the company's active installations by their type of intervention and by the result of their latest record, the
// filters by type, the initials on the avatar. The queries are in src/server/dashboard.ts and project-list.ts; nothing
// here reads the database.
import type { TipoIntervento } from '@/lib/lift/intervento';
import { searchQuery } from '@/lib/search-query';

/** The list's filters by type of intervention (round 45, ?tipo=): the three types and the installations without a
 *  «Calcolo argano» yet («Da definire»). */
export const TIPI_FILTRO = ['solo-argano', 'ammodernamento', 'trasformazione-completa', 'da-definire'] as const;
export type TipoFiltro = (typeof TIPI_FILTRO)[number];
const TIPO_DI_FILTRO: Readonly<Record<TipoFiltro, TipoIntervento | null>> = {
  'solo-argano': 'SOLO_ARGANO', ammodernamento: 'AMMODERNAMENTO', 'trasformazione-completa': 'TRASFORMAZIONE_COMPLETA', 'da-definire': null,
};
/** The filter of an address (?tipo=), null for none or an unknown one (an old ?kind= is not one). */
export const tipoFiltroOf = (slug: unknown): TipoFiltro | null => (TIPI_FILTRO.find((t) => t === slug) ?? null);
/** The installations of a filter among the types read (project-list.ts tipiImpianti). */
export const idsDelTipo = (tipi: ReadonlyMap<string, TipoIntervento | null>, f: TipoFiltro): string[] =>
  [...tipi].filter(([, t]) => t === TIPO_DI_FILTRO[f]).map(([id]) => id);

/** At most this many characters and words of a search are used: a longer one is cut, never refused. */
export const SEARCH_MAX_CHARS = 80;
export const SEARCH_MAX_WORDS = 5;

/** The words of the top bar's search (`?q=`): without control characters (search-query.ts), trimmed, cut to 80
 *  characters and 5 words; each must be found. */
export function searchWords(q: unknown): string[] {
  return searchQuery(q).slice(0, SEARCH_MAX_CHARS).trim().split(/\s+/u).filter(Boolean).slice(0, SEARCH_MAX_WORDS);
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
  /** the type of intervention (round 45; null — no calculation yet) */
  tipo: TipoIntervento | null;
  latest: LatestResult | null;
}

/** What the dashboard's tiles count among the active installations: how many, by type of intervention, without a saved
 *  result yet, whose latest result does not pass or passes with warnings, whose latest result the engines no longer
 *  reproduce, and the installations to review — any of the three (one installation counted once). */
export interface ProjectStats {
  active: number;
  soloArgano: number;
  ammodernamento: number;
  trasformazione: number;
  daDefinire: number;
  noResult: number;
  fail: number;
  warn: number;
  outdated: number;
  review: number;
}

export function projectStats(rows: readonly ProjectRow[]): ProjectStats {
  const s: ProjectStats = { active: rows.length, soloArgano: 0, ammodernamento: 0, trasformazione: 0, daDefinire: 0, noResult: 0, fail: 0, warn: 0, outdated: 0, review: 0 };
  for (const r of rows) {
    if (r.tipo === 'SOLO_ARGANO') s.soloArgano++;
    else if (r.tipo === 'AMMODERNAMENTO') s.ammodernamento++;
    else if (r.tipo === 'TRASFORMAZIONE_COMPLETA') s.trasformazione++;
    else s.daDefinire++;
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

/** The pages of an installation's records: in the sidebar they belong to the installations. */
const RECORD_PAGES = ['/app/projects/', '/app/calculations/', '/app/lift-designs/', '/app/shaft-designs/', '/app/room-designs/', '/app/drawing-sets/'];

/** Which entry of the sidebar the page is (its key: `rilievi` — the home and the survey sheets —, `impianti`, `archived`,
 *  `new` — the new installation —, or the path of a section such as `/app/norme`); null for a page none of them names. */
export function shellSection(pathname: string, search: { archived: boolean }, sections: readonly string[]): string | null {
  if (pathname === '/app' || pathname === '/app/rilievi' || pathname.startsWith('/app/rilievi/')) return 'rilievi';
  if (pathname === '/app/impianti') return search.archived ? 'archived' : 'impianti';
  if (pathname === '/app/projects/new') return 'new';
  if (RECORD_PAGES.some((p) => pathname.startsWith(p))) return 'impianti';
  return sections.find((s) => pathname === s || pathname.startsWith(`${s}/`)) ?? null;
}

/** The sidebar entry's aria-current: `page` when the address is the entry's own page, `true` when the page only belongs
 *  to it (an installation's record under «Impianti», a survey sheet under «Rilievi», a sub-page of a section). */
export function navCurrent(key: string, pathname: string): 'page' | 'true' {
  if (key === 'rilievi') return pathname === '/app' ? 'page' : 'true';
  if (key === 'impianti' || key === 'archived') return pathname === '/app/impianti' ? 'page' : 'true';
  if (key.startsWith('/')) return pathname === key ? 'page' : 'true';
  return 'page';
}
