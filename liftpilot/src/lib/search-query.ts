// What a search box sends (`?q=`, the Rilievi list, the top bar, the installations, the link of a survey to its
// installation): the text as typed, without control characters. A NUL byte reaches PostgreSQL as an invalid string and
// fails the query (a 500 instead of an empty list); tabs, line breaks and the other C0/C1 controls are never part of what
// anyone searches for — each becomes a space, so the words around it stay apart. Every search page reads its query
// through here before anything reaches Prisma.

/** The control characters (Unicode Cc: C0, DEL and C1). */
const CONTROLS = /\p{Cc}/gu;

/** The search text of a query parameter: a string without control characters ('' for anything that is not a string —
 *  a repeated `?q=` comes as an array and searches nothing). */
export function searchQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(CONTROLS, ' ') : '';
}
