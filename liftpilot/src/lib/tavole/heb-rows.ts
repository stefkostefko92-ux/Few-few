// The HEB beams on the shaft's walls on sheet 1 (src/shaft/heb.ts, registry locale.putrelle.vano): the two beams, their
// length and weight, and the largest force on one of their bearings in the walls, at the sheet's load. Pure.
import type { HebOption } from '@/shaft/heb';
import { PROFILES } from '@/shaft/profiles';

type Fmt = (x: number, dp: number) => string;

/** The rows of the sheet's analysis of the loads for the beams taken (none without them). */
export const hebRows = (o: HebOption | null, fmt: Fmt): (readonly [string, string, string])[] => (o ? [
  [`PUTRELLE ${o.profile} SUI MURI DEL VANO (DUE), L ${fmt(Math.round(o.length), 0)} mm`, fmt((2 * PROFILES[o.profile].mass * o.length) / 1000, 0), 'kg'],
  ['REAZIONE MASSIMA SU UN APPOGGIO NEL MURO DEL VANO', fmt(o.result.reaction / 10, 0), 'daN'],
] : []);
