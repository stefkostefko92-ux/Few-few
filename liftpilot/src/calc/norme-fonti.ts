// The source of the entries read on the standards themselves: the official texts, read point by point on 2026-10-06
// (the index of what was read, without its content: research/norme-ascensori/README.md). Every company sees it, so it
// says what was read and where, not who supplied it.

/** «UNI EN 81-20:2020, testo della norma, letto il 2026-10-06, p. 74». */
export const letto = (sigla: string, pagine: string): string => `${sigla}, testo della norma, letto il 2026-10-06, ${pagine}`;
