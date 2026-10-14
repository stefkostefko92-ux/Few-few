// The articles of a project the software does not draw but counts from what it designs (the price list's electrical
// system, signalling and labour; the buffers' supports; the car's guide shoes), each by a rule said here and on the
// screen — estimates to be replaced with the site's measures where a length is counted:
// - controller, complete electrical sub-panel, car operating panel, inspection station, pit stop, machine room stop,
//   emergency light, alarm siren, remote alarm system: one each;
// - landing push-button panels: one at each landing door (every floor each entrance serves);
// - travelling cable: half the travel plus 3 m (the same length the loads count, registry carichi.cavi);
// - shaft wiring: the shaft's height from the pit floor to the machine room's floor (to its ceiling without a room over
//   it); cable trunking: the same, plus in the room the run square to the walls from the control panel to the machine;
// - shaft lighting: the shaft's height from the pit floor to its ceiling;
// - buffer supports: one under each spring or polyurethane buffer; guide shoes: two on each car rail and two on each
//   counterweight rail;
// - installer (cottimista): by the stop; rail cleaning: every metre of rail.
// The bill (bom.ts, bom-parts.ts) adds what the design gives one by one: the ropes at their cut length with two wedge
// sockets each, the 2:1 roping's pulleys and dead ends, a machine below's head pulleys and base, the HEB beams with a
// bearing plate under each end, the rails in whole 5 m bars, Panev's articles with two N1 clips on every SG, the
// safety gear, the governors with their ropes (with the machine under the pit the counterweight's gear and what trips
// it), ACOP/UCM; a modification tested to UNI 10411 only the parts its acceptance test replaces, the installer as a lump
// sum. A machine replacement counts the machine, its support and diverting pulley (with the HEB beams and their
// plates), the ropes and the controller when the acceptance test names them replaced, and the installer as a lump sum;
// the other replaced parts it names, not counted (bom.ts calcUncounted). Pure.
import type { LiftDerived } from '@/lib/lift/derive';
import { cableLength } from '@/lib/lift/support';
import { roomGeo, type RoomGeo } from '@/shaft/machine-room';
import { section } from '@/shaft/section';
import { bufferType } from '@/shaft/buffers';
import type { RoomInputs } from '@/shaft/room';
import type { BomLine } from './cost';

const one = (key: string, item: string): BomLine => ({ key, label: { item }, qty: 1, unit: 'pz' });

/** Square to the walls, from the front of the control panel to the machine's middle in plan [mm]. */
export function panelRun(R: RoomInputs, G: RoomGeo): number {
  const c = R.panelAt + R.panelW / 2, front: readonly [number, number] = R.panelWall === 'front' ? [c, R.panelD] : R.panelWall === 'rear' ? [c, R.D - R.panelD]
    : R.panelWall === 'left' ? [R.panelD, c] : [R.W - R.panelD, c];
  const u = (G.frame0 + G.frame1) / 2, v = (G.across[0] + G.across[1]) / 2;
  const m = [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
  return Math.abs(m[0] - front[0]) + Math.abs(m[1] - front[1]);
}

/** The electrical system, the signalling, the buffers' supports, the guide shoes and the labour of a whole project; `rails`:
 *  the metres of every rail (car and counterweight) the bill counts. */
export function plantLines(dv: LiftDerived, rails: number): BomLine[] {
  const I = dv.shaft, V = I.vertical, L = dv.layout, S = section(L), travel = S.top / 1000, above = I.room !== null && !dv.bottom;
  const shaft = (V.pit + S.top + V.headroom) / 1000, toRoom = shaft + (above && I.room ? I.room.slab / 1000 : 0);
  const G = above ? roomGeo(L, dv.machine) : null, room = G && I.room ? panelRun(I.room, G) / 1000 : 0;
  const landings = L.doors.reduce((n, d) => n + V.floors.filter((f) => f.door.includes(d.side)).length, 0);
  const ct = bufferType(V, 'car'), wt = bufferType(V, 'cw'), supports = (t: string): number => (ct === t ? Math.max(1, V.carBuffers) : 0) + (wt === t ? 1 : 0);
  return [
    one('controller', 'controller'), one('electrical:panel', 'electrical_panel'),
    { key: 'cable:travelling', label: { item: 'cable_travelling' }, qty: cableLength(travel), unit: 'm' },
    { key: 'wiring', label: { item: 'wiring' }, qty: toRoom, unit: 'm' },
    { key: 'trunking', label: { item: 'trunking' }, qty: toRoom + room, unit: 'm' },
    { key: 'push:landing', label: { item: 'push_landing' }, qty: landings, unit: 'pz' },
    one('push:car', 'push_car'), one('push:inspection', 'push_inspection'), one('stop:pit', 'stop_pit'), one('stop:room', 'stop_room'),
    one('light:emergency', 'light_emergency'), { key: 'light:shaft', label: { item: 'light_shaft' }, qty: shaft, unit: 'm' },
    one('alarm:siren', 'alarm_siren'), one('alarm:remote', 'alarm_remote'),
    ...(['spring', 'pu'] as const).map((t): BomLine => ({ key: `buffer-support:${t}`, label: { item: `buffer_support_${t}` }, qty: supports(t), unit: 'pz' })),
    { key: 'shoes:car', label: { item: 'shoes_car' }, qty: 2 * L.rails.filter((r) => r.kind === 'car').length, unit: 'pz' },
    { key: 'shoes:cw', label: { item: 'shoes_cw' }, qty: 2 * L.rails.filter((r) => r.kind === 'cw').length, unit: 'pz' },
    { key: 'labour:installer', label: { item: 'labour_installer' }, qty: V.floors.length, unit: 'stop' },
    { key: 'labour:rails', label: { item: 'labour_rails' }, qty: rails, unit: 'm' },
  ];
}

/** What the company's free lines count by in a whole project: its stops and its travel [m]. */
export const designBasis = (dv: LiftDerived): { stops: number; travel: number } => ({ stops: dv.shaft.vertical.floors.length, travel: section(dv.layout).top / 1000 });
