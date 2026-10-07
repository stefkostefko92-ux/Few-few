// The machine's room with the machine below (src/lib/lift/bottom.ts) in plan and in section C-C, as the 3D builds it
// (components/lift3d/roomshell.ts and room.ts): beside the shaft — the room past the wall behind the counterweight, the
// sheave in the gap behind the counterweight on a slow shaft through the wall, the gearbox and the motor in the room —
// or under the pit, the ropes down through the pit's slab; the walls and the door, the controller with the free area in
// front of it, the main switch, the two runs of the ropes to the sheave. Plan in the shaft's coordinates; section C-C
// along the drops' direction (U from the car's drop, through the sheave's centre) with the height over the lowest floor.
// Model entities with their dimensions — the room's sizes and its door changed where they are drawn (ShaftInputs.below),
// the shaft's (W, D, its wall, the pit) as on its own drawings; the machine's place and its sheave's axis follow the
// ropes and stay references —; the machine is the 3D's (machine-outline.ts) scaled to the sheave or a maker's as it is,
// its side view the outline of its body. Pure.
import { chain, edit as E, line, path, rect, textWidth, type Box, type Edit, type Entity, type Pt } from '@/drawing';
import { MACHINE_TOP, machinePlan } from '@/shaft/machine-outline';
import { bodyBox } from '@/shaft/machine-shape';
import { shapePlan } from '@/shaft/machine-shape-view';
import { ropeWidths, type MachineSpec } from '@/shaft/machine-room';
import { section } from '@/shaft/section';
import type { RoomInputs } from '@/shaft/room';
import { belowSwitchAt } from '@/shaft/room-floor';
import type { Layout, Wall } from '@/shaft/types';
import { OPPOSITE, belowMachine, belowRoom, exitAlong, type BottomGeo } from '../lift/bottom';
import { KL } from '../lift/norme';

const WALL = 250, SLAB = 200, FREE = 700;

type P2 = readonly [number, number];
const add = (a: P2, b: P2, k = 1): Pt => [a[0] + k * b[0], a[1] + k * b[1]];
const dot = (a: P2, b: P2): number => a[0] * b[0] + a[1] * b[1];

/** The machine of `M` below (bottom.ts belowMachine) and its room grown round it where it reaches out. */
const placed = (L: Layout, M: MachineSpec, g: BottomGeo) => {
  const m = belowMachine(L, g, M.D, M.n, M.d, M.shape ?? null);
  return { ...m, ...belowRoom(L, g, m.body) };
};

/** A wall's strip outside the room's rectangle (room axes), cut by the door when it is on it. */
function roomWalls(R: RoomInputs, o: P2, skip: Wall | null, thick: (w: Wall) => number): Entity[] {
  const out: Entity[] = [], strip = (x0: number, y0: number, x1: number, y1: number): void => {
    if (x1 - x0 > 1 && y1 - y0 > 1) out.push(rect(o[0] + x0, o[1] + y0, o[0] + x1, o[1] + y1, 'wall', 'concrete'));
  };
  const [d0, d1] = [R.doorAt, R.doorAt + R.doorW], xl = -thick('left'), xr = R.W + thick('right');
  for (const w of ['front', 'rear', 'left', 'right'] as const) {
    if (w === skip) continue;
    const t = thick(w), door = R.doorWall === w;
    // the front and rear walls across the side walls' ends, so the corners close
    if (w === 'front' || w === 'rear') {
      const [y0, y1] = w === 'front' ? [-t, 0] : [R.D, R.D + t];
      if (door) { strip(xl, y0, d0, y1); strip(d1, y0, xr, y1); } else strip(xl, y0, xr, y1);
    } else {
      const [x0, x1] = w === 'left' ? [-t, 0] : [R.W, R.W + t];
      if (door) { strip(x0, 0, x1, d0); strip(x0, d1, x1, R.D); } else strip(x0, 0, x1, R.D);
    }
  }
  return out;
}

/** A box along a wall of the room, `depth` into it (room axes). */
function wallBox(R: RoomInputs, w: Wall, at: number, len: number, d0: number, d1: number): Pt[] {
  if (w === 'front') return [[at, d0], [at + len, d0], [at + len, d1], [at, d1]];
  if (w === 'rear') return [[at, R.D - d1], [at + len, R.D - d1], [at + len, R.D - d0], [at, R.D - d0]];
  if (w === 'left') return [[d0, at], [d1, at], [d1, at + len], [d0, at + len]];
  return [[R.W - d1, at], [R.W - d0, at], [R.W - d0, at + len], [R.W - d1, at + len]];
}

const mid = (p: readonly Pt[]): Pt => [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];

/** The drawing's side a wall of the plan faces. */
const sideOf = (w: Wall): 'top' | 'bottom' | 'left' | 'right' => (w === 'front' ? 'bottom' : w === 'rear' ? 'top' : w);

/** The box round a level lettering centred on `at` at 1:`s` (model units), 0.8 mm clear of it. */
function letterBox(at: P2, text: string, size: number, s: number): Box {
  const hw = (textWidth(text, { size, cond: true }) / 2 + 0.8) * s;
  return { x0: at[0] - hw, x1: at[0] + hw, y0: at[1] - (0.3 * size + 0.8) * s, y1: at[1] + (0.9 * size + 0.8) * s };
}
const boxOf = (ps: readonly P2[]): Box => {
  const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The first of `spots` whose lettering stays in `room` and meets none of `taken`, else the first. */
function clearOf(spots: readonly Pt[], text: string, size: number, s: number, taken: readonly Box[], room: Box): Pt {
  const ok = (b: Box): boolean => b.x0 >= room.x0 && b.x1 <= room.x1 && b.y0 >= room.y0 && b.y1 <= room.y1 && !taken.some((t) => meets(b, t));
  return spots.find((p) => ok(letterBox(p, text, size, s))) ?? spots[0];
}

/** The controller with the free area in front of it, the main switch beside the door where the 3D puts it
 *  (room-floor.ts belowSwitchAt) with its name nearest it clear of them and of `kept` (the machine and its name) — room axes
 *  moved by `o`, at 1:`s`; and the boxes the room's name keeps clear of. */
function fittings(R: RoomInputs, o: P2, s: number, kept: readonly Box[], room: Box): { entities: Entity[]; taken: Box[] } {
  const mv = (ps: Pt[]): Pt[] => ps.map((p) => add(p, o)), side = R.panelWall === 'left' || R.panelWall === 'right';
  const pan = mv(wallBox(R, R.panelWall, R.panelAt, R.panelW, 0, R.panelD)), front = mv(wallBox(R, R.panelWall, R.panelAt, R.panelW, R.panelD, R.panelD + FREE));
  const swAt = belowSwitchAt(R), sw = mv(wallBox(R, R.doorWall, swAt - 100, 200, 0, 130));
  const inward: P2 = R.doorWall === 'front' ? [0, 1] : R.doorWall === 'rear' ? [0, -1] : R.doorWall === 'left' ? [1, 0] : [-1, 0];
  const name = 'INTERRUTTORE GENERALE', along: P2 = [Math.abs(inward[1]), Math.abs(inward[0])], hw = letterBox([0, 0], name, 1.5, s).x1;
  const near = [boxOf(front), boxOf(pan), boxOf(sw), ...kept], spots: Pt[] = [], c = mid(sw);
  for (let k = -2; k <= 2; k++) for (let d = 200; d <= 2000; d += 50) spots.push(add(add(c, inward, d), along, (k * hw) / 2));
  const at = clearOf(spots.sort((p, q) => Math.hypot(p[0] - c[0], p[1] - c[1]) - Math.hypot(q[0] - c[0], q[1] - c[1])), name, 1.5, s, near, room);
  return {
    entities: [
      path(front, true, 'space'), line(front[0], front[2], 'space'), line(front[1], front[3], 'space'),
      path(pan, true, 'outline', 'paper'), { e: 'text', at: mid(pan), text: 'QUADRO MANOVRA', size: 1.8, align: 'c', angle: side ? 90 : 0, halo: true, fit: R.panelW - 60 },
      path(sw, true, 'outline', 'paper'), { e: 'text', at, text: name, size: 1.5, align: 'c', halo: true },
    ],
    taken: [...near, letterBox(at, name, 1.5, s)],
  };
}

/** The machine's room below in plan, with the shaft at the lowest floor; the names kept clear of each other at 1:`s`
 *  (the scale the sheet draws it at: views.ts belowView). */
export function belowPlanEntities(L: Layout, M: MachineSpec, g: BottomGeo, s = 25): { entities: Entity[]; bounds: Box } {
  const I = L.inputs, T = I.wall, out: Entity[] = [], { F, xDir, zDir, C, ext, room: R, open } = placed(L, M, g), o: P2 = [-R.shaftX, -R.shaftY], under = g.scheme === 'under';
  const w = ropeWidths(M.n, M.d);
  // the shaft's walls; beside it the room past the wall behind the counterweight, that wall carried across the room
  for (const [x0, y0, x1, y1] of [[-T, -T, I.W + T, 0], [-T, I.D, I.W + T, I.D + T], [-T, 0, 0, I.D], [I.W, 0, I.W + T, I.D]] as const) {
    if (!under) out.push(rect(x0, y0, x1, y1, 'wall', 'concrete'));
  }
  out.push(...roomWalls(R, o, null, (w) => (w === open ? T : WALL)));
  out.push(rect(o[0], o[1], o[0] + R.W, o[1] + R.D, 'wall'));
  // the car at the lowest floor and the counterweight (over the room when it is under the pit)
  const seen = under ? 'hidden' : 'thin';
  out.push(rect(L.car.x, L.car.y, L.car.x + L.car.w, L.car.y + L.car.h, seen), rect(L.cw.x, L.cw.y, L.cw.x + L.cw.w, L.cw.y + L.cw.h, under ? 'hidden' : 'outline', under ? undefined : 'cw'));
  if (under) out.push(rect(0, 0, I.W, I.D, 'hidden'));
  // the two runs to the sheave, the ropes side by side across its plane; under the pit their openings in its slab
  const along: Pt = [g.mw[0] - g.mc[0], g.mw[1] - g.mc[1]], n = Math.hypot(along[0], along[1]) || 1, a: Pt = [along[0] / n, along[1] / n];
  const box = (c: P2, du: number, dz: number): Pt[] => [add(add(c, a, -du), zDir, -dz), add(add(c, a, du), zDir, -dz), add(add(c, a, du), zDir, dz), add(add(c, a, -du), zDir, dz)];
  for (const m of [g.mc, g.mw]) {
    out.push(path(box(m, M.d / 2 + 2, w.ropes), true, 'outline', 'steel'));
    if (under) out.push(path(box(m, M.d / 2 + 60, w.ropes + 60), true, 'thin'));
  }
  // the machine: its sheave between the runs, the gearbox and the motor past it (the sheave's side of the machine moved
  // by the slow shaft's extension, as the 3D does); beside the shaft the slow shaft through the wall in its sleeve
  const at = (x: number, z: number): Pt => add(add(C, xDir, x), zDir, z - F.zSheave - ext), cut = F.zSheave - F.width / 2 - 1;
  const k = 1000 * F.s, shift = (z: number): number => (z >= cut ? ext : 0);
  out.push(...(F.shape ? shapePlan(F, M.D, M.n, M.d, (x, z) => at(x, z + shift(z))) : machinePlan((x, z) => at(x * k, z * k + shift(z * k)))));
  if (ext > 0) {
    const r = 0.075 * (M.D / 560) * 1000 + 30, wall0 = add(g.car, g.dir, g.wallAt), across = (p: P2): number => dot([p[0] - g.car[0], p[1] - g.car[1]], xDir);
    const u = across(C) - across(wall0), s0 = add(wall0, xDir, u - r), s1 = add(add(wall0, xDir, u + r), g.dir, T);
    out.push(rect(Math.min(s0[0], s1[0]), Math.min(s0[1], s1[1]), Math.max(s0[0], s1[0]), Math.max(s0[1], s1[1]), 'thin', 'paper'));
    out.push(line(at(0, F.face), at(0, F.zSheave + ext - F.width / 2), 'outline'));
  }
  // the names: the machine's past its body's far side, the main switch's off the controller, the room's where nothing
  // else is, nearest the room's middle
  const room: Box = { x0: o[0], y0: o[1], x1: o[0] + R.W, y1: o[1] + R.D };
  const body = boxOf([at(F.x[0], F.z[0]), at(F.x[1], F.z[0]), at(F.x[1], F.zSheave + ext), at(F.x[0], F.zSheave + ext)]);
  const label = `${M.label || 'ARGANO'} · Ø ${M.D}`, ends: Pt[] = [];
  for (let d = 150; d <= 2500; d += 50) ends.push(add(at((F.x[0] + F.x[1]) / 2, F.z[0]), zDir, -d));
  const named = clearOf(ends, label, 1.8, s, [body], room), fit = fittings(R, o, s, [body, letterBox(named, label, 1.8, s)], room);
  out.push({ e: 'text', at: named, text: label, size: 1.8, align: 'c', halo: true }, ...fit.entities);
  const roomName = under ? 'LOCALE MACCHINA SOTTO IL VANO' : 'LOCALE MACCHINA', taken = fit.taken;
  const grid: Pt[] = [];
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) grid.push([room.x0 + (R.W * i) / 12, room.y0 + (R.D * j) / 12]);
  const centre: Pt = [room.x0 + R.W / 2, room.y0 + R.D / 2], far = (p: Pt): number => Math.hypot(p[0] - centre[0], p[1] - centre[1]);
  out.push({ e: 'text', at: clearOf([centre, ...grid.sort((p, q) => far(p) - far(q))], roomName, 2.2, s, taken, room), text: roomName, size: 2.2, align: 'c', halo: true });
  if (!under) out.push({ e: 'text', at: [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2], text: 'VANO', size: 2.2, align: 'c', halo: true });
  // dimensions: the door on its wall
  const x0 = Math.min(o[0], under ? 0 : -T), x1 = Math.max(o[0] + R.W, under ? I.W : I.W + T), y0 = Math.min(o[1], under ? 0 : -T), y1 = Math.max(o[1] + R.D, under ? I.D : I.D + T);
  const doorAlongX = R.doorWall === 'front' || R.doorWall === 'rear', doorLen = doorAlongX ? R.W : R.D, d0 = doorAlongX ? o[0] : o[1];
  out.push(chain({ dir: doorAlongX ? 'x' : 'y', pts: [d0, d0 + R.doorAt, d0 + R.doorAt + R.doorW, d0 + doorLen], side: sideOf(R.doorWall), row: 0, text: [null, `Porta ${R.doorW}x H. ${R.doorH}`, null],
    edit: [E('below.doorAt'), E('below.doorW'), E('below.doorAt', doorLen - R.doorW, -1)] }));
  out.push(...(under || !open ? underChains(I, R, o) : besideChains(I, g, R, o, open, C)));
  return { entities: out, bounds: { x0: x0 - WALL, y0: y0 - WALL, x1: x1 + WALL, y1: y1 + WALL } };
}

/** A chain's points with the segments shorter than a millimetre left out (their texts and edits with them). */
function steps(pts: readonly number[], text: readonly (string | null)[], edit: readonly (Edit | null)[]): { pts: number[]; text: (string | null)[]; edit: (Edit | null)[] } {
  const p = [pts[0]], t: (string | null)[] = [], e: (Edit | null)[] = [];
  for (let i = 1; i < pts.length; i++) if (pts[i] - p[p.length - 1] >= 1) { p.push(pts[i]); t.push(text[i - 1]); e.push(edit[i - 1]); }
  return { pts: p, text: t, edit: e };
}

/** Under the pit: where the shaft stands from the room's walls and its size, the room's outermost (the door is on the
 *  front wall); the room grows from its corner nearest the origin (the shaft's place in it follows the machine). */
function underChains(I: Layout['inputs'], R: RoomInputs, o: P2): Entity[] {
  const x = steps([o[0], 0, I.W, o[0] + R.W], [null, 'Vano {v}', null], [null, E('W'), E('below.W', I.W - o[0])]);
  const y = steps([o[1], 0, I.D, o[1] + R.D], [null, 'Vano {v}', null], [null, E('D'), E('below.D', I.D - o[1])]);
  return [
    chain({ dir: 'x', ...x, side: 'top', row: 0 }), chain({ dir: 'x', pts: [o[0], o[0] + R.W], side: 'top', row: 1, text: ['{v} Locale'], edit: [E('below.W')] }),
    chain({ dir: 'y', ...y, side: 'right', row: 0 }), chain({ dir: 'y', pts: [o[1], o[1] + R.D], side: 'right', row: 1, text: ['{v} Locale'], edit: [E('below.D')] }),
  ];
}

/** Beside the shaft: across the wall the shaft, the wall and the room in one chain, on the side away from the door;
 *  along the wall the room's size past its far wall, and past the shaft's far side the slow shaft's axis from the
 *  shaft's walls with the shaft's size outside it. */
function besideChains(I: Layout['inputs'], g: BottomGeo, R: RoomInputs, o: P2, open: Wall, C: Pt): Entity[] {
  const k = Math.abs(g.dir[0]) > Math.abs(g.dir[1]) ? 0 : 1, len = k ? I.D : I.W, rLo = o[k], rHi = o[k] + (k ? R.D : R.W);
  const toRoom = g.dir[k] > 0, j = 1 - k, wallLen = j ? I.D : I.W, axis = Math.round(C[j]);
  const size = (a: number): string => (a ? 'D' : 'W'), shaft = E(size(k)), room = E(`below.${size(k)}`);
  return [
    chain({ dir: k ? 'y' : 'x', pts: toRoom ? [0, len, rLo, rHi] : [rLo, rHi, 0, len], side: sideOf(OPPOSITE[R.doorWall]), row: 0,
      text: toRoom ? ['Vano {v}', '{v}', '{v} Locale'] : ['{v} Locale', '{v}', 'Vano {v}'], edit: toRoom ? [shaft, E('wall'), room] : [room, E('wall'), shaft] }),
    chain({ dir: j ? 'y' : 'x', pts: [o[j], o[j] + (j ? R.D : R.W)], side: sideOf(OPPOSITE[open]), row: 0, text: ['{v} Locale'], edit: [E(`below.${size(j)}`)] }),
    // the slow shaft's axis where the ropes put it (a reference)
    chain({ dir: j ? 'y' : 'x', pts: [0, axis, wallLen], side: sideOf(open), row: 0, text: ['Asse argano {v}', null] }),
    chain({ dir: j ? 'y' : 'x', pts: [0, wallLen], side: sideOf(open), row: 1, text: ['Vano {v}'], edit: [E(size(j))] }),
  ];
}

/** Section C-C: along the drops' direction through the sheave's centre, the height over the lowest floor. */
export function belowSectionEntities(L: Layout, M: MachineSpec, g: BottomGeo): { entities: Entity[]; bounds: Box } {
  const I = L.inputs, V = I.vertical, T = I.wall, S = section(L), out: Entity[] = [], under = g.scheme === 'under';
  const { F, zDir, C, ext, room: R } = placed(L, M, g), w = ropeWidths(M.n, M.d);
  const along = (p: P2): number => dot([p[0] - g.car[0], p[1] - g.car[1]], g.dir);
  const back = exitAlong(g.car, [-g.dir[0], -g.dir[1]], I.W, I.D), uC = along(C), sg = dot(zDir, g.dir);
  const zs = g.zSheave, base = zs - F.axis, floor = g.roomFloor, H = R.H, top = under ? 900 : H + SLAB + 300;
  // the shaft's walls cut, the pit's floor (beside the shaft the wall behind the counterweight open round the slow
  // shaft's sleeve); the room past it, or under the pit as far as the machine needs (bottom.ts belowRoom)
  const u0 = -back, u1 = g.wallAt, r = 0.075 * (M.D / 560) * 1000 + 30, sLow = under ? S.pitFloor - KL.underSlab : S.pitFloor - SLAB;
  // the room along the section, as bottom.ts belowRoom has it (its sizes set on the drawings in place)
  const rs = [[0, 0], [R.W, 0], [R.W, R.D], [0, R.D]].map(([x, y]) => along([x - R.shaftX, y - R.shaftY]));
  const r0 = under ? Math.min(...rs) : u1 + T, r1 = under ? Math.max(...rs) : u1 + T + (Math.abs(g.dir[0]) > Math.abs(g.dir[1]) ? R.W : R.D);
  const low = under ? floor - SLAB : sLow;
  out.push(rect(u0 - T, sLow, u0, top, 'wall', 'concrete'));
  if (ext > 0) out.push(rect(u1, low, u1 + T, zs - r, 'wall', 'concrete'), rect(u1, zs + r, u1 + T, top, 'wall', 'concrete'), rect(u1, zs - r, u1 + T, zs + r, 'thin', 'paper'));
  else out.push(rect(u1, sLow, u1 + T, top, 'wall', 'concrete'));
  out.push(line([u0, 0], [u1, 0], 'axis'));
  if (under) {
    // its floor and walls, the pit's slab over it with the ropes' opening
    out.push(rect(r0 - T, floor - SLAB, r1 + T, floor, 'wall', 'concrete'), rect(r0 - T, floor, r0, sLow, 'wall', 'concrete'), rect(r1, floor, r1 + T, sLow, 'wall', 'concrete'));
    const h0 = uC - w.ropes - 60, h1 = uC + w.ropes + 60;
    out.push(rect(r0 - T, sLow, h0, S.pitFloor, 'wall', 'concrete'), rect(h1, sLow, r1 + T, S.pitFloor, 'wall', 'concrete'));
    out.push({ e: 'text', at: [(r0 + r1) / 2, floor + H - 400], text: 'LOCALE MACCHINA SOTTO IL VANO', size: 2.2, align: 'c', halo: true });
  } else {
    // its floor at the lowest floor, its roof, its far wall
    out.push(rect(u0, S.pitFloor - SLAB, u1, S.pitFloor, 'wall', 'concrete'));
    out.push(rect(r0, -SLAB, r1 + WALL, 0, 'wall', 'concrete'), rect(u1, H, r1 + WALL, H + SLAB, 'wall', 'concrete'), rect(r1, 0, r1 + WALL, H, 'wall', 'concrete'));
    out.push({ e: 'text', at: [(r0 + r1) / 2, H - 350], text: 'LOCALE MACCHINA', size: 2.2, align: 'c', halo: true });
  }
  // the car at the lowest floor
  const half = Math.abs(g.dir[0]) * L.car.w / 2 + Math.abs(g.dir[1]) * L.car.h / 2;
  out.push(rect(-half, 0, half, Math.min(V.carOutH, top - 100), 'thin'));
  // the machine from its side on levelling shims: the bedplate and the body, the slow shaft, the sheave
  const U = (z: number): number => uC + sg * (z - (F.zSheave + ext)), k = 1000 * F.s;
  const [z0, z1] = F.shape ? [bodyBox(F.shape)[2], F.face] : [F.z[0], F.face], yTop = F.shape ? F.bed + bodyBox(F.shape)[4] : MACHINE_TOP * k;
  const bed = F.shape ? Math.max(F.bed, 40) : 0.07 * k, box = (za: number, zb: number, ya: number, yb: number, st: 'outline' | 'thin', fill?: 'paper' | 'steel' | 'cw'): Entity =>
    rect(Math.min(U(za), U(zb)), base + ya, Math.max(U(za), U(zb)), base + yb, st, fill);
  out.push(rect(Math.min(U(z0), U(z1)), floor, Math.max(U(z0), U(z1)), base, 'thin', 'paper'));
  out.push(box(z0, z1, 0, bed, 'outline', 'cw'), box(z0, z1, bed, yTop, 'outline', 'paper'));
  out.push(box(F.face, F.zSheave + ext - F.width / 2, F.axis - 0.06 * k - 10, F.axis + 0.06 * k + 10, 'thin', 'steel'));
  out.push(box(F.zSheave + ext - F.width / 2, F.zSheave + ext + F.width / 2, F.axis - M.D / 2, F.axis + M.D / 2, 'outline', 'steel'));
  out.push(line([uC - F.width / 2 - 60, zs], [uC + F.width / 2 + 60, zs], 'axis'));
  out.push({ e: 'text', at: [uC + sg * (F.width / 2 + 90), zs + M.D / 2 + 120], text: `Ø ${M.D}`, size: 1.8, align: sg > 0 ? 'l' : 'r', halo: true });
  // the ropes up from the sheave toward the head, cut at the drawing's top
  for (const s of [-1, 1]) out.push(line([uC + s * w.ropes, zs], [uC + s * w.ropes, top - 60], 'thin'));
  out.push({ e: 'text', at: [(u0 + Math.min(u1, uC - 400)) / 2, S.pitFloor + 300], text: 'FOSSA', size: 2.2, align: 'c' });
  // dimensions: the door's and the room's heights (as section B-B of a room above), the sheave's axis over its floor, the
  // pit; along the section the wall and the room
  const right = r1 + (under ? T : WALL), x0 = (under ? Math.min(u0, r0) : u0) - T;
  out.push(chain({ dir: 'y', pts: [floor, floor + R.doorH], side: 'right', row: 0, text: ['{v} H. Porta'], edit: [E('below.doorH')] }));
  out.push(chain({ dir: 'y', pts: [floor, floor + H], side: 'right', row: 1, text: ['{v} H. Locale'], edit: [E('below.H')] }));
  // the sheave's axis over the room's floor: the machine on its levelling shims (a reference)
  out.push(chain({ dir: 'y', pts: [floor, zs], at: right - (under ? T + 300 : WALL + 300), from: [null, uC], text: ['Asse {v}'] }));
  out.push(chain({ dir: 'y', pts: [S.pitFloor, 0], side: 'left', row: 0, text: ['Fossa {v}'], edit: [E('v.pit')] }));
  const size = Math.abs(g.dir[0]) > Math.abs(g.dir[1]) ? 'W' : 'D';
  if (under) {
    out.push(chain({ dir: 'x', pts: [u0, u1], side: 'top', row: 0, text: ['Vano {v}'], edit: [E(size)] }),
      chain({ dir: 'x', pts: [r0, r1], side: 'bottom', row: 0, text: ['{v} Locale'], edit: [E(`below.${size}`)] }));
  } else out.push(chain({ dir: 'x', pts: [u0, u1, u1 + T, r1], side: 'bottom', row: 0, text: ['Vano {v}', '{v}', '{v} Locale'], edit: [E(size), E('wall'), E(`below.${size}`)] }));
  return { entities: out, bounds: { x0, y0: low, x1: right, y1: top } };
}
