// Sheet 1's labels, written in capitals, as the relazioni write them (round 37): in lower case, the designations kept as
// the sheets and the plans name them — the bearings R1…Rn and the loads P1…P9, the makers' codes (XTE0517, SH130G), the
// steel profiles' families (HEB, IPE, UPN…), the makers' names (SICOR, Montanari) and a dimension's symbol before its
// value (L 2400 mm). One rule for every relazione: the same tag on the sheet and in the text. Pure.
import { BRANDS } from '../catalog/machines';
import { PROFILES } from '@/shaft/profiles';

/** the profiles' families of the catalogue (IPE, HEA, HEB, UPN) */
const FAMILIES: ReadonlySet<string> = new Set(Object.keys(PROFILES).map((k) => k.split(' ')[0] ?? k));
/** the makers' names as their catalogue writes them, by their capitals */
const MAKERS: ReadonlyMap<string, string> = new Map(BRANDS.map((b) => [b.toUpperCase(), b]));
/** a tag: capitals then a digit (R4, P9, XTE0517, SH130G) */
const TAG = /^[A-Z]+\d[A-Z0-9]*$/;

/** One word of a label in capitals, as the text writes it; `next`: what follows it. */
function word(w: string, next: string): string {
  if (TAG.test(w) || FAMILIES.has(w)) return w;
  const maker = MAKERS.get(w);
  if (maker) return maker;
  // a dimension's symbol before its value (L 2400 mm)
  if (/^[A-Z]$/.test(w) && /^\s+\d/.test(next)) return w;
  return w.toLowerCase();
}

/** A label in capitals in lower case, its designations kept. */
export function lowerKeeping(upper: string): string {
  return upper.replace(/[\p{L}\p{N}]+/gu, (w, at: number, all: string) => word(w, all.slice(at + w.length)));
}

/** A label in capitals as a row of a relazione names it: its first letter a capital, its designations kept. */
export function labelCase(upper: string): string {
  const s = lowerKeeping(upper);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
