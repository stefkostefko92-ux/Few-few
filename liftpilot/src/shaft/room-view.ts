// The machine room drawn: plan (walls and door, the shaft under it, the slab's openings, the machine, the diverting
// pulley on its stand, the governor, the control panel with its free area, the main switch) and section B-B along the
// rope drops (the floor slab over the shaft with its openings, walls and roof, the machine on its levelling shims, the
// pulley, the ropes as they run halfway through the travel). The machine is the 3D's (machine-outline.ts) scaled to
// the sheave, or a maker's as it is (machine-shape-view.ts); the sheave's axis and the pulley stand where the
// calculation puts them (machine-room.ts). Model entities for the drawing kernel; dimensions included.
import { chain, circle, edit as E, line, path, rect, type Box, type Entity, type Pt } from '../drawing';
import { calataEdit } from './drop';
import { ownAxis, padsOf, supportOf } from './support';
import { supportPlan, supportSection } from './support-view';
import { governorSpot } from './governor';
import { MACHINE_A, machineElevation, machinePlan } from './machine-outline';
import { bodyBox } from './machine-shape';
import { shapeElevation, shapePlan } from './machine-shape-view';
import { dropSpan as span, hitchDepths, roomRopes, ropeWidths, slabHoles, type MachineSpec, type RoomGeo } from './machine-room';
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
const holesOf = (L: Layout, M: MachineSpec, G: RoomGeo): ReturnType<typeof slabHoles> => slabHoles(M, G, G.room.slab, hitchDepths(L).ends);

export function roomPlanEntities(L: Layout, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [], I = L.inputs, w = ropeWidths(M.n, M.d), holes = holesOf(L, M, G), k = 1000 * G.s;
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
  out.push(rect(R.shaftX, R.shaftY, R.shaftX + I.W, R.shaftY + I.D, 'hidden'));
  for (const h of holes) {
    const a = (h.wheel ? Math.max(w.ropes, w.pulley) : w.ropes) + 30;
    out.push(path(quad(G, h.u0, -a, h.u1, a), true, 'thin'));
  }
  if (M.ropeIn > 0) for (const u of [-M.ropeIn, G.calata + M.ropeIn]) out.push(path(quad(G, u - 90, -w.ropes - 50, u + 90, w.ropes + 50), true, 'hidden'));
  // the diverting pulley under the machine: on a stand over the opening when its axle is above the slab's underside,
  // else hung under the slab; the machine over it, its sheave's rope plane on the drop line, the motor toward the
  // counterweight; the pulley's outline again where the machine hides it
  const pulley = M.Dp > 0 ? quad(G, G.pulleyAt - M.Dp / 2, -(w.ropes + 8), G.pulleyAt + M.Dp / 2, w.ropes + 8) : null;
  if (pulley) {
    const u = G.pulleyAt, r = M.Dp / 2, half = w.pulley, under = G.pulleyZ <= -R.slab;
    if (!under) {
      const u0 = u - r - 110, u1 = u + r + 110;
      for (const s of [-1, 1]) out.push(path(quad(G, u0, s * (half - 10), u1, s * half), true, 'outline'));
      for (const [a, b] of [[u0, u0 + 70], [u1 - 70, u1]]) out.push(path(quad(G, a, -half - 40, b, half + 40), true, 'outline', 'paper'));
    } else out.push(path(quad(G, u - 140, -half - 40, u + 140, half + 40), true, 'hidden'));
    out.push(path(pulley, true, under ? 'hidden' : 'outline', under ? undefined : 'steel'), line(onDrop(G, u, -half - 22), onDrop(G, u, half + 22), under ? 'hidden' : 'thin'));
  }
  const [p0, p1] = span(G, 0, 0, R.W, R.D);
  out.push(...supportPlan(M, G, (u, v) => onDrop(G, u, v), p0, p1));
  const F = G.frame;
  out.push(...(F.shape ? shapePlan(F, M.D, M.n, M.d, (x, z) => onDrop(G, G.sheaveAt + x, F.zSheave - z))
    : machinePlan((x, z) => onDrop(G, G.sheaveAt + x * k, (MACHINE_A.zSheave - z) * k))));
  if (pulley) out.push(path(pulley, true, 'hidden'));
  // control panel with its free area, main switch by the door
  const pan = wallBox(R, R.panelWall, R.panelAt, R.panelW, R.panelD), free = wallBox(R, R.panelWall, R.panelAt, R.panelW, R.panelD + 700);
  out.push(path(free, true, 'space'), line(free[0], free[2], 'space'), line(free[1], free[3], 'space'));
  out.push(path(pan, true, 'outline', 'paper'), { e: 'text', at: mid(pan), text: 'QUADRO MANOVRA', size: 1.8, align: 'c', halo: true });
  const sw = wallBox(R, R.doorWall, R.doorAt + R.doorW + 150, 200, 120);
  const inward: Pt = R.doorWall === 'front' ? [0, 1] : R.doorWall === 'rear' ? [0, -1] : R.doorWall === 'left' ? [1, 0] : [-1, 0];
  const swAt: Pt = [mid(sw)[0] + inward[0] * 260, mid(sw)[1] + inward[1] * 260 - 30];
  out.push(path(sw, true, 'outline', 'paper'), { e: 'text', at: swAt, text: 'INTERRUTTORE GENERALE', size: 1.5, align: 'c' });
  // the sheave's size on the side away from the gearbox, along the drop line (an upright one would cross the frame's
  // dimension); the load P1 where the room is free, its leader to the gearbox
  const side = Math.min(G.across[0], -Math.max(w.ropes + 60, M.Dp > 0 ? w.pulley + 40 : 0)), um = (G.frame0 + G.frame1) / 2;
  const ax = Math.abs(G.ux) > Math.abs(G.uy) ? 0 : 1;
  out.push({ e: 'text', at: onDrop(G, G.sheaveAt, side - 70), text: `${M.label ? `${M.label} · ` : ''}Ø ${M.D}`, size: 1.8, align: 'c', angle: ax ? 90 : 0, halo: true });
  // clear of the main switch's lettering too (wide enough for it at 1:50)
  const inRoom = (p: Pt): boolean => p[0] > 250 && p[0] < R.W - 250 && p[1] > 250 && p[1] < R.D - 250;
  const offSwitch = (p: Pt): boolean => Math.abs(p[0] - swAt[0]) > 600 || Math.abs(p[1] - swAt[1]) > 250;
  const spots = [onDrop(G, G.sheaveAt, G.across[1] + 380), onDrop(G, G.frame1 + 380, G.across[1] / 2), onDrop(G, G.frame0 - 380, G.across[1] / 2), onDrop(G, um, side - 700), onDrop(G, um, side - 400)];
  out.push({ e: 'tag', at: spots.find((p) => inRoom(p) && !inBox(p, free) && offSwitch(p)) ?? spots[0], text: 'P1', to: F.shape ? onDrop(G, G.sheaveAt, F.zSheave) : onDrop(G, 0.1 * k + G.sheaveAt, MACHINE_A.zSheave * k) });
  governor(L, R, out);
  // dimensions: room, door, bedframe, rope drops
  const dimSide = R.doorWall === 'front' ? 'bottom' : R.doorWall === 'rear' ? 'top' : R.doorWall;
  out.push(chain({ dir: 'x', pts: [0, R.W], side: dimSide === 'top' ? 'bottom' : 'top', row: 0, edit: [E('room.W')] }));
  out.push(chain({ dir: 'y', pts: [0, R.D], side: dimSide === 'right' ? 'left' : 'right', row: 0, edit: [E('room.D')] }));
  const across = dimSide === 'top' || dimSide === 'bottom', wallLen = across ? R.W : R.D;
  out.push(chain({ dir: across ? 'x' : 'y', pts: [0, d0, d1, wallLen], side: dimSide, row: 0, text: [null, `Porta ${R.doorW}x H. ${R.doorH}`, null],
    edit: [E('room.doorAt'), E('room.doorW'), E('room.doorAt', wallLen - R.doorW, -1)] }));
  // the shaft under the room: where it stands from the room's walls, and its size
  out.push(chain({ dir: 'x', pts: [0, R.shaftX, R.shaftX + I.W, R.W], side: dimSide === 'top' ? 'bottom' : 'top', row: 1, text: [null, 'Vano {v}', null],
    edit: [E('room.shaftX'), E('W'), E('room.shaftX', R.W - I.W, -1)] }));
  out.push(chain({ dir: 'y', pts: [0, R.shaftY, R.shaftY + I.D, R.D], side: dimSide === 'right' ? 'left' : 'right', row: 1, text: [null, 'Vano {v}', null],
    edit: [E('room.shaftY'), E('D'), E('room.shaftY', R.D - I.D, -1)] }));
  // the control panel along its wall, in front of it (its name stays readable inside), and its depth into the room
  const pw = R.panelWall, alongP = pw === 'front' || pw === 'rear', panelLen = alongP ? R.W : R.D;
  const face = pw === 'front' ? 0 : pw === 'rear' ? R.D : pw === 'left' ? 0 : R.W, into = pw === 'rear' || pw === 'right' ? -1 : 1, inner = face + into * R.panelD;
  out.push(chain({ dir: alongP ? 'x' : 'y', pts: [0, R.panelAt, R.panelAt + R.panelW, panelLen], at: inner + into * 150, text: [null, '{v}', null],
    edit: [E('room.panelAt'), E('room.panelW'), E('room.panelAt', panelLen - R.panelW, -1)] }));
  out.push(chain({ dir: alongP ? 'y' : 'x', pts: [Math.min(face, inner), Math.max(face, inner)], at: R.panelAt + R.panelW + 120, edit: [E('room.panelD')] }));
  const [a, b] = [onDrop(G, G.frame0, side - 220), onDrop(G, G.frame1, side - 220)], drop = onDrop(G, 0, side - 420);
  const sorted = (p: number, q: number): number[] => [Math.min(p, q), Math.max(p, q)];
  out.push(chain({ dir: ax ? 'y' : 'x', pts: sorted(a[ax], b[ax]), at: a[1 - ax], text: ['{v} Telaio argano'] }));
  out.push(chain({ dir: ax ? 'y' : 'x', pts: sorted(G.carDrop[ax], G.cwDrop[ax]), at: drop[1 - ax], text: ['Calata Funi {v}'], edit: [calataEdit(L)] }));
  return { entities: out, bounds: { x0: -WALL, y0: -WALL, x1: R.W + WALL, y1: R.D + WALL } };
}

/** The governor over its rope where the 3D puts it (governor.ts): its base, the A-frame's cheeks, the sheave seen from
 *  above with the jaw's housing over it, the two strands through the slab; the model by the rated speed, written
 *  toward the wall it is nearer to, out of the machine's way. */
function governor(L: Layout, R: RoomGeo['room'], out: Entity[]): void {
  const spot = governorSpot(L), I = L.inputs;
  if (spot) {
    const g = spot.G, gx = R.shaftX + spot.x, gy = R.shaftY + (spot.y1 + spot.y2) / 2, fw = g.baseW - 6;
    out.push(rect(gx - g.baseA, gy - g.baseW, gx + g.baseA, gy + g.baseW, 'outline', 'paper'));
    for (const sx of [-1, 1]) out.push(rect(gx + sx * 26, gy - fw, gx + sx * 40, gy + fw, 'thin'));
    out.push(rect(gx - g.half, gy - g.R - 14, gx + g.half, gy + g.R + 14, 'outline', 'steel'), rect(gx - 26, gy - 48, gx + 26, gy + 48, 'thin'));
    for (const y of [spot.y1, spot.y2]) {
      const c: Pt = [gx, R.shaftY + y];
      out.push(rect(c[0] - 25, c[1] - 25, c[0] + 25, c[1] + 25, 'thin'), circle(c, g.rope, 'outline', 'steel'));
    }
    const s = gx - R.shaftX < I.W / 2 ? -1 : 1;
    out.push({ e: 'text', at: [gx + s * (g.baseA + 60), gy - 30], text: `Limitatore ${g.model}`, size: 1.6, align: s < 0 ? 'r' : 'l', halo: true });
    out.push({ e: 'tag', at: [gx + s * (g.baseA + 200), gy + g.baseW + 230], text: 'P4', to: [gx + s * g.baseA, gy + g.baseW / 2] });
    return;
  }
  // a cantilever sling: no place worked out, the governor shown by the car rail opposite the counterweight
  const railR = L.rails.filter((r) => r.kind === 'car').sort((a, b) => (L.cwSide === 'left' ? b.x - a.x : a.x - b.x))[0];
  if (railR) {
    const gx = R.shaftX + railR.x + (railR.dir === 'left' ? 120 : -120), gy = R.shaftY + railR.y + 250;
    out.push(rect(gx - 150, gy - 90, gx + 150, gy + 90, 'outline', 'paper'), circle([gx, gy], 125, 'thin'));
    out.push({ e: 'tag', at: [gx + 330, gy + 160], text: 'P4', to: [gx + 150, gy] });
  }
}

function wallBox(R: RoomGeo['room'], w: 'front' | 'rear' | 'left' | 'right', at: number, len: number, depth: number): Pt[] {
  if (w === 'front') return [[at, 0], [at + len, 0], [at + len, depth], [at, depth]];
  if (w === 'rear') return [[at, R.D - depth], [at + len, R.D - depth], [at + len, R.D], [at, R.D]];
  if (w === 'left') return [[0, at], [depth, at], [depth, at + len], [0, at + len]];
  return [[R.W - depth, at], [R.W, at], [R.W, at + len], [R.W - depth, at + len]];
}
const mid = (p: Pt[]): Pt => [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];

/** Section B-B along the rope drops: X is u along the drop line, Z the height above the room floor. */
export function roomSectionEntities(L: Layout, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [], I = L.inputs;
  const [r0, r1] = span(G, 0, 0, R.W, R.D), [s0, s1] = span(G, R.shaftX, R.shaftY, R.shaftX + I.W, R.shaftY + I.D);
  const top = R.H, ridge = R.ridge > 0 ? R.ridge : R.H, midU = (r0 + r1) / 2, below = 1300, foot = -R.slab - below;
  // floor slab over the shaft, open where the ropes and a pulley go through; the shaft's walls under it
  let u = r0 - WALL;
  for (const h of holesOf(L, M, G)) {
    if (h.u0 > u) out.push(rect(u, -R.slab, h.u0, 0, 'wall', 'concrete'));
    u = Math.max(u, h.u1);
  }
  if (r1 + WALL > u) out.push(rect(u, -R.slab, r1 + WALL, 0, 'wall', 'concrete'));
  for (const x of [s0 - I.wall, s1]) out.push(rect(x, foot, x + I.wall, -R.slab, 'wall', 'concrete'));
  out.push(line([s0, foot], [s1, foot], 'axis'));
  // walls and roof
  out.push(rect(r0 - WALL, 0, r0, top, 'wall', 'concrete'), rect(r1, 0, r1 + WALL, top, 'wall', 'concrete'));
  if (ridge > top) {
    out.push(path([[r0 - WALL, top], [midU, ridge], [r1 + WALL, top], [r1 + WALL, top + WALL], [midU, ridge + WALL], [r0 - WALL, top + WALL]], true, 'wall', 'concrete'));
  } else out.push(rect(r0 - WALL, top, r1 + WALL, top + WALL, 'wall', 'concrete'));
  // the machine on its support (shims, frame, beams, plates or plinth, with pads), its sheave's axis at the height the
  // calculation counts
  const k = 1000 * G.s, F = G.frame, base = F.shape ? M.axis - F.axis : M.axis - MACHINE_A.yWheel * k, zs = M.axis, D = M.D, sup = supportOf(R);
  out.push(...supportSection(M, G, r0, r1));
  out.push(...(F.shape ? shapeElevation(F, D, (x, y) => [G.sheaveAt + x, base + y]) : machineElevation((x, y) => [G.sheaveAt + x * k, base + y * k])));
  const centre = (c: Pt, r: number): void => { out.push(line([c[0] - r - 40, c[1]], [c[0] + r + 40, c[1]], 'axis'), line([c[0], c[1] - r - 40], [c[0], c[1] + r + 40], 'axis')); };
  centre([G.sheaveAt, zs], D / 2);
  // the ropes as they run with the car halfway, cut at the drawing's foot; the pulley on its stand or hung under the
  // slab; the dead ends of a 2:1 roping
  const [carD, cwD] = hitchDepths(L).mid;
  for (const [p, q] of roomRopes(M, G, carD, cwD)) {
    if (p[1] < foot && q[1] < foot) continue;
    const cut = (a: readonly [number, number], b: readonly [number, number]): Pt => (a[1] >= foot ? [a[0], a[1]] : [a[0] + ((b[0] - a[0]) * (foot - a[1])) / (b[1] - a[1]), foot]);
    out.push(line(cut(p, q), cut(q, p), 'thin'));
  }
  if (M.Dp > 0) {
    const pu = G.pulleyAt, zp = G.pulleyZ, r = M.Dp / 2;
    out.push(circle([pu, zp], r, 'outline', 'paper'), circle([pu, zp], r - M.d, 'thin'), circle([pu, zp], r * 0.28, 'outline', 'steel'));
    centre([pu, zp], r);
    if (zp > -R.slab) {
      const u0 = pu - r - 110, u1 = pu + r + 110;
      out.push(rect(u0, 0, u1, 140, 'outline'), rect(pu - 80, Math.min(0, zp - 70), pu + 80, Math.max(140, zp + 70), 'thin'));
      for (const x of [u0, u1 - 70]) out.push(rect(x, 0, x + 70, 12, 'outline', 'steel'));
    } else out.push(rect(pu - 140, -R.slab - 14, pu + 140, -R.slab, 'outline', 'steel'), rect(pu - 80, zp - 70, pu + 80, -R.slab - 14, 'thin'));
    out.push({ e: 'text', at: [pu + r + 60, Math.min(zp - r, -R.slab) - 160], text: `Ø${M.Dp}`, size: 2.2 });
  }
  if (M.ropeIn > 0) {
    for (const x of [-M.ropeIn, G.calata + M.ropeIn]) out.push(rect(x - 90, -R.slab - 16, x + 90, -R.slab, 'outline', 'steel'), line([x, -R.slab - 16], [x, foot], 'thin'));
  }
  // dimensions and references: the axis' height, the pulley's h and dx as the calculation takes them
  out.push(chain({ dir: 'y', pts: [-R.slab, 0, top], side: 'left', row: 0, text: ['{v}', null], edit: [E('room.slab'), E('room.H')] }));
  if (ridge > top) out.push(chain({ dir: 'y', pts: [0, ridge], side: 'left', row: 1, edit: [E('room.ridge')] }));
  out.push(chain({ dir: 'y', pts: [0, R.doorH], side: 'right', row: 0, text: ['{v} H. Porta'], edit: [E('room.doorH')] }));
  out.push(chain({ dir: 'y', pts: [0, R.panelH], side: 'right', row: 1, text: ['{v} H. Quadro'], edit: [E('room.panelH')] }));
  // the sheave's axis: the support's height takes the change (pads and the machine's own height stay)
  out.push(chain({ dir: 'y', pts: [0, zs], at: G.frame0 - 120, from: [null, G.sheaveAt], text: ['Asse {v}'], edit: [E('sup.height', -(padsOf(sup) + ownAxis(D, F.shape)))] }));
  if (M.Dp > 0) {
    const low = G.pulleyZ < zs, ue = Math.max(G.pulleyAt + M.Dp / 2, G.frame1) + 160, left = G.sheaveAt < G.pulleyAt;
    // the pulley's height below the sheave is the calculation's h; its distance dx follows the rope drop
    if (Math.abs(M.h) > 1) out.push(chain({ dir: 'y', pts: low ? [G.pulleyZ, zs] : [zs, G.pulleyZ], at: ue, from: low ? [G.pulleyAt, G.sheaveAt] : [G.sheaveAt, G.pulleyAt], text: ['h {v}'], edit: [E('calc.h', 0, low ? 1 : -1)] }));
    const less = 2 * M.ropeIn + M.D / 2 + (M.reverse ? -M.Dp / 2 : M.Dp / 2);
    out.push(chain({ dir: 'x', pts: left ? [G.sheaveAt, G.pulleyAt] : [G.pulleyAt, G.sheaveAt], at: zs + 0.8 * k + 260, from: left ? [zs, G.pulleyZ] : [G.pulleyZ, zs], text: ['dx {v}'],
      edit: [left ? calataEdit(L, less, true) : null] }));
  }
  out.push(chain({ dir: 'x', pts: [G.frame0, G.frame1], side: 'top', row: 0, text: ['{v} Telaio argano'] }));
  out.push(chain({ dir: 'x', pts: [0, G.calata], at: foot + 160, text: ['{v} Calata Funi (Rif.)'], edit: [calataEdit(L, 0, true)] }));
  const along = Math.abs(G.uy) > 0.999 ? 'D' : Math.abs(G.ux) > 0.999 ? 'W' : null;
  out.push(chain({ dir: 'x', pts: [s0, s1], at: foot + 420, text: ['Vano {v}'], edit: [along ? E(along) : null] }));
  out.push({ e: 'text', at: [G.sheaveAt - D / 2 - 40, zs + D / 2 + 60], text: `Ø${M.D}`, size: 2.2, align: 'r' });
  const body = F.shape ? bodyBox(F.shape) : null, um = body ? G.sheaveAt + (body[0] + body[3]) / 2 : G.sheaveAt + 0.53 * k;
  out.push({ e: 'tag', at: [um, top - 350], text: 'P1', to: [um, body ? base + F.bed + 0.9 * body[4] : base + 0.55 * k] });
  out.push({ e: 'text', at: [(s0 + s1) / 2, foot - 250], text: 'VANO', size: 2.2, align: 'c' });
  return { entities: out, bounds: { x0: r0 - WALL, y0: foot, x1: r1 + WALL, y1: Math.max(top, ridge) + WALL } };
}
