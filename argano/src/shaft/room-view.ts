// The machine room drawn: plan (walls and door, the shaft under it, rope holes, the machine on its bedframe, the
// governor, the control panel with its free area, the main switch) and section B-B along the rope drops (floor slab
// with the shaft under it, walls and roof, the machine: sheave, gearbox, motor, brake, handwheel, diverting pulley).
// The machine is schematic, sized on its sheave. Model entities for the drawing kernel; dimensions included.
import { chain, circle, edit as E, line, path, rect, type Box, type Entity, type Pt } from '../drawing';
import type { MachineSpec, RoomGeo } from './machine-room';
import type { Layout } from './types';

const WALL = 250;

/** Point on the rope drop line: u along it from the car drop, v across it. */
const onDrop = (G: RoomGeo, u: number, v: number): Pt => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
const quad = (G: RoomGeo, u0: number, v0: number, u1: number, v1: number): Pt[] => [onDrop(G, u0, v0), onDrop(G, u1, v0), onDrop(G, u1, v1), onDrop(G, u0, v1)];

export function roomPlanEntities(L: Layout, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [], I = L.inputs;
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
  // the shaft underneath and the rope holes
  out.push(rect(R.shaftX, R.shaftY, R.shaftX + I.W, R.shaftY + I.D, 'hidden'));
  for (const p of [G.carDrop, G.cwDrop]) out.push(rect(p[0] - 90, p[1] - 70, p[0] + 90, p[1] + 70, 'thin'));
  // bedframe, sheave, pulley, gearbox and motor
  const gw = M.n * (M.d + 5) + 40, D = M.D;
  out.push(path(quad(G, G.frame0, -G.frameW / 2, G.frame1, G.frameW / 2), true, 'outline', 'cw'));
  out.push(path(quad(G, G.sheaveAt - D / 2, -gw / 2, G.sheaveAt + D / 2, gw / 2), true, 'outline', 'steel'));
  if (M.Dp > 0) out.push(path(quad(G, G.pulleyAt - M.Dp / 2, -gw / 2, G.pulleyAt + M.Dp / 2, gw / 2), true, 'outline', 'steel'));
  const gb0 = gw / 2 + 15, gb1 = gb0 + 0.6 * D, mv = (gb0 + gb1) / 2;
  out.push(path(quad(G, G.sheaveAt - 0.45 * D, gb0, G.sheaveAt + 0.45 * D, gb1), true, 'outline', 'paper'));
  const m0 = G.sheaveAt + 0.45 * D, m1 = m0 + 0.18 * D, m2 = m1 + 1.05 * D;
  out.push(path(quad(G, m0, mv - 0.22 * D, m1, mv + 0.22 * D), true, 'outline', 'paper'), path(quad(G, m1, mv - 0.26 * D, m2, mv + 0.26 * D), true, 'outline', 'paper'));
  for (let u = m1 + 60; u < m2 - 30; u += 55) out.push(line(onDrop(G, u, mv - 0.26 * D), onDrop(G, u, mv + 0.26 * D), 'fine'));
  out.push(path(quad(G, m2, mv - 0.2 * D, m2 + 25, mv + 0.2 * D), true, 'outline', 'paper'));
  out.push({ e: 'tag', at: onDrop(G, (G.frame0 + G.frame1) / 2, -G.frameW / 2 - 520), text: 'P1', to: onDrop(G, (G.frame0 + G.frame1) / 2, -G.frameW / 2) });
  out.push({ e: 'text', at: onDrop(G, G.sheaveAt, 0), text: `Ø ${M.D}`, size: 2, align: 'c', halo: true });
  // governor over its rope, on the car rail opposite the counterweight
  const railR = L.rails.filter((r) => r.kind === 'car').sort((a, b) => (L.cwSide === 'left' ? b.x - a.x : a.x - b.x))[0];
  if (railR) {
    const gx = R.shaftX + railR.x + (railR.dir === 'left' ? 120 : -120), gy = R.shaftY + railR.y + 250;
    out.push(rect(gx - 150, gy - 90, gx + 150, gy + 90, 'outline', 'paper'), circle([gx, gy], 125, 'thin'));
    out.push({ e: 'tag', at: [gx + 330, gy + 160], text: 'P4', to: [gx + 150, gy] });
  }
  // control panel with its free area, main switch by the door
  const pan = wallBox(R, R.panelWall, R.panelAt, R.panelW, R.panelD), free = wallBox(R, R.panelWall, R.panelAt, R.panelW, R.panelD + 700);
  out.push(path(free, true, 'space'), line(free[0], free[2], 'space'), line(free[1], free[3], 'space'));
  out.push(path(pan, true, 'outline', 'paper'), { e: 'text', at: mid(pan), text: 'QUADRO MANOVRA', size: 1.8, align: 'c', halo: true });
  const sw = wallBox(R, R.doorWall, R.doorAt + R.doorW + 150, 200, 120);
  const inward: Pt = R.doorWall === 'front' ? [0, 1] : R.doorWall === 'rear' ? [0, -1] : R.doorWall === 'left' ? [1, 0] : [-1, 0];
  out.push(path(sw, true, 'outline', 'paper'), { e: 'text', at: [mid(sw)[0] + inward[0] * 260, mid(sw)[1] + inward[1] * 260 - 30], text: 'INTERRUTTORE GENERALE', size: 1.5, align: 'c' });
  // dimensions: room, door, bedframe, rope drops
  const dimSide = R.doorWall === 'front' ? 'bottom' : R.doorWall === 'rear' ? 'top' : R.doorWall;
  out.push(chain({ dir: 'x', pts: [0, R.W], side: dimSide === 'top' ? 'bottom' : 'top', row: 0, edit: [E('room.W')] }));
  out.push(chain({ dir: 'y', pts: [0, R.D], side: dimSide === 'right' ? 'left' : 'right', row: 0, edit: [E('room.D')] }));
  const across = dimSide === 'top' || dimSide === 'bottom', wallLen = across ? R.W : R.D;
  out.push(chain({ dir: across ? 'x' : 'y', pts: [0, d0, d1, wallLen], side: dimSide, row: 0, text: [null, `Porta ${R.doorW}x H. ${R.doorH}`, null],
    edit: [E('room.doorAt'), E('room.doorW'), E('room.doorAt', wallLen - R.doorW, -1)] }));
  // bedframe and rope drops dimensioned on the side away from the gearbox and the motor
  const [a, b] = [onDrop(G, G.frame0, -G.frameW / 2 - 120), onDrop(G, G.frame1, -G.frameW / 2 - 120)], drop = onDrop(G, 0, -G.frameW / 2 - 320);
  if (Math.abs(G.ux) > Math.abs(G.uy)) {
    out.push(chain({ dir: 'x', pts: [Math.min(a[0], b[0]), Math.max(a[0], b[0])], at: a[1], text: ['{v} Telaio'] }));
    out.push(chain({ dir: 'x', pts: [Math.min(G.carDrop[0], G.cwDrop[0]), Math.max(G.carDrop[0], G.cwDrop[0])], at: drop[1], text: ['Calata Funi {v}'] }));
  } else {
    out.push(chain({ dir: 'y', pts: [Math.min(a[1], b[1]), Math.max(a[1], b[1])], at: a[0], text: ['{v} Telaio'] }));
    out.push(chain({ dir: 'y', pts: [Math.min(G.carDrop[1], G.cwDrop[1]), Math.max(G.carDrop[1], G.cwDrop[1])], at: drop[0], text: ['Calata Funi {v}'] }));
  }
  return { entities: out, bounds: { x0: -WALL, y0: -WALL, x1: R.W + WALL, y1: R.D + WALL } };
}

function wallBox(R: RoomGeo['room'], w: 'front' | 'rear' | 'left' | 'right', at: number, len: number, depth: number): Pt[] {
  if (w === 'front') return [[at, 0], [at + len, 0], [at + len, depth], [at, depth]];
  if (w === 'rear') return [[at, R.D - depth], [at + len, R.D - depth], [at + len, R.D], [at, R.D]];
  if (w === 'left') return [[0, at], [depth, at], [depth, at + len], [0, at + len]];
  return [[R.W - depth, at], [R.W, at], [R.W, at + len], [R.W - depth, at + len]];
}
const mid = (p: Pt[]): Pt => [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];

/** Where the drop line runs inside the rectangle [x0, x1] × [y0, y1]: the range of u. */
function span(G: RoomGeo, x0: number, y0: number, x1: number, y1: number): [number, number] {
  let lo = -Infinity, hi = Infinity;
  for (const [p, d, a, b] of [[G.carDrop[0], G.ux, x0, x1], [G.carDrop[1], G.uy, y0, y1]] as const) {
    if (Math.abs(d) < 1e-9) continue;
    const t0 = (a - p) / d, t1 = (b - p) / d;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  return [lo, hi];
}

/** Section B-B along the rope drops: X is u along the drop line, Z the height above the room floor. */
export function roomSectionEntities(L: Layout, M: MachineSpec, G: RoomGeo): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [], I = L.inputs;
  const [r0, r1] = span(G, 0, 0, R.W, R.D), [s0, s1] = span(G, R.shaftX, R.shaftY, R.shaftX + I.W, R.shaftY + I.D);
  const top = R.H, ridge = R.ridge > 0 ? R.ridge : R.H, midU = (r0 + r1) / 2, below = 1300;
  // floor slab over the shaft with the rope holes, the shaft under it
  out.push(rect(r0 - WALL, -R.slab, 0 - 90, 0, 'wall', 'concrete'), rect(90, -R.slab, G.calata - 90, 0, 'wall', 'concrete'), rect(G.calata + 90, -R.slab, r1 + WALL, 0, 'wall', 'concrete'));
  for (const u of [s0 - I.wall, s1]) out.push(rect(u, -R.slab - below, u + I.wall, -R.slab, 'wall', 'concrete'));
  out.push(line([s0, -R.slab - below], [s1, -R.slab - below], 'axis'));
  // walls and roof
  out.push(rect(r0 - WALL, 0, r0, top, 'wall', 'concrete'), rect(r1, 0, r1 + WALL, top, 'wall', 'concrete'));
  if (ridge > top) {
    out.push(path([[r0 - WALL, top], [midU, ridge], [r1 + WALL, top], [r1 + WALL, top + WALL], [midU, ridge + WALL], [r0 - WALL, top + WALL]], true, 'wall', 'concrete'));
  } else out.push(rect(r0 - WALL, top, r1 + WALL, top + WALL, 'wall', 'concrete'));
  // bedframe on its pads, gearbox, sheave, motor, brake, handwheel, pulley, ropes
  const fh = 180, zs = fh + 0.75 * M.D, D = M.D;
  out.push(rect(G.frame0, 0, G.frame1, fh, 'outline', 'cw'));
  for (const u of [G.frame0 + 60, G.frame1 - 60]) out.push(rect(u - 60, -20, u + 60, 0, 'outline', 'steel'));
  out.push(rect(G.sheaveAt - 0.45 * D, fh, G.sheaveAt + 0.45 * D, zs + 0.3 * D, 'thin', 'paper'));
  out.push(circle([G.sheaveAt, zs], D / 2, 'outline', 'paper'), circle([G.sheaveAt, zs], D / 2 - M.d, 'thin'), circle([G.sheaveAt, zs], D * 0.12, 'outline', 'steel'));
  const zm = zs + 0.28 * D, m0 = G.sheaveAt + 0.45 * D, m1 = m0 + 0.18 * D, m2 = m1 + 1.05 * D;
  out.push(rect(m0, zm - 0.2 * D, m1, zm + 0.2 * D, 'outline', 'paper'), rect(m1, zm - 0.26 * D, m2, zm + 0.26 * D, 'outline', 'paper'));
  for (let u = m1 + 60; u < m2 - 30; u += 55) out.push(line([u, zm - 0.26 * D], [u, zm + 0.26 * D], 'fine'));
  out.push(rect(m2, zm - 0.3 * D, m2 + 22, zm + 0.3 * D, 'outline', 'paper'));
  const zp = M.Dp > 0 ? Math.max(M.Dp / 2 - R.slab / 2, fh / 2) : 0;
  if (M.Dp > 0) out.push(circle([G.pulleyAt, zp], M.Dp / 2, 'outline', 'paper'), circle([G.pulleyAt, zp], M.Dp * 0.12, 'outline', 'steel'));
  out.push(line([0, zs], [0, -R.slab - below], 'thin'), line([G.calata, M.Dp > 0 ? zp : zs], [G.calata, -R.slab - below], 'thin'));
  if (M.Dp > 0) out.push(line([G.sheaveAt + (D / 2) * 0.2, zs - (D / 2) * 0.98], [G.pulleyAt - (M.Dp / 2) * 0.2, zp + (M.Dp / 2) * 0.98], 'thin'));
  // dimensions and references
  out.push(chain({ dir: 'y', pts: [0, top], side: 'left', row: 0, edit: [E('room.H')] }));
  if (ridge > top) out.push(chain({ dir: 'y', pts: [0, ridge], side: 'left', row: 1, edit: [E('room.ridge')] }));
  out.push(chain({ dir: 'y', pts: [0, zs], at: G.frame0 - 120 }));
  out.push(chain({ dir: 'x', pts: [G.frame0, G.frame1], side: 'top', row: 0, text: ['{v} Telaio'] }));
  out.push(chain({ dir: 'x', pts: [0, G.calata], at: -R.slab - below + 160, text: ['{v} Calata Funi (Rif.)'] }));
  out.push(chain({ dir: 'x', pts: [s0, s1], at: -R.slab - below + 420, text: ['Vano {v}'] }));
  out.push({ e: 'text', at: [G.sheaveAt - D / 2 - 40, zs + D / 2 + 60], text: `Ø${M.D}`, size: 2.2, align: 'r' });
  if (M.Dp > 0) out.push({ e: 'text', at: [G.pulleyAt + M.Dp / 2 + 40, zp + M.Dp / 2 + 40], text: `Ø${M.Dp}`, size: 2.2 });
  out.push({ e: 'tag', at: [G.sheaveAt, top - 350], text: 'P1', to: [G.sheaveAt, zs + D / 2] });
  out.push({ e: 'text', at: [(s0 + s1) / 2, -R.slab - below - 250], text: 'VANO', size: 2.2, align: 'c' });
  return { entities: out, bounds: { x0: r0 - WALL, y0: -R.slab - below, x1: r1 + WALL, y1: Math.max(top, ridge) + WALL } };
}
