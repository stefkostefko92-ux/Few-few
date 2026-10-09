// The machine room of a machine replacement from its survey (survey.ts) and the calculation it builds on: the new
// machine as the calculation describes it (the catalogue's model its values are, drawn as it is, on the support chosen
// in the room, its diverting pulley at the calculation's h), standing over the existing car drop; its counterweight
// drop at the calculation's spacing along the line to the counterweight drop measured, which must agree with it
// (m_calata, registry locale.calate). The checks of the room (height, panel, door), of the machine in it (m_fit,
// m_stand, m_free), of its support (the beams), of a maker's bedplate (m_rinvio) and of the panel among them (m_quadro,
// m_route: the panel stays where it was surveyed), of the existing governor (m_gov, m_govfree, its ropes down into the
// shaft: m_govdrop) and the slab's existing openings (m_holes), of the HEB beams on the shaft's walls when the room puts
// the support on them (the software's choice among the six named in the room it draws); the load on the support. What
// stops a record: the machine below (no room over the shaft: not drawn, as in a whole design), drops that coincide or
// lie outside the shaft, a diverting pulley under the room's floor. Pure: the browser and the server run it alike.
import type { FormValues } from '@/calc/types';
import type { Box as DrawBox } from '@/drawing';
import { shapeOf } from '@/lib/catalog/shapes';
import { machineSpec } from '@/lib/lift/machine';
import { carriedMass, supportLoad } from '@/lib/lift/support';
import { calcMachine } from '@/lib/order/machine';
import { analyse, type Analysis } from '@/lib/present/analysis';
import { check } from '@/shaft/checks';
import { hebChecks, hebDrawn, hebFor, type HebTaken } from '@/shaft/heb';
import { orientedGeo, roomChecksOf, type MachineSpec, type RoomGeo } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import { existingRoomCheck } from '@/shaft/room-above';
import { axisOverTop, rinvioAxisOf, rinvioClash, rinvioTopOf } from '@/shaft/rinvio';
import type { RoomSite } from '@/shaft/room-site';
import { outlineBox, switchBox } from '@/shaft/room-floor';
import { AT } from '@/shaft/room-label';
import { beamChecks, besideGovernor, fitChecks, governorFree, governorRoomChecks, machineParts, panelFloorChecks, rinvioChecks, type SupportLoad } from '@/shaft/support-check';
import { ownAxis } from '@/shaft/support';
import type { ShaftCheck } from '@/shaft/types';
import type { Survey } from './survey';
import { existingOpenings, governorDropCheck, holesCheck, surveyFound, surveyGovernor, surveyOpenings } from './survey-site';

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
  // the drops as surveyed: with 2:1 the ropes rise half a pulley in from them along their line
  const spec = (room: Survey['room']): MachineSpec => {
    const { pulley2, ...m } = machineSpec(a.ctx, a.ctx.N.mass, made ? `${made.brand} ${made.model}` : '', room, shape, made);
    return { ...m, ropeIn: pulley2 ? pulley2 / 2 : 0 };
  };
  const M = spec(s.room), rf = M.rinvio;
  if (rf?.on !== 'frame' || rf.maker || s.room.support?.height !== undefined) return { M, made };
  const height = Math.round(Math.max(rinvioTopOf(M.Dp), rinvioAxisOf(M.Dp) + M.h - axisOverTop(M.D, shape)));
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
  const G = issues.includes('bottom') ? null : orientedGeo(R, { car, cw, ux, uy, calata }, M, sheaveAt);
  // the existing governor and openings the survey found (round 36): drawn — the governor's name and P4 off what stands
  // round it and off its free area (round 37) —, and on the floor for the checks; the openings in section B-B too; the
  // existing machine among the pieces the hook lifts
  // (its lettering placed for the scale the plan takes: round 37 review)
  const gov = surveyGovernor(s), compare = a.ctx.compare && a.ctx.O.mass > 0;
  const keep = G ? besideGovernor(G, M).map(outlineBox) : [], free = G && gov ? governorFree(gov, G, M).area : null;
  const found = (k: number, lettered: readonly DrawBox[] = [], dims: readonly DrawBox[] = []): RoomSite['governor'] => {
    const f = surveyFound(s, keep, free, k, lettered, dims);
    return { entities: f.entities, box: f.box, marks: f.marks };
  };
  const site: RoomSite = {
    W: s.shaft.W, D: s.shaft.D, wall: s.shaft.wall, ends: [[top, top + H], [top + H, top]], mid: [top + H / 2, top + H / 2],
    governor: found(AT), governorAt: found, govRopes: [], calata: () => null, calcEdits: false,
    drops: { car: [s.car.x, s.car.y], cw: [cw[0] - R.shaftX, cw[1] - R.shaftY] }, govFoot: gov, pieces: compare ? [a.ctx.O.mass] : [],
    openings: existingOpenings(s),
  };
  // the diverting pulley under the room's floor, or in the bedplate up into the machine standing over it
  const rf = M.rinvio, r = M.Dp / 2;
  if (rinvioClash(G, M)) issues.push('rinvio');
  // the support carries the machine as the full design counts it: the whole machine with what carries it (the maker's
  // bedplate, our bedframe, the support's own weight), the static load on its axis, the dynamic coefficient — as sheet 1
  // and the relazione tecnica count them
  const load = supportLoad(a.ctx, a.res.Mcw, { machine: carriedMass(G, M, a.ctx.N, made) });
  // what stands on the floor besides the machine: the main switch by the door, the existing governor when surveyed
  const off = Math.abs(measured - calata), others = [switchBox(R), ...(gov ? [gov] : [])];
  const beams = G ? hebFor(G, M, site, load) : null, chosenBy = R.heb;
  const checks: ShaftCheck[] = G ? [
    ...roomChecksOf(R, [...machineParts(G, M), ...others]), ...beamChecks(G, M, load), ...rinvioChecks(G, M), ...hebChecks(beams?.chosen.result ?? null), ...fitChecks(G, M, others),
    ...panelFloorChecks(G, M, others), check('m_calata', off <= KV_VERT.dropTol, Math.round(off), KV_VERT.dropTol, 0, 'mm'),
    ...governorRoomChecks(gov, G, M), ...governorDropCheck(s), ...holesCheck(G, M, surveyOpenings(s), beams ? hebDrawn(G, M, site) : null),
  ] : roomChecksOf(R);
  // the existing room's height under 2,0 m (UNI 10411-1:2024, 9.2; registry locale.esistente.altezza)
  if (G && I.context === 'repl') checks.push(existingRoomCheck(R));
  const hMin = M.Dp > 0 ? Math.ceil((rf?.on === 'frame' ? axisOverTop(M.D, M.shape ?? null, rf.bed) : ownAxis(M.D, M.shape ?? null)) + r) : null;
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
