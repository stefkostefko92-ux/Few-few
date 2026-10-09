// The lines of a design's bill the drawings do not draw one by one, and which part of the acceptance test each line
// belongs to (src/lib/lift/collaudo.ts PARTI): a modification tested to UNI 10411 counts only the parts it replaces —
// the others stay, as sheet 1 writes them ESISTENTI —, a new lift (UNI EN 81-20/50) every one. Here: the ropes at their
// cut length with two wedge sockets each (UNI EN 81-20:2020, 5.5.5.1: the tensions equalised at one end at least), the
// 2:1 roping's pulleys on the car and the counterweight with the dead ends under the slab, a machine below's head
// pulleys with their frames and its base anchored against the uplift, the car's safety gear by its type, the
// governor's rope as sheet 1 counts it, the protection against the car's overspeed upward and its uncontrolled movement
// (registry impianto.acop.ucm). Pure.
import { partKept, type Collaudo, type Parte } from '@/lib/lift/collaudo';
import type { LiftDerived } from '@/lib/lift/derive';
import { rigLength } from '@/lib/lift/rope';
import { governorRopeLength, ropeCut } from '@/lib/lift/support';
import type { Plant } from '@/lib/plant';
import { section } from '@/shaft/section';
import { govSize } from '@/shaft/governor';
import { governorRopeKey, ropeEndKey, ropeKey } from './articles';
import type { BomLine } from './cost';

/** The part of the acceptance test a line belongs to; 'always': counted whatever the intervention replaces. */
export type BomPart = Parte | 'always';

/** A line of the design's bill with its part. */
export type TaggedLine = readonly [BomPart, BomLine];

export const sizeText = (d: number): string => String(d).replace('.', ',');

/** A part the intervention leaves in place: a modification tested to UNI 10411 that does not replace it (a new lift,
 *  UNI EN 81-20/50: none) — the rule of sheet 1 (src/lib/tavole/data.ts). */
export const keptPart = (C: Collaudo, p: BomPart): boolean => p !== 'always' && partKept(C, p);

/** The kind of project the cost counts by (the company's free lines, the labour): a new lift is a whole project, a
 *  modification tested to UNI 10411 one of the replacements. */
export const bomKind = (C: Collaudo): 'full' | 'replacement' => (C.norma === 'en81' ? 'full' : 'replacement');

/** A pulley's words: its pitch diameter and its grooves for n ropes of d [mm]. */
const pulleyArgs = (Dp: number, n: number, d: number): Record<string, string> => ({ D: sizeText(Dp), n: String(n), d: sizeText(d) });

/** The ropes: every one at its cut length (support.ts ropeCut: on the design's rope rig, the terminations and the
 *  adjustment added, rounded up to the metre), two wedge sockets with spring each. */
export function ropeLines(dv: LiftDerived): TaggedLine[] {
  const { I, N } = dv.analysis.ctx, cut = ropeCut(I, rigLength(dv));
  return [
    ['ropes', { key: ropeKey(N.d), label: { item: 'rope', name: sizeText(N.d) }, qty: cut * N.n, unit: 'm' }],
    ['ropes', { key: ropeEndKey(N.d), label: { item: 'rope_end', name: sizeText(N.d) }, qty: 2 * N.n, unit: 'pz' }],
  ];
}

/** 2:1 roping: the pulley on the car (its sling) and the one on the counterweight, each of Dp with a groove for every
 *  rope, and the two dead ends under the slab; none at 1:1. */
export function ropingLines(dv: LiftDerived): TaggedLine[] {
  const { I, N } = dv.analysis.ctx;
  if (I.r !== 2) return [];
  const pulley: BomLine = { key: 'pulley:2to1', label: { item: 'pulley_2to1_spec', args: pulleyArgs(I.Dp, N.n, N.d) }, qty: 1, unit: 'pz' };
  return [['sling', pulley], ['cw', pulley], ['ropes', { key: 'deadend:2to1', label: { item: 'deadend_2to1' }, qty: 2, unit: 'pz' }]];
}

/** A machine below: the head pulleys of its scheme with their frames and anchors (bottom.ts: two the calculation counts,
 *  the others extra bends), its base anchored against the net uplift in the test with 1.25·Q; none above. */
export function belowLines(dv: LiftDerived): TaggedLine[] {
  if (!dv.bottom) return [];
  const { I, N } = dv.analysis.ctx;
  return [
    ['machine', { key: 'pulley:head', label: { item: 'pulley_head_spec', args: pulleyArgs(I.Dp, N.n, N.d) }, qty: dv.headPulleys, unit: 'pz' }],
    ['machine', { key: 'base:below', label: { item: 'base_below' }, qty: 1, unit: 'pz' }],
  ];
}

/** The car's safety gear of the type the data of the installation give (none: progressive, as sheet 1 takes it), on
 *  the sling; the governor's rope as sheet 1 counts it. */
export function safetyLines(dv: LiftDerived, plant: Plant): TaggedLine[] {
  const L = dv.layout, V = L.inputs.vertical, g = govSize(V.v, L.inputs.governor), d = 2 * g.rope;
  return [
    ['sling', { key: `safety-gear:${plant.safetyGear ?? 'progressive'}`, label: { item: `safety_gear_${plant.safetyGear ?? 'progressive'}` }, qty: 1, unit: 'pz' }],
    ['governor', { key: governorRopeKey(d), label: { item: 'governor_rope', name: sizeText(d) }, qty: governorRopeLength(V, section(L).top, L.inputs.room, dv.bottom), unit: 'm' }],
  ];
}

/** The protection against the car's overspeed upward and its uncontrolled movement (registry impianto.acop.ucm): a
 *  certified device on a new lift; with the machine replaced under UNI 10411-11 (lifts with the CE marking, which have
 *  ACOP) the adaptation of the existing ones to the new machine; none otherwise (UNI 10411-1: the existing ones, if
 *  any, keep working — the draft order asks). */
export function acopLines(C: Collaudo): TaggedLine[] {
  if (C.norma === 'en81') return [['always', { key: 'acop:ucm', label: { item: 'acop_ucm' }, qty: 1, unit: 'pz' }]];
  return C.norma === '10411-11' && C.parti.includes('machine') ? [['always', { key: 'acop:adapt', label: { item: 'acop_adapt' }, qty: 1, unit: 'lot' }]] : [];
}

/** The part of a line plant-bom.ts counts: the electrical system and the signalling go with the controller, the
 *  buffers' supports with the buffers, the car's shoes with its sling and the counterweight's with it, the rails'
 *  cleaning with the rails; the installer by the stop always (a modification takes it as a lump sum). */
export function plantPart(key: string | null): BomPart {
  if (key?.startsWith('buffer-support:')) return 'buffers';
  if (key === 'shoes:car') return 'sling';
  if (key === 'shoes:cw') return 'cw';
  if (key === 'labour:rails') return 'rails';
  if (key === 'labour:installer') return 'always';
  return 'controller';
}
