// Which part of the acceptance test (src/lib/lift/collaudo.ts PARTI) a line of a bill belongs to, and whether the
// intervention counts it: a modification tested to UNI 10411 counts only the parts it replaces — the others stay, as
// sheet 1 writes them ESISTENTI —, a new lift (UNI EN 81-20/50) every one. Panev's articles by what they hold: the pairs
// A + B under the landing sills and over the landing doors carry the sill and the suspension (staffe-porte.ts), so they
// go with the landing doors; the supports and SG of the counterweight rails go with the rails. Pure, without the price
// list: the screens' Panev table counts with the same rule as the bill.
import type { BomRow, PanevBom } from '@/lib/catalog/panev';
import type { Collaudo, Parte } from '@/lib/lift/collaudo';

/** The part of the acceptance test a line belongs to; 'always': counted whatever the intervention replaces. */
export type BomPart = Parte | 'always';

/** A part the intervention leaves in place: a modification tested to UNI 10411 that does not replace it (a new lift,
 *  UNI EN 81-20/50: none) — the rule of sheet 1 (src/lib/tavole/data.ts). */
export const keptPart = (C: Collaudo, p: BomPart): boolean => p !== 'always' && C.norma !== 'en81' && !C.parti.includes(p);

/** The part a Panev row goes with: the landing doors' pairs with the landing doors, the counterweight rails' brackets
 *  with the rails. */
export const panevPart = (use: BomRow['use']): Parte => (use === 'door' ? 'landingDoors' : 'rails');

/** Panev's bill of a design `pb` (panevBom) as the intervention `C` counts it (none: every row, as a shaft design
 *  alone): the rows of the parts it replaces, and the counterweight rails' brackets no article takes only with the
 *  rails replaced. */
export function panevCounted(pb: PanevBom, C: Collaudo | null = null): PanevBom {
  if (!C) return pb;
  return { rows: pb.rows.filter((r) => !keptPart(C, panevPart(r.use))), missing: keptPart(C, 'rails') ? 0 : pb.missing };
}
