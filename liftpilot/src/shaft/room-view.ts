// The machine room drawn: plan (walls and door, the shaft under it, the slab's openings, the machine, the diverting
// pulley on its stand, the governor, the control panel with its free area, the main switch) and section B-B along the
// rope drops (the floor slab over the shaft with its openings, walls and roof, the machine on its levelling shims, the
// pulley, the ropes as they run halfway through the travel). The machine is the 3D's (machine-outline.ts) scaled to
// the sheave, or a maker's as it is (machine-shape-view.ts); the sheave's axis and the pulley stand where the
// calculation puts them (machine-room.ts). Model entities for the drawing kernel; dimensions included.
import { chain, edit as E, line, path, rect, type Box, type Edit, type Entity, type Pt } from '../drawing';
import { ownAxis } from './support';
import { rinvioHEdit } from './rinvio-view';
import { rinvioAcross, rinvioRun } from './rinvio';
import { hebDrawn } from './heb';
import { hebPlan } from './heb-view';
import { supportPlan, supportSection } from './support-view';
import { MACHINE_A, machineElevation, machinePlan } from './machine-outline';
import { bodyBox } from './machine-shape';
import { shapeElevation, shapePlan } from './machine-shape-view';
import { dropSpan as span, machineU, machineV, roomRopes, ropeWidths, slabHoles, type MachineSpec, type RoomGeo } from './machine-room';
import { bbox, fittingsPlan } from './room-fittings-view';
import { outlineBox } from './room-floor';
import { machineParts } from './support-check';
import { layoutSite, type RoomSite } from './room-site';
import { pulleySection } from './room-pulley';
import type { Layout } from './types';

const WALL = 250;

/** Point on the rope drop line: u along it from the car drop, v across it. */
const onDrop = (G: RoomGeo, u: number, v: number): Pt => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
const quad = (G: RoomGeo, u0: number, v0: number, u1: number, v1: number): Pt[] => [onDrop(G, u0, v0), onDrop(G, u1, v0), onDrop(G, u1, v1), onDrop(G, u0, v1)];
const inBox = (p: Pt, b: readonly Pt[]): boolean => {
  const xs = b.map((q) => q[0]), ys = b.map((q) => q[1]);
  return p[0] >= Math.min(...xs) && p[0] <= Math.max(...xs) && p[1] >= Math.min(...ys) && p[1] <= Math.max(...ys);
};

/** The slab's openings with the car at either end of its travel. */
const holesOf = (S: RoomSite, M: MachineSpec, G: RoomGeo): ReturnType<typeof slabHoles> => slabHoles(M, G, G.room.slab, S.ends);

/** The machine room of a whole design in plan and in section B-B (its shaft, travel and governor from its layout). */
export const roomPlanEntities = (L: Layout, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } => roomPlanOn(layoutSite(L), M, G);
export const roomSectionEntities = (L: Layout, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } => roomSectionOn(layoutSite(L), M, G);

export function roomPlanOn(S: RoomSite, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [], w = ropeWidths(M.n, M.d), holes = holesOf(S, M, G), k = 1000 * G.s;
  // walls with the door
  const strip = (x0: number, y0: number, x1: number, y1: number): void => { if (x1 - x0 > 1 && y1 - y0 > 1) out.push(rect(x0, y0, x1, y1, 'wall', 'concrete')); };
  const door = R.doorWall, [d0, d1] = [R.doorAt, R.doorAt + R.doorW];
  const horizontal = (y0: number, y1: number, cut: boolean): void => {
    if (cut) { strip(-WALL, y0, d0, y1); strip(d1, y0, R.W + WALL, y1); } else strip(-WALL, y0, R.W + WALL, y1);
  };
  const vertical = (x0: number, x1: number, cut: boolean): void => {
    if (cut) { strip(x0, 0, x1, d0); strip(x0, d1, x1, R.D); } else strip(x0, 0, x1, R.D);
  };
  horizontal(-WALL, 0, door === 'front');
  horizontal(R.D, R.D + WALL, door === 'rear');
  vertical(-WALL, 0, door === 'left');
  vertical(R.W, R.W + WALL, door === 'right');
  out.push(rect(0, 0, R.W, R.D, 'wall'));
  // the shaft underneath, the slab's openings round the ropes and a pulley dipping into it, a 2:1 roping's dead ends
  out.push(rect(R.shaftX, R.shaftY, R.shaftX + S.W, R.shaftY + S.D, 'hidden'));
  for (const h of holes) {
    const a = (h.wheel ? Math.max(w.ropes, w.pulley) : w.ropes) + 30;
    out.push(path(quad(G, h.u0, -a, h.u1, a), true, 'thin'));
  }
  // a 2:1 roping's dead ends, each opening along the plane its pulley turns in
  for (const { at, dir } of G.deadEnds) {
    const a = 90, b = w.ropes + 50, n: Pt = [-dir[1], dir[0]];
    out.push(path([[-a, -b], [a, -b], [a, b], [-a, b]].map(([p, q]): Pt => [at[0] + p * dir[0] + q * n[0], at[1] + p * dir[1] + q * n[1]]), true, 'hidden'));
  }
  // the diverting pulley under the machine: on a stand over the opening when its axle is above the slab's underside,
  // else hung under the slab; the machine over it, its sheave's rope plane on the drop line, the motor toward the
  // counterweight or, turned round, toward the car (G.dir); the pulley's outline again where the machine hides it
  const pulley = M.Dp > 0 ? quad(G, G.pulleyAt - M.Dp / 2, -(w.ropes + 8), G.pulleyAt + M.Dp / 2, w.ropes + 8) : null;
  if (pulley) {
    const u = G.pulleyAt, r = M.Dp / 2, half = w.pulley, under = G.pulleyZ <= -R.slab;
    // in the bedplate its plates hold it (rinvio-view.ts); else its own stand over the opening
    const framed = M.rinvio?.on === 'frame' && G.pulleyZ - r >= 0;
    if (!under && !framed) {
      const u0 = u - r - 110, u1 = u + r + 110;
      for (const s of [-1, 1]) out.push(path(quad(G, u0, s * (half - 10), u1, s * half), true, 'outline'));
      for (const [a, b] of [[u0, u0 + 70], [u1 - 70, u1]]) out.push(path(quad(G, a, -half - 40, b, half + 40), true, 'outline', 'paper'));
    } else out.push(path(quad(G, u - 140, -half - 40, u + 140, half + 40), true, 'hidden'));
    out.push(path(pulley, true, under ? 'hidden' : 'outline', under ? undefined : 'steel'), line(onDrop(G, u, -half - 22), onDrop(G, u, half + 22), under ? 'hidden' : 'thin'));
  }
  // from the lowest up: the HEB beams on the shaft's walls, the support on them, the machine on it
  const [p0, p1] = span(G, 0, 0, R.W, R.D), heb = hebDrawn(G, M, S);
  if (heb) out.push(...hebPlan(heb, G, M, S));
  out.push(...supportPlan(M, G, (u, v) => onDrop(G, u, v), p0, p1));
  const F = G.frame;
  out.push(...(F.shape ? shapePlan(F, M.D, M.n, M.d, (x, z) => onDrop(G, machineU(G, x), machineV(G, z)))
    : machinePlan((x, z) => onDrop(G, machineU(G, x * k), machineV(G, z * k)), F.beams.map((z) => z / k))));
  if (pulley) out.push(path(pulley, true, 'hidden'));
  // control panel with its free area, main switch by the door (room-fittings-view.ts)
  const { entities: fittings, free, sw, swAt } = fittingsPlan(R, machineParts(G, M).map(outlineBox).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 })));
  out.push(...fittings);
  // the sheave's size on the side away from the gearbox, along the drop line (an upright one would cross the frame's
  // dimension); the load P1 where the room is free, its leader to the gearbox (the gearbox's side of the drop line: g)
  const g = G.dir, clearV = Math.max(w.ropes + 60, M.Dp > 0 ? w.pulley + 40 : 0), um = (G.frame0 + G.frame1) / 2;
  const side = g > 0 ? Math.min(G.across[0], -clearV) : Math.max(G.across[1], clearV), gear = g > 0 ? G.across[1] : G.across[0];
  // the bedplate with the diverting pulley, when the pulley turns in it: its chain goes on the machine's other side
  const rfx = M.rinvio, bed = rfx?.on === 'frame' && M.Dp > 0 && G.pulleyZ - M.Dp / 2 >= 0
    ? (([u0, u1], [v0, v1]) => ({ u0, u1, v0, v1 }))(rinvioRun(M, G), rinvioAcross(G, rfx)) : null;
  const ax = Math.abs(G.ux) > Math.abs(G.uy) ? 0 : 1;
  out.push({ e: 'text', at: onDrop(G, G.sheaveAt, side - 70 * g), text: `${M.label ? `${M.label} · ` : ''}Ø ${M.D}`, size: 1.8, align: 'c', angle: ax ? 90 : 0, halo: true });
  // clear of the main switch's lettering too (wide enough for it at 1:50)
  const inRoom = (p: Pt): boolean => p[0] > 250 && p[0] < R.W - 250 && p[1] > 250 && p[1] < R.D - 250;
  const offSwitch = (p: Pt): boolean => Math.abs(p[0] - swAt[0]) > 600 || Math.abs(p[1] - swAt[1]) > 250;
  // with the bedplate of the pulley: past its chain, past its ends, and off the control panel's chain (the generic
  // spots stay as they always were: an issued set's hash covers them)
  const pw0 = R.panelWall, panelRow = (pw0 === 'front' ? 0 : pw0 === 'rear' ? R.D : pw0 === 'left' ? 0 : R.W)
    + (pw0 === 'rear' || pw0 === 'right' ? -1 : 1) * (R.panelD + 150);
  const offPanelRow = (p: Pt): boolean => !bed || Math.abs((pw0 === 'front' || pw0 === 'rear' ? p[1] : p[0]) - panelRow) > 300;
  const spots = bed
    ? [onDrop(G, G.sheaveAt, g > 0 ? Math.max(G.across[1], bed.v1 + 300) + 380 : Math.min(G.across[0], bed.v0 - 300) - 380), onDrop(G, bed.u0 - 380, gear / 2),
      onDrop(G, bed.u1 + 380, gear / 2), onDrop(G, um, side - 700 * g), onDrop(G, um, side - 400 * g)]
    : [onDrop(G, G.sheaveAt, gear + 380 * g), onDrop(G, G.frame1 + 380, gear / 2), onDrop(G, G.frame0 - 380, gear / 2), onDrop(G, um, side - 700 * g), onDrop(G, um, side - 400 * g)];
  out.push({ e: 'tag', at: spots.find((p) => inRoom(p) && !inBox(p, free) && offSwitch(p) && offPanelRow(p)) ?? spots[0], text: 'P1',
    to: onDrop(G, machineU(G, F.shape ? 0 : 0.1 * k), machineV(G, 0)) });
  out.push(...S.governor.entities);
  const gov = S.governor.box;
  // dimensions: room, door, bedframe, rope drops; outside the walls the drops in the shaft first, the shaft under the
  // room (where it stands from the room's walls, and its size, from its outline), the room's own size outermost
  const dimSide = R.doorWall === 'front' ? 'bottom' : R.doorWall === 'rear' ? 'top' : R.doorWall;
  const xSide = dimSide === 'top' ? 'bottom' : 'top', ySide = dimSide === 'right' ? 'left' : 'right', first = S.drops ? 1 : 0;
  const shaftY = xSide === 'top' ? R.shaftY + S.D : R.shaftY, shaftX = ySide === 'right' ? R.shaftX + S.W : R.shaftX;
  const across = dimSide === 'top' || dimSide === 'bottom', wallLen = across ? R.W : R.D;
  out.push(chain({ dir: across ? 'x' : 'y', pts: [0, d0, d1, wallLen], side: dimSide, row: 0, text: [null, `Porta ${R.doorW}x H. ${R.doorH}`, null],
    edit: [E('room.doorAt'), E('room.doorW'), E('room.doorAt', wallLen - R.doorW, -1)] }));
  if (S.drops) out.push(...dropChains(S, S.drops, R, dimSide));
  out.push(chain({ dir: 'x', pts: [0, R.shaftX, R.shaftX + S.W, R.W], side: xSide, row: first, text: [null, 'Vano {v}', null],
    edit: [E('room.shaftX'), E('W'), E('room.shaftX', R.W - S.W, -1)], from: [undefined, shaftY, shaftY, undefined] }));
  out.push(chain({ dir: 'y', pts: [0, R.shaftY, R.shaftY + S.D, R.D], side: ySide, row: first, text: [null, 'Vano {v}', null],
    edit: [E('room.shaftY'), E('D'), E('room.shaftY', R.D - S.D, -1)], from: [undefined, shaftX, shaftX, undefined] }));
  out.push(chain({ dir: 'x', pts: [0, R.W], side: xSide, row: first + 1, text: ['{v} Locale'], edit: [E('room.W')] }));
  out.push(chain({ dir: 'y', pts: [0, R.D], side: ySide, row: first + 1, text: ['{v} Locale'], edit: [E('room.D')] }));
  // the control panel along its wall, in front of it (its name stays readable inside), and its depth into the room
  const pw = R.panelWall, alongP = pw === 'front' || pw === 'rear', panelLen = alongP ? R.W : R.D;
  const face = pw === 'front' ? 0 : pw === 'rear' ? R.D : pw === 'left' ? 0 : R.W, into = pw === 'rear' || pw === 'right' ? -1 : 1, inner = face + into * R.panelD;
  // (from the nearer wall only: a chain across the room would cross the machine)
  const nearStart = R.panelAt <= panelLen - R.panelAt - R.panelW;
  out.push(chain(nearStart
    ? { dir: alongP ? 'x' : 'y', pts: [0, R.panelAt, R.panelAt + R.panelW], at: inner + into * 150, from: [null, inner, inner], text: [null, 'Quadro {v}'],
      edit: [E('room.panelAt'), E('room.panelW')] }
    : { dir: alongP ? 'x' : 'y', pts: [R.panelAt, R.panelAt + R.panelW, panelLen], at: inner + into * 150, from: [inner, inner, null], text: ['Quadro {v}', null],
      edit: [E('room.panelW'), E('room.panelAt', panelLen - R.panelW, -1)] }));
  const side1 = R.panelAt + R.panelW;
  out.push(chain({ dir: alongP ? 'y' : 'x', pts: [Math.min(face, inner), Math.max(face, inner)], at: side1 + 120, from: [side1, side1], text: ['Prof. {v}'], edit: [E('room.panelD')] }));
  // the frame's and the drops' chains beside the machine, each moved further out until its row and lettering clear the
  // governor, the control panel's free area and the main switch
  const blocked = [gov, bbox(free), bbox(sw)].filter((x): x is Box => x !== null);
  const inside = (p: Pt): boolean => p[0] > 100 && p[0] < R.W - 100 && p[1] > 100 && p[1] < R.D - 100;
  // how much of a row's band (its lettering and ticks) lies on them: 0 clear, Infinity out of the room
  const onBlocked = (v: number, u0: number, u1: number): number => {
    const band = bbox(quad(G, u0 - 80, v - 150, u1 + 80, v + 150)), over = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    return inside(onDrop(G, (u0 + u1) / 2, v)) ? blocked.reduce((t, q) => t + over(q.x0, q.x1, band.x0, band.x1) * over(q.y0, q.y1, band.y0, band.y1), 0) : Infinity;
  };
  // the first clear row: away from the gearbox as always, else past the machine (and the bedplate's chain) on its side —
  // the rows counted toward the gearbox (w = g·v); none clear, the one least on what is there
  const pick = (rows: readonly number[], u0: number, u1: number): number =>
    g * (rows.find((w) => onBlocked(g * w, u0, u1) === 0) ?? rows.reduce((b, w) => (onBlocked(g * w, u0, u1) < onBlocked(g * b, u0, u1) ? w : b)));
  const far = (v0: number, v1: number): number => Math.max(g * v0, g * v1), gs = g * side;
  const beyond = Math.max(far(G.across[0], G.across[1]), bed ? far(bed.v0, bed.v1) + 220 : -Infinity) + 200;
  const vFrame = pick([gs - 220, gs - 370, beyond, beyond + 150], G.frame0, G.frame1), wf = g * vFrame;
  const vDrop = wf < 0 ? pick([Math.min(gs - 420, wf - 200), Math.min(gs - 570, wf - 350), beyond, beyond + 150], 0, G.calata)
    : pick([gs - 220, gs - 370, gs - 520, wf + 200, wf + 350], 0, G.calata);
  const [a, b] = [onDrop(G, G.frame0, vFrame), onDrop(G, G.frame1, vFrame)], drop = onDrop(G, 0, vDrop);
  const sorted = (p: number, q: number): number[] => [Math.min(p, q), Math.max(p, q)];
  // from the bedframe's side toward the chain (a machine on a bedplate's irons or on the maker's pedestal has none)
  const edgeV = vFrame < G.across[0] ? G.across[0] : G.across[1], edge = onDrop(G, G.frame0, edgeV)[1 - ax];
  // askew, the frames' lengths along the drop line itself, like the drop's (on an axis their projection is their length)
  const askew = Math.max(Math.abs(G.ux), Math.abs(G.uy)) <= 0.999, on = { o: G.carDrop, u: [G.ux, G.uy] as Pt };
  if (G.frame.on === 'frame') {
    out.push(chain(askew ? { dir: ax ? 'y' : 'x', on, pts: [G.frame0, G.frame1], at: vFrame, from: [edgeV, edgeV], text: ['{v} Telaio argano'] }
      : { dir: ax ? 'y' : 'x', pts: sorted(a[ax], b[ax]), at: a[1 - ax], from: [edge, edge], text: ['{v} Telaio argano'] }));
  }
  // the rope drop between the ropes, from each of them: along an axis on a chain there; askew, along the drop line
  // itself (the rows outside give where each drop stands)
  const [r0, r1] = G.carDrop[ax] <= G.cwDrop[ax] ? [G.carDrop, G.cwDrop] : [G.cwDrop, G.carDrop];
  out.push(chain(Math.max(Math.abs(G.ux), Math.abs(G.uy)) > 0.999
    ? { dir: ax ? 'y' : 'x', pts: [r0[ax], r1[ax]], at: drop[1 - ax], from: [r0[1 - ax], r1[1 - ax]], text: ['Calata Funi {v}'], edit: [S.calata(0, false)] }
    : { dir: ax ? 'y' : 'x', on: { o: G.carDrop, u: [G.ux, G.uy] }, pts: [0, G.calata], at: vDrop, from: [0, 0], text: ['Calata Funi {v}'], edit: [S.calata(0, false)] }));
  // the bedplate with the diverting pulley: its length and width beside the machine, away from the drop's chains
  if (bed) {
    const bv = g > 0 ? bed.v1 : bed.v0, [c, d] = [onDrop(G, bed.u0, bv + 220 * g), onDrop(G, bed.u1, bv + 220 * g)], side1 = onDrop(G, bed.u0, bv)[1 - ax];
    const text = [`{v} × ${Math.round(bed.v1 - bed.v0)} Telaio con rinvio`];
    out.push(chain(askew ? { dir: ax ? 'y' : 'x', on, pts: [bed.u0, bed.u1], at: bv + 220 * g, from: [bv, bv], text }
      : { dir: ax ? 'y' : 'x', pts: sorted(c[ax], d[ax]), at: c[1 - ax], from: [side1, side1], text }));
  }
  return { entities: out, bounds: { x0: -WALL, y0: -WALL, x1: R.W + WALL, y1: R.D + WALL } };
}

/** A survey's rope drops from the shaft's walls, one chain along each axis nearest the drawing (row 0, inside the
 *  shaft's own): the car's drop changes with its segment from the nearer wall; the counterweight's follows the
 *  calculation. */
function dropChains(S: RoomSite, d: { car: Pt; cw: Pt }, R: RoomGeo['room'], dimSide: 'top' | 'bottom' | 'left' | 'right'): Entity[] {
  const out: Entity[] = [];
  for (const [ax, len, at0, side] of [[0, S.W, R.shaftX, dimSide === 'top' ? 'bottom' : 'top'], [1, S.D, R.shaftY, dimSide === 'right' ? 'left' : 'right']] as const) {
    const car = Math.round(d.car[ax] * 2) / 2, cw = Math.round(d.cw[ax] * 2) / 2, mid = Math.abs(cw - car) < 1 ? [car] : [Math.min(car, cw), Math.max(car, cw)];
    const key = ax ? 'drop.carY' : 'drop.carX', pts = [0, ...mid, len];
    const edit = pts.slice(1).map((p, i): Edit | null => (i === 0 && p === car ? E(key) : i === pts.length - 2 && pts[i] === car ? E(key, len, -1) : null));
    // each drop's extension line from the drop itself (two drops on one line: from the farther, through the nearer), the
    // shaft's walls from the drawing's edge
    const other = ax ? R.shaftX : R.shaftY, across = (q: Pt): number => other + q[1 - ax], up = side === 'top' || side === 'right';
    const dropAt = (p: number): number => (mid.length === 1 ? (up ? Math.min : Math.max)(across(d.car), across(d.cw)) : across(Math.abs(p - car) < 1 ? d.car : d.cw));
    const from = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? undefined : dropAt(p)));
    out.push(chain({ dir: ax ? 'y' : 'x', pts: pts.map((p) => at0 + p), side, row: 0, edit, from }));
  }
  return out;
}

/** Section B-B along the rope drops: X is u along the drop line, Z the height above the room floor. */
export function roomSectionOn(S: RoomSite, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [];
  const [r0, r1] = span(G, 0, 0, R.W, R.D), [s0, s1] = span(G, R.shaftX, R.shaftY, R.shaftX + S.W, R.shaftY + S.D);
  const top = R.H, ridge = R.ridge > 0 ? R.ridge : R.H, midU = (r0 + r1) / 2, below = 1300, foot = -R.slab - below;
  // floor slab over the shaft, open where the ropes and a pulley go through; the shaft's walls under it
  let u = r0 - WALL;
  for (const h of holesOf(S, M, G)) {
    if (h.u0 > u) out.push(rect(u, -R.slab, h.u0, 0, 'wall', 'concrete'));
    u = Math.max(u, h.u1);
  }
  if (r1 + WALL > u) out.push(rect(u, -R.slab, r1 + WALL, 0, 'wall', 'concrete'));
  for (const x of [s0 - S.wall, s1]) out.push(rect(x, foot, x + S.wall, -R.slab, 'wall', 'concrete'));
  out.push(line([s0, foot], [s1, foot], 'axis'));
  // walls and roof
  out.push(rect(r0 - WALL, 0, r0, top, 'wall', 'concrete'), rect(r1, 0, r1 + WALL, top, 'wall', 'concrete'));
  if (ridge > top) {
    out.push(path([[r0 - WALL, top], [midU, ridge], [r1 + WALL, top], [r1 + WALL, top + WALL], [midU, ridge + WALL], [r0 - WALL, top + WALL]], true, 'wall', 'concrete'));
  } else out.push(rect(r0 - WALL, top, r1 + WALL, top + WALL, 'wall', 'concrete'));
  // the machine on its support (shims, frame, beams, plates or plinth), its sheave's axis at the height the
  // calculation counts
  const k = 1000 * G.s, F = G.frame, base = F.shape ? M.axis - F.axis : M.axis - MACHINE_A.yWheel * k, zs = M.axis, D = M.D, rf = M.rinvio ?? null;
  // the pulley's h right of it and of the frames, nearest to them (on the bedplate of the pulley, past it); the support's
  // own heights beyond it
  // (kept 150 off the wall, not on its face, as long as the room allows)
  const bedRun = rf?.on === 'frame' && M.Dp > 0 && G.pulleyZ - M.Dp / 2 >= 0 ? rinvioRun(M, G) : null;
  const near = Math.max(G.pulleyAt + M.Dp / 2, G.frame1, bedRun ? bedRun[1] : -Infinity);
  const ue = Math.max(Math.min(near + (bedRun ? 300 : 160), r1 - 150), near + 60), hChain = M.Dp > 0 && Math.abs(M.h) > 1;
  out.push(...supportSection(M, G, r0, r1, hChain ? ue : null, hebDrawn(G, M, S)));
  // (turned round, the machine seen from its other side: its elevation mirrored along the drop line)
  out.push(...(F.shape ? shapeElevation(F, D, (x, y) => [machineU(G, x), base + y]) : machineElevation((x, y) => [machineU(G, x * k), base + y * k])));
  const centre = (c: Pt, r: number): void => { out.push(line([c[0] - r - 40, c[1]], [c[0] + r + 40, c[1]], 'axis'), line([c[0], c[1] - r - 40], [c[0], c[1] + r + 40], 'axis')); };
  centre([G.sheaveAt, zs], D / 2);
  // the ropes as they run with the car halfway, cut at the drawing's foot; the pulley in the bedplate (drawn with it), on
  // its stand, or — an h entered by hand that takes it under the floor (an issue of the form) — hung under the slab; the
  // dead ends of a 2:1 roping
  // (cut over the band of the dimensions at the foot, which they would cross)
  const [carD, cwD] = S.mid, ropeFoot = foot + 620;
  for (const [p, q] of roomRopes(M, G, carD, cwD)) {
    if (p[1] < ropeFoot && q[1] < ropeFoot) continue;
    const cut = (a: readonly [number, number], b: readonly [number, number]): Pt => (a[1] >= ropeFoot ? [a[0], a[1]] : [a[0] + ((b[0] - a[0]) * (ropeFoot - a[1])) / (b[1] - a[1]), ropeFoot]);
    out.push(line(cut(p, q), cut(q, p), 'thin'));
  }
  if (M.Dp > 0) out.push(...pulleySection(M, G, s0, s1));
  // a 2:1 roping's dead ends hung under the slab, where they stand along the drop line
  for (const { at } of G.deadEnds) {
    const x = (at[0] - G.carDrop[0]) * G.ux + (at[1] - G.carDrop[1]) * G.uy;
    out.push(rect(x - 90, -R.slab - 16, x + 90, -R.slab, 'outline', 'steel'), line([x, -R.slab - 16], [x, ropeFoot], 'thin'));
  }
  // dimensions and references: the axis' height, the pulley's h and dx as the calculation takes them
  out.push(chain({ dir: 'y', pts: [-R.slab, 0, top], side: 'left', row: 0, text: ['{v} Soletta', '{v} H. Locale'], edit: [E('room.slab'), E('room.H')] }));
  if (ridge > top) out.push(chain({ dir: 'y', pts: [0, ridge], side: 'left', row: 1, text: ['{v} H. Colmo'], edit: [E('room.ridge')] }));
  out.push(chain({ dir: 'y', pts: [0, R.doorH], side: 'right', row: 0, text: ['{v} H. Porta'], edit: [E('room.doorH')] }));
  out.push(chain({ dir: 'y', pts: [0, R.panelH], side: 'right', row: 1, text: ['{v} H. Quadro'], edit: [E('room.panelH')] }));
  // the sheave's axis: the support's height takes the change (the machine's own height and the HEB beams under
  // the support stay)
  const hb = M.base ?? 0, axisEdit = rf?.on === 'frame' ? (rf.maker ? null : E('rinvio.height', -F.axis - hb)) : E('sup.height', -(ownAxis(D, F.shape) + hb));
  // (on the bedplate of the pulley, left of its two heights; the h of the pulley right of its legs)
  out.push(chain({ dir: 'y', pts: [0, zs], at: bedRun ? Math.min(G.frame0 - 120, bedRun[0] - 620) : G.frame0 - 120, from: [null, G.sheaveAt], text: ['Asse {v}'], edit: [axisEdit] }));
  if (M.Dp > 0) {
    const low = G.pulleyZ < zs;
    const left = G.sheaveAt < G.pulleyAt;
    // the pulley's height below the sheave is the calculation's h; its distance dx follows the rope drop
    // on the bedplate whose h the calculation took, a change of h is a change of the bedplate's top; on its own stand,
    // of the machine's support (the pulley's axis stays where the stand has it)
    const standH = E('sup.height', G.pulleyZ - ownAxis(D, F.shape) - hb, low ? 1 : -1);
    const hEdit = rf?.auto ? (rf.on === 'frame' ? (low ? rinvioHEdit(M, rf) : null) : standH) : S.calcEdits ? E('calc.h', 0, low ? 1 : -1) : null;
    if (hChain) out.push(chain({ dir: 'y', pts: low ? [G.pulleyZ, zs] : [zs, G.pulleyZ], at: ue, from: low ? [G.pulleyAt, G.sheaveAt] : [G.sheaveAt, G.pulleyAt], text: ['h {v}'], edit: [hEdit] }));
    const less = 2 * M.ropeIn + M.D / 2 + (M.reverse ? -M.Dp / 2 : M.Dp / 2);
    // over the room, nearest to it: the frames' lengths in the rows beyond
    out.push(chain({ dir: 'x', pts: left ? [G.sheaveAt, G.pulleyAt] : [G.pulleyAt, G.sheaveAt], side: 'top', row: 0, from: left ? [zs, G.pulleyZ] : [G.pulleyZ, zs], text: ['dx {v}'],
      edit: [left ? S.calata(less, true) : null] }));
  }
  // the bedframe's length over the room, from its ends (none on a bedplate's irons or the maker's pedestal); the rope
  // drop between the ropes' axes in the shaft
  if (F.on === 'frame') out.push(chain({ dir: 'x', pts: [G.frame0, G.frame1], side: 'top', row: M.Dp > 0 ? 1 : 0, from: [base, base], text: ['{v} Telaio argano'] }));
  out.push(chain({ dir: 'x', pts: [0, G.calata], at: foot + 160, from: [ropeFoot, ropeFoot], axis: [true, true], text: ['{v} Calata Funi (Rif.)'], edit: [S.calata(0, true)] }));
  const along = Math.abs(G.uy) > 0.999 ? 'D' : Math.abs(G.ux) > 0.999 ? 'W' : null;
  out.push(chain({ dir: 'x', pts: [s0, s1], at: foot + 420, text: ['Vano {v}'], edit: [along ? E(along) : null] }));
  // the sheave's diameter with its leader to the rim, on the side away from the motor
  const away = -G.dir, rim: Pt = [G.sheaveAt + away * (D / 2) * Math.SQRT1_2, zs + (D / 2) * Math.SQRT1_2], tag: Pt = [G.sheaveAt + away * (D / 2 + 40), zs + D / 2 + 60];
  out.push(line([tag[0] - away * 10, tag[1] + 20], rim, 'dim'), { e: 'text', at: tag, text: `Ø${M.D}`, size: 2.2, align: away < 0 ? 'r' : 'l', halo: true });
  const body = F.shape ? bodyBox(F.shape) : null, um = machineU(G, body ? (body[0] + body[3]) / 2 : 0.53 * k);
  out.push({ e: 'tag', at: [um, top - 350], text: 'P1', to: [um, body ? base + F.bed + 0.9 * body[4] : base + 0.55 * k] });
  out.push({ e: 'text', at: [(s0 + s1) / 2, foot - 250], text: 'VANO', size: 2.2, align: 'c' });
  return { entities: out, bounds: { x0: r0 - WALL, y0: foot, x1: r1 + WALL, y1: Math.max(top, ridge) + WALL } };
}
