// The source of the entries read on the standards themselves: the official texts, read point by point on 2026-10-06
// (the index of what was read, without its content: research/norme-ascensori/README.md). Every company sees it, so it
// says what was read and where, not who supplied it.
import type { MachineStd } from './types';

/** «UNI EN 81-20:2020, testo della norma, letto il 2026-10-06, p. 74». */
export const letto = (sigla: string, pagine: string): string => `${sigla}, testo della norma, letto il 2026-10-06, ${pagine}`;

/** The clauses of UNI 10411 that admit a replacement's machine by its standard (UNI 10411-1:2024, 14.1 a) for one to UNI EN
 *  81-20, b) for one to UNI EN 81-1:2010; UNI 10411-11:2024, 14.1 for either): one place for the entries of the machine's
 *  checks keyed by its standard (rifStd). The relazione cites only the part of the test (report/refs.ts). */
export const MACCHINA_AMMESSA: Readonly<Record<MachineStd, string>> = {
  'en81-20': 'UNI 10411-1:2024, 14.1 a); UNI 10411-11:2024, 14.1',
  'en81-1': 'UNI 10411-1:2024, 14.1 b); UNI 10411-11:2024, 14.1',
};
