// The bill of materials of a project as the software designs it, for its cost with the company's prices: the machine
// (the catalogue's model the proposal took, else one of no list), what it stands on (SICOR's bedplate with the pulley,
// ours, or the support chosen, the pulley on its stand, the HEB beams with their bearing plates; a machine below its
// head pulleys and its base: bom-parts.ts), the ropes at their cut length with their wedge sockets, the 2:1 roping's
// pulleys and dead ends, the rails in 5 m bars from the pit floor to under the slab with a joint between two bars, a
// bracket every 2 m plus the first and the last (a side counterweight's bridge at its rails' brackets, carrying a car
// rail), Panev's articles (panevBom: the landing doors' pairs with the landing doors, the counterweight rails' with the
// rails and their N1 clips), the doors of every stop and of the car, the governors with their tension pulleys and
// ropes, the buffers, the car, its sling with the safety gear, the counterweight's mass and its shoes (over a space
// under the shaft its safety gear and what trips it), the protection
// ACOP/UCM; then what it counts from the design without drawing it (the electrical system, the signalling, the buffers'
// supports, the car's shoes, the labour: plant-bom.ts). A modification tested to UNI 10411 counts only the parts the
// acceptance test replaces, and the installer as a lump sum (parts.ts keptPart). Not counted: the building works, the
// anchors and bolts of Panev's brackets (the cost's note says so). Pure.
import type { FormValues } from '@/calc/types';
import { panevBom } from '@/lib/catalog/panev';
import type { LiftDerived } from '@/lib/lift/derive';
import { layoutRigLength, rigLength } from '@/lib/lift/rope';
import { calcMachine } from '@/lib/order/machine';
import type { Plant } from '@/lib/plant';
import { analyse } from '@/lib/present/analysis';
import { RAIL_LENGTH, cwBracketsOf, railSpan, section, type Layout } from '@/shaft';
import { bridgeHeights, onBridge, railHeights } from '@/shaft/rail-brackets';
import { bufferType } from '@/shaft/buffers';
import { railLabel, type RailType } from '@/shaft/rails';
import { supportOf } from '@/shaft/support';
import { bedplateKey, machineKey, ropeEndKey, ropeKey } from './articles';
import { acopLines, belowLines, governorLines, hebLines, keptPart, panevLines, plantPart, ropeLines, ropingLines, safetyLines, sizeText, type TaggedLine } from './bom-parts';
import type { BomLine } from './cost';
import { plantLines } from './plant-bom';
import { collaudoOf, ropesKept, type Collaudo, type Parte } from '@/lib/lift/collaudo';
import { ropeCut } from '@/lib/lift/support';
import type { RoomDerived } from '@/lib/room/derive';

const tenth = (x: number): number => Math.ceil(x * 10 - 1e-9) / 10;

/** The lines of the same article as one. */
function merged(lines: readonly BomLine[]): BomLine[] {
  const out: BomLine[] = [], at = new Map<string, number>();
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    const i = l.key === null ? undefined : at.get(l.key);
    if (i === undefined) { if (l.key !== null) at.set(l.key, out.length); out.push({ ...l }); } else out[i] = { ...out[i], qty: out[i].qty + l.qty };
  }
  return out.map((l) => (l.unit === 'pz' ? l : { ...l, qty: tenth(l.qty) }));
}

/** One rope's length on its pulleys, hitch to hitch [m] (the rope rig: src/lib/lift/rope.ts); null when the rig cannot
 *  be drawn. */
export const ropeLength = (dv: LiftDerived): number | null => rigLength(dv);

/** The bars of `RAIL_LENGTH` that cover one rail of `span` [mm]: the last one is cut. */
const barsOf = (span: number): number => Math.max(0, Math.ceil(span / RAIL_LENGTH - 1e-9));

/** The design's bill; `plant`: the data of the installation (the safety gear's type). */
export function designBom(dv: LiftDerived, plant: Plant = {}): BomLine[] {
  const T: TaggedLine[] = [], add = (p: TaggedLine[0], ...lines: BomLine[]): void => { for (const l of lines) T.push([p, l]); };
  const I = dv.shaft, V = I.vertical, M = dv.machine, C = dv.collaudo, r2 = dv.analysis.ctx.I.r === 2;
  // the catalogue's machine of the design: the proposal's, or the one entered by hand (derive.ts), as the documents name it
  const fit = dv.catalog?.fit ?? null;
  add('machine', fit ? { key: machineKey(fit.machine.brand, fit.machine.model), label: { item: 'machine', name: `${fit.machine.brand} ${fit.machine.model}` }, qty: 1, unit: 'pz' }
    : { key: null, label: { item: 'machine_other', name: M.label }, qty: 1, unit: 'pz' });
  if (!dv.bottom && I.room) {
    const rf = M.rinvio, sup = supportOf(I.room, M.Dp > 0);
    if (rf?.on === 'frame' && rf.maker) add('machine', { key: bedplateKey(rf.maker.code), label: { item: 'bedplate', name: `${rf.maker.brand} ${rf.maker.code}` }, qty: 1, unit: 'pz' });
    else add('machine', { key: `support:${sup.kind}`, label: { item: `support_${sup.kind}` }, qty: 1, unit: 'pz' });
    if (rf?.on === 'stand') add('machine', { key: 'support:stand', label: { item: 'support_stand' }, qty: 1, unit: 'pz' });
    // the two HEB beams on the shaft's walls by the metre, on their bearing plates
    add('machine', ...hebLines(dv.heb?.chosen));
  }
  T.push(...belowLines(dv), ...ropeLines(dv), ...ropingLines(dv));
  // the rails in whole bars, the same type of the car and of the counterweight together; a joint between two bars
  const S = section(dv.layout), [z0, z1] = railSpan(S), span = Math.max(0, z1 - z0), bars = barsOf(span);
  const pb = panevBom(dv.layout), byType = new Map<RailType, number>();
  let rails = 0;
  for (const kind of ['car', 'cw'] as const) {
    const own = dv.layout.rails.filter((r) => r.kind === kind), n = own.length, type = kind === 'car' ? I.carRail : I.cwRail;
    rails += (n * span) / 1000;
    byType.set(type, (byType.get(type) ?? 0) + n);
    // each rail's brackets where rail-brackets.ts puts them; the car rail on a side counterweight's bridge has none of
    // its own (clipped to the bridge: its line below)
    if (kind === 'car' || cwBracketsOf(I) !== 'panev') {
      const qty = own.filter((r) => !onBridge(dv.layout, r)).reduce((q, r) => q + railHeights(dv.layout, r).length, 0);
      add('rails', { key: `bracket:${kind}`, label: { item: `bracket_${kind}` }, qty, unit: 'pz' });
    } else add('rails', { key: 'bracket:cw', label: { item: 'bracket_cw' }, qty: pb.missing, unit: 'pz' });
  }
  // a side counterweight's bridge between its rails, at every bracket of theirs, with the plate and the clips of the car
  // rail it carries (registry ingombri.contrappeso.laterale)
  const B = dv.layout.bridge;
  if (B) add('rails', { key: 'bracket:bridge', label: { item: 'bracket_bridge_len', args: { len: String(Math.round(B.y1 - B.y0)) } }, qty: bridgeHeights(dv.layout).length, unit: 'pz' });
  for (const [type, n] of byType) {
    add('rails', { key: `rail:${type}`, label: { item: 'rail_bars', name: railLabel(type), args: { bars: String(n * bars), len: sizeText(RAIL_LENGTH / 1000) } }, qty: (n * bars * RAIL_LENGTH) / 1000, unit: 'm' });
    add('rails', { key: `fishplate:${type}`, label: { item: 'fishplate', name: railLabel(type) }, qty: n * Math.max(0, bars - 1), unit: 'pz' });
  }
  T.push(...panevLines(pb.rows));
  for (const d of dv.layout.doors) {
    add('landingDoors', { key: `door:landing:${d.kind}`, label: { item: `door_landing_${d.kind}` }, qty: V.floors.filter((f) => f.door.includes(d.side)).length, unit: 'pz' });
    add('carDoors', { key: `door:car:${d.kind}`, label: { item: `door_car_${d.kind}` }, qty: 1, unit: 'pz' });
  }
  // the plate under each landing sill (UNI EN 81-20:2020, 5.2.5.3.2; src/shaft/toe.ts): one per landing door
  add('landingDoors', { key: 'door:toe', label: { item: 'door_toe' }, qty: dv.layout.doors.reduce((n, d) => n + V.floors.filter((f) => f.door.includes(d.side)).length, 0), unit: 'pz' });
  T.push(...governorLines(dv, plant));
  const ct = bufferType(V, 'car'), wt = bufferType(V, 'cw');
  add('buffers', { key: `buffer:${ct}`, label: { item: `buffer_${ct}` }, qty: Math.max(1, V.carBuffers), unit: 'pz' });
  add('buffers', { key: `buffer:${wt}`, label: { item: `buffer_${wt}` }, qty: 1, unit: 'pz' });
  // 2:1: the sling and the counterweight's frame carry the pulleys (counted apart: ropingLines)
  add('car', { key: 'car', label: { item: 'car' }, qty: 1, unit: 'pz' });
  add('sling', r2 ? { key: 'sling:2to1', label: { item: 'sling_2to1' }, qty: 1, unit: 'pz' } : { key: 'sling', label: { item: 'sling' }, qty: 1, unit: 'pz' });
  add('cw', { key: r2 ? 'cw:2to1' : 'cw', label: { item: r2 ? 'cw_2to1' : 'cw' }, qty: Math.round(dv.analysis.res.Mcw), unit: 'kg' });
  T.push(...safetyLines(dv, plant), ...acopLines(C));
  for (const l of plantLines(dv, rails)) T.push([plantPart(l.key), l]);
  // a modification: the parts it replaces, the installer as a lump sum
  const repl = C.norma !== 'en81', kept = T.filter(([p, l]) => !keptPart(C, p, dv.values) && !(repl && l.key === 'labour:installer')).map(([, l]) => l);
  return merged(repl ? [...kept, { key: 'labour:replacement', label: { item: 'labour_replacement' }, qty: 1, unit: 'lot' }] : kept);
}

/** What a machine replacement counts of the parts its acceptance test replaces: the machine with what it stands on, the
 *  ropes, the controller; the speed, the load and the travel change without a part of their own. */
const CALC_COUNTED: readonly Parte[] = ['machine', 'ropes', 'controller', 'speed', 'load', 'travel'];

/** The parts a calculation's bill (calcBom) does not count; `newLift`: a new lift calculated without its design (EN
 *  81-20/50), whose parts are new, not replaced, so the cost says it in words of its own (prices.uncountedNew). */
export type Uncounted = { parts: Parte[]; newLift: boolean };

/** The parts the acceptance test `C` puts in the lift that a machine replacement's bill does not count (calcBom): under
 *  UNI 10411 those it names replaced, under EN 81-20/50 every part of the new lift. They need the design of the lift
 *  (its shaft, doors, rails, car), so the cost says so, never silently leaves them out. */
export const calcUncounted = (C: Collaudo | null): Uncounted =>
  ({ parts: (C?.parti ?? []).filter((p) => !CALC_COUNTED.includes(p)), newLift: C?.norma === 'en81' });

/** The replacement of the machine: the machine (the catalogue's whose values the calculator holds), what it stands on
 *  (the maker's bedplate with the pulley; with the machine room surveyed `room`, the support chosen there, the pulley's
 *  stand and the HEB beams on their plates; a machine below its base anchored against the uplift), the ropes at their
 *  cut length with their wedge sockets and the controller when the acceptance test `C` names them replaced (none: the
 *  software's default for the calculation, collaudo.ts collaudoOf; the ropes by ropesKept), the adaptation of ACOP/UCM
 *  under UNI 10411-11, and the installer as a lump sum (the other parts `C` replaces: calcUncounted). The cut length on
 *  the rig of the shaft design laid out `shaft` the calculation was made from, as its sheet 1 measures it (rope.ts
 *  layoutRigLength); without one, the formula. */
export function calcBom(V: FormValues, C: Collaudo | null = null, room: RoomDerived | null = null, shaft: Layout | null = null): BomLine[] {
  const c = calcMachine(V), a = room?.analysis ?? analyse(V), { I, N } = a.ctx, col = C ?? collaudoOf(V);
  const L: BomLine[] = [c ? { key: machineKey(c.brand, c.model), label: { item: 'machine', name: `${c.brand} ${c.model}` }, qty: 1, unit: 'pz' } : { key: null, label: { item: 'machine_other' }, qty: 1, unit: 'pz' }];
  // with the room surveyed, what stands there (the maker's frame, ours, or the support with the pulley's stand); else
  // the maker's bedplate the calculation's machine takes
  const rf = room?.M.rinvio ?? null, mk = room ? (rf?.on === 'frame' ? rf.maker : null) : c?.bedplate ?? null;
  if (mk) L.push({ key: bedplateKey(mk.code), label: { item: 'bedplate', name: `${mk.brand} ${mk.code}` }, qty: 1, unit: 'pz' });
  else if (room?.G) {
    const sup = supportOf(room.G.room, room.M.Dp > 0);
    L.push({ key: `support:${sup.kind}`, label: { item: `support_${sup.kind}` }, qty: 1, unit: 'pz' });
  }
  if (rf?.on === 'stand') L.push({ key: 'support:stand', label: { item: 'support_stand' }, qty: 1, unit: 'pz' });
  L.push(...hebLines(room?.heb?.chosen));
  if (I.layout === 'bottom') L.push({ key: 'base:below', label: { item: 'base_below' }, qty: 1, unit: 'pz' });
  // the ropes when the intervention replaces them: as the test says, and new whenever the calculation gives them their
  // own number and diameter (collaudo.ts ropesKept, as sheet 1 and the draft order)
  if (!ropesKept(col, V)) {
    L.push({ key: ropeKey(N.d), label: { item: 'rope', name: sizeText(N.d) }, qty: N.n * ropeCut(I, shaft ? layoutRigLength(shaft, a) : null), unit: 'm' });
    L.push({ key: ropeEndKey(N.d), label: { item: 'rope_end', name: sizeText(N.d) }, qty: 2 * N.n, unit: 'pz' });
  }
  if (col.parti.includes('controller')) L.push({ key: 'controller', label: { item: 'controller' }, qty: 1, unit: 'pz' });
  L.push(...acopLines(col).map(([, l]) => l));
  L.push({ key: 'labour:replacement', label: { item: 'labour_replacement' }, qty: 1, unit: 'lot' });
  return merged(L);
}
