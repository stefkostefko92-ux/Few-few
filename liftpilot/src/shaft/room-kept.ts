// The machine the intervention keeps, on its existing base (round 46, B8; registry locale.basamento.esistente; UNI
// 10411-1:2024 9.1–9.2 and 5, UNI 10411-11:2024 9.2 and 5): the room's drawings show the existing machine where the
// calculation's L0 puts its sheave's axis (src/lib/lift/kept.ts), over a hatched block — its base as it is, position,
// height and bearings to be surveyed — with no new support, mounts, HEB beams or lifting hook; the existing diverting
// pulley without a frame or stand; the slab's openings existing (dashed, «FORO ESISTENTE», no upstands). Nothing is
// checked on the base: whether it carries a greater load or speed is the building's owner's to prove (point 5). The
// words are the drawing's, the type of the intervention names the sheets (round 45). Model entities; pure.
import { chain, path, rect, type Entity, type Pt } from '../drawing';
import type { MachineSpec, RoomGeo } from './machine-room';
import type { RoomInputs } from './room';
import { ownAxis, supportOf } from './support';

/** The name the drawings give the existing base, with what is to be surveyed. */
export const KEPT_BASE_NOTE = 'BASAMENTO ESISTENTE — DA RILEVARE: POSIZIONE, ALTEZZA E APPOGGI';
/** The name of an existing opening of the slab. */
export const KEPT_HOLE = 'FORO ESISTENTE';

/** The machine stands on its existing base: the room's support is the kept machine's (kept.ts). */
export const onKeptBase = (R: RoomInputs | null | undefined, M: Pick<MachineSpec, 'Dp'>): boolean => supportOf(R ?? null, M.Dp > 0).kind === 'esistente';

/** The base's top over the room's floor: the sheave's axis less the machine's own height (never under the floor) [mm]. */
export const keptBaseTop = (M: MachineSpec): number => Math.max(0, M.axis - ownAxis(M.D, M.shape ?? null) - (M.base ?? 0));

/** Section B-B: the existing base under the machine's bedframe, hatched from the floor to the machine's underside, and
 *  its height beside it — read from the calculation's L0, not an input of the drawing. */
export function keptBaseSection(M: MachineSpec, G: RoomGeo, sk = 1): Entity[] {
  const top = keptBaseTop(M);
  if (top < 0.5) return [];
  return [rect(G.frame0, 0, G.frame1, top, 'outline', 'concrete'),
    chain({ dir: 'y', pts: [0, top], at: G.frame1 + 220 * sk, from: [G.frame1, G.frame1], text: ['{v} Basamento esistente'] })];
}

/** Plan: the existing base's outline under the machine, dashed (where it is and how big are to be surveyed). */
export const keptBasePlan = (G: RoomGeo, onDrop: (u: number, v: number) => Pt): Entity[] =>
  [path([onDrop(G.frame0, G.across[0]), onDrop(G.frame1, G.across[0]), onDrop(G.frame1, G.across[1]), onDrop(G.frame0, G.across[1])], true, 'hidden')];

/** The words of the mounts' note on the existing base: section B-B's two lines and the relazione's sentence. */
export const KEPT_MOUNTS_LINES: [string, string] = [KEPT_BASE_NOTE, 'argano esistente sul suo basamento: nessun nuovo supporto né fissaggio; portata da verificare dallo strutturista'];
export const KEPT_MOUNTS_TEXT = 'Argano esistente sul suo basamento esistente (da rilevare): posizione, altezza e appoggi da rilevare in sito; nessun nuovo '
  + 'supporto né fissaggio — la portata del basamento e della soletta non è verificata dal software: con portata o velocità maggiori la prova '
  + 'della struttura dell’edificio è a cura del proprietario (UNI 10411-1:2024, 5; UNI 10411-11:2024, 5)';
