// The machine room of a machine replacement from its survey (survey.ts) and the calculation it builds on: the new
// machine as the calculation describes it (the catalogue's model its values are, drawn as it is, on the support chosen
// in the room, its diverting pulley at the calculation's h), standing over the existing car drop; its counterweight
// drop at the calculation's spacing along the line to the counterweight drop measured, which must agree with it
// (m_calata, registry locale.calate). The checks of the room (height, panel, door), of the machine in it (m_fit,
// m_stand, m_free), of its support (the beams), of a maker's bedplate (m_rinvio) and of the panel among them (m_quadro,
// m_route: the panel stays where it was surveyed), of the HEB beams on the shaft's walls when the room puts the support
// on them (the software's choice among the six named in the room it draws); the load on the support. What stops a
// record: the machine below (no room over the shaft: not drawn, as in a whole design), drops that coincide or lie
// outside the shaft, a diverting pulley under the room's floor. Pure: the browser and the server run it alike.
import type { FormValues } from '@/calc/types';
import { shapeOf } from '@/lib/catalog/shapes';
import { machineSpec } from '@/lib/lift/machine';
import { bedplateMass, supportLoad } from '@/lib/lift/support';
import { calcMachine } from '@/lib/order/machine';
import { analyse, type Analysis } from '@/lib/present/analysis';
import { check } from '@/shaft/checks';
import { hebChecks, hebFor, type HebTaken } from '@/shaft/heb';
import { geoOn, roomChecksOf, type MachineSpec, type RoomGeo } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import { rinvioAxisOf, rinvioTopOf } from '@/shaft/rinvio';
import type { RoomSite } from '@/shaft/room-site';
import { switchBox } from '@/shaft/room-floor';
import { beamChecks, fitChecks, machineParts, panelFloorChecks, rinvioChecks, type SupportLoad } from '@/shaft/support-check';
import { ownAxis } from '@/shaft/support';
import type { ShaftCheck } from '@/shaft/types';
import type { Survey } from './survey';

export type RoomIssue = 'bottom' | 'drops' | 'rinvio';

export interface RoomDerived {
  analysis: Analysis;
  /** the catalogue's machine the calculation's values are (null: entered by hand, drawn as the generic machine) */
  made: { brand: string; model: string } | null;
  M: MachineSpec;
  /** the room's geometry; null with the machine below */
  G: RoomGeo | null;
  site: RoomSite;
  /** the drops' spacing the calculation's machine hangs its ropes at, and the one measured [mm] */
  calata: { calc: number; measured: number };
  /** the least h of the calculation that keeps the diverting pulley under the seat of our bedplate [mm]; null: no pulley */
  hMin: number | null;
  load: SupportLoad;
  /** the HEB beams on the shaft's walls: the six weighed, the one taken (the room of G names it), whether its profile
   *  and its direction are the software's; null without them */
  heb: HebTaken | null;
  checks: ShaftCheck[];
  issues: RoomIssue[];
}

/** The spacing of the drops the calculation's machine hangs its ropes at, and its sheave's centre along the drop line
 *  from the car's drop [mm]: with a diverting pulley D/2 + dx ± Dp/2 (a reverse bend: minus), a direct pull the
 *  existing sheave when the calculation has it (its hitches) else the new one; 2:1 adds the pulleys' Dp. A direct pull
 *  centres the sheave between the drops unless the calculation aligns it with the car's. */
export function calcDrops(a: Analysis, M: MachineSpec): { calata: number; sheaveAt: number } {
  const { I } = a.ctx, car = M.ropeIn + M.D / 2;
  if (I.layout === 'topDefl') return { calata: 2 * M.ropeIn + M.D / 2 + I.dx * 1000 + (M.reverse ? -M.Dp / 2 : M.Dp / 2), sheaveAt: car };
  const calata = (I.drops > 0 ? I.drops : M.D) + 2 * M.ropeIn;
  return { calata, sheaveAt: I.dropAlign === 'car' ? car : calata / 2 };
}

/** The machine of a calculation as the room's drawings take it: the catalogue's model its values are, drawn as it is. Its
 *  diverting pulley turns in the bedplate (the maker's when its heights give the calculation's h); ours, unless its
 *  height was set, is made as tall as puts the pulley at its usual axis under the calculation's h (at least as tall as
 *  it is with the pulley under its beams). */
export function surveyMachine(V: FormValues, a: Analysis, s: Pick<Survey, 'room'>): { M: MachineSpec; made: RoomDerived['made'] } {
  const c = calcMachine(V), made = c ? { brand: c.brand, model: c.model } : null, shape = made ? shapeOf(made.brand, made.model) : null;
  const spec = (room: Survey['room']): MachineSpec => machineSpec(a.ctx, a.ctx.N.mass, made ? `${made.brand} ${made.model}` : '', room, shape, made);
  const M = spec(s.room), rf = M.rinvio;
  if (rf?.on !== 'frame' || rf.maker || s.room.support?.height !== undefined) return { M, made };
  const height = Math.round(Math.max(rinvioTopOf(M.Dp), rinvioAxisOf(M.Dp) + M.h - ownAxis(M.D, shape)));
  return { M: spec({ ...s.room, support: { kind: 'rinvio', height } }), made };
}

function deriveOnce(V: FormValues, s: Survey, a: Analysis): RoomDerived {
  const { I } = a.ctx, R = s.room, { M, made } = surveyMachine(V, a, s), issues: RoomIssue[] = [];
  const { calata, sheaveAt } = calcDrops(a, M);
  const mx = s.cw.x - s.car.x, my = s.cw.y - s.car.y, measured = Math.hypot(mx, my);
  const inShaft = (p: Survey['car']): boolean => p.x <= s.shaft.W && p.y <= s.shaft.D;
  if (I.layout === 'bottom') issues.push('bottom');
  if (measured < 1 || !inShaft(s.car) || !inShaft(s.cw)) issues.push('drops');
  // the hitches below the room's floor: the rope beyond the travel L0 (sheave to car with the car at the top floor, as
  // the calculation counts it) less the sheave's axis over the floor, the travel added on the side at the bottom
  const top = Math.max(R.slab + 100, I.L0 * 1000 - M.axis), H = I.H * 1000;
  const ux = measured >= 1 ? mx / measured : 0, uy = measured >= 1 ? my / measured : 1;
  const car: [number, number] = [R.shaftX + s.car.x, R.shaftY + s.car.y], cw: [number, number] = [car[0] + calata * ux, car[1] + calata * uy];
  const site: RoomSite = {
    W: s.shaft.W, D: s.shaft.D, wall: s.shaft.wall, ends: [[top, top + H], [top + H, top]], mid: [top + H / 2, top + H / 2],
    governor: { entities: [], box: null }, calata: () => null, calcEdits: false, drops: { car: [s.car.x, s.car.y], cw: [cw[0] - R.shaftX, cw[1] - R.shaftY] },
  };
  const G = issues.includes('bottom') ? null : geoOn(R, { car, cw, ux, uy, calata }, M, sheaveAt);
  // the diverting pulley under the room's floor, or in the bedplate up into the machine standing over it
  const rf = M.rinvio, r = M.Dp / 2;
  const clash = !!G && rf?.on === 'frame' && G.pulleyAt + r > G.frame0 && G.pulleyAt - r < G.frame1 && G.pulleyZ + r > rf.top;
  if (G && M.Dp > 0 && (G.pulleyZ - r < 0 || clash)) issues.push('rinvio');
  // the support carries the machine as the full design counts it: its mass with the maker's bedplate it stands on, the
  // static load on its axis, the dynamic coefficient — as sheet 1 and the relazione tecnica count them
  const load = supportLoad(a.ctx, a.res.Mcw, { machine: a.ctx.N.mass + bedplateMass(M) });
  // what stands on the floor besides the machine: the main switch by the door (no governor in the survey)
  const off = Math.abs(measured - calata), others = [switchBox(R)];
  const beams = G ? hebFor(G, M, s.shaft, load) : null, chosenBy = R.heb;
  const checks: ShaftCheck[] = G ? [
    ...roomChecksOf(R, [...machineParts(G, M), ...others]), ...beamChecks(G, load), ...rinvioChecks(G, M), ...hebChecks(beams?.chosen.result ?? null), ...fitChecks(G, M, others),
    ...panelFloorChecks(G, M, others), check('m_calata', off <= KV_VERT.dropTol, Math.round(off), KV_VERT.dropTol, 0, 'mm'),
  ] : roomChecksOf(R);
  const hMin = M.Dp > 0 ? Math.ceil(ownAxis(M.D, M.shape ?? null) + r) : null;
  const heb = beams && chosenBy ? { ...beams, auto: { profile: !chosenBy.profile, dir: !chosenBy.dir } } : null;
  return { analysis: a, made, M, G, site, calata: { calc: calata, measured }, hMin, load, heb, checks, issues };
}

/** The machine room of the survey: with the HEB beams' profile or direction left to the software, derived on the beams
 *  it takes (their height raises the machine), which the room it draws names. */
export function deriveRoom(V: FormValues, s: Survey, a: Analysis = analyse(V)): RoomDerived {
  const R = s.room, chosenBy = R.heb, first = deriveOnce(V, s, a), taken = first.heb?.chosen;
  if (!chosenBy || (chosenBy.profile && chosenBy.dir) || !first.heb || !taken) return first;
  const heb = { profile: taken.profile, dir: taken.dir }, again = deriveOnce(V, { ...s, room: { ...R, heb } }, a);
  const auto = { profile: !chosenBy.profile, dir: !chosenBy.dir };
  return { ...again, heb: again.heb ? { ...again.heb, auto } : null };
}
