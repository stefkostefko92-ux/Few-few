// Section A-A as model entities: a vertical cut through the middle of the car along the depth of the shaft, seen
// from the right, so the front (entrance A) is on the left and the rear on the right. X is the plan y, Z the height
// from the lowest floor. Walls with the landing openings and slabs of the floors each side serves, pit and slab over
// the shaft, the machine room, the car at a floor with frame, operator and balustrade, the counterweight where the
// ropes put it, rails, buffers, the spaces for the maintenance person and the ropes. A long travel is compressed
// between two heights (the floors in between keep only their level), with break marks on the walls.
import { clipBand, line, path, rect, type Box, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import { pitSpace, roofSpaces } from './plan-view';
import { RAILS } from './rails';
import { cwPlateAt, section, type Section } from './section';
import type { Layout, Rail } from './types';

/** Real heights between z0 and z1 are drawn f times shorter. */
export interface ZMap {
  z0: number;
  z1: number;
  f: number;
}

export const mapZ = (m: ZMap | null, z: number): number =>
  !m ? z : z <= m.z0 ? z : z >= m.z1 ? z - (m.z1 - m.z0) * (1 - m.f) : m.z0 + (z - m.z0) * m.f;

export interface SectionView {
  /** floor where the car is */
  carFloor: number;
  /** real heights shown */
  lo: number;
  hi: number;
  zmap: ZMap | null;
}

const LANDING_EXT = 400;
const SLAB = 220;

export function sectionEntities(L: Layout, v: SectionView): { entities: Entity[]; bounds: Box; S: Section } {
  const S = section(L), I = L.inputs, V = I.vertical, T = I.wall, D = I.D, out: Entity[] = [];
  const Z = (z: number): number => mapZ(v.zmap, z);
  const P = (x: number, z: number): Pt => [x, Z(z)];
  const inWin = (z: number): boolean => z >= v.lo - 1 && z <= v.hi + 1;
  const compressed = (z: number): boolean => !!v.zmap && z > v.zmap.z0 + 1 && z < v.zmap.z1 - 1;
  const roomTop = S.ceiling + (I.room ? I.room.slab + (I.room.ridge || I.room.H) : 0);
  const zBot = Math.max(v.lo, S.pitFloor - SLAB), zTop = Math.min(v.hi, I.room ? roomTop + 250 : S.ceiling + SLAB);
  const box = (x0: number, z0: number, x1: number, z1: number, st: Parameters<typeof rect>[4] = 'thin', fill?: Parameters<typeof rect>[5]): Entity =>
    path([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], true, st, fill);

  // walls with the landing openings of the floors each side serves
  const served = (side: 'front' | 'rear'): number[] => V.floors.flatMap((f, i) => {
    const onFront = f.door.includes('A'), onRear = I.entrances === 'opposite' && f.door.includes('B');
    return (side === 'front' ? onFront : onRear) ? [i] : [];
  });
  for (const side of ['front', 'rear'] as const) {
    const [x0, x1] = side === 'front' ? [-T, 0] : [D, D + T];
    const gaps = served(side).map((i) => S.levels[i]).filter((z) => inWin(z) && !compressed(z)).map((z) => [z, z + I.doorHeight] as const);
    let z = zBot;
    for (const [a, b] of [...gaps, [zTop, zTop] as const]) {
      if (a > z + 1) out.push(box(x0, z, x1, Math.min(a, zTop), 'wall', 'concrete'));
      z = Math.max(z, b);
    }
    for (const i of served(side)) {
      const zf = S.levels[i];
      if (!inWin(zf)) continue;
      const ext = side === 'front' ? [-T - LANDING_EXT, -T] : [D + T, D + T + LANDING_EXT];
      if (compressed(zf)) {
        out.push(line(P(ext[0], zf), P(ext[1], zf), 'outline'));
      } else {
        out.push(box(ext[0], zf - SLAB, ext[1], zf, 'wall', 'concrete'));
        const s = side === 'front' ? 1 : -1, w0 = side === 'front' ? 0 : D, dl = I.landingDepth;
        out.push(box(w0, zf - 40, w0 + s * dl, zf, 'outline', 'steel'));
        out.push(box(w0 + s * (dl - 50), zf, w0 + s * (dl - 14), zf + I.doorHeight, 'thin', 'door'));
        out.push(box(w0, zf + I.doorHeight, w0 + s * dl, zf + I.doorHeight + 150, 'thin'));
      }
      out.push({ e: 'text', at: P(side === 'front' ? -T - LANDING_EXT + 60 : D + T + LANDING_EXT - 60, zf + 80), text: V.floors[i].label, size: 3, align: side === 'front' ? 'l' : 'r' });
    }
  }
  // break marks where the travel is compressed
  if (v.zmap) for (const z of [v.zmap.z0, v.zmap.z1]) for (const [x0, x1] of [[-T - 60, 60], [D - 60, D + T + 60]]) out.push(...zigzag(P(x0, z), P(x1, z)));

  // pit floor, slab over the shaft, machine room
  if (inWin(S.pitFloor)) out.push(box(-T, S.pitFloor - SLAB, D + T, S.pitFloor, 'wall', 'concrete'));
  if (I.room && S.ceiling <= v.hi) {
    const r = I.room, top = S.ceiling + r.slab + r.H, ridge = r.ridge ? S.ceiling + r.slab + r.ridge : top;
    const holeX = L.car.y + L.car.h / 2;
    out.push(box(-T, S.ceiling, holeX - 120, S.ceiling + r.slab, 'wall', 'concrete'), box(holeX + 120, S.ceiling, D + T, S.ceiling + r.slab, 'wall', 'concrete'));
    // the room's walls up to the roof, or cut where the view ends
    const wallTop = Math.min(ridge, zTop);
    if (wallTop > S.ceiling + r.slab + 1) out.push(box(-T, S.ceiling + r.slab, 0, wallTop, 'wall', 'concrete'), box(D, S.ceiling + r.slab, D + T, wallTop, 'wall', 'concrete'));
    if (ridge <= zTop && top <= v.hi + 1) out.push(box(-T, ridge, D + T, ridge + SLAB, 'wall', 'concrete'));
    if (S.ceiling + r.slab + 250 <= zTop) out.push({ e: 'text', at: P(D / 2, S.ceiling + r.slab + 250), text: 'LOCALE MACCHINA', size: 2.4, align: 'c' });
  } else if (S.ceiling <= v.hi) {
    out.push(box(-T, S.ceiling, D + T, S.ceiling + SLAB, 'wall', 'concrete'));
  }

  // rails seen beyond the cut: facing the cut, a rail shows its foot; along it, its side from foot to tip
  const seen = new Set<string>();
  const railBand = (r: Rail): void => {
    const s = RAILS[r.kind === 'car' ? I.carRail : I.cwRail];
    const [a, b] = r.dir === 'back' ? [r.y - s.h, r.y] : r.dir === 'front' ? [r.y, r.y + s.h] : [r.y - s.b / 2, r.y + s.b / 2];
    if (seen.has(`${a}:${b}`)) return;
    seen.add(`${a}:${b}`);
    const z0 = Math.max(zBot, S.pitFloor), z1 = Math.min(zTop, S.ceiling - 60);
    out.push(line(P(a, z0), P(a, z1), 'steel'), line(P(b, z0), P(b, z1), 'steel'));
  };
  for (const r of L.rails) if (r.kind === 'car' || L.cwSide !== 'rear') railBand(r);

  // counterweight where the car's position puts it, and its screen in the pit
  const plate = cwPlateAt(S, S.levels[v.carFloor] ?? 0), cwTop = plate + V.cwH, c = L.cw;
  if (cwTop >= v.lo && plate <= v.hi) {
    out.push(box(c.y, plate, c.y + c.h, cwTop, 'outline', 'cw'));
    for (let z = plate + 150; z < cwTop - 120; z += 120) out.push(line(P(c.y + 18, z), P(c.y + c.h - 18, z), 'fine'));
    out.push(line(P(c.y + c.h / 2, cwTop), P(c.y + c.h / 2, Math.min(S.ceiling, zTop)), 'thin'));
  }
  if (inWin(S.pitFloor)) {
    const x0 = L.cwSide === 'rear' ? c.y - 25 : c.y - 40, x1 = L.cwSide === 'rear' ? c.y - 15 : c.y + c.h + 40;
    out.push(box(x0, S.pitFloor + 300, x1, S.pitFloor + KV_VERT.cwScreen, 'hidden'));
  }

  // buffers on their bases, and the space in the pit
  if (inWin(S.pitFloor)) {
    const cy = L.car.y + L.car.h / 2;
    out.push(...buffer(P, cy, S.pitFloor, V.carBufferBase, V.carBufferH));
    out.push(...buffer(P, c.y + c.h / 2, S.pitFloor, V.cwBufferBase, V.cwBufferH));
    const ps = pitSpace(L), h = KV_VERT.refugeH[V.pitRefuge];
    out.push(...cross(P, ps.y0, S.pitFloor, ps.y1, S.pitFloor + h), { e: 'mark', at: P((ps.y0 + ps.y1) / 2 - 80, S.pitFloor + h / 2), sym: 'square' });
  }

  // the car at its floor; at the top floor also dashed where the counterweight on its buffer lets it go
  const zf = S.levels[v.carFloor] ?? 0;
  if (zf + S.highest >= v.lo && zf - V.frameBelow <= v.hi) out.push(...car(L, P, zf, Math.min(S.ceiling, zTop), v.carFloor === V.floors.length - 1));
  if (v.carFloor === V.floors.length - 1 && zf + S.moveUp + S.highest >= v.lo) out.push(...carTopAt(L, P, zf + S.moveUp));
  const bounds: Box = { x0: -T - LANDING_EXT, y0: Z(zBot), x1: D + T + LANDING_EXT, y1: Z(zTop) };
  return { entities: clipBand(out, bounds.y0, bounds.y1), bounds, S };
}

function zigzag(a: Pt, b: Pt): Entity[] {
  const mx = (a[0] + b[0]) / 2, h = 70;
  return [path([a, [mx - 40, a[1]], [mx - 15, a[1] + h], [mx + 15, a[1] - h], [mx + 40, a[1]], b], false, 'thin')];
}

/** Dashed box with its diagonals: a space for the maintenance person. */
function cross(P: (x: number, z: number) => Pt, x0: number, z0: number, x1: number, z1: number): Entity[] {
  return [path([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], true, 'space'), line(P(x0, z0), P(x1, z1), 'space'), line(P(x0, z1), P(x1, z0), 'space')];
}

/** A spring buffer standing on its base (plinth and support). */
function buffer(P: (x: number, z: number) => Pt, x: number, floor: number, base: number, h: number): Entity[] {
  const out: Entity[] = [], w = 90, zb = floor + base;
  if (base > 0) out.push(path([P(x - w, floor), P(x + w, floor), P(x + w, zb), P(x - w, zb)], true, 'outline', base > 350 ? 'concrete' : 'steel'));
  const turns = Math.max(3, Math.round(h / 45)), pts: Pt[] = [P(x - 45, zb)];
  for (let i = 1; i <= turns; i++) pts.push(P(i % 2 ? x + 45 : x - 45, zb + (h - 20) * (i / turns)));
  out.push(path(pts, false, 'thin'), path([P(x - 60, zb + h - 20), P(x + 60, zb + h - 20), P(x + 60, zb + h), P(x - 60, zb + h)], true, 'outline', 'steel'));
  return out;
}

/** Stiles of the car frame in the section: at the rails' axis, or one at each rail's tip on a cantilever sling. */
const stilesOf = (L: Layout): number[] =>
  L.frame.kind === 'central' ? [L.frame.axis] : L.rails.filter((r) => r.kind === 'car').map((r) => r.y + (r.dir === 'back' ? 55 : -55));

/** The top of the car dashed at the floor level zf: roof, operators, crosshead, balustrade (its highest position). */
function carTopAt(L: Layout, P: (x: number, z: number) => Pt, zf: number): Entity[] {
  const I = L.inputs, V = I.vertical, c = L.car, x0 = c.y, x1 = c.y + c.h, roof = zf + V.carOutH, out: Entity[] = [];
  const b = (a0: number, z0: number, a1: number, z1: number): Entity => path([P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], true, 'space');
  out.push(line(P(x0, roof), P(x1, roof), 'space'));
  for (const d of L.doors.filter((x) => x.wall === 'front' || x.wall === 'rear')) {
    const front = d.wall === 'front';
    if (V.opTop > V.carOutH + 60) out.push(b(front ? x0 - I.carDoorDepth : x1 - 150, roof + 60, front ? x0 + 150 : x1 + I.carDoorDepth, zf + V.opTop));
  }
  const stiles = stilesOf(L);
  out.push(b(Math.min(...stiles) - 105, zf + V.frameTop - 170, Math.max(...stiles) + 105, zf + V.frameTop));
  if (V.parapet > 0) {
    const zt = roof + V.parapet;
    out.push(line(P(x0 + 60, zt), P(x1 - 60, zt), 'space'), line(P(x0 + 60, roof), P(x0 + 60, zt), 'space'), line(P(x1 - 60, roof), P(x1 - 60, zt), 'space'));
  }
  return out;
}

/** Car at the floor zf: platform, walls cut at the entrances, roof, doors, operator, frame, balustrade; at the top floor
 *  the refuge space on the roof. */
function car(L: Layout, P: (x: number, z: number) => Pt, zf: number, ropeTop: number, atTop: boolean): Entity[] {
  const I = L.inputs, V = I.vertical, c = L.car, out: Entity[] = [], x0 = c.y, x1 = c.y + c.h, w = I.carWall;
  const b = (a0: number, z0: number, a1: number, z1: number, st: Parameters<typeof rect>[4] = 'thin', fill?: Parameters<typeof rect>[5]): Entity =>
    path([P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], true, st, fill);
  out.push(b(x0, zf - V.platform, x1, zf, 'outline', 'car'));
  const front = L.doors.some((d) => d.wall === 'front'), rear = L.doors.some((d) => d.wall === 'rear');
  for (const [a, open] of [[x0, front], [x1 - w, rear]] as const) {
    if (open) {
      out.push(b(a, zf + I.doorHeight, a + w, zf + V.carOutH, 'outline', 'car'));
      const dx = a === x0 ? -I.carDoorDepth + 14 : w + 14;
      out.push(b(a + dx, zf, a + dx + 18, zf + I.doorHeight, 'thin', 'door'));
      const s0 = a === x0 ? x0 - I.carDoorDepth : x1, s1 = a === x0 ? x0 : x1 + I.carDoorDepth;
      out.push(b(s0, zf - 30, s1, zf, 'outline', 'steel'));
      // operator over the entrance, on the car roof
      if (V.opTop > V.carOutH + 60) out.push(b(a === x0 ? x0 - I.carDoorDepth : x1 - 150, zf + V.carOutH + 60, a === x0 ? x0 + 150 : x1 + I.carDoorDepth, zf + V.opTop, 'thin'));
    } else {
      out.push(b(a, zf, a + w, zf + V.carOutH, 'outline', 'car'));
    }
  }
  out.push(b(x0, zf + V.carH, x1, zf + V.carOutH, 'outline', 'car'));
  // car frame seen beyond: the stiles, crosshead and safety plank cut
  const stiles = stilesOf(L);
  for (const ax of stiles) {
    out.push(b(ax - 55, zf - V.frameBelow, ax + 55, zf + V.frameTop, 'thin'));
    for (const z of [zf + V.frameTop, zf - V.frameBelow - 90]) out.push(b(ax - 35, z, ax + 35, z + 90, 'thin'));
  }
  const [s0, s1] = [Math.min(...stiles) - 105, Math.max(...stiles) + 105];
  out.push(b(s0, zf + V.frameTop - 170, s1, zf + V.frameTop, 'outline', 'steel'));
  out.push(b(s0, zf - V.frameBelow, s1, zf - V.frameBelow + 150, 'outline', 'steel'));
  // suspension ropes up to the machine
  if (ropeTop > zf + V.frameTop) out.push(line(P(c.y + c.h / 2, zf + V.frameTop), P(c.y + c.h / 2, ropeTop), 'thin'));
  // balustrade on the roof, seen along its side
  if (V.parapet > 0) {
    const zt = zf + V.carOutH + V.parapet;
    out.push(line(P(x0 + 60, zt), P(x1 - 60, zt), 'outline'), line(P(x0 + 60, zf + V.carOutH), P(x0 + 60, zt), 'outline'), line(P(x1 - 60, zf + V.carOutH), P(x1 - 60, zt), 'outline'));
    out.push(line(P(x0 + 60, zf + V.carOutH + V.parapet / 2), P(x1 - 60, zf + V.carOutH + V.parapet / 2), 'thin'));
  }
  // the refuge space over the roof, with the car at the top floor
  if (atTop) {
    const { refuge: r } = roofSpaces(L), h = KV_VERT.refugeH[V.topRefuge], roof = zf + V.carOutH;
    out.push(...cross(P, r.y0, roof, r.y1, roof + h), { e: 'mark', at: P((r.y0 + r.y1) / 2 + 60, roof + h * 0.72), sym: 'tri' });
  }
  return out;
}
