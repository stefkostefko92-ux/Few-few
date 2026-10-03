// The bill of materials of a project as the software designs it, for its cost with the company's prices: the machine
// (the catalogue's model the proposal took, else one of no list), what it stands on (SICOR's bedplate with the pulley,
// ours, or the support chosen, the pulley on its stand), the ropes (their length on the pulleys from the rope rig of the
// 3D, every rope), the rails from the pit floor to under the slab with a joint every 5 m, a bracket every 2 m plus the
// first and the last, Panev's articles (panevBom), the doors of every stop and of the car, the governor with its tension
// pulley, the buffers, the car, its sling and the counterweight's mass; then what it counts from the design without
// drawing it (the electrical system, the signalling, the buffers' supports, the car's shoes, the labour: plant-bom.ts).
// Not counted: the governor rope and the building works. Pure.
import type { FormValues } from '@/calc/types';
import { panevBom } from '@/lib/catalog/panev';
import { belt } from '@/lib/lift/belt';
import type { LiftDerived } from '@/lib/lift/derive';
import { ropeRig } from '@/lib/lift/rig';
import { calcMachine } from '@/lib/order/machine';
import { analyse } from '@/lib/present/analysis';
import { RAIL_LENGTH, bracketHeights, cwBracketsOf, railSpan, section } from '@/shaft';
import { bufferType } from '@/shaft/buffers';
import { govSize } from '@/shaft/governor';
import { railLabel } from '@/shaft/rails';
import { supportOf } from '@/shaft/support';
import { bedplateKey, governorKey, machineKey, ropeKey } from './articles';
import type { BomLine } from './cost';
import { plantLines } from './plant-bom';
import type { Collaudo } from '@/lib/lift/collaudo';
import { ropeLength as ropeRun } from '@/lib/lift/support';
import type { RoomDerived } from '@/lib/room/derive';

const tenth = (x: number): number => Math.ceil(x * 10 - 1e-9) / 10;
const sizeText = (d: number): string => String(d).replace('.', ',');

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

/** One rope's length on its pulleys, hitch to hitch [m]; null when the rig cannot be drawn. */
export function ropeLength(dv: LiftDerived): number | null {
  try {
    let len = 0;
    for (const p of ropeRig(dv).pieces(0, dv.sim.cw0)) {
      const b = belt(p.els);
      for (const [a, c] of b.runs) len += Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (const arc of b.arcs) len += Math.abs(arc.sweep) * arc.r;
    }
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

export function designBom(dv: LiftDerived): BomLine[] {
  const L: BomLine[] = [], I = dv.shaft, V = I.vertical, M = dv.machine;
  const fit = dv.origin.machine === 'auto' ? dv.catalog?.fit ?? null : null;
  L.push(fit ? { key: machineKey(fit.machine.brand, fit.machine.model), label: { item: 'machine', name: `${fit.machine.brand} ${fit.machine.model}` }, qty: 1, unit: 'pz' }
    : { key: null, label: { item: 'machine_other', name: M.label }, qty: 1, unit: 'pz' });
  if (!dv.bottom && I.room) {
    const rf = M.rinvio, sup = supportOf(I.room, M.Dp > 0);
    if (rf?.on === 'frame' && rf.maker) L.push({ key: bedplateKey(rf.maker.code), label: { item: 'bedplate', name: `${rf.maker.brand} ${rf.maker.code}` }, qty: 1, unit: 'pz' });
    else L.push({ key: `support:${sup.kind}`, label: { item: `support_${sup.kind}` }, qty: 1, unit: 'pz' });
    if (rf?.on === 'stand') L.push({ key: 'support:stand', label: { item: 'support_stand' }, qty: 1, unit: 'pz' });
  }
  const rope = ropeLength(dv);
  if (rope !== null) L.push({ key: ropeKey(M.d), label: { item: 'rope', name: sizeText(M.d) }, qty: rope * M.n, unit: 'm' });
  const S = section(dv.layout), [z0, z1] = railSpan(S), span = Math.max(0, z1 - z0), joints = Math.max(0, Math.ceil(span / RAIL_LENGTH - 1e-9) - 1);
  const pb = panevBom(dv.layout);
  let rails = 0;
  for (const kind of ['car', 'cw'] as const) {
    const n = dv.layout.rails.filter((r) => r.kind === kind).length, type = kind === 'car' ? I.carRail : I.cwRail;
    rails += (n * span) / 1000;
    L.push({ key: `rail:${type}`, label: { item: 'rail', name: railLabel(type) }, qty: (n * span) / 1000, unit: 'm' });
    L.push({ key: `fishplate:${type}`, label: { item: 'fishplate', name: railLabel(type) }, qty: n * joints, unit: 'pz' });
    if (kind === 'car' || cwBracketsOf(I) !== 'panev') {
      L.push({ key: `bracket:${kind}`, label: { item: `bracket_${kind}` }, qty: n * bracketHeights(z0, z1, type, kind === 'car' ? dv.layout.carBracketPitch : dv.layout.cwBracketPitch).length, unit: 'pz' });
    } else L.push({ key: 'bracket:cw', label: { item: 'bracket_cw' }, qty: pb.missing, unit: 'pz' });
  }
  for (const r of pb.rows) L.push({ key: `panev:${r.article.code}`, label: { item: `panev_${r.article.kind}`, name: `${r.article.code} (${r.article.size})` }, qty: r.qty, unit: 'pz' });
  for (const d of dv.layout.doors) {
    L.push({ key: `door:landing:${d.kind}`, label: { item: `door_landing_${d.kind}` }, qty: V.floors.filter((f) => f.door.includes(d.side)).length, unit: 'pz' });
    L.push({ key: `door:car:${d.kind}`, label: { item: `door_car_${d.kind}` }, qty: 1, unit: 'pz' });
  }
  const g = govSize(V.v, I.governor);
  L.push({ key: governorKey(g.brand, g.model), label: { item: 'governor', name: `${g.brand} ${g.model}` }, qty: 1, unit: 'pz' });
  L.push({ key: 'tension', label: { item: 'tension' }, qty: 1, unit: 'pz' });
  const ct = bufferType(V, 'car'), wt = bufferType(V, 'cw');
  L.push({ key: `buffer:${ct}`, label: { item: `buffer_${ct}` }, qty: Math.max(1, V.carBuffers), unit: 'pz' });
  L.push({ key: `buffer:${wt}`, label: { item: `buffer_${wt}` }, qty: 1, unit: 'pz' });
  L.push({ key: 'car', label: { item: 'car' }, qty: 1, unit: 'pz' }, { key: 'sling', label: { item: 'sling' }, qty: 1, unit: 'pz' });
  L.push({ key: 'cw', label: { item: 'cw' }, qty: Math.round(dv.analysis.res.Mcw), unit: 'kg' });
  return merged([...L, ...plantLines(dv, rails)]);
}

/** The replacement of the machine: the machine (the catalogue's whose values the calculator holds), what it stands on
 *  (the maker's bedplate with the pulley; with the machine room surveyed `room`, the support chosen there and the pulley's
 *  stand), the ropes and the controller when the acceptance test `C` names them replaced (every rope, the calculation's
 *  length), and the installer as a lump sum. */
export function calcBom(V: FormValues, C: Collaudo | null = null, room: RoomDerived | null = null): BomLine[] {
  const c = calcMachine(V), a = room?.analysis ?? analyse(V), { I, N } = a.ctx, parts = C?.parti ?? ['machine'];
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
  if (parts.includes('ropes')) L.push({ key: ropeKey(N.d), label: { item: 'rope', name: sizeText(N.d) }, qty: N.n * ropeRun(I), unit: 'm' });
  if (parts.includes('controller')) L.push({ key: 'controller', label: { item: 'controller' }, qty: 1, unit: 'pz' });
  L.push({ key: 'labour:replacement', label: { item: 'labour_replacement' }, qty: 1, unit: 'lot' });
  return merged(L);
}
