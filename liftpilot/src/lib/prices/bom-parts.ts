// The lines of a design's bill the drawings do not draw one by one, and which part of the acceptance test each line
// belongs to (parts.ts: a modification tested to UNI 10411 counts only the parts it replaces, a new lift every one).
// Here: the ropes at their cut length with two wedge sockets each (UNI EN 81-20:2020, 5.5.5.1: the tensions equalised
// at one end at least), the 2:1 roping's pulleys on the car and the counterweight with the dead ends under the slab, a
// machine below's head pulleys with their frames and its base anchored against the uplift, the HEB beams with the
// bearing plate under each end, Panev's articles with the N1 clips on every SG, the car's safety gear by its type, the
// governors with their tension weights and ropes as sheet 1 counts them, the counterweight's safety gear over a space
// under the shaft and what trips it (cw-gear.ts), the protection against the car's overspeed upward and its
// uncontrolled movement (registry impianto.acop.ucm). Pure.
import type { BomRow } from '@/lib/catalog/panev';
import type { Collaudo } from '@/lib/lift/collaudo';
import type { LiftDerived } from '@/lib/lift/derive';
import { rigLength } from '@/lib/lift/rope';
import { governorRopeLength, ropeCut } from '@/lib/lift/support';
import type { Plant } from '@/lib/plant';
import { cwGearOf, cwTripOf } from '@/lib/tavole/cw-gear';
import type { HebLayout } from '@/shaft/heb';
import { section } from '@/shaft/section';
import { govSize } from '@/shaft/governor';
import { N1_PER_SG } from '@/shaft/staffe';
import { HEB_PLATE_KEY, N1_KEY, cwGearKey, governorKey, governorRopeKey, hebKey, hebPlateSize, ropeEndKey, ropeKey } from './articles';
import type { BomLine } from './cost';
import { panevPart, type BomPart } from './parts';

export { keptPart, panevCounted, panevPart, type BomPart } from './parts';

/** A line of the design's bill with its part. */
export type TaggedLine = readonly [BomPart, BomLine];

export const sizeText = (d: number): string => String(d).replace('.', ',');

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

/** The HEB beams on the shaft's walls (registry locale.putrelle.vano): each by the metre, and the bearing plate under
 *  each of its two ends, as sheet 1, the plan and the 3D give them (the mortar bed under it is building work). */
export function hebLines(heb: HebLayout | null | undefined): BomLine[] {
  if (!heb) return [];
  const beams = heb.at.length;
  return [
    { key: hebKey(heb.profile), label: { item: 'heb', name: heb.profile }, qty: (beams * heb.length) / 1000, unit: 'm' },
    { key: HEB_PLATE_KEY, label: { item: 'heb_plate', name: hebPlateSize }, qty: 2 * beams, unit: 'pz' },
  ];
}

/** Panev's articles of a design (panevBom's rows), each with its part (parts.ts panevPart), and the N1 clips that hold
 *  the counterweight rail on every SG, with the rails (Panev's price leaves them out). */
export function panevLines(rows: readonly BomRow[]): TaggedLine[] {
  const sg = rows.filter((r) => r.use === 'cw' && (r.article.kind === 'guideSG' || r.article.kind === 'madeSG')).reduce((n, r) => n + r.qty, 0);
  return [
    ...rows.map((r): TaggedLine => [panevPart(r.use), { key: `panev:${r.article.code}`, label: { item: `panev_${r.article.kind}`, name: `${r.article.code} (${r.article.size})` }, qty: r.qty, unit: 'pz' }]),
    ['rails', { key: N1_KEY, label: { item: 'clip_n1' }, qty: N1_PER_SG * sg, unit: 'pz' }],
  ];
}

/** The governors with their tension weights and ropes, as sheet 1 writes them: the car's (the one chosen, else by the
 *  speed), and with a space under the shaft whose counterweight gear a governor trips, its own — the same model with
 *  the same rope (cw-gear.ts cwTripOf: the car's rope is clamped to the car). */
export function governorLines(dv: LiftDerived, plant: Plant): TaggedLine[] {
  const L = dv.layout, V = L.inputs.vertical, g = govSize(V.v, L.inputs.governor), d = 2 * g.rope;
  const one: TaggedLine[] = [
    ['governor', { key: governorKey(g.brand, g.model), label: { item: 'governor', name: `${g.brand} ${g.model}` }, qty: 1, unit: 'pz' }],
    ['governor', { key: 'tension', label: { item: 'tension' }, qty: 1, unit: 'pz' }],
    ['governor', { key: governorRopeKey(d), label: { item: 'governor_rope', name: sizeText(d) }, qty: governorRopeLength(V, section(L).top, L.inputs.room, dv.bottom), unit: 'm' }],
  ];
  return cwTripOf(dv.bottom === 'under', plant) === 'governor' ? [...one, ...one] : one;
}

/** The car's safety gear of the type the data of the installation give (none: progressive, as sheet 1 takes it), on
 *  the sling; with a space under the shaft the counterweight's (cw-gear.ts: the type given, progressive when not given;
 *  none with a pillar in its place) on it, and what trips it otherwise than by a governor: the device on its
 *  suspension's breakage, or the safety rope with its pulleys and hitches as a lump sum (its run is the site's). */
export function safetyLines(dv: LiftDerived, plant: Plant): TaggedLine[] {
  const car = plant.safetyGear ?? 'progressive', under = dv.bottom === 'under', cw = cwGearOf(under, plant), trip = cwTripOf(under, plant);
  const out: TaggedLine[] = [['sling', { key: `safety-gear:${car}`, label: { item: `safety_gear_${car}` }, qty: 1, unit: 'pz' }]];
  if (cw) out.push(['cw', { key: cwGearKey(cw), label: { item: `safety_gear_cw_${cw}` }, qty: 1, unit: 'pz' }]);
  if (trip === 'rupture') out.push(['cw', { key: 'cw-trip:rupture', label: { item: 'cw_trip_rupture' }, qty: 1, unit: 'pz' }]);
  else if (trip === 'rope') out.push(['cw', { key: 'cw-trip:rope', label: { item: 'cw_trip_rope' }, qty: 1, unit: 'lot' }]);
  return out;
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
